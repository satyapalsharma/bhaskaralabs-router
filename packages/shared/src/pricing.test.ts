// Pricing configuration tests — the invariants the router and the margin
// accounting both depend on. A silent change to any of these is a pricing
// incident, not a refactor.

import {
  FRONTIER_DISPLAY,
  THETA_DISPLAY,
  HYPER,
  STEPFUN,
  PARETO,
  LLMGATEWAY,
  TEAMOROUTER,
  FLAT_PROVIDERS,
  UPSTREAM_RATES,
  AGNES,
  CAMEL,
  PLANS,
  ROUTER,
  THROTTLE,
  CONCURRENCY,
  PROVIDER_CLASS,
  THETA_CHAIN,
  GLM_FULL_CHAIN,
  GLM_FLASH_CHAIN,
  ENDPOINT_MODELS,
  chainFor,
  type RateCard,
  type PlanId,
} from "./pricing";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function validCard(c: RateCard): boolean {
  return (
    typeof c.input === "number" &&
    typeof c.output === "number" &&
    Number.isFinite(c.input) &&
    Number.isFinite(c.output) &&
    c.input >= 0 &&
    c.output >= 0 &&
    (c.cacheHit === undefined || (Number.isFinite(c.cacheHit) && c.cacheHit >= 0))
  );
}

console.log("Test 1: every rate card is well-formed");
{
  const cards: [string, RateCard][] = [
    ["FRONTIER_DISPLAY", FRONTIER_DISPLAY],
    ["THETA_DISPLAY", THETA_DISPLAY],
    ...Object.entries(HYPER).map(([k, v]) => [`HYPER.${k}`, v] as [string, RateCard]),
    ...Object.entries(STEPFUN).map(([k, v]) => [`STEPFUN.${k}`, v] as [string, RateCard]),
    ...Object.entries(PARETO).map(([k, v]) => [`PARETO.${k}`, v] as [string, RateCard]),
    ...Object.entries(LLMGATEWAY).map(([k, v]) => [`LLMGATEWAY.${k}`, v] as [string, RateCard]),
    ...Object.entries(TEAMOROUTER).map(([k, v]) => [`TEAMOROUTER.${k}`, v] as [string, RateCard]),
  ];
  const bad = cards.filter(([, c]) => !validCard(c));
  check(`${cards.length} cards valid`, bad.length === 0, bad.map(([k]) => k).join(", "));
}

console.log("\nTest 2: flat lanes are genuinely zero-cost");
{
  // These are prepaid plans: the per-request ledger cost must be 0, because the
  // real cost is amortized monthly. A non-zero entry here would double-count.
  check("FLAT_PROVIDERS is non-empty", FLAT_PROVIDERS.length > 0);
  check(
    "no flat provider appears in UPSTREAM_RATES",
    FLAT_PROVIDERS.every((p) => !(p in UPSTREAM_RATES)),
  );
  // TeamoRouter free variants must be exactly 0 — they are the free lane.
  check(
    "teamo free models are $0",
    TEAMOROUTER["glm-5.3-flash-free"].input === 0 &&
      TEAMOROUTER["glm-5.3-flash-free"].output === 0 &&
      TEAMOROUTER["deepseek-v4-flash-free"].input === 0,
  );
}

console.log("\nTest 3: the cheap lane is cheaper than the expensive one");
{
  // The router's cost term assumes this ordering. If GLM flash ever costs more
  // than full, the objective silently inverts.
  const full = HYPER["glm-5.3"];
  const flash = HYPER["glm-5.3-flash"];
  check("glm-5.3-flash input < glm-5.3 input", flash.input < full.input);
  check("glm-5.3-flash output < glm-5.3 output", flash.output < full.output);
  check(
    "flash is at least 5x cheaper on input",
    full.input / flash.input >= 5,
    `ratio ${(full.input / flash.input).toFixed(1)}`,
  );
  // LLMGateway is the same catalogue at 1/3 — the ratios must survive.
  const lg = LLMGATEWAY["glm-5.3"];
  check(
    "llmgateway is 1/3 of list",
    Math.abs(lg.input - full.input / 3) < 1e-9,
  );
}

console.log("\nTest 4: plans");
{
  const ids: PlanId[] = ["trial", "starter", "pro"];
  check(
    "all three plans exist",
    ids.every((id) => PLANS[id] !== undefined),
  );
  check(
    "prices are non-negative",
    ids.every((id) => PLANS[id].priceUsd >= 0 && PLANS[id].priceInr >= 0),
  );
  check("usd/inr ratio is 100:1", ids.every((id) => PLANS[id].priceInr === PLANS[id].priceUsd * 100));
  check("trial is unlisted", PLANS.trial.listed === false);
  check("starter and pro are listed", PLANS.starter.listed && PLANS.pro.listed);
  check("trial has a duration", (PLANS.trial.trialDays ?? 0) > 0);

  // Every paid plan must give the user something, and the glm token cap must
  // exist — a call cap alone cannot bound cost on a 1M-context endpoint.
  for (const id of ["starter", "pro"] as const) {
    check(`${id}: has a glm call cap`, PLANS[id].glmPer5h > 0);
    check(`${id}: has a glm token cap`, PLANS[id].glmTokensPer5h > 0);
  }
  check("theta is unlimited only on pro", PLANS.pro.thetaPer5h === null && PLANS.starter.thetaPer5h !== null);
  check("only pro has an extra theta pool", PLANS.pro.thetaExtraMonthly > 0 && PLANS.starter.thetaExtraMonthly === 0);
  check(
    "pro gives more glm than starter",
    PLANS.pro.glmPer5h > PLANS.starter.glmPer5h &&
      PLANS.pro.glmTokensPer5h > PLANS.starter.glmTokensPer5h,
  );
}

console.log("\nTest 4b: the operator plan");
{
  // super is assigned by hand and must never leak into a customer path. If it
  // ever becomes listed, a signup or an upgrade flow could hand out a plan with
  // no caps at all — which is why this is asserted rather than commented.
  check("super exists", PLANS.super !== undefined);
  check("super is not listed", PLANS.super.listed === false);
  check("super is free", PLANS.super.priceUsd === 0 && PLANS.super.priceInr === 0);
  check("super is flagged unlimited", PLANS.super.unlimited === true);
  check(
    "super is the only unlimited plan",
    (["trial", "starter", "pro"] as const).every((id) => PLANS[id].unlimited !== true),
  );
  check("super has no trial duration", (PLANS.super.trialDays ?? 0) === 0);
  check("super's concurrency exceeds every paid tier", CONCURRENCY.superTier > CONCURRENCY.extraTierMax);
}

console.log("\nTest 5: router caps");
{
  check(
    "full-model share cap is in (0,1]",
    ROUTER.fullModelShareCap > 0 && ROUTER.fullModelShareCap <= 1,
  );
  check(
    "alert threshold is below the cap",
    ROUTER.fullModelShareAlertAt < ROUTER.fullModelShareCap,
  );
  check(
    "cache hit assumption is in (0,1]",
    ROUTER.cacheHitAssumption > 0 && ROUTER.cacheHitAssumption <= 1,
  );
  check(
    "switch penalty budget is positive",
    ROUTER.reeval.maxPenaltyUsd > 0 && ROUTER.reeval.maxPrefixTokensForSwitch > 0,
  );
}

console.log("\nTest 6: throttle curve");
{
  check(
    "throttle window matches the theta quota window",
    THROTTLE.windowHours === 5,
  );
  check(
    "soft edge is below the hard edge",
    THROTTLE.fullSpeedUntil < THROTTLE.rejectAfter,
  );
  check("delay ramp is ascending", THROTTLE.minDelayMs > 0 && THROTTLE.maxDelayMs > THROTTLE.minDelayMs);
  check("unlimited tier is single-stream", CONCURRENCY.unlimitedTier === 1);
  check(
    "extra tier allows more parallelism than the base tier",
    CONCURRENCY.extraTierMax > CONCURRENCY.unlimitedTier,
  );
}

console.log("\nTest 7: chains");
{
  check("two endpoints only", ENDPOINT_MODELS.length === 2 && ENDPOINT_MODELS.includes("glm-5.3") && ENDPOINT_MODELS.includes("theta"));
  check("theta chain is non-empty", THETA_CHAIN.length > 0);
  check("glm full chain is non-empty", GLM_FULL_CHAIN.length > 0);
  check("glm flash chain is non-empty", GLM_FLASH_CHAIN.length > 0);

  // Hyper must be on every chain: it is the core provider and the thing margin
  // is proven against. A chain without it has no landing zone when the
  // bootstrap lanes die.
  check(
    "hyper is on all three chains",
    THETA_CHAIN.some((l) => l.provider === "hyper") &&
      GLM_FULL_CHAIN.some((l) => l.provider === "hyper") &&
      GLM_FLASH_CHAIN.some((l) => l.provider === "hyper"),
  );

  // Electron and Openference both meter something scarce, so neither may be
  // reachable from a flash call. Electron's case is newer than the original
  // reasoning and was measured, not assumed: its Coding Plan allows only two
  // concurrent requests (its own 429 states the number), which cannot carry the
  // tier that sees ~99% of traffic, and the lane is ~2.4x slower than Pareto
  // even when it answers at all. See GLM_FLASH_CHAIN for the full numbers.
  check(
    "electronhub/openference are full-tier only",
    !GLM_FLASH_CHAIN.some((l) => l.provider === "electronhub" || l.provider === "openference"),
  );

  // Every LANE must have an upstream rate card, or its cost silently reads 0.
  const allLanes = [...THETA_CHAIN, ...GLM_FULL_CHAIN, ...GLM_FLASH_CHAIN];
  const missingRates = allLanes.filter(
    (l) => !FLAT_PROVIDERS.includes(l.provider) && !UPSTREAM_RATES[l.provider]?.[l.model],
  );
  check(
    "every metered lane has a rate card",
    missingRates.length === 0,
    missingRates.map((l) => `${l.provider}:${l.model}`).join(", "),
  );

  // Duplicate lanes would make preference order ambiguous.
  for (const [name, chain] of [["theta", THETA_CHAIN], ["glm-full", GLM_FULL_CHAIN], ["glm-flash", GLM_FLASH_CHAIN]] as const) {
    const seen = new Set(chain.map((l) => `${l.provider}:${l.model}`));
    check(`${name} chain has no duplicate lanes`, seen.size === chain.length);
  }

  check("chainFor routes by endpoint", chainFor("theta", "flash") === THETA_CHAIN);
  check("chainFor picks full for glm", chainFor("glm-5.3", "full") === GLM_FULL_CHAIN);
  check("chainFor picks flash for glm", chainFor("glm-5.3", "flash") === GLM_FLASH_CHAIN);
}

console.log("\nTest 8: provider classification covers the fleet");
{
  const known = [...THETA_CHAIN, ...GLM_FULL_CHAIN, ...GLM_FLASH_CHAIN].map((l) => l.provider);
  const unclassified = [...new Set(known)].filter((p) => !(p in PROVIDER_CLASS));
  check("every routed provider is classified", unclassified.length === 0, unclassified.join(", "));
  check("hyper is core", PROVIDER_CLASS.hyper === "core");
  check(
    "agnes and camel are flat",
    PROVIDER_CLASS.agnes === "flat" && PROVIDER_CLASS.camel === "flat",
  );
  check("agnes retains its published limits", AGNES.requestsPer5h === 7_500 && AGNES.requestsPerWeek === 75_000);
  check("camel streams start at 1 and can grow", CAMEL.streams === 1 && CAMEL.maxStreams > CAMEL.streams);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
