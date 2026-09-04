// Central pricing config — the ONLY place rates live.
// Everything: calculator, metering, admin margins reads from here.

export type RateCard = {
  input: number;      // $ per 1M tokens
  output: number;
  cacheHit?: number;  // $ per 1M cached tokens (if provider discounts)
  cacheWrite?: number;
};

// ── USER-FACING (display) rates — what users see on the site/dashboard ──
export const FRONTIER_DISPLAY: Record<string, RateCard> = {
  "glm-5.3":  { input: 1.52432, output: 4.79072, cacheHit: 0.283088 },
  "qwen-3.8": { input: 2.0,     output: 6.0,     cacheHit: 0.25 },
};

export const THETA_DISPLAY: RateCard = { input: 0.20, cacheHit: 0.04, output: 0.40 };

// ── ACTUAL upstream rates (admin COGS only) ──
// Hyper (CORE) — verified from live /v1/models 2026-08-31
export const HYPER: Record<string, RateCard> = {
  "glm-5.3":            { input: 1.52432, output: 4.79072, cacheHit: 0.283088 },
  "glm-5.3-flash":      { input: 0.16332, output: 0.5444,  cacheHit: 0.0315752 },
  "qwen3.8-max":        { input: 2.833,   output: 7.333,   cacheHit: 0.25 },  // verified live 2026-09-04: reverse-engineered from Hyper cost.usd
  "qwen3.8-flash":      { input: 0.15,    output: 0.47,    cacheHit: 0.016 },
  "deepseek-v4-flash":  { input: 0.2,     output: 0.4,     cacheHit: 0.04 },
};

// FEIHOA [BACKCHANNEL/TEST] — unlimited-usage OpenAI-compat endpoint
// (Qwen3.8-27B-Uncensored, 32K window). Unmetered: COGS 0; kill-switchable.
export const FEIHOA: Record<string, RateCard> = {
  "Qwen3.8-27B-Uncensored": { input: 0, output: 0 },
};

// DevPass / LLM Gateway [BOOTSTRAP] — old DeepSeek prices, 3x allowance economics
export const DEVPASS: Record<string, RateCard> = {
  "deepseek-v4-flash-0731": { input: 0.08, output: 0.15 },
};
// StepFun [BOOTSTRAP] — PAYG equivalents; actual = plan fee amortized
export const STEPFUN = {
  planTiers: [
    { name: "Mini", usd: 6.99, creditsM: 400 },
    { name: "Plus", usd: 9.99, creditsM: 1600 },
    { name: "Pro", usd: 29.0, creditsM: 8000 },
    { name: "Max", usd: 99.0, creditsM: 40000 },
  ] as const,
  payg: { input: 0.20, cacheHit: 0.04, output: 1.15 },
};
// Agnes [BOOTSTRAP] — flat plan, tokens included
export const AGNES = { planUsd: 10.0, requestsPerMonth: 200_000 };

// ── Plans (regional pricing) ──
export type Plan = {
  id: "free" | "basic" | "advanced";
  priceUsd: number;
  priceInr: number;
  frontierInputM: number;   // monthly cap, millions of tokens
  frontierOutputM: number;
  thetaPer5h: number;       // rolling window
  thetaMonthly: number;
};

export const PLANS: Record<Plan["id"], Plan> = {
  free:     { id: "free",     priceUsd: 0,  priceInr: 0,    frontierInputM: 1,  frontierOutputM: 0.25, thetaPer5h: 0,   thetaMonthly: 100 },
  basic:    { id: "basic",    priceUsd: 15, priceInr: 1500, frontierInputM: 20,  frontierOutputM: 5,   thetaPer5h: 400, thetaMonthly: 57_600 },
  advanced: { id: "advanced", priceUsd: 30, priceInr: 3000, frontierInputM: 500,  frontierOutputM: 100,  thetaPer5h: 8000, thetaMonthly: 1_000_000 },
};

// ── Router policy ──
export const ROUTER = {
  fullShareCapPerUserPerWeek: 0.10, // HARD CAP — spill goes to flash
  fullShareAlertAt: 0.08,
  cacheHitAssumption: 0.80,         // used by calculator + margin projections
  // Per-turn re-evaluation inside a locked (sticky) session: a flash-locked
  // session may upgrade to the full model on a hard turn, paying the cache-wipe
  // re-bill penalty (prefix re-priced at full-model input rate). Gates ALL must hold:
  //   maxPrefixTokensForSwitch — hard ceiling on prefix size eligible for a wipe
  //   maxPenaltyUsd            — prefix × (full−flash input rate) must stay under this
  //   maxSwitchesPerSession    — churn guard (after upgrading, full lock sticks)
  //   weekly full-share < HARD CAP — margin guard still governs
  reeval: {
    enabled: true,
    maxPrefixTokensForSwitch: 16_000,
    maxPenaltyUsd: 0.03,
    maxSwitchesPerSession: 1,
  },
  // Escalation-on-failure: quality signals that justify a flash→full upgrade
  // on the NEXT turn of a session (same gates as reeval apply afterwards).
  //   testFailSignal  — scan the request's live zone (fresh tool results) for
  //                     failing tests / compile errors / non-zero exits; stateless.
  //   emptyOutputStreak — provider returned zero content chars; N consecutive
  //                     (observed in the wild: GLM empty-content instability)
  escalation: {
    enabled: true,
    maxEmptyOutputStreak: 2,
  },
};

// ── Provider classification ──
export const PROVIDER_CLASS = {
  hyper: "core",
  devpass: "bootstrap",
  agnes: "bootstrap",
  stepfun: "bootstrap",
  feihoa: "backchannel",
  yolo: "backchannel",
} as const;