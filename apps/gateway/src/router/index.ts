// Router v0: decides which upstream model serves a request.
// Decision rule: (prefix size, cache-eligibility, task hardness) → tier.
// HARD CAP: 10% full-model share per user/week (spill → flash + fair-use nudge).
// Session stickiness: once a session locks a workhorse model, it stays.

import { ROUTER, HYPER } from "@bhaskara/shared/pricing";
import { FEIHOA_MODEL } from "../providers/feihoa";
import { YOLO_MODEL } from "../providers/yolo";

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
  provider: "hyper" | "devpass" | "agnes" | "stepfun" | "feihoa" | "yolo";
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

// ── Backchannel smart routing ──
// Two OpenAI-compat backchannel lanes behind the frontier endpoints:
//   feihoa — Qwen3.8-27B-Uncensored, 32K window, unlimited reqs, concurrency 1
//   yolo   — qwen3.8-27b,           128K window, builder plan (no daily cap), concurrency 4
// Lane selection is context-size aware: small contexts fit feihoa's 32K window
// (the unlimited lane); large contexts route to yolo's 128K window so the
// context engine doesn't have to compact as hard. Either lane fails over to
// the other on capacity/provider errors. The router owns the policy; the
// route handler only executes a hop.
export const BACKCHANNEL_CHAIN = ["feihoa", "yolo"] as const;
export type BackchannelLane = (typeof BACKCHANNEL_CHAIN)[number];

/** Pick the primary backchannel lane by estimated context size. */
export function backchannelPrimary(rawInTokens: number, feihoaBudget: number): BackchannelLane {
  return rawInTokens <= feihoaBudget ? "feihoa" : "yolo";
}

/** Statuses that justify a backchannel hop (capacity / provider failure). */
const FAILOVER_STATUSES = new Set([429, 409, 500, 502, 503]);

/**
 * Next backchannel lane after a failed dispatch, or null (no hop).
 * feihoa → yolo always (yolo's 128K window fits anything).
 * yolo → feihoa only when the (already window-fitted) payload fits feihoa's
 * 32K budget — otherwise the hop would 400 on context length.
 */
export function backchannelNext(
  provider: RouterDecision["provider"],
  status: number,
  opts?: { fitsFeihoa?: boolean },
): RouterDecision["provider"] | null {
  if (!FAILOVER_STATUSES.has(status)) return null;
  if (provider === "feihoa") return "yolo";
  if (provider === "yolo") return opts?.fitsFeihoa ? "feihoa" : null;
  return null;
}


/**
 * qwen-3.8 smart routing across four upstream lanes (cost + quality + context aware):
 *   hard/planning turns      → qwen3.8-max   (Hyper, paid, best quality)
 *   routine, ctx ≤ feihoa    → feihoa        (free, 32K, concurrency 1)
 *   routine, ctx ≤ yolo      → yolo          (free, 128K, concurrency 4)
 *   routine, ctx > yolo / free off → qwen3.8-flash (Hyper, paid, unlimited)
 * Free lanes are $0 COGS so they win when they fit; Hyper is the reliability
 * + quality backstop. Failover (backchannelNext) still chains feihoa→yolo→flash.
 */
export function routeQwenSmart(signals: {
  hardness: RouterSignals["hardness"];
  prefixTokens: number;
  fullShareThisWeek: number;
  feihoaOn: boolean;
  feihoaFree: boolean; // semaphore: is feihoa's single slot idle right now?
  yoloOn: boolean;
  yoloFree: boolean; // semaphore: does yolo have a free slot (<4 in flight)?
  feihoaBudget: number;
  yoloBudget: number;
}): RouterDecision {
  const hard = signals.hardness === "planning" || signals.hardness === "debugging" || signals.hardness === "architect";
  if (hard && signals.fullShareThisWeek < ROUTER.fullShareCapPerUserPerWeek) {
    return { provider: "hyper", upstreamModel: "qwen3.8-max", tier: "full", effort: "max", reason: `smart-qwen=hard:${signals.hardness}`, hardCapped: false };
  }
  // FLIPPED (data-driven 2026-09-03): yolo is ~2.8x faster (29.6 vs 10.4 median
  // out-TPS) and has 4 slots, so it is the PRIMARY free lane. feihoa (slow,
  // 1 slot) is the SECONDARY free lane, used only when yolo's 4 slots are all
  // busy and context fits feihoa's 32K window. hyper flash is the backstop.
  if (signals.yoloOn && signals.yoloFree && signals.prefixTokens <= signals.yoloBudget) {
    return { provider: "yolo", upstreamModel: YOLO_MODEL, tier: "flash", effort: "low", reason: "smart-qwen=yolo", hardCapped: false };
  }
  if (signals.feihoaOn && signals.feihoaFree && signals.prefixTokens <= signals.feihoaBudget) {
    return { provider: "feihoa", upstreamModel: FEIHOA_MODEL, tier: "flash", effort: "low", reason: "smart-qwen=feihoa(yolo-busy)", hardCapped: false };
  }
  return { provider: "hyper", upstreamModel: "qwen3.8-flash", tier: "flash", effort: "low", reason: "smart-qwen=flash", hardCapped: false };
}
/** Failover decision: same turn, same (already window-fitted) messages, new lane. */
export function failoverDecision(d: RouterDecision, to: RouterDecision["provider"], cause: string): RouterDecision {
  return { ...d, provider: to, reason: `${d.reason} → failover-${to}(${cause})`, hardCapped: false };
}