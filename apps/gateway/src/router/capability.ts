// Capability vector: p(x) ∈ Δ⁶ — what the turn is asking for.
//
// Brick derives this from a fine-tuned ModernBERT classifier. We derive it from
// signals this gateway already computes, for three reasons:
//
//   1. Their classifier costs ~500ms p50 in production (paper §9) on a remote
//      endpoint. Our hot path is a streaming proxy with a latency budget.
//   2. Their six dimensions describe general assistant work. Ours describe the
//      failure modes we have actually observed (see CAPABILITY_EVIDENCE).
//   3. We already wrote these patterns to fix real incidents. Throwing them away
//      for a generic classifier would be a downgrade, not an upgrade.
//
// This is a prior, not a trained model. It is deterministic, testable, and free.
// The skill matrix it feeds is where the learned part lives.
//
// Every input here is a regex or arithmetic pass over data the decision already
// touches — this adds no I/O.

import { CAPABILITIES, type Capability, clipSkill } from "@bhaskara/shared/skill";
import type { ChatMessage } from "../lib/prefix";
import { estimateTokens } from "../lib/prefix";

/** Base weights per signal. Deliberately readable: each line is one observation
 *  about what a turn is asking for, and the number is how strongly it points at
 *  that capability. Tuned against tier share once the compare data lands. */
type Weight = [Capability, number];

const TEXT_RULES: { re: RegExp; weights: Weight[] }[] = [
  // ── planning: architecture before any edit ──
  {
    re: /\b(architect|architecture|design\s+(a|the)\s+\w+|system\s+design|trade[- ]?offs?|propose|strategy)\b/i,
    weights: [["planning", 6]],
  },
  {
    re: /\b(plan|approach|options?|should\s+(we|i)\b|how\s+would\s+you)\b/i,
    weights: [["planning", 2.5]],
  },

  // ── debug: diagnosis of something already broken ──
  {
    re: /\b(failing|failed|fails|failure|flaky|broken|not\s+work\w*|wrong|bug)\b/i,
    weights: [["debug", 5]],
  },
  {
    re: /\b(traceback|stack\s+trace|panic|segfault|exception|throw\w*)\b/i,
    weights: [["debug", 5]],
  },
  {
    re: /\b(debug|diagnose|investigate|root\s+cause|why\s+(is|does|did|are))\b/i,
    weights: [["debug", 4]],
  },

  // ── type_repair: the failure class a 27B keeps losing ──
  {
    re: /\bTS\d{3,5}\b/,
    weights: [["type_repair", 9]],
  },
  {
    re: /\b(type\s+error|type\s+check|tsc|compiler?\s+error|does\s+not\s+satisfy|not\s+assignable|union\s+narrow\w*|type\s+narrow\w*)\b/i,
    weights: [["type_repair", 6]],
  },

  // ── refactor: structural change across call sites ──
  {
    re: /\b(refactor|restructure|extract|rename\s+(all|across)|migrate|port\s+to|rewrite)\b/i,
    weights: [["refactor", 4]],
  },
  {
    re: /\b(whole|entire|across\s+(the\s+)?(codebase|project|repo)|every\s+(file|call\s?site|usage))\b/i,
    weights: [["refactor", 4]],
  },

  // ── codegen: construction, following a pattern ──
  {
    re: /\b(implement|add|create|write|build|generate|scaffold)\b/i,
    weights: [["codegen", 2]],
  },
  {
    re: /\b(like\s+the\s+(other|existing)|same\s+pattern|follow\s+the\s+existing|consistent\s+with)\b/i,
    weights: [["codegen", 3]],
  },
];

/** Failure evidence in the live zone shifts demand toward repair capabilities.
 *  This is what makes escalation-on-failure a *capability* signal instead of a
 *  special case: a failing test is evidence the turn is now a debug turn. */
const FAILURE_WEIGHTS: Weight[] = [
  ["debug", 7],
  ["type_repair", 3],
];

/** The stage router already distinguishes "still exploring" from "mechanically
 *  making progress". Exploration is diagnosis; mechanical work is construction. */
const STAGE_WEIGHTS: Record<string, Weight[]> = {
  explore: [
    ["debug", 6],
    ["planning", 1],
  ],
  mechanical: [["codegen", 4]],
  unknown: [],
};

export interface CapabilityInput {
  messages: ChatMessage[];
  /** From classifyHardness: routine | planning | debugging | architect. */
  hardness: string;
  /** From detectStage: explore | mechanical | unknown. */
  stage: string;
  /** From scanFailureSignals: count of live-zone blocks matching failure patterns. */
  failBlocks: number;
  /** From detectStage/scanFailureSignals: repeated identical tool calls. */
  loopRepeats: number;
}

/** Tokens per live-zone block above which the turn is treated as context-heavy.
 *  Mirrors DUD_MIN_PROMPT (40k) from escalation.ts — the same threshold the dud
 *  detector uses, so the two agree on what "long" means. */
const LONG_CONTEXT_TOKENS = 40_000;

/** Build the capability distribution for a turn. Always a valid point on the
 *  6-simplex: non-negative and summing to 1. */
export function capabilityVector(input: CapabilityInput): Record<Capability, number> {
  const scores = new Map<Capability, number>(CAPABILITIES.map((c) => [c, 0]));

  const bump = (weights: Weight[], scale = 1) => {
    for (const [cap, w] of weights) {
      scores.set(cap, (scores.get(cap) ?? 0) + w * scale);
    }
  };

  // Text of the turn: last user message plus any fresh tool/user blocks after
  // the last assistant turn (the same "live zone" escalation.ts scans).
  const liveText = liveZoneText(input.messages);
  for (const rule of TEXT_RULES) {
    if (rule.re.test(liveText)) bump(rule.weights);
  }

  // Hardness is a coarser read of the same text; it nudges the two capabilities
  // that actually need a bigger model.
  if (input.hardness === "planning" || input.hardness === "architect") {
    bump([["planning", 4]]);
  }
  if (input.hardness === "debugging") {
    bump([["debug", 3]]);
  }

  // Stage: tool activity says what phase the agent is in.
  bump(STAGE_WEIGHTS[input.stage] ?? []);

  // Failure evidence dominates — a turn carrying a failing test is a repair turn
  // regardless of how it was phrased. Scaled so several blocks saturate rather
  // than run away.
  if (input.failBlocks > 0) {
    bump(FAILURE_WEIGHTS, Math.min(input.failBlocks, 3));
  }
  if (input.loopRepeats >= 3) {
    // Repeating the same tool call is "this is not working" — the same
    // observation TOOL_LOOP_ESCALATE_AT encodes.
    bump([["debug", 4]], 1);
  }

  // Context pressure is a capability demand in its own right: long sessions need
  // instruction-following at length, which is its own failure mode.
  const tokens = estimateTokens(input.messages);
  if (tokens >= LONG_CONTEXT_TOKENS) {
    const over = Math.min((tokens - LONG_CONTEXT_TOKENS) / LONG_CONTEXT_TOKENS, 1);
    bump([["long_context", 3 + 4 * over]]);
  }

  const total = [...scores.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) {
    // No signal at all. Uniform is the honest answer — it makes every model's
    // expected success equal, so the cost term decides, which is the correct
    // behaviour for a turn we cannot classify.
    const uniform = 1 / CAPABILITIES.length;
    return Object.fromEntries(CAPABILITIES.map((c) => [c, uniform])) as Record<
      Capability,
      number
    >;
  }

  return Object.fromEntries(
    [...scores.entries()].map(([c, v]) => [c, v / total]),
  ) as Record<Capability, number>;
}

/** Everything after the last assistant message, joined. Bounded so a giant
 *  history cannot make the regex pass expensive. */
function liveZoneText(messages: ChatMessage[]): string {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      start = i + 1;
      break;
    }
  }
  const parts: string[] = [];
  for (let i = start; i < messages.length; i++) {
    const content = messages[i].content;
    if (typeof content === "string") parts.push(content);
    else if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === "object" && "text" in block) {
          const t = (block as { text?: unknown }).text;
          if (typeof t === "string") parts.push(t);
        }
      }
    }
  }
  const joined = parts.join("\n");
  return joined.length > 20_000 ? joined.slice(-20_000) : joined;
}

/** Dense array form, ordered by CAPABILITIES. Used by the routing math and the
 *  persisted signal blob.
 *
 *  No skill clipping here: this is the query's requirement distribution, not an
 *  estimate of anyone's success rate. A dimension the turn does not touch is
 *  legitimately 0, and clipping it to 0.02 would invent demand that is not
 *  there (and break the simplex property). Skill values are clipped where they
 *  are consumed, in skillDistance. */
export function capabilityArray(p: Record<Capability, number>): number[] {
  return CAPABILITIES.map((c) => {
    const v = p[c] ?? 0;
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
}

/** Difficulty label + confidence from the same signals, mapped onto the
 *  anchors in shared/skill.ts. Confidence is intentionally conservative: a
 *  regex match is weak evidence, so the blend keeps it near medium. */
export function difficultyOf(input: CapabilityInput): {
  label: "easy" | "medium" | "hard";
  confidence: number;
} {
  if (input.hardness === "architect") return { label: "hard", confidence: 0.85 };
  if (input.hardness === "debugging" || input.hardness === "planning") {
    return { label: "hard", confidence: 0.7 };
  }
  if (input.stage === "mechanical" && input.failBlocks === 0) {
    return { label: "easy", confidence: 0.6 };
  }
  if (input.failBlocks > 0) return { label: "hard", confidence: 0.8 };
  return { label: "medium", confidence: 0.5 };
}
