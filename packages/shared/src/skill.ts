// Skill-card routing config — the shared vocabulary between the gateway (which
// routes) and the web admin (which displays and edits).
//
// Methodology after Brick (arXiv 2606.13241, "Spatial Capability Routing for the
// Mixture-of-Models paradigm"): a query and each candidate model are points in a
// capability space; the router picks the model whose point is closest to what the
// query needs, penalised by cost.
//
// Two deliberate departures from the paper:
//
//   1. The capability basis is ours. Brick's six dimensions (creative_synthesis,
//      world_knowledge, …) describe general assistant work. Ours are the failure
//      modes a coding agent actually hits, each one already documented in this
//      repo (see CAPABILITY_EVIDENCE).
//
//   2. The objective carries a third term — cache-wipe penalty. Brick models
//      routing per query and bolts session stickiness on as a setting. Our margin
//      *is* prefix caching, so the cost of moving a warm session to another model
//      belongs in the objective itself, not in a separate gate.
//
//   J_m = D_m + β·ĉ_m + β_cache·p̂_m

/** The six capability dimensions. Order is load-bearing: skill vectors and
 *  persisted signal blobs index into this array, so append only. */
export const CAPABILITIES = [
  "codegen",
  "debug",
  "type_repair",
  "refactor",
  "planning",
  "long_context",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_COUNT = CAPABILITIES.length;

/** Why each dimension exists — the observed failure that justified it. Shown in
 *  the admin panel so the basis stays accountable rather than aspirational. */
export const CAPABILITY_EVIDENCE: Record<Capability, string> = {
  codegen: "Writing straightforward code, following an existing pattern.",
  debug: "Failing tests, stack traces, non-zero exits — diagnosis before repair.",
  type_repair:
    "Precise compiler fixes. 27B-class models were observed letting TS2339/TS2345 union-narrowing errors survive 8 repair rounds.",
  refactor: "Multi-file structural change where the edit spans call sites.",
  planning: "Architecture, decomposition, trade-off selection before any edit.",
  long_context:
    "Instruction-following at large prompt sizes. The dud streak (40k prompt / <1k output) is the observed failure.",
};

export type RoutingProfileName = "eco" | "balanced" | "pro";

/** The preference knob, `r ∈ [−1, 1]`. Named profiles are convenience labels for
 *  the three operating points operators actually use. */
export const PROFILE_R: Record<RoutingProfileName, number> = {
  eco: -1,
  balanced: 0,
  pro: 1,
};

export function isProfileName(s: string): s is RoutingProfileName {
  return s === "eco" || s === "balanced" || s === "pro";
}

/**
 * The single allowlist for `api_keys.flags`.
 *
 * This lives here rather than in either app because it was previously duplicated
 * between the web write route and the dashboard UI, where the two copies could
 * drift and silently reject or accept different tokens. The gateway's flag
 * resolver and the web PATCH validator both read this list.
 */
export const VALID_FLAGS = [
  "compress",
  "compact",
  "shadow",
  "docs",
  "skill",
] as const;

export const PROFILE_FLAGS = ["eco", "balanced", "pro"] as const;

export type ValidFlag = (typeof VALID_FLAGS)[number] | RoutingProfileName;

/** Canonical storage order: plain flags first, then at most one profile. */
export const FLAG_ORDER: readonly string[] = [...VALID_FLAGS, ...PROFILE_FLAGS];

/** Normalise a CSV flag string: lowercase, trim, drop unknowns, canonical order.
 *  Returns null for the empty set so the column stays NULL rather than "". */
export function normalizeFlags(csv: string): string | null {
  const parts = csv
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const unknown = parts.filter((p) => !FLAG_ORDER.includes(p));
  if (unknown.length > 0) {
    throw new Error(`unknown flags: ${unknown.join(", ")}`);
  }
  // At most one profile — two profiles is a contradiction, not a preference.
  const profiles = PROFILE_FLAGS.filter((p) => parts.includes(p));
  if (profiles.length > 1) {
    throw new Error(`at most one routing profile allowed; got ${profiles.join(", ")}`);
  }
  const ordered = FLAG_ORDER.filter((f) => parts.includes(f));
  return ordered.length > 0 ? ordered.join(",") : null;
}

/**
 * The four scalars the preference knob modulates.
 *
 *   mu     difficulty sensitivity — how much a hard turn raises the bar
 *   b      bias, in log-odds — shifts the whole bar up or down
 *   beta   cost coefficient — how many distance units one unit of cost is worth
 *   lambda over-capacity penalty — how much overkill (paying for capability the
 *          query did not need) is punished relative to under-capacity
 */
export interface SkillMath {
  mu: number;
  b: number;
  beta: number;
  lambda: number;
}

/** Neutral (r = 0) operating point. Starting values, not calibrated constants:
 *  `calibrate-skills.ts` fits the skill matrix; these four are tuned by hand
 *  against observed tier share and are expected to move. */
export const SKILL_MATH_BASE: SkillMath = {
  mu: 1.0,
  b: 0,
  beta: 0.35,
  lambda: 0.05,
};

/** Asymmetric multipliers at r = ±1, applied through a one-sided power law so
 *  r = 0 is exactly the base and each extreme is independently readable.
 *  Fewer constants than the paper's eight: we have one pool and one workload
 *  family, and uncalibrated knobs are worse than none. */
export const SKILL_MATH_MULTIPLIERS = {
  alpha: 3, // sharpness: flattens the response near r = 0, concentrates it at the extremes
  mu: { pro: 4, eco: 0.15 }, // pro: raise the bar; eco: lower it
  b: { pro: 0.8, eco: -0.5 }, // additive in log-odds
  beta: { pro: 40, eco: 6 }, // pro: cost is 40x cheaper in attention; eco: 6x dearer
  lambda: { pro: 20, eco: 6 }, // pro: overkill barely matters; eco: it matters a lot
} as const;

/** Resolve the four routing scalars for a given knob position. Pure.
 *
 *  Sign convention: r = +1 is max-quality, so beta and lambda must *shrink*
 *  (cost and overkill stop mattering) while mu grows (the bar rises). r = −1 is
 *  the reverse. The two branches are one-sided — exactly one of pPlus/pMinus is
 *  non-zero — so each extreme's multiplier is readable straight off the table
 *  above. */
export function mathForR(r: number): SkillMath {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(r) ? r : 0));
  const { alpha, mu, b, beta, lambda } = SKILL_MATH_MULTIPLIERS;
  const pPlus = Math.pow(Math.max(clamped, 0), alpha);
  const pMinus = Math.pow(Math.max(-clamped, 0), alpha);

  return {
    mu: SKILL_MATH_BASE.mu * Math.exp(pPlus * Math.log(mu.pro) + pMinus * Math.log(mu.eco)),
    b: SKILL_MATH_BASE.b + pPlus * b.pro + pMinus * b.eco,
    // pro divides (cost matters less), eco multiplies (cost matters more)
    beta: SKILL_MATH_BASE.beta * Math.exp(-pPlus * Math.log(beta.pro) + pMinus * Math.log(beta.eco)),
    lambda:
      SKILL_MATH_BASE.lambda *
      Math.exp(-pPlus * Math.log(lambda.pro) + pMinus * Math.log(lambda.eco)),
  };
}

/** Difficulty anchors. A classifier verdict maps onto this axis; the blend pulls
 *  toward `medium` in proportion to how unsure the classifier is. */
export const TAU_ANCHORS = { easy: 0.55, medium: 0.72, hard: 0.88 } as const;
export type DifficultyLabel = keyof typeof TAU_ANCHORS;

/** Confidence-weighted blend of the predicted anchor toward the safe middle. */
export function blendTau(label: DifficultyLabel, confidence: number): number {
  const c = Math.max(0, Math.min(1, Number.isFinite(confidence) ? confidence : 0));
  return c * TAU_ANCHORS[label] + (1 - c) * TAU_ANCHORS.medium;
}

/** Skill estimates are clipped away from the boundary so logit() stays finite.
 *  A cell pinned at the floor means the labels are wrong, not that the model is
 *  perfect — the calibration script warns when that happens. */
export const SKILL_CLIP: readonly [number, number] = [0.02, 0.98];

export function clipSkill(s: number): number {
  const [lo, hi] = SKILL_CLIP;
  if (!Number.isFinite(s)) return TAU_ANCHORS.medium;
  return Math.max(lo, Math.min(hi, s));
}

/** Tie band. Inside this margin the objective is treated as a tie and broken on
 *  expected success, then on cost — otherwise float noise picks the model. */
export const SKILL_TIE_EPSILON = 0.03;

/** Confidence tiers read straight off support counts. */
export function confidenceForSupport(support: number): "low" | "medium" | "high" {
  if (support >= 200) return "high";
  if (support >= 50) return "medium";
  return "low";
}

export type SkillCard = {
  modelId: string;
  capability: Capability;
  successRate: number;
  support: number;
  source: string;
  confidence: string;
};

/** A candidate in a routing pool. Rates are USD per 1M tokens and are the same
 *  numbers the metering ledger uses.
 *
 *  A candidate is a *tier*, not a provider. The router answers "full or flash?";
 *  which provider serves that answer is the ladder's job (pricing.ts). Keeping
 *  the two apart means adding capacity cannot change routing quality. */
export type PoolModel = {
  modelId: string;
  tier: "full" | "flash";
  /** Preference ladder for this tier, in descending order. The first lane whose
   *  health gate passes serves the turn. */
  providers: readonly string[];
  /** Upstream input rate of the preferred lane — used by the cache-wipe penalty,
   *  because that penalty is a real input-rate difference. */
  inputUsdPerM: number;
  /** Blended per-token cost used for ĉ_m — input and output weighted by the
   *  observed in/out split, so a model that is cheap on input but dear on output
   *  does not look artificially attractive. */
  blendedUsdPerM: number;
};

/**
 * Candidate pools per public endpoint.
 *
 * Rates mirror packages/shared/src/pricing.ts. The flash/full spread is the
 * whole economics of this endpoint: ~9× per call, which is why the full tier
 * carries a hard share cap on top of the cost term.
 *
 * theta has no pool — it is a single capability class served by a flat ladder,
 * so there is no tier decision to make. Its ladder is resolved directly.
 */
export const SKILL_POOLS: Record<string, PoolModel[]> = {
  "glm-5.3": [
    {
      modelId: "glm-5.3-flash",
      tier: "flash",
      providers: ["pareto", "hyper", "llmgateway", "teamorouter"],
      inputUsdPerM: 0.16332,
      // 80% input-weighted blend at the observed cache-heavy mix
      blendedUsdPerM: 0.24,
    },
    {
      modelId: "glm-5.3",
      tier: "full",
      providers: ["electronhub", "openference", "pareto", "hyper", "llmgateway"],
      inputUsdPerM: 1.52432,
      blendedUsdPerM: 2.18,
    },
  ],
};

/** Cache-wipe penalty coefficient. The penalty itself is computed in dollars at
 *  the call site and normalised by the pool's cost scale; this controls how much
 *  a re-primed prefix is allowed to influence the choice. Set high enough that a
 *  warm session only moves when the quality case for moving is real. */
export const SKILL_CACHE_COEFFICIENT = 0.6;

/** A pool with no cost spread (all free lanes) makes the cost term vacuous.
 *  Below this spread in blended USD/1M the router falls back to pure quality. */
export const SKILL_COST_SPREAD_FLOOR = 1e-6;
