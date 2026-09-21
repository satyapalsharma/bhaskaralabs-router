// Router: decides which upstream lane serves a request.
//
// Two layers, deliberately separate:
//
//   tier    — capability. "Does this turn need the full model?" Answered by
//             the skill router (cost-penalised capability distance) with the
//             hard share cap applied as a pre-filter. Lives in lib/skill-decide.
//   lane    — availability. "Which provider serves that tier right now?"
//             Answered here, by walking the preference ladder in
//             pricing.ts until a healthy lane is found.
//
// Keeping them apart is what makes the ladders safe to edit: adding a provider
// changes capacity, never routing quality, and changing the router never
// silently moves traffic onto a metered lane.
//
// This module is pure. Every health predicate arrives as a boolean from the
// caller, so the whole decision is testable without a database or network.

import {
  chainFor,
  ROUTER,
  type EndpointModel,
  type Lane,
  type ProviderId,
} from "@bhaskara/shared/pricing";
import { laneCooling } from "../lib/lane-slot";

export type EffortLevel = "low" | "high" | "max";
export type Tier = "full" | "flash";

export interface RouterSignals {
  endpointModel: string;
  prefixTokens: number; // size of the stable prefix (system + tools + history)
  isNewSession: boolean;
  sessionLockedModel?: string;
  fullShareThisWeek: number; // 0..1
  hardness: "routine" | "planning" | "debugging" | "architect";
  userRequestedFull?: boolean;
  failureSignal?: boolean; // failing tests/compile in this request's live zone
}

export interface RouterDecision {
  provider: ProviderId;
  upstreamModel: string;
  tier: Tier;
  effort: EffortLevel;
  reason: string;
  hardCapped: boolean;
  /** Fair-use state for response nudges. */
  fairUse?: "alert" | "capped";
  fairUseShare?: number;
  /** Machine-readable input vector behind `reason`, persisted to the ledger so
   *  skill-card calibration can regress on it. */
  signals?: Record<string, unknown>;
}

/** Product endpoint → the full model it maps to. Both endpoints now resolve to
 *  a single family; kept as a map so a third endpoint is a one-line change. */
export const FULL_OF: Record<string, string> = {
  "glm-5.3": "glm-5.3",
};

/** Full model id → its flash variant. The only place the pairing is written. */
export const FLASH_OF: Record<string, string> = {
  "glm-5.3": "glm-5.3-flash",
};

export function fullModelFor(endpointModel: string): string {
  return FULL_OF[endpointModel] ?? "glm-5.3";
}

export function flashModelFor(endpointModel: string): string {
  return FLASH_OF[fullModelFor(endpointModel)] ?? "glm-5.3-flash";
}

/**
 * Model id → the product model it is a variant of.
 *
 * Providers spell plan variants into the id: `glm-5.3:dev` is GLM 5.3 served
 * under Electron's flat DevPass plan — the endpoint's own catalogue gives it
 * the same 1.4/4.4 reference rates as `glm-5.3`. Tier is a property of the
 * weights, not of the allowance they are billed under, so the plan suffix is
 * stripped before any family lookup.
 *
 * This is load-bearing rather than cosmetic. `tierOf` decides both the ledger's
 * `routed_to` and which branch of the locked-session logic a turn takes, and the
 * full-share cap counts `routed_to = 'full'`. A variant id that read as flash
 * would be served on the full model while never consuming full-model budget —
 * the cap would stop binding, silently, only for traffic on that lane.
 */
export function baseModelOf(model: string): string {
  const colon = model.indexOf(":");
  return colon === -1 ? model : model.slice(0, colon);
}

/** Tier of an upstream model id. Anything not recognised as the full model is
 *  treated as flash, which is the safe direction: an unknown model can never
 *  consume full-model budget. */
export function tierOf(model: string): Tier {
  return Object.values(FULL_OF).includes(baseModelOf(model)) ? "full" : "flash";
}

/** Health predicate map: provider id → may be used right now. A provider that
 *  is absent from the map is treated as unavailable, so a new ladder entry is
 *  inert until its health check is wired up. */
export type LaneHealth = Record<string, boolean>;

export function laneUsable(health: LaneHealth, provider: string): boolean {
  return health[provider] === true;
}

/**
 * Does this lane's declared input window hold the prefix?
 *
 * A lane that declares no window always fits. A lane that does is checked
 * against the turn's own prefix estimate, so an oversized request skips it
 * before a socket is opened — the alternative is an upstream 400 on a turn the
 * ladder could have served from the next rung.
 *
 * Equal counts as fitting: providers reject on `> max`, not `>=`.
 */
export function fitsLane(lane: Lane, prefixTokens: number): boolean {
  return lane.maxInputTokens === undefined || prefixTokens <= lane.maxInputTokens;
}

/**
 * First healthy lane in an explicit ladder, skipping providers excluded for this
 * turn and lanes whose window cannot hold the prefix.
 *
 * Exclusions are how failover works: a lane that just failed is added to the set
 * and the next call walks past it instead of retrying it. Returns null when the
 * ladder is exhausted — the caller decides what exhaustion means (for glm it
 * degrades to flash; for theta it is a real outage).
 *
 * `prefixTokens` is deliberately required rather than optional. Leaving it out
 * must not be the quiet default, because the failure it prevents is silent in
 * development and expensive in production: a 400 from one lane, a failover to a
 * dearer one, and a turn that still succeeds — so nothing looks broken while the
 * cost line moves. Callers with no token count pass 0, which is a visible
 * decision at the call site rather than an oversight.
 */
export function pickLane(
  chain: readonly Lane[],
  health: LaneHealth,
  prefixTokens: number,
  exclude: Set<string> = new Set(),
): Lane | null {
  return (
    chain.find(
      (lane) =>
        !exclude.has(lane.provider) &&
        !exclude.has(`${lane.provider}:${lane.model}`) &&
        !laneCooling(lane.provider, lane.model) &&
        laneUsable(health, lane.provider) &&
        fitsLane(lane, prefixTokens),
    ) ?? null
  );
}

/** First healthy lane of a tier's configured ladder for an endpoint. */
export function resolveLane(
  endpoint: EndpointModel,
  tier: Tier,
  health: LaneHealth,
  prefixTokens: number,
  exclude: Set<string> = new Set(),
): Lane | null {
  return pickLane(chainFor(endpoint, tier), health, prefixTokens, exclude);
}

/** Every lane in a tier's ladder, healthy or not — for admin display and for
 *  building the "why did we end up here" part of a decision reason. */
export function lanesFor(endpoint: EndpointModel, tier: Tier): readonly Lane[] {
  return chainFor(endpoint, tier);
}

// ── Hardness classification ──
// Heuristics v0 — a trained classifier replaces this post-beta. Every pattern
// below corresponds to an observed failure mode, not a guess.

export const HARD_PATTERNS: RegExp[] = [
  /\b(architect|architecture|design\s+(a|the)\s+system)\b/i,
  /\b(why\s+(is|does|did)\b.{0,40}\b(fail|failing|broken|not\s+work))/i,
  /\b(root\s+cause|debug\s+this|mysterious|flaky\s+test)\b/i,
  /\b(security|race\s+condition|deadlock|memory\s+leak)\b/i,
  /\b(refactor.{0,30}(whole|entire|large)\b)/i,
  // fix/repair turns — flash-class models were observed letting TS2339/TS2345
  // union-narrowing errors survive 8 repair rounds.
  /\b(fix|repair|resolve)\b.{0,30}\b(error|errors|fail|fails|failing|broken|type|TS\d{3,5}|compile|compilation|build)\b/i,
  /\b(error|errors|fail|fails|failing|broken|type|TS\d{3,5}|compile|compilation|build)\b.{0,30}\b(fix|repair|resolve)\b/i,
  /\bTS\d{3,5}\b/,
];

export function classifyHardness(text: string): RouterSignals["hardness"] {
  if (HARD_PATTERNS.some((re) => re.test(text))) return "debugging";
  if (/\b(plan|design|propose|strategy|should\s+we|trade[- ]?off)\b/i.test(text)) return "planning";
  return "routine";
}

export function isHard(h: RouterSignals["hardness"]): boolean {
  return h === "planning" || h === "debugging" || h === "architect";
}

/**
 * Whether the full-model budget still allows an escalation.
 *
 * A HARD pre-filter, not a hint: once spent, the full tier leaves the candidate
 * pool entirely, so capability decides which turns escalate but never how many.
 * The cap is on the *share of glm calls*, so a user cannot reach it by making
 * more cheap calls — the denominator moves with them.
 */
export function fullTierAllowed(fullShareThisWeek: number): boolean {
  return fullShareThisWeek < ROUTER.fullModelShareCap;
}

/** Fair-use nudge state from a user's trailing full-model share. */
export function fairUseState(share: number): RouterDecision["fairUse"] {
  if (share >= ROUTER.fullModelShareCap) return "capped";
  if (share >= ROUTER.fullModelShareAlertAt) return "alert";
  return undefined;
}

/** Failover decision: same turn, same (already window-fitted) messages, new lane. */
export function failoverDecision(
  d: RouterDecision,
  to: ProviderId,
  cause: string,
  upstreamModel?: string,
): RouterDecision {
  return {
    ...d,
    provider: to,
    upstreamModel: upstreamModel ?? d.upstreamModel,
    reason: `${d.reason} → failover-${to}(${cause})`,
    hardCapped: false,
  };
}
