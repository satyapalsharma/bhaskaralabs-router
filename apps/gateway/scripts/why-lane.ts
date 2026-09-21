// Why is a lane not being used?
//
// Walks the same resolution the router performs and prints, rung by rung, the
// reason each lane is or is not eligible. Guessing at this from the ledger
// alone is not possible — a lane can be skipped for half a dozen different
// reasons (health, cooldown, a window limit, lane saturation, a missing fleet
// row) and every one of them looks identical in the traffic: zero turns.
//
// Written while chasing "electronhub gets no traffic", which turned out to be
// four separate causes stacked on top of each other.
//
// Load the GATEWAY's .env, not whatever bun finds in the working directory.
// Provider enablement is env-gated — `agnesEnabled` is `!!process.env
// .AGNES_API_KEY && …`, and stepfun, camel and llmgateway are the same shape —
// so a script run from the repo root saw none of those keys and reported every
// one of those lanes as `laneHealth=false`. That is a false negative in the one
// field this script exists to get right: it claimed agnes was down while
// `curl :8787/health` said `"agnes": true` and agnes was serving turns.
//
// Loaded by hand because this Bun (1.3.14) has neither `Bun.loadEnvFile` nor
// `process.loadEnvFile`, and bun's automatic pickup reads the repo root's .env,
// which is not the file the gateway runs on. Variables already present are left
// alone, so an explicitly exported value still wins — the same precedence bun
// itself applies when `--env-file` is used.
async function loadGatewayEnv(): Promise<void> {
  let text: string;
  try {
    text = await Bun.file(new URL("../.env", import.meta.url)).text();
  } catch {
    return; // No file: the caller exported what it needs, or the lanes are off.
  }
  for (const line of text.split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || m[1] in process.env) continue;
    const v = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    process.env[m[1]] = v;
  }
}
await loadGatewayEnv();
import { buildLaneHealth } from "../src/lib/lane-health";
import { getFleet } from "../src/lib/upstream-config";
import { resolveLane, laneUsable, fitsLane, tierOf } from "../src/router";
import { GLM_FULL_CHAIN, GLM_FLASH_CHAIN, THETA_CHAIN } from "@bhaskara/shared/pricing";
import { laneFree, laneLoadOf, laneBudgetFor, laneWeight, costOnLane } from "../src/lib/lane-slot";
import { accountSlotFreeFor, candidatesFor } from "../src/providers/generic";
import { checkAccountWindows } from "../src/lib/account-windows";

const fleet = await getFleet();
const health = await buildLaneHealth();

console.log("=== lane health as the router sees it ===");
for (const [id, ok] of Object.entries(health)) {
  console.log(`  ${ok ? "healthy  " : "UNHEALTHY"}  ${id}`);
}

console.log("\n=== fleet as loaded ===");
for (const [id, p] of fleet) {
  console.log(`  ${id}: billing=${p.billing} accounts=${p.accounts.length} models=${p.models.length}`);
  for (const a of p.accounts) {
    const cooling = (a.cooldownUntil ?? 0) > Date.now();
    const win = checkAccountWindows(a.id, a.limits);
    console.log(
      `      ${a.label}: disabled=${a.disabled} cooling=${cooling}${cooling ? ` until ${new Date(a.cooldownUntil!).toISOString()}` : ""} ` +
        `slotFree=${accountSlotFreeFor(a)} windowAllowed=${win.allowed}${win.allowed ? "" : ` (${win.reason})`} ` +
        `maxConcurrent=${a.limits?.maxConcurrent ?? 4} declaredWindow=${JSON.stringify(a.limits ?? null)}`,
    );
  }
}

console.log("\n=== chain walk: why does each rung lose? ===");
for (const [name, chain] of [
  ["FULL ", GLM_FULL_CHAIN],
  ["FLASH", GLM_FLASH_CHAIN],
  ["THETA", THETA_CHAIN],
] as const) {
  console.log(`\n  ── ${name} chain ──`);
  for (const lane of chain) {
    const id = lane.provider;
    const reasons: string[] = [];
    const h = health[id] === true;
    const cfg = fleet.get(id);
    // Absent from the fleet is NOT a reason the router skips a lane. The
    // hardcoded providers (camel, agnes, stepfun, hyper, llmgateway) are
    // dispatched by their own modules and have no fleet row by design;
    // `pickLane` tests only `laneUsable(health, …)` and `fitsLane(…)`, and
    // `buildLaneHealth` fills those five in from their own enable/budget
    // checks. Reporting "NOT IN FLEET" as a skip reason therefore inverted the
    // answer for two rungs of every glm ladder — it is why this script kept
    // insisting hyper was unreachable while the ledger showed hyper serving
    // turns. Fleet presence is a note; only the checks `pickLane` performs are
    // allowed to mark a rung skipped.
    if (!h) reasons.push("laneHealth=false");
    const notes: string[] = [];
    if (lane.maxInputTokens !== undefined) notes.push(`maxInputTokens=${lane.maxInputTokens} (blocks only past it)`);
    if (!cfg) {
      notes.push("no fleet row (hardcoded provider)");
    } else {

      const cands = candidatesFor(cfg);
      if (cands.length === 0) reasons.push("no account with a free slot");
      for (const a of cfg.accounts) {
        if (a.disabled) reasons.push(`${a.label} disabled`);
        if ((a.cooldownUntil ?? 0) > Date.now()) reasons.push(`${a.label} cooling until ${new Date(a.cooldownUntil!).toLocaleTimeString()}`);
        const win = checkAccountWindows(a.id, a.limits);
        if (!win.allowed) reasons.push(`${a.label} window blocked: ${win.reason}`);
      }
      const budget = laneBudgetFor(id);
      const w = costOnLane(id, 2000);
      if (!laneFree(id, w)) reasons.push(`lane saturated (load ${laneLoadOf(id)} + weight ${w} > budget ${budget})`);
    }
    console.log(`    ${reasons.length === 0 ? "ELIGIBLE  " : "skipped   "} ${id.padEnd(12)} ${[...reasons, ...notes].join("; ") || "nothing blocking"}`);
  }
}

console.log("\n=== what the router actually resolves ===");
for (const [model, tier, prefix] of [
  ["glm-5.3", "flash", 20_000],
  ["glm-5.3", "full", 20_000],
] as const) {
  const lane = resolveLane(model, tier, health, prefix);
  console.log(`  ${model} ${tier} @${prefix} tokens → ${lane ? `${lane.provider} / ${lane.model}` : "NO LANE"}`);
}

// The full-tier gate: a full turn only happens when the decision tree allows
// it, so zero electronhub traffic can also just mean zero full-tier turns.
console.log("\n=== recent tier mix (this is the other half of the answer) ===");

process.exit(0);
