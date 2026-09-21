// Does the gateway actually resolve theta's new third rung end to end?
//
// why-lane already proved the THETA chain walk reaches pareto. What it does
// not prove is that the other half of the pair — the MODEL — resolves: the
// router emits { provider: "pareto", model: "deepseek/deepseek-v4-flash" },
// and dispatch needs a fleet row with that exact model_id, plus a rate the
// ledger can bill against. A chain entry whose model is unregistered is
// eligible in the walk and 502s in production, which is the failure this
// script exists to rule out.
import { getFleet } from "../src/lib/upstream-config";
import { THETA_CHAIN } from "@bhaskara/shared/pricing";
import { laneInputRateUsdPerM } from "../src/lib/decision";

const fleet = await getFleet();
let bad = 0;

console.log("=== THETA_CHAIN, rung by rung: is the pair resolvable? ===\n");
for (const [i, lane] of THETA_CHAIN.entries()) {
  const f = fleet.get(lane.provider);
  let verdict: string;
  if (!f) {
    // Hardcoded providers live outside the fleet table on purpose; their rate
    // comes from the shared card by design, so absence here is correct.
    const rate = await laneInputRateUsdPerM(lane.provider, lane.model, "glm-5.3-flash");
    verdict = `hardcoded provider — rate ${rate}/M in`;
  } else {
    const base = lane.model.includes(":") ? lane.model.split(":")[0] : lane.model;
    const model = f.models.find((m) => m.modelId === lane.model || m.modelId === base);
    if (!model) {
      verdict = "MODEL NOT REGISTERED — would 502";
      bad++;
    } else {
      const rate = await laneInputRateUsdPerM(lane.provider, lane.model, "glm-5.3-flash");
      verdict = `ok  ctx=${model.contextWindow}  ${model.inputUsdPerM}/${model.outputUsdPerM} per M  (resolved ${rate})`;
    }
  }
  console.log(`  ${i + 1}. ${lane.provider.padEnd(12)} ${lane.model.padEnd(26)} ${verdict}`);
}

console.log(`\n  ${bad === 0 ? "all rungs resolvable" : `${bad} BROKEN rung(s)`}`);
process.exit(bad === 0 ? 0 : 1);
