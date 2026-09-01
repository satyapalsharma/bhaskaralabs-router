// Smoke-test the metering math before anything else uses it.
import { valueUserFacing, valueActualCost, type Usage } from "./metering";

// Case 1: frontier turn on Hyper — 1M prompt (100k cached), 100k out on glm-5.3
const f: Usage = { promptTokens: 1_000_000, completionTokens: 100_000, cachedTokens: 100_000, model: "glm-5.3", provider: "hyper" };
const uf = valueUserFacing(f);
// actual: (0.1M cached * 0.283088) + (0.9M fresh * 1.52432) + (0.1M out * 4.79072)
const actual = valueActualCost(f);
console.log("frontier glm-5.3: user-equivalent $%s actual $%s", uf.equivalentApiCost.toFixed(4), actual.toFixed(4));
const expectActual = (100_000 * 0.283088 + 900_000 * 1.52432 + 100_000 * 4.79072) / 1e6;
if (Math.abs(actual - expectActual) > 1e-9) throw new Error("frontier math mismatch");
if (Math.abs(uf.equivalentApiCost - (1_000_000 * 1.52432 + 100_000 * 4.79072) / 1e6) > 1e-9) throw new Error("frontier display mismatch");

// Case 2: theta turn on Agnes — user sees display rates, COGS is 0 (flat plan)
const t: Usage = { promptTokens: 50_000, completionTokens: 2_000, model: "agnes-2.5-flash", provider: "agnes" };
const tu = valueUserFacing(t);
console.log("theta agnes: user-equivalent $%s actual $%s", tu.equivalentApiCost.toFixed(6), valueActualCost(t));
if (Math.abs(tu.equivalentApiCost - (50_000 * 0.2 + 2_000 * 0.4) / 1e6) > 1e-9) throw new Error("theta display mismatch");

// Case 3: devpass metered
const d: Usage = { promptTokens: 100_000, completionTokens: 5_000, model: "deepseek-v4-flash-0731", provider: "devpass" };
const du = valueActualCost(d);
if (Math.abs(du - (100_000 * 0.08 + 5_000 * 0.15) / 1e6) > 1e-9) throw new Error("devpass mismatch");
console.log("devpass actual $%s", du.toFixed(6));

console.log("✓ metering math verified");