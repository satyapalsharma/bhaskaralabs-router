// Comprehensive metering edge cases. Complements metering.test.ts, which covers
// the three headline claims; this file covers the boundaries the ledger will
// actually see in production.

import { valueUserFacing, valueActualCost, isFlatProvider, registerUpstreamRates, clearUpstreamRates, type Usage } from "./metering";
import { FLAT_PROVIDERS, UPSTREAM_RATES } from "./pricing";

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

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

const base: Usage = {
  promptTokens: 100_000,
  completionTokens: 50_000,
  model: "glm-5.3",
  provider: "hyper",
  endpoint: "glm-5.3",
};

console.log("Test 1: degenerate inputs never produce NaN or Infinity");
{
  const zero: Usage = { ...base, promptTokens: 0, completionTokens: 0 };
  check("zero usage costs $0", valueActualCost(zero) === 0 && valueUserFacing(zero).equivalentApiCost === 0);

  const huge: Usage = { ...base, promptTokens: 1_000_000_000, completionTokens: 500_000_000 };
  check("a billion tokens stays finite", Number.isFinite(valueActualCost(huge)) && Number.isFinite(valueUserFacing(huge).equivalentApiCost));

  const negative: Usage = { ...base, promptTokens: -100, completionTokens: -50 };
  check("negative tokens stay finite", Number.isFinite(valueActualCost(negative)));
}

console.log("\nTest 2: cache accounting");
{
  const noCache = valueActualCost({ ...base, cachedTokens: 0 });
  const halfCache = valueActualCost({ ...base, cachedTokens: 50_000 });
  const fullCache = valueActualCost({ ...base, cachedTokens: 100_000 });
  check("cache reduces cost", halfCache < noCache);
  check("more cache reduces cost further", fullCache < halfCache);
  check("full cache is still positive (output is never cached)", fullCache > 0);

  // A provider reporting more cached tokens than prompt tokens must not create
  // a negative fresh-token count.
  const overCached = valueActualCost({ ...base, cachedTokens: 150_000 });
  check(
    "cached tokens are clamped to prompt tokens",
    near(overCached, fullCache),
    `${overCached} vs ${fullCache}`,
  );
}

console.log("\nTest 3: reasoning tokens are billed once, not twice");
{
  // Providers include reasoning inside completion_tokens. Counting it again
  // would inflate every reasoning-heavy turn.
  const withReasoning = valueActualCost({ ...base, reasoningTokens: 40_000 });
  const without = valueActualCost(base);
  check("reasoning tokens do not change the bill", near(withReasoning, without));
}

console.log("\nTest 4: flat providers book zero, metered providers do not");
{
  for (const p of FLAT_PROVIDERS) {
    check(`${p} books $0`, valueActualCost({ ...base, provider: p }) === 0);
    check(`${p} is classified flat`, isFlatProvider(p));
  }
  check("agnes is flat", isFlatProvider("agnes"));
  check("hyper is not flat", !isFlatProvider("hyper"));
  check("stepfun is metered, not flat", !isFlatProvider("stepfun"));
  check(
    "stepfun books a positive cost",
    valueActualCost({ ...base, provider: "stepfun", model: "step-3.7-flash" }) > 0,
  );
}

console.log("\nTest 5: a provider-reported exact cost always wins");
{
  const overridden: Usage = { ...base, actualCostOverrideUsd: 0.012345 };
  check("override beats the rate card", near(valueActualCost(overridden), 0.012345));
  // Even on a flat provider — an override means we know the real number.
  const flatWithOverride: Usage = { ...base, provider: "agnes", actualCostOverrideUsd: 0.5 };
  check("override beats the flat rule", near(valueActualCost(flatWithOverride), 0.5));
}

console.log("\nTest 6: unknown combinations fail closed");
{
  check("unknown provider books $0", valueActualCost({ ...base, provider: "brand-new-provider" }) === 0);
  check(
    "unknown model on a known provider books $0",
    valueActualCost({ ...base, model: "no-such-model" }) === 0,
  );
  // The important property: we never invent a cost. A silent wrong number is
  // worse than a zero, because the zero is visible in the admin ledger.
  const unknown = valueActualCost({ ...base, provider: "brand-new-provider" });
  check("and it is exactly zero, not a guess", unknown === 0);
}

console.log("\nTest 7: endpoint decides the display rate, not the provider");
{
  // The same upstream lane serves both products. Hyper answering a theta turn
  // must be valued at theta display rates, not glm list rates.
  const asTheta: Usage = { ...base, provider: "hyper", model: "glm-5.3-flash", endpoint: "theta" };
  const asGlm: Usage = { ...base, provider: "hyper", model: "glm-5.3-flash", endpoint: "glm-5.3" };
  const thetaCost = valueUserFacing(asTheta).equivalentApiCost;
  const glmCost = valueUserFacing(asGlm).equivalentApiCost;
  check("theta and glm display values differ on the same lane", thetaCost !== glmCost);
  check(
    "theta uses theta display rates",
    near(thetaCost, (100_000 * 0.2 + 50_000 * 0.4) / 1e6),
  );
  check(
    "glm uses full-model list rates",
    near(glmCost, (100_000 * 1.52432 + 50_000 * 4.79072) / 1e6),
  );

  // Legacy rows have no endpoint; the fallback must still classify them.
  const noEndpoint: Usage = { ...base };
delete noEndpoint.endpoint;
  const legacyTheta: Usage = { ...noEndpoint, model: "agnes-2.5-flash", provider: "agnes" };
  check(
    "a row without an endpoint falls back sensibly",
    near(valueUserFacing(legacyTheta).equivalentApiCost, (100_000 * 0.2 + 50_000 * 0.4) / 1e6),
  );
  // And a legacy glm row must not be mistaken for theta.
  const legacyGlm: Usage = { ...noEndpoint, model: "glm-5.3", provider: "hyper" };
  check(
    "a legacy glm row values at list rates",
    near(valueUserFacing(legacyGlm).equivalentApiCost, (100_000 * 1.52432 + 50_000 * 4.79072) / 1e6),
  );
}

console.log("\nTest 8: display tokens are the raw streamed counts");
{
  const r = valueUserFacing({ ...base, promptTokens: 123_456, completionTokens: 78_901, cachedTokens: 100_000 });
  check("input is unmodified", r.displayTokens.input === 123_456);
  check("output is unmodified", r.displayTokens.output === 78_901);
  // Pre-compression counts are a stated product promise: the dashboard shows
  // what the agent actually sent, never a post-optimisation number.
  check("cached tokens are not subtracted from the display count", r.displayTokens.input === 123_456);
}

console.log("\nTest 9: every routed provider has a defined cost path");
{
  // A provider that is neither flat nor in the rate table would silently book
  // $0 while actually costing money.
  const covered = new Set([...FLAT_PROVIDERS, ...Object.keys(UPSTREAM_RATES)]);
  const routed = ["hyper", "agnes", "stepfun", "camel", "llmgateway", "electronhub", "openference", "pareto", "teamorouter"];
  const uncovered = routed.filter((p) => !covered.has(p));
  check("every routed provider is costed", uncovered.length === 0, uncovered.join(", "));
}

console.log("\nTest 10: runtime rate overlay for DB-registered providers");
{
  // The compiled table only knows the hardcoded lanes. A provider added through
  // the admin panel has no entry there, and a missing entry books every turn at
  // $0 — which is invisible in a spend report and indistinguishable from a flat
  // lane. The gateway registers the fleet's cards so that cannot happen.
  clearUpstreamRates();

  const turn: Usage = { ...base, provider: "newlane", model: "some-model" };
  check("an unregistered provider books at $0", valueActualCost(turn) === 0);

  registerUpstreamRates("newlane", { "some-model": { input: 2, output: 6, cacheHit: 0.5 } });
  // 100k prompt, 50k completion, no cache: 100k*2/M + 50k*6/M = 0.2 + 0.3
  check("a registered provider books at its own rate", near(valueActualCost(turn), 0.5), `got ${valueActualCost(turn)}`);

  // Cache is priced at the card's cacheHit, not the input rate: 100k cached at
  // $0.5/M plus 50k completion at $6/M is 0.05 + 0.30, against 0.50 uncached.
  const cachedTurn: Usage = { ...turn, cachedTokens: 100_000 };
  check("cache bills at the card's cache rate", near(valueActualCost(cachedTurn), 0.35), `got ${valueActualCost(cachedTurn)}`);

  // A lane serving `glm-5.3:dev` while the row records `glm-5.3` (or the
  // reverse) must still find its card — a miss on the suffix is another $0.
  registerUpstreamRates("suffixed", { "glm-5.3:dev": { input: 1.4, output: 4.4 } });
  check("plan-suffixed card resolves for a bare id", valueActualCost({ ...turn, provider: "suffixed", model: "glm-5.3" }) > 0);
  check("bare card resolves for a suffixed id", valueActualCost({ ...turn, provider: "suffixed", model: "glm-5.3:dev" }) > 0);

  // Openference advertises `GLM-5.3` uppercase while calls route to `glm-5.3`.
  registerUpstreamRates("caselane", { "GLM-5.3": { input: 1.4, output: 4.4 } });
  check("case-differing id resolves to its card", valueActualCost({ ...turn, provider: "caselane", model: "glm-5.3" }) > 0);

  clearUpstreamRates();
  check("clearing the overlay restores $0", valueActualCost(turn) === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
