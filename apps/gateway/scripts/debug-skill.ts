import { skillDecide } from "../src/lib/skill-decide";
import { buildLaneHealth } from "../src/lib/lane-health";
import { getSkillMap } from "../src/lib/skill-cards";
import type { ChatMessage } from "../src/lib/prefix";

const health = await buildLaneHealth();
const map = await getSkillMap().catch(() => ({} as Record<string, Record<string, number>>));
console.log("skill matrix cells:", Object.keys(map).length);

const prompts: Array<[string, string]> = [
  ["routine", "hi, continue"],
  ["hard: TS error", "fix the TS2345 error in the union narrowing"],
  ["hard: debug", "why is this test failing? debug this flaky test"],
  ["architect", "design a system for payments, what's the trade-off"],
];

for (const [label, text] of prompts) {
  const messages: ChatMessage[] = [{ role: "user", content: text }] as ChatMessage[];
  const res = await skillDecide({
    endpointModel: "glm-5.3",
    messages,
    hardness: label.startsWith("hard") || label === "architect" ? "debugging" : "routine",
    stage: "unknown",
    failBlocks: 0,
    loopRepeats: 0,
    lockedModel: null,
    fullShareThisWeek: 0,
    r: 0,
    health,
  });
  if (!res) {
    console.log(`  ${label}: skillDecide -> null (heuristic would run)`);
    continue;
  }
  console.log(
    `  ${label}: picked ${res.decision.upstreamModel} (${res.decision.tier}) ` +
      `J=${res.selection.J.toFixed(3)} d=${res.selection.distance.toFixed(3)} c=${res.selection.costTerm.toFixed(3)}`,
  );
}

// Would the heuristic have chosen full for the same hard prompt?
console.log("\n-- counterfactual: what the heuristic would pick with skill off --");
for (const [label, text] of prompts) {
  const hard = label.startsWith("hard") || label === "architect";
  console.log(`  ${label}: wantsFull=${hard} -> tier ${hard ? "full" : "flash"}`);
}
process.exit(0);
