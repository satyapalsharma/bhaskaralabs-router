// Router v0: decides which upstream model serves a request.
// Decision rule: (prefix size, cache-eligibility, task hardness) → tier.
// HARD CAP: 10% full-model share per user/week (spill → flash + fair-use nudge).
// Session stickiness: once a session locks a workhorse model, it stays.

import { ROUTER, HYPER } from "@bhaskara/shared/pricing";

export type EffortLevel = "low" | "high" | "max";

export interface RouterSignals {
  endpointModel: "glm-5.3" | "qwen-3.8" | "theta";
  prefixTokens: number;          // size of stable prefix (system+tools+history)
  isNewSession: boolean;
  sessionLockedModel?: string;   // existing workhorse for this session, if any
  fullShareThisWeek: number;     // 0..1 — user's full-model share so far
  hardness: "routine" | "planning" | "debugging" | "architect";
  userRequestedFull?: boolean;   // explicit user opt-in (future UI affordance)
}

export interface RouterDecision {
  provider: "hyper" | "devpass" | "agnes" | "stepfun";
  upstreamModel: string;
  tier: "full" | "flash";
  effort: EffortLevel;
  reason: string;
  hardCapped: boolean;
}

const FLASH_OF: Record<string, string> = {
  "glm-5.3": "glm-5.3-flash",
  "qwen3.8-max": "qwen3.8-flash",
};

const FULL_OF: Record<string, string> = {
  "glm-5.3": "glm-5.3",
  "qwen-3.8": "qwen3.8-max",
};

// Signals that justify the full model. Heuristics v0 — Needle2 replaces this post-beta.
const HARD_PATTERNS: RegExp[] = [
  /\b(architect|architecture|design\s+(a|the)\s+system)\b/i,
  /\b(why\s+(is|does|did)\b.{0,40}\b(fail|failing|broken|not\s+work))/i,
  /\b(root\s+cause|debug\s+this|mysterious|flaky\s+test)\b/i,
  /\b(security|race\s+condition|deadlock|memory\s+leak)\b/i,
  /\b(refactor.{0,30}(whole|entire|large)\b)/i,
];

export function classifyHardness(text: string): RouterSignals["hardness"] {
  if (HARD_PATTERNS.some((re) => re.test(text))) return "debugging";
  if (/\b(plan|design|propose|strategy|should\s+we|trade[- ]?off)\b/i.test(text)) return "planning";
  return "routine";
}

export function route(signals: RouterSignals): RouterDecision {
  // Session stickiness — a locked session stays on its workhorse model.
  if (!signals.isNewSession && signals.sessionLockedModel) {
    const locked = signals.sessionLockedModel;
    const tier = HYPER[locked] && !locked.includes("flash") ? "full" : "flash";
    return {
      provider: "hyper",
      upstreamModel: locked,
      tier,
      effort: "low",
      reason: "session-sticky",
      hardCapped: false,
    };
  }

  const fullModel = signals.endpointModel === "qwen-3.8" ? "qwen3.8-max" : "glm-5.3";
  const flashModel = FLASH_OF[fullModel];
  const hardness = signals.hardness;

  // HARD CAP: if user already burned their weekly full-share, force flash.
  const capExceeded = signals.fullShareThisWeek >= ROUTER.fullShareCapPerUserPerWeek;

  const wantsFull =
    !capExceeded &&
    (signals.userRequestedFull === true ||
      hardness === "planning" ||
      hardness === "debugging" ||
      hardness === "architect");

  if (wantsFull) {
    return {
      provider: "hyper",
      upstreamModel: fullModel,
      tier: "full",
      effort: "max",
      reason: `hardness=${hardness}`,
      hardCapped: false,
    };
  }

  return {
    provider: "hyper",
    upstreamModel: flashModel,
    tier: "flash",
    effort: "low",
    reason: `hardness=${hardness}, full-share ${(signals.fullShareThisWeek * 100).toFixed(1)}%`,
    hardCapped: capExceeded,
  };
}

// theta routing: cheap turns → agnes/stepfun flash; hard → devpass deepseek (bootstrap).
// v0: everything cheap to agnes if enabled, else stepfun, else devpass (which is also the hard target).
export function routeTheta(text: string): RouterDecision {
  const hard = classifyHardness(text) === "debugging" || classifyHardness(text) === "planning";
  return {
    provider: hard ? "devpass" : "agnes",
    upstreamModel: hard ? "deepseek-v4-flash-0731" : "agnes-2.5-flash",
    tier: "flash",
    effort: "low",
    reason: hard ? "theta-hard" : "theta-routine",
    hardCapped: false,
  };
}