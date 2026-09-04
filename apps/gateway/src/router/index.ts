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
  provider: "hyper" | "devpass" | "agnes" | "stepfun" | "feihoa" | "yolo" | "llmgateway";
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
  // fix/repair turns — 27B models are weak at precise TS type-repair
  // (observed: TS2339/TS2345 union-narrowing errors survived 8 fix rounds);
  // route them to the frontier model.
  /\b(fix|repair|resolve)\b.{0,30}\b(error|errors|fail|fails|failing|broken|type|TS\d{3,5}|compile|compilation|build)\b/i,
  /\b(error|errors|fail|fails|failing|broken|type|TS\d{3,5}|compile|compilation|build)\b.{0,30}\b(fix|repair|resolve)\b/i,
  /\bTS\d{3,5}\b/,
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

// theta routing (v2 redesign 2026-09-04): a full cheap-first chain.
//   agnes (4 concurrent) → stepfun (8 concurrent) → yolo (free, pressure-gated)
//   → glm-5.3-flash on Hyper (till $12.5/day) → glm-5.3-flash on llmgateway.
// Concurrency semaphores + pressure/budget gates are caller-supplied booleans.
export interface ThetaBackends {
  agnes: boolean;
  agnesFree: boolean;       // 4-slot semaphore
  stepfun: boolean;
  stepfunFree: boolean;     // 8-slot semaphore
  yolo: boolean;
  yoloFree: boolean;
  yoloPressureOk: boolean;
  hyperBudgetOk: boolean;
  llmGatewayOn: boolean;
}

export function routeTheta(text: string, backends: ThetaBackends): RouterDecision {
  const hardness = classifyHardness(text);
  const hard = hardness === "debugging" || hardness === "planning";
  // Chain order (user-specified): agnes → stepfun → yolo → hyper flash → llmgateway.
  // step-3.7-flash reasons better than agnes-2.5-flash, so on HARD theta turns
  // prefer stepfun first when both are free (both flat-cost; quality wins).
  type Lane = { id: RouterDecision["provider"]; model: string; ok: boolean; why: string };
  const chain: Lane[] = hard
    ? [
        { id: "stepfun", model: "step-3.7-flash", ok: backends.stepfun && backends.stepfunFree, why: "theta-hard=stepfun" },
        { id: "agnes", model: "agnes-2.5-flash", ok: backends.agnes && backends.agnesFree, why: "theta-hard=agnes" },
      ]
    : [
        { id: "agnes", model: "agnes-2.5-flash", ok: backends.agnes && backends.agnesFree, why: "theta-routine=agnes" },
        { id: "stepfun", model: "step-3.7-flash", ok: backends.stepfun && backends.stepfunFree, why: "theta-routine=stepfun" },
      ];
  chain.push(
    { id: "yolo", model: YOLO_MODEL, ok: backends.yolo && backends.yoloFree && backends.yoloPressureOk, why: `theta-${hard ? "hard" : "routine"}=yolo` },
    { id: "hyper", model: "glm-5.3-flash", ok: backends.hyperBudgetOk, why: `theta-${hard ? "hard" : "routine"}=hyper-flash` },
    { id: "llmgateway", model: "glm-5.3-flash", ok: backends.llmGatewayOn, why: `theta-${hard ? "hard" : "routine"}=llmgateway-flash` },
  );
  const pick = chain.find((lane) => lane.ok);
  if (!pick) {
    return { provider: "hyper", upstreamModel: "glm-5.3-flash", tier: "flash", effort: "low", reason: "theta-no-backend(last-resort-hyper)", hardCapped: false };
  }
  return {
    provider: pick.id,
    upstreamModel: pick.model,
    tier: "flash",
    effort: "low",
    reason: pick.why,
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
 * qwen-3.8 smart routing (v2 chain redesign 2026-09-04):
 *   routine: yolo (free, pressure-gated) → qwen3.8-flash on Hyper (till $12.5/day)
 *            → qwen3.8-flash on llmgateway (paid fallback)
 *   hard:    qwen3.8-max on Hyper (till $12.5/day) → qwen3.8-max on llmgateway
 * Pressure/budget gates are evaluated by the caller (decision.ts) and passed
 * in as booleans — this function stays pure/synchronous.
 */
export function routeQwenSmart(signals: {
  hardness: RouterSignals["hardness"];
  prefixTokens: number;
  fullShareThisWeek: number;
  yoloOn: boolean;
  yoloFree: boolean;            // semaphore: does yolo have a free slot (<4 in flight)?
  yoloPressureOk: boolean;     // pressure tracker: below soft edge, and this turn won't overflow
  hyperBudgetOk: boolean;       // $12.5/day global budget has headroom
  llmGatewayOn: boolean;
}): RouterDecision {
  const hard = signals.hardness === "planning" || signals.hardness === "debugging" || signals.hardness === "architect";
  if (hard && signals.fullShareThisWeek < ROUTER.fullShareCapPerUserPerWeek) {
    if (signals.hyperBudgetOk) {
      return { provider: "hyper", upstreamModel: "qwen3.8-max", tier: "full", effort: "max", reason: `smart-qwen=hard:${signals.hardness}`, hardCapped: false };
    }
    if (signals.llmGatewayOn) {
      return { provider: "llmgateway", upstreamModel: "qwen3.8-max", tier: "full", effort: "max", reason: `smart-qwen=hard:${signals.hardness}(hyper-budget-out)`, hardCapped: false };
    }
  }
  // Routine: yolo primary (free, fastest) — pressure-gated so we never wedge the lane.
  if (signals.yoloOn && signals.yoloFree && signals.yoloPressureOk) {
    return { provider: "yolo", upstreamModel: YOLO_MODEL, tier: "flash", effort: "low", reason: "smart-qwen=yolo", hardCapped: false };
  }
  // Hyper flash backstop (cheap paid) while the daily budget holds.
  if (signals.hyperBudgetOk) {
    return { provider: "hyper", upstreamModel: "qwen3.8-flash", tier: "flash", effort: "low", reason: `smart-qwen=flash(${signals.yoloOn ? "yolo-pressured" : "yolo-off"})`, hardCapped: false };
  }
  // llmgateway flash — final fallback (paid, no cache, but always available).
  if (signals.llmGatewayOn) {
    return { provider: "llmgateway", upstreamModel: "qwen3.8-flash", tier: "flash", effort: "low", reason: "smart-qwen=llmgateway-flash(hyper-budget-out)", hardCapped: false };
  }
  // Nothing else enabled — last resort on hyper even past budget (better an
  // overage than a hard failure; admin alert covers the budget breach).
  return { provider: "hyper", upstreamModel: "qwen3.8-flash", tier: "flash", effort: "low", reason: "smart-qwen=flash(no-alternative)", hardCapped: false };
}
/** Failover decision: same turn, same (already window-fitted) messages, new lane. */
export function failoverDecision(d: RouterDecision, to: RouterDecision["provider"], cause: string): RouterDecision {
  return { ...d, provider: to, reason: `${d.reason} → failover-${to}(${cause})`, hardCapped: false };
}