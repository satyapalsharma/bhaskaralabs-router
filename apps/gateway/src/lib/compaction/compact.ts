// 200K-threshold history compaction (Layer 2) — our design, headroom-memo trick.
//
// When estimated context > COMPACT_THRESHOLD (200K tokens):
//   take the FIRST COMPACT_SPAN (100K) of non-system messages, summarize them
//   (deterministically — memoized by content hash), and REPLACE them with the
//   summary. System prompt + tool schemas are NEVER touched (frozen prefix).
//
// CACHE MODEL: this is a budgeted one-time wipe. The compacted prefix is a NEW
// stable prefix — deterministic memoization means every later turn replays the
// same compacted bytes, so the cache re-warms on the compacted form and holds.
// We compact at most once per session until the context crosses the threshold
// again (compaction count tracked per session).
//
// The summarizer: uses the gateway's OWN theta/flash tier via a direct internal
// call. Memo table (contentHash → summary) makes it byte-stable across turns.

import { createHash } from "node:crypto";
import type { ChatMessage } from "../prefix";

export function compactThreshold(): number {
  return Number(process.env.BHASKARA_COMPACT_THRESHOLD ?? 200_000);
}
export function compactSpan(): number {
  return Number(process.env.BHASKARA_COMPACT_SPAN ?? 100_000);
}

export interface CompactStats {
  triggered: boolean;
  spanMessages: number;
  tokensBefore: number;
  tokensAfter: number;
  summaryTokens: number;
  keptBlocks: number;
}

const MEMO = new Map<string, string>(); // contentHash → summary (bounded)

function hash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 24);
}

export function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function messagesTokens(messages: ChatMessage[]): number {
  let t = 0;
  for (const m of messages) {
    if (typeof m.content === "string") t += estTokens(m.content);
    else t += estTokens(JSON.stringify(m.content ?? ""));
  }
  return t;
}

/** Compaction prompt, v2 (Parsec-trim-concept, our own words): standing
 * directives FIRST (durable rulings that must keep governing), needed-set
 * second (resumption state). Same ~400-word budget as v1 — signal
 * restructured, not enlarged. Pure + exported for contract tests. */
export function buildCompactPrompt(text: string): string {
  return `You are compacting conversation history for a coding agent continuing the SAME session. Output EXACTLY two sections, nothing else, max 400 words total.

## STANDING DIRECTIVES (max 150 words)
Durable rulings that must keep governing after compaction: policies the user stated, model/tool choices, quantitative floors, scope decisions, pinned constraints. One imperative per line. Exclude one-off task steps and transient state. If nothing durable was established, write exactly: None established.

## NEEDED SET (max 250 words, compact bullets)
What the agent needs to resume work: current task state, open TODOs, file names plus function/type names touched, error causes and fixes, decisions made. Drop pleasantries, exploration dead-ends, and repeated context.

Conversation history:
${text.slice(0, compactSpan() * 4)}`;
}

/** Deterministic summarizer call — direct Hyper flash (no auth loopback, no double-metering). */
async function summarize(text: string): Promise<string> {
  const h = hash(text);
  const memo = MEMO.get(h);
  if (memo) return memo;

  const { hyperChat } = await import("../../providers/hyper");
  const key = (process.env.HYPER_API_KEYS ?? process.env.HYPER_API_KEY ?? "").split(",")[0]?.trim();
  if (!key) throw new Error("no hyper key for summarizer");
  const prompt = buildCompactPrompt(text);
  const res = await hyperChat({
    model: "glm-5.3-flash",
    body: { model: "glm-5.3-flash", messages: [{ role: "user", content: prompt }], max_tokens: 900, temperature: 0 },
    apiKey: key,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`summarizer http ${res.status}`);
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const summary = j.choices?.[0]?.message?.content?.trim() ?? "";
  if (!summary) throw new Error("summarizer empty");
  if (MEMO.size > 500) MEMO.clear(); // bounded
  MEMO.set(h, summary);
  return summary;
}

/**
 * Compact history if over threshold. Never touches system messages.
 * firstPass: non-system messages at the START of history (after system blocks).
 */
const NEEDED_REF = /[\w./$-]+\.(ts|js|mjs|cjs|py|rs|go|java|rb|php|md|json|yaml|yml|toml|sql|sh)\b|[A-Za-z_][A-Za-z0-9_]{3,}\(/g;

/** Needed-set keep: span blocks the SURVIVING history still references.
 * Frequency-counted, deterministic, capped. See call-site comment. */
export function neededSetKeep(history: ChatMessage[], span: number, spanTokens: number): Set<number> {
  const later = history
    .slice(span)
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n")
    .slice(0, 200_000);
  if (!later) return new Set();
  const freq = new Map<string, number>();
  NEEDED_REF.lastIndex = 0;
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = NEEDED_REF.exec(later)) !== null && guard++ < 20_000) {
    freq.set(m[0], (freq.get(m[0]) ?? 0) + 1);
  }
  const hot = new Set(
    [...freq]
      .filter(([, n]) => n >= 2)
      .map(([t]) => t)
      .slice(0, 200),
  );
  if (hot.size === 0) return new Set();
  const keep = new Set<number>();
  const cap = Math.floor(spanTokens * 0.2);
  let keptTokens = 0;
  for (let i = 0; i < span; i++) {
    const text = typeof history[i].content === "string" ? (history[i].content as string) : "";
    if (!text) continue;
    let hits = 0;
    for (const t of hot) {
      if (text.includes(t)) {
        hits++;
        if (hits >= 2) break;
      }
    }
    if (hits >= 2) {
      const tok = estTokens(text);
      if (keptTokens + tok > cap) continue;
      keep.add(i);
      keptTokens += tok;
    }
  }
  return keep;
}

export async function maybeCompact(
  messages: ChatMessage[],
  opts: { alreadyCompacted?: boolean; logSkip?: boolean; extraTokens?: number; threshold?: number; span?: number } = {},
): Promise<{ messages: ChatMessage[]; stats: CompactStats }> {
  const stats: CompactStats = { triggered: false, spanMessages: 0, tokensBefore: 0, tokensAfter: 0, summaryTokens: 0, keptBlocks: 0 };
  if (opts.alreadyCompacted) return { messages, stats };
  const threshold = opts.threshold ?? compactThreshold();
  const spanBudget = opts.span ?? compactSpan();
  const total = messagesTokens(messages) + (opts.extraTokens ?? 0); // + tool schemas = true provider context
  if (total <= threshold) {
    if (opts.logSkip) console.log(JSON.stringify({ ev: "compact-skip", estTokens: total, threshold }));
    return { messages, stats };
  }
  // split: leading system messages stay; the rest is compactable history
  let firstNonSystem = 0;
  while (firstNonSystem < messages.length && messages[firstNonSystem].role === "system") firstNonSystem++;
  const head = messages.slice(0, firstNonSystem);
  const history = messages.slice(firstNonSystem);
  if (history.length < 4) return { messages, stats };

  // walk history from the start until we've spanned the compact span.
  // NEVER span into the final message pair: the current user prompt (+ the
  // assistant reply before it) must reach the model verbatim — at small
  // thresholds (backchannel modes) history can be shorter than the span,
  // and spanning everything would summarize the live prompt away.
  let span = 0;
  let spanTokens = 0;
  while (span < history.length - 2 && spanTokens < spanBudget) {
    const m = history[span];
    spanTokens += typeof m.content === "string" ? estTokens(m.content) : estTokens(JSON.stringify(m.content ?? ""));
    span++;
  }
  // Needed-set keep (Parsec-trim needed-set concept, frequency-counted):
  // span blocks the SURVIVING history still references (paths/call-shapes
  // mentioned ≥2 times later) stay verbatim; the rest is summarized.
  // Deterministic + capped at 20% of span tokens. Memo key stays spanText
  // (kept blocks recomputed fresh each call — same input, same output).
  const keepIdx = neededSetKeep(history, span, spanTokens);

  const spanText = history
    .slice(0, span)
    .filter((_, i) => !keepIdx.has(i))
    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n\n");
  if (!spanText.trim()) return { messages, stats }; // degenerate: all kept

  let summary: string;
  try {
    summary = await summarize(spanText);
  } catch (err) {
    console.error("[compact] summarizer failed (fail-open):", (err as Error).message);
    return { messages, stats }; // fail-open: send original
  }
  const keptText = [...keepIdx]
    .sort((a, b) => a - b)
    .map((i) => {
      const m = history[i];
      return `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`;
    })
    .join("\n\n");
  const compactedBlock: ChatMessage = {
    role: "user",
    content: `[COMPACTED HISTORY — summary of the first ${span} messages (${spanTokens} est tokens) + ${keepIdx.size} verbatim-needed blocks. Originals are not re-sent.]\n\n${summary}${keptText ? `\n\n[VERBATIM — still referenced later in this session:]\n${keptText}` : ""}`,
  };
  const out = [...head, compactedBlock, ...history.slice(span)];
  stats.triggered = true;
  stats.spanMessages = span;
  stats.tokensBefore = total;
  stats.tokensAfter = messagesTokens(out);
  stats.summaryTokens = estTokens(summary);
  stats.keptBlocks = keepIdx.size;
  return { messages: out, stats };
}