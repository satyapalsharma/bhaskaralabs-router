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
  failureSignal?: boolean;       // failing tests/compile in this request's live zone (escalation-on-failure)
}

export interface RouterDecision {
  provider: "hyper" | "devpass" | "agnes" | "stepfun";
  upstreamModel: string;
  tier: "full" | "flash";
  effort: EffortLevel;
  reason: string;
  hardCapped: boolean;
  /** Fair-use state for response nudges: near-cap (>=8% weekly full-share) or capped (>=10%). */
  fairUse?: "alert" | "capped";
  /** User's weekly full-share when it was computed for this decision (0..1). */
  fairUseShare?: number;
}

export const FLASH_OF: Record<string, string> = {
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
  // Fair-use nudge state: alert at 8% weekly full-share, hard cap at 10%.
  const fairUse = signals.fullShareThisWeek >= ROUTER.fullShareCapPerUserPerWeek
    ? "capped"
    : signals.fullShareThisWeek >= ROUTER.fullShareAlertAt
      ? "alert"
      : undefined;

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
      fairUse,
      fairUseShare: signals.fullShareThisWeek,
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
      hardness === "architect" ||
      signals.failureSignal === true); // escalation-on-failure: failing tests/compile → full

  if (wantsFull) {
    return {
      provider: "hyper",
      upstreamModel: fullModel,
      tier: "full",
      effort: "max",
      reason: signals.failureSignal === true && hardness === "routine"
        ? "failure-escalation"
        : `hardness=${hardness}${signals.failureSignal === true ? "+failure-signal" : ""}`,
      hardCapped: false,
      fairUse,
      fairUseShare: signals.fullShareThisWeek,
    };
  }

  return {
    provider: "hyper",
    upstreamModel: flashModel,
    tier: "flash",
    effort: "low",
    reason: `hardness=${hardness}, full-share ${(signals.fullShareThisWeek * 100).toFixed(1)}%`,
    hardCapped: capExceeded,
    fairUse,
    fairUseShare: signals.fullShareThisWeek,
  };
}

// theta routing: cheap turns → first enabled bootstrap backend (agnes → stepfun → devpass);
// hard turns → devpass deepseek (best reasoning of the three; falls back through chain too).
export interface ThetaBackends {
  agnes: boolean;
  stepfun: boolean;
  devpass: boolean;
}

export function routeTheta(text: string, backends: ThetaBackends): RouterDecision {
  const hardness = classifyHardness(text);
  const hard = hardness === "debugging" || hardness === "planning";
  // Preference: hard → devpass first (deepseek reasons best); routine → agnes first (flat cost).
  const chain: Array<{ id: "devpass" | "agnes" | "stepfun"; model: string }> = hard
    ? [
        { id: "devpass", model: "deepseek-v4-flash-0731" },
        { id: "stepfun", model: "step-3.7-flash" },
        { id: "agnes", model: "agnes-2.5-flash" },
      ]
    : [
        { id: "agnes", model: "agnes-2.5-flash" },
        { id: "stepfun", model: "step-3.7-flash" },
        { id: "devpass", model: "deepseek-v4-flash-0731" },
      ];
  const pick = chain.find((b) => backends[b.id]);
  if (!pick) {
    return { provider: "devpass", upstreamModel: "deepseek-v4-flash-0731", tier: "flash", effort: "low", reason: "theta-no-backend", hardCapped: false };
  }
  return {
    provider: pick.id,
    upstreamModel: pick.model,
    tier: "flash",
    effort: "low",
    reason: hard ? `theta-hard=${hardness}` : `theta-routine=${hardness}`,
    hardCapped: false,
  };
}