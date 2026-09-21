// Skill router: the routing objective.
//
//   z_q   = b + µ·logit(τ_q)                       difficulty in log-odds
//   r_q,c = p_c · z_q                              what the query demands on c
//   v_m,c = p_c · logit(s_m,c)                     what model m offers on c
//   u     = max(0, r − v)   under-capacity → a wrong answer is likely
//   o     = max(0, v − r)   over-capacity  → capability paid for and not needed
//   D_m   = √(Σ_c [u² + λ·o²])                     capability distance
//   J_m   = D_m + β·ĉ_m + β_cache·p̂_m              routing objective
//   m*    = argmin J_m   (tie-broken on expected success, then cost)
//
// The two residuals are asymmetric on purpose. Under-capacity costs correctness;
// over-capacity costs money. A symmetric penalty cannot express that difference,
// and the whole point of routing is that they are not the same loss.
//
// Everything in this module is pure: no I/O, no clock, no randomness. That is
// what makes the decisions testable and reproducible from a ledger row.

import {
  CAPABILITIES,
  SKILL_CACHE_COEFFICIENT,
  SKILL_COST_SPREAD_FLOOR,
  SKILL_TIE_EPSILON,
  blendTau,
  clipSkill,
  mathForR,
  type Capability,
  type DifficultyLabel,
  type PoolModel,
  type SkillMath,
} from "@bhaskara/shared/skill";

const EPS = 1e-9;

/** logit with the skill clip already applied, so this never returns ±∞. */
function logit(p: number): number {
  const c = clipSkill(p);
  return Math.log(c / (1 - c));
}

/** Cost normalised so the most expensive model in the pool maps to 1. With no
 *  real spread (all-free lanes) the cost term is dropped entirely rather than
 *  producing a divide-by-almost-zero. */
export function normalizeCosts(pool: PoolModel[]): Map<string, number> {
  const max = pool.reduce((m, p) => Math.max(m, p.blendedUsdPerM), 0);
  const out = new Map<string, number>();
  for (const p of pool) {
    out.set(p.modelId, max > SKILL_COST_SPREAD_FLOOR ? p.blendedUsdPerM / max : 0);
  }
  return out;
}

/**
 * Capability distance for one model.
 *
 * `z` is the resolved difficulty logit (see resolveMath) and `lambda` the
 * over-capacity weight. Both are passed in rather than read off a combined
 * object so this stays a pure function of its inputs.
 */
export function skillDistance(
  p: Record<Capability, number>,
  skills: Record<Capability, number>,
  z: number,
  lambda: number,
): number {
  let sum = 0;
  for (const c of CAPABILITIES) {
    const pc = p[c] ?? 0;
    if (pc <= 0) continue; // a dimension the query does not touch cannot matter
    const q = pc * z;
    const v = pc * logit(skills[c] ?? 0.5);
    const under = Math.max(0, q - v);
    const over = Math.max(0, v - q);
    sum += under * under + lambda * over * over;
  }
  return Math.sqrt(sum);
}

/** The four routing scalars with the turn's difficulty already resolved into a
 *  log-odds bar, so callers never recompute it per candidate. */
export interface ResolvedMath extends SkillMath {
  /** Effective difficulty logit for this turn: b + µ·logit(τ). */
  z: number;
}

export function resolveMath(
  r: number,
  label: DifficultyLabel,
  confidence: number,
): ResolvedMath {
  const math = mathForR(r);
  const tau = blendTau(label, confidence);
  return { ...math, z: math.b + math.mu * logit(tau) };
}

export interface Candidate {
  model: PoolModel;
  /** Per-capability success rate for this model, from the skill matrix. */
  skills: Record<Capability, number>;
  /** Cache-wipe penalty in normalized cost units. 0 for the session-locked
   *  model; > 0 means switching to this model re-primes the prefix. */
  cachePenalty: number;
}

export interface Selection {
  model: PoolModel;
  /** Total objective — lower is better. */
  J: number;
  distance: number;
  costTerm: number;
  cacheTerm: number;
  /** Expected success Σ_c p_c·s_m,c — the first tie-breaker. */
  expectedSuccess: number;
  /** Every candidate with its objective, for logging and the admin surface. */
  scored: {
    modelId: string;
    J: number;
    distance: number;
    costTerm: number;
    cacheTerm: number;
    expectedSuccess: number;
  }[];
}

/** Expected success of a model for this query — the quality term the objective
 *  does not directly optimise, used to break objective ties. */
function expectedSuccess(
  p: Record<Capability, number>,
  skills: Record<Capability, number>,
): number {
  let s = 0;
  for (const c of CAPABILITIES) s += (p[c] ?? 0) * clipSkill(skills[c] ?? 0.5);
  return s;
}

/**
 * Pick the model with the lowest objective. Throws on an empty candidate list so
 * a misconfiguration fails loudly at the call site rather than silently routing
 * every turn to nothing.
 *
 * Costs are normalised across the candidates themselves — there is deliberately
 * no separate pool argument, because two sources of model metadata is exactly
 * how a stale pool silently mis-prices a candidate.
 */
export function selectModel(
  p: Record<Capability, number>,
  candidates: Candidate[],
  math: ResolvedMath,
): Selection {
  if (candidates.length === 0) {
    throw new Error("selectModel: empty candidate pool");
  }

  const normalized = normalizeCosts(candidates.map((c) => c.model));

  const scored = candidates.map((cand) => {
    const distance = skillDistance(p, cand.skills, math.z, math.lambda);
    const costTerm = math.beta * (normalized.get(cand.model.modelId) ?? 0);
    const cacheTerm = SKILL_CACHE_COEFFICIENT * cand.cachePenalty;
    return {
      cand,
      modelId: cand.model.modelId,
      distance,
      costTerm,
      cacheTerm,
      J: distance + costTerm + cacheTerm,
      expectedSuccess: expectedSuccess(p, cand.skills),
    };
  });

  // Deterministic ordering: objective ascending, then expected success, then
  // cost, then model id. Without the final tie-break the winner would depend on
  // pool array order, which changes as the fleet is edited.
  scored.sort((a, b) => {
    if (Math.abs(a.J - b.J) > SKILL_TIE_EPSILON) return a.J - b.J;
    if (Math.abs(a.expectedSuccess - b.expectedSuccess) > EPS) {
      return b.expectedSuccess - a.expectedSuccess;
    }
    const ca = a.cand.model.blendedUsdPerM;
    const cb = b.cand.model.blendedUsdPerM;
    if (Math.abs(ca - cb) > EPS) return ca - cb;
    return a.modelId.localeCompare(b.modelId);
  });

  const winner = scored[0];
  return {
    model: winner.cand.model,
    J: winner.J,
    distance: winner.distance,
    costTerm: winner.costTerm,
    cacheTerm: winner.cacheTerm,
    expectedSuccess: winner.expectedSuccess,
    scored: scored.map(({ modelId, J, distance, costTerm, cacheTerm, expectedSuccess }) => ({
      modelId,
      J,
      distance,
      costTerm,
      cacheTerm,
      expectedSuccess,
    })),
  };
}

/**
 * Cache-wipe penalty in normalized cost units.
 *
 * Moving a session to a different model re-bills the whole prefix at the new
 * model's input rate (the provider cache is per-model). We express that as the
 * *incremental* input cost of the prefix, divided by the pool's cost scale so it
 * lands in the same units as ĉ_m.
 *
 * Returns 0 when the target is the locked model — the common case, and the one
 * that must stay free.
 */
export function cachePenalty(
  prefixTokens: number,
  targetInputUsdPerM: number,
  lockedInputUsdPerM: number | null,
  pool: PoolModel[],
): number {
  if (lockedInputUsdPerM === null) return 0;
  if (targetInputUsdPerM <= lockedInputUsdPerM) return 0; // downswitching is free
  const dollars = (prefixTokens * (targetInputUsdPerM - lockedInputUsdPerM)) / 1e6;
  const scale = pool.reduce((m, p) => Math.max(m, p.blendedUsdPerM), 0);
  if (scale <= SKILL_COST_SPREAD_FLOOR) return 0;
  // Reference: the cost of 200k tokens at the dearest model — an arbitrary but
  // fixed normaliser, so the penalty is comparable across pools.
  const reference = (200_000 * scale) / 1e6;
  return reference > 0 ? dollars / reference : 0;
}
