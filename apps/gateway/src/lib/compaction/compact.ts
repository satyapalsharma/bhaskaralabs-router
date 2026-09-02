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

/** Deterministic summarizer call — direct Hyper flash (no auth loopback, no double-metering). */
async function summarize(text: string): Promise<string> {
  const h = hash(text);
  const memo = MEMO.get(h);
  if (memo) return memo;

  const { hyperChat } = await import("../../providers/hyper");
  const key = (process.env.HYPER_API_KEYS ?? process.env.HYPER_API_KEY ?? "").split(",")[0]?.trim();
  if (!key) throw new Error("no hyper key for summarizer");
  const prompt = `Summarize the following conversation history for a coding agent continuing the same session. Keep: decisions made, file names, function/type names, error causes and fixes, current task state, open TODOs. Drop: pleasantries, exploration dead-ends, repeated context. Output ONLY the summary as a compact bullet list, max 400 words.\n\n${text.slice(0, compactSpan() * 4)}`;
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
export async function maybeCompact(
  messages: ChatMessage[],
  opts: { alreadyCompacted?: boolean; logSkip?: boolean } = {},
): Promise<{ messages: ChatMessage[]; stats: CompactStats }> {
  const stats: CompactStats = { triggered: false, spanMessages: 0, tokensBefore: 0, tokensAfter: 0, summaryTokens: 0 };
  if (opts.alreadyCompacted) return { messages, stats };
  const total = messagesTokens(messages);
  if (total <= compactThreshold()) {
    if (opts.logSkip) console.log(JSON.stringify({ ev: "compact-skip", estTokens: total, threshold: compactThreshold() }));
    return { messages, stats };
  }
  // split: leading system messages stay; the rest is compactable history
  let firstNonSystem = 0;
  while (firstNonSystem < messages.length && messages[firstNonSystem].role === "system") firstNonSystem++;
  const head = messages.slice(0, firstNonSystem);
  const history = messages.slice(firstNonSystem);
  if (history.length < 4) return { messages, stats };

  // walk history from the start until we've spanned the compact span
  let span = 0;
  let spanTokens = 0;
  while (span < history.length && spanTokens < compactSpan()) {
    const m = history[span];
    spanTokens += typeof m.content === "string" ? estTokens(m.content) : estTokens(JSON.stringify(m.content ?? ""));
    span++;
  }
  if (span < 2) return { messages, stats };

  const spanText = history
    .slice(0, span)
    .map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n\n");

  let summary: string;
  try {
    summary = await summarize(spanText);
  } catch (err) {
    console.error("[compact] summarizer failed (fail-open):", (err as Error).message);
    return { messages, stats }; // fail-open: send original
  }
  const compactedBlock: ChatMessage = {
    role: "user",
    content: `[COMPACTED HISTORY — summary of the first ${span} messages (${spanTokens} est tokens). Originals are not re-sent.]\n\n${summary}`,
  };
  const out = [...head, compactedBlock, ...history.slice(span)];
  stats.triggered = true;
  stats.spanMessages = span;
  stats.tokensBefore = total;
  stats.tokensAfter = messagesTokens(out);
  stats.summaryTokens = estTokens(summary);
  return { messages: out, stats };
}