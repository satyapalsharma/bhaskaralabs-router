// Bridge between live gateway state and the pure routing math.
//
// skill-router.ts decides *given* a set of candidates. This module assembles
// that candidate set from reality: which lanes are actually healthy, what the
// skill matrix currently says, where the cache sits, and how much of the
// trailing full-model allowance is left.
//
// The health filtering matters more than the math. A router that picks a wedged
// lane is worse than no router, so a candidate that fails its gate is removed
// before the objective ever sees it.
//
// A candidate is a tier, and a tier is served by the first healthy provider in
// its ladder. So the lane is resolved here rather than in the caller, which
// keeps "the router chose X" and "we dispatched to X" the same statement.

import {
  CAPABILITIES,
  SKILL_POOLS,
  type Capability,
  type PoolModel,
} from "@bhaskara/shared/skill";
import type { ChatMessage } from "./prefix";
import { estimateTokens } from "./prefix";
import { ROUTER, chainFor, type EndpointModel } from "@bhaskara/shared/pricing";
import type { LaneHealth, RouterDecision } from "../router";
import { baseModelOf, fitsLane } from "../router";
import {
  capabilityVector,
  difficultyOf,
  type CapabilityInput,
} from "../router/capability";
import {
  cachePenalty,
  resolveMath,
  selectModel,
  type Candidate,
  type Selection,
} from "../router/skill-router";
import { getSkillMap, neutralSkills } from "./skill-cards";

export interface SkillDecideInput extends CapabilityInput {
  endpointModel: EndpointModel;
  /** Session's current model, for the cache-wipe term. Null on a fresh session. */
  lockedModel: string | null;
  fullShareThisWeek: number;
  /** Preference knob, −1..1. */
  r: number;
  /** Lane availability for this turn, from lib/lane-health. */
  health: LaneHealth;
}

export interface SkillDecideResult {
  decision: RouterDecision;
  selection: Selection;
  /** The capability distribution, for the persisted signal blob. */
  capability: Record<Capability, number>;
  difficulty: { label: "easy" | "medium" | "hard"; confidence: number };
  /** True when the full-model allowance removed full-tier lanes from the
   *  candidate set. Surfaced so a decision that looks wrong can be told apart
   *  from one that was bounded. */
  capped: boolean;
}

/** A pool entry paired with the lane that will actually serve it. */
interface ResolvedCandidate {
  pool: PoolModel;
  provider: string;
  /** What to put on the wire. Usually the pool's own modelId, but not always —
   *  see resolveLaneFor. */
  wireModel: string;
}

/**
 * Pair a pool entry with a dispatchable lane, or null when none can serve it.
 *
 * Two things differ between the pool's view of a model and the wire's, and both
 * are resolved here from the ladder rather than duplicated in the pool:
 *
 *  - The id. Electron serves GLM 5.3 as `glm-5.3:dev` under its DevPass plan and
 *    402s on the plain id, so dispatching the pool's `modelId` would trade a
 *    working lane for a guaranteed failover.
 *  - The window. `glm-5.3:dev` accepts 262k tokens where Openference accepts
 *    899k, so a long turn has to skip it here for the same reason the ladder
 *    skips it — the pool's provider order alone cannot express that.
 *
 * A provider that appears in no ladder keeps the pool's own modelId, which lets
 * the pool stand on its own in tests.
 */
function resolveLaneFor(
  entry: PoolModel,
  endpointModel: EndpointModel,
  health: LaneHealth,
  prefixTokens: number,
): { provider: string; wireModel: string } | null {
  const chain = chainFor(endpointModel, entry.tier);
  for (const provider of entry.providers) {
    if (health[provider] !== true) continue;
    const lane = chain.find((l) => l.provider === provider);
    if (lane && !fitsLane(lane, prefixTokens)) continue;
    return { provider, wireModel: lane?.model ?? entry.modelId };
  }
  return null;
}

/**
 * Run the skill router for one turn.
 *
 * Returns null when the endpoint has no configured pool or every lane in it is
 * unavailable. The caller falls back to walking the ladder directly, which is
 * what happens for `theta` and for uncalibrated deployments — the skill term
 * being absent must never mean the request fails.
 */
export async function skillDecide(
  input: SkillDecideInput,
): Promise<SkillDecideResult | null> {
  const pool = SKILL_POOLS[input.endpointModel];
  if (!pool || pool.length === 0) return null;

  const prefixTokens = estimateTokens(input.messages);

  // Health gate first: never let a dead lane reach the objective.
  const resolved: ResolvedCandidate[] = [];
  for (const entry of pool) {
    const lane = resolveLaneFor(entry, input.endpointModel, input.health, prefixTokens);
    if (lane) resolved.push({ pool: entry, ...lane });
  }
  if (resolved.length === 0) return null;

  // The full-model allowance is a hard constraint, not a price. Dropping the
  // full tier here is what keeps the cap honest regardless of what the objective
  // would otherwise prefer.
  const overCap = input.fullShareThisWeek >= ROUTER.fullModelShareCap;
  const eligible = overCap ? resolved.filter((r) => r.pool.tier !== "full") : resolved;
  const candidates0 = eligible.length > 0 ? eligible : resolved;
  const poolModels = candidates0.map((r) => r.pool);

  const skills = await getSkillMap().catch(
    () => ({} as Record<string, Record<Capability, number>>),
  );

  // A cold matrix carries no information, and "let the cost term decide" is not
  // a neutral default — it is a policy. Every candidate then has the same
  // neutral skill vector, so `distance` is identical across the pool and `J`
  // collapses to β·ĉ: the cheapest lane wins every turn. In the glm pool that
  // spread is 9.1× (0.24 vs 2.18 blended), so an uncalibrated skill router would
  // send 100% of traffic to flash and never escalate a hard turn again.
  //
  // Deferring to the ladder instead keeps behaviour identical to what it was
  // before the flag was set, which is what makes `skill` safe to enable at any
  // point in the calibration cycle. The capability vector is still recorded by
  // routingSignals, so the matrix can still fill in while this returns null.
  const measured = candidates0.some(({ pool: m }) => skills[m.modelId] !== undefined);
  if (!measured) return null;
  // Compared through `baseModelOf` because the lock stores the wire id the last
  // turn was served on — which can be a plan variant like `glm-5.3:dev` while
  // the pool keys on the product id. A miss here reads as "no locked rate",
  // which zeroes the cache term and lets the objective move a warm session for
  // free.
  const lockedBase = input.lockedModel ? baseModelOf(input.lockedModel) : null;
  const lockedInputRate = lockedBase
    ? (pool.find((m) => m.modelId === lockedBase)?.inputUsdPerM ?? null)
    : null;

  const candidates: Candidate[] = candidates0.map(({ pool: m }) => ({
    model: m,
    // No measured card → neutral prior. The model is neither favoured nor
    // punished by the skill term; the cost term decides. That is the honest
    // default when we have no measurement for this lane.
    skills: skills[m.modelId] ?? neutralSkills(),
    cachePenalty: cachePenalty(prefixTokens, m.inputUsdPerM, lockedInputRate, poolModels),
  }));

  const capability = capabilityVector(input);
  const difficulty = difficultyOf(input);
  const math = resolveMath(input.r, difficulty.label, difficulty.confidence);

  const selection = selectModel(capability, candidates, math);
  const winner = selection.model as PoolModel;
  const served = candidates0.find((c) => c.pool === winner);
  if (!served) return null;

  // A full-tier model gets the reasoning budget its selection implies; a flash
  // lane stays cheap.
  const effort = winner.tier === "full" ? "max" : "low";

  const decision: RouterDecision = {
    provider: served.provider,
    // The lane's spelling, not the pool's: `glm-5.3:dev` on Electron, `glm-5.3`
    // everywhere else. The pool chosen above is the product model; this is what
    // the provider is actually asked for.
    upstreamModel: served.wireModel,
    tier: winner.tier,
    effort,
    reason: `skill r=${input.r.toFixed(2)} J=${selection.J.toFixed(3)} d=${selection.distance.toFixed(3)} c=${selection.costTerm.toFixed(3)} p=${selection.cacheTerm.toFixed(3)} lane=${served.provider}${overCap ? " cap=full-share" : ""}`,
    hardCapped: overCap,
  };

  return { decision, selection, capability, difficulty, capped: overCap };
}

/** Signal blob for the ledger: everything needed to calibrate or audit this
 *  decision offline, including the full score table so a review can see how
 *  close the runner-up was. */
export function skillSignals(
  result: SkillDecideResult,
  r: number,
): Record<string, unknown> {
  return {
    r,
    capped: result.capped,
    capability: CAPABILITIES.map((c) => Number((result.capability[c] ?? 0).toFixed(4))),
    difficulty: result.difficulty,
    J: Number(result.selection.J.toFixed(4)),
    scored: result.selection.scored.map((s) => ({
      m: s.modelId,
      J: Number(s.J.toFixed(4)),
      d: Number(s.distance.toFixed(4)),
      c: Number(s.costTerm.toFixed(4)),
      p: Number(s.cacheTerm.toFixed(4)),
      e: Number(s.expectedSuccess.toFixed(4)),
    })),
  };
}
