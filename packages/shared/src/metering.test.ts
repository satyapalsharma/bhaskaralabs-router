// Smoke-test the metering math before anything else uses it.
//
// The three claims this file exists to defend:
//   1. glm-5.3 is valued at full-model list rates with no cache discount.
//   2. theta is valued at its display rates whichever upstream answered.
//   3. Flat-plan providers book $0 per request — their cost is the monthly
//      invoice, amortized elsewhere. A non-zero here would double-count.

import { valueUserFacing, valueActualCost, isFlatProvider, type Usage } from "./metering";

const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;

// ── Case 1: glm-5.3 full on Hyper — 1M prompt (100k cached), 100k out ──
const full: Usage = {
  promptTokens: 1_000_000,
  completionTokens: 100_000,
  cachedTokens: 100_000,
  model: "glm-5.3",
  provider: "hyper",
  endpoint: "glm-5.3",
};
{
  const uf = valueUserFacing(full);
  const actual = valueActualCost(full);
  const expectActual = (100_000 * 0.283088 + 900_000 * 1.52432 + 100_000 * 4.79072) / 1e6;
  // Display deliberately ignores the 100k cached tokens — no discount is shown.
  const expectDisplay = (1_000_000 * 1.52432 + 100_000 * 4.79072) / 1e6;
  console.log("glm-5.3 full: display $%s actual $%s", uf.equivalentApiCost.toFixed(4), actual.toFixed(4));
  if (!near(actual, expectActual)) throw new Error("full-model actual math mismatch");
  if (!near(uf.equivalentApiCost, expectDisplay)) throw new Error("display must not apply a cache discount");
  if (uf.equivalentApiCost <= actual) throw new Error("display should exceed actual when caching is used");
}

// ── Case 2: glm-5.3 flash is materially cheaper than full ──
{
  const flash: Usage = { ...full, model: "glm-5.3-flash" };
  const fullCost = valueActualCost(full);
  const flashCost = valueActualCost(flash);
  console.log("glm-5.3-flash: actual $%s (%.1fx cheaper)", flashCost.toFixed(4), fullCost / flashCost);
  if (!(flashCost < fullCost)) throw new Error("flash must cost less than full");
  if (fullCost / flashCost < 5) throw new Error("flash should be at least 5x cheaper on this profile");
}

// ── Case 3: theta on a flat lane — display rates, $0 COGS ──
{
  const t: Usage = {
    promptTokens: 50_000,
    completionTokens: 2_000,
    model: "agnes-2.5-flash",
    provider: "agnes",
    endpoint: "theta",
  };
  const tu = valueUserFacing(t);
  const expect = (50_000 * 0.2 + 2_000 * 0.4) / 1e6;
  console.log("theta/agnes: display $%s actual $%s", tu.equivalentApiCost.toFixed(6), valueActualCost(t));
  if (!near(tu.equivalentApiCost, expect)) throw new Error("theta display mismatch");
  if (valueActualCost(t) !== 0) throw new Error("flat-plan lane must book $0 COGS");
  if (!isFlatProvider("agnes")) throw new Error("agnes should be classified flat");
}

// ── Case 4: the same theta turn on a metered lane still values at theta rates ──
{
  const t: Usage = {
    promptTokens: 50_000,
    completionTokens: 2_000,
    model: "step-3.7-flash",
    provider: "stepfun",
    endpoint: "theta",
  };
  const tu = valueUserFacing(t);
  const expectDisplay = (50_000 * 0.2 + 2_000 * 0.4) / 1e6;
  const expectActual = (50_000 * 0.04 + 2_000 * 0.1) / 1e6;
  console.log("theta/stepfun: display $%s actual $%s", tu.equivalentApiCost.toFixed(6), valueActualCost(t).toFixed(6));
  if (!near(tu.equivalentApiCost, expectDisplay)) throw new Error("theta display must not depend on the upstream lane");
  if (!near(valueActualCost(t), expectActual)) throw new Error("stepfun metered math mismatch");
}

// ── Case 5: LLMGateway books a third of list ──
{
  const g: Usage = { ...full, provider: "llmgateway" };
  const ratio = valueActualCost(full) / valueActualCost(g);
  console.log("llmgateway is %.2fx cheaper than list", ratio);
  if (!near(ratio, 3, 1e-6)) throw new Error("llmgateway should be exactly 1/3 of list");
}

// ── Case 6: a provider-reported exact cost always wins ──
{
  const o: Usage = { ...full, actualCostOverrideUsd: 0.012345 };
  if (!near(valueActualCost(o), 0.012345)) throw new Error("exact override must win");
}

// ── Case 7: an unknown provider books $0 rather than guessing ──
{
  const x: Usage = { ...full, provider: "totally-new-provider" };
  if (valueActualCost(x) !== 0) throw new Error("unknown providers must not invent a cost");
}

console.log("\n✓ metering math verified");
