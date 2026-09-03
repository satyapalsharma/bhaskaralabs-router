// Upstream window guard — hard fit for small-context backchannel providers.
// Runs AFTER compaction + live-zone compression. If the estimated provider
// context (messages + tool schemas) still exceeds the upstream input budget,
// drop the OLDEST non-system history messages until it fits. The most recent
// messages (the live zone: fresh tool results + current prompt) are always
// kept — we trim from the front, never the tail.
//
// This is the safety net under compaction: compaction summarizes the span,
// the guard guarantees the payload actually fits the upstream window even
// when a single fresh tool result is huge or tool schemas eat the budget.

import type { ChatMessage } from "./prefix";

export interface WindowGuardStats {
  triggered: boolean;
  droppedMessages: number;
  tokensBefore: number;
  tokensAfter: number;
  limit: number;
}

function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function msgTokens(m: ChatMessage): number {
  return typeof m.content === "string" ? estTokens(m.content) : estTokens(JSON.stringify(m.content ?? ""));
}

/**
 * Trim oldest non-system history until (messages + extraTokens) ≤ limit.
 * extraTokens = tool schemas + other fixed overhead (never trimmed).
 * Keeps: leading system messages, ALL trailing messages after the trim point.
 */
export function fitUpstreamWindow(
  messages: ChatMessage[],
  extraTokens: number,
  limit: number,
): { messages: ChatMessage[]; stats: WindowGuardStats } {
  const total = () => messages.reduce((s, m) => s + msgTokens(m), 0) + extraTokens;
  const stats: WindowGuardStats = {
    triggered: false,
    droppedMessages: 0,
    tokensBefore: total(),
    tokensAfter: 0,
    limit,
  };

  if (stats.tokensBefore <= limit) {
    stats.tokensAfter = stats.tokensBefore;
    return { messages, stats };
  }

  // compactable region: after leading system messages
  let firstNonSystem = 0;
  while (firstNonSystem < messages.length && messages[firstNonSystem].role === "system") firstNonSystem++;

  // walk from the start, dropping whole messages until we fit.
  // never drop into the final user message (the model must see the prompt);
  // if we can't fit even then, the caller will see a 4xx from upstream — honest.
  let drop = firstNonSystem;
  let running = stats.tokensBefore;
  const minKeep = 2; // at least the last turn pair stays
  while (drop < messages.length - minKeep && running > limit) {
    running -= msgTokens(messages[drop]);
    drop++;
  }

  if (drop === firstNonSystem) {
    stats.tokensAfter = running;
    return { messages, stats }; // nothing droppable
  }

  stats.triggered = true;
  stats.droppedMessages = drop - firstNonSystem;
  stats.tokensAfter = running;
  const out = [...messages.slice(0, firstNonSystem), ...messages.slice(drop)];
  return { messages: out, stats };
}
