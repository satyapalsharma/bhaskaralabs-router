// Stage Router — Switchyard-inspired (NVIDIA NeMo Switchyard blog, 2026-08).
// A coding agent moves through phases; each phase needs different model
// capability:
//
//   EXPLORE  — early: reading files, listing dirs, grepping, recovering from
//              errors. High uncertainty → capable model pays off.
//   MECHANICAL — late: steady writes/edits, tests passing. Routine → cheap
//              lane wins.
//
// Signal source: the request's OWN tool activity (live zone = fresh tool
// results after the last assistant message) — stateless, no new storage.
//
// Detection rules (concrete shapes, high precision):
//   MECHANICAL evidence: passing tests ("0 fail", "N pass" no fails),
//              file reads (no errors), clean greps with few results.
//   EXPLORE evidence: failing tests, compile errors (TSxxxx, error), stack
//              traces, exit codes != 0, many consecutive reads (still
//              searching), empty grep results (not found yet).
//
// Used as a modifier on hardness: EXPLORE pushes routine→debugging (capable
// model), MECHANICAL keeps/downgrades to routine (cheap lane).

import type { ChatMessage } from "./prefix";
export type AgentStage = "explore" | "mechanical" | "unknown";

/** Tool results that say "still figuring things out" (errors, failures). */
const EXPLORE_PATTERNS: RegExp[] = [
  /\b[1-9]\d*\s+(fail|failing|failed|error|errors)\b/i,
  /\berror\s+TS\d{3,5}\b/,
  /\b(fail|failing|failed)\s+\([1-9]\d*\)/i,
  /\bexit\s+code\s+[1-9]\d*\b/i,
  /\bcommand\s+not\s+found:/i,
  /\bTraceback\s+\(/,
  /\bnot\s+found\b/i,
  /\bno\s+such\s+file\b/i,
  /\bECONNREFUSED\b|\bEPERM\b|\bENOENT\b/,
];

/** Tool results that say "things are working" (tests green, builds clean). */
const MECHANICAL_PATTERNS: RegExp[] = [
  /\b0\s+fail/i,
  /\b\d+\s+pass(ed)?\b.{0,20}\b0\s+fail/i,
  /\ball\s+tests?\s+pass/i,
  /\bcompiled\s+successfully\b/i,
  /\bbuilt\s+successfully\b/i,
  /\btsc\b.{0,30}\b(no\s+errors|0\s+errors)\b/i,
];

export interface StageSignals {
  stage: AgentStage;
  exploreBlocks: number;
  mechanicalBlocks: number;
  liveZoneBlocks: number;
}

/** Detect the agent's phase from the request's live-zone tool activity. */
export function detectStage(messages: ChatMessage[]): StageSignals {
  // live zone = after last assistant message (fresh tool results + prompt)
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }

  let exploreBlocks = 0;
  let mechanicalBlocks = 0;
  let liveZoneBlocks = 0;
  for (let i = lastAssistantIdx + 1; i < messages.length; i++) {
    const msg = messages[i];
    const text = typeof msg.content === "string" ? msg.content : null;
    if (!text || (msg.role !== "user" && msg.role !== "tool")) continue;
    liveZoneBlocks++;
    if (EXPLORE_PATTERNS.some((re) => re.test(text))) exploreBlocks++;
    if (MECHANICAL_PATTERNS.some((re) => re.test(text))) mechanicalBlocks++;
  }

  let stage: AgentStage = "unknown";
  if (liveZoneBlocks > 0) {
    if (exploreBlocks > 0) stage = "explore"; // any error signal dominates
    else if (mechanicalBlocks > 0) stage = "mechanical";
  }
  return { stage, exploreBlocks, mechanicalBlocks, liveZoneBlocks };
}
