// Escalation-on-failure: quality signals from the live zone of the request
// (fresh tool results) + empty-output streaks escalate the session to the
// full model on the NEXT turn, paying the same reeval gates (prefix penalty,
// weekly full-share cap, switch churn guard) as a hardness upgrade.
//
// The scan is STATELESS — it looks only at the current request's live zone,
// never at stored history: no new per-request storage, no cache risk.
//
// Failure patterns: the concrete, unambiguous shapes we saw in testing.
// NOT a general-purpose error detector — misses are fine (hardness patterns
// + escalation-on-failure is a heuristic safety net), false positives are not.

import { ROUTER } from "@bhaskara/shared/pricing";
import type { ChatMessage } from "./prefix";

export interface EscalationSignals {
  /** Live-zone blocks with a concrete failure signature (tests, compile, exit codes). */
  testFailBlocks: number;
}

/** Regexes with concrete failure shapes — high precision, low recall. */
const FAIL_PATTERNS: RegExp[] = [
  // test runners: bun/vitest/jest "N fail" summaries — always a run result, never prose
  /\b(\d+)\s+fail(?:ed|ures?)?\b/i,
  /\bfail(?:ed)?\s+\((\d+)\)/i,
  /\b(\d+)\s+failing\b/i,
  /\b(\d+)\s+error(?:s)?\s+(?:found|generated)\b/i,
  // compilers/interpreters — canonical shapes only
  /\berror\s+TS\d{3,5}\b/, // tsc
  /\berror:\s+no\s+rule\s+to\s+make\s+target\b/,
  /\bSyntaxError:/,
  /\bTypeError:/,
  /\bModuleNotFoundError:/,
  /\bcommand\s+not\s+found:/,
  /\bTraceback\s+\(most\s+recent\s+call\s+last\):/,
  /\bnpm\s+err!.*code\s+ELIFECYCLE/,
  // exit codes — shell run results
  /\bexit\s+code\s+(\d+)\b/,
  /\bexited\s+with\s+(?:code\s+)?([1-9]\d*)\b/,
  /\bRC=([1-9]\d*)\b/,
];

export function scanFailureSignals(messages: ChatMessage[]): EscalationSignals {
  if (!ROUTER.escalation.enabled) return { testFailBlocks: 0 };

  // Live zone = everything after the last assistant message: fresh tool results
  // + the current user prompt. History is cached prefix — never re-examined.
  function liveZoneStart(messages: ChatMessage[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i + 1;
    }
    return 0;
  }

  let testFailBlocks = 0;
  const start = liveZoneStart(messages);
  for (let i = start; i < messages.length; i++) {
    const msg = messages[i];
    // content can be structured (tool_call parts); scan only string content
    const text = typeof msg.content === "string" ? msg.content : null;
    if (text && (msg.role === "user" || msg.role === "tool")) {
      if (FAIL_PATTERNS.some((re) => re.test(text))) testFailBlocks++;
    }
  }
  return { testFailBlocks };
}

// ── Empty-output streak tracking ──
// Consecutive upstream completions with zero content chars (observed GLM
// empty-content instability). One empty reply = flake; N in a row = the model
// is stuck → escalate. Map is in-process; streak resets on any content.
// Bounded: single-box gateway, sessions age out with the session lock TTL.

const emptyStreaks = new Map<string, number>();
const EMPTY_STREAK_SWEEP_MS = 6 * 60 * 60 * 1000; // 6h sweep
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < EMPTY_STREAK_SWEEP_MS) return;
  lastSweep = now;
  if (emptyStreaks.size > 0) emptyStreaks.clear();
}

/** Record that the session's latest upstream turn returned `contentChars`. */
export function recordContentChars(sessionId: string, contentChars: number): void {
  const now = Date.now();
  sweep(now);
  if (contentChars > 0) {
    emptyStreaks.delete(sessionId);
    return;
  }
  emptyStreaks.set(sessionId, (emptyStreaks.get(sessionId) ?? 0) + 1);
}

/** Current consecutive-empty-output streak for the session (0 = healthy). */
export function emptyOutputStreak(sessionId: string): number {
  return emptyStreaks.get(sessionId) ?? 0;
}

/** Content chars of a completed response JSON — OpenAI choices[].message.content
 * or Anthropic content[] text blocks. 0 when absent/empty. */
export function contentCharsOf(json: unknown): number {
  if (typeof json !== "object" || json === null) return 0;
  const j = json as Record<string, unknown>;
  // OpenAI shape
  if (Array.isArray(j.choices)) {
    const msg = (j.choices[0] as { message?: { content?: unknown } } | undefined)?.message;
    if (typeof msg?.content === "string") return msg.content.length;
  }
  // Anthropic shape
  if (Array.isArray(j.content)) {
    let n = 0;
    for (const part of j.content as Array<{ type?: string; text?: unknown }>) {
      if (part?.type === "text" && typeof part.text === "string") n += part.text.length;
    }
    return n;
  }
  return 0;
}
