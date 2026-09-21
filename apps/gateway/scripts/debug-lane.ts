import { chainFor } from "@bhaskara/shared/pricing";
import { buildLaneHealth } from "../src/lib/lane-health";
import { pickLane, laneUsable } from "../src/router";

const health = await buildLaneHealth();
const chain = chainFor("glm-5.3", "full");
console.log("chain providers:", chain.map((l) => l.provider).join(", "));
for (const l of chain) {
  console.log(`  ${l.provider}: health=${JSON.stringify(health[l.provider])} usable=${laneUsable(health, l.provider)}`);
}
console.log("pickLane:", pickLane(chain, health, 0)?.provider);
console.log("inline find:", chain.find((l) => laneUsable(health, l.provider))?.provider);

// The old signature took prefixTokens as the third argument. If a caller still
// passes one, it lands in `exclude` — and a number has no .has(), so this would
// be a runtime error, not a silent skip. Check both shapes explicitly.
console.log("with number as 3rd arg:", (() => {
  try {
    return (pickLane as unknown as (c: unknown, h: unknown, n: number) => { provider: string } | null)(chain, health, 50000)?.provider ?? "null";
  } catch (e) {
    return `THREW: ${(e as Error).message.slice(0, 60)}`;
  }
})());

process.exit(0);
