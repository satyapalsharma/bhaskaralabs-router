// Operator ("unlimited") keys must not scan usage_ledger on every request.
// On 2026-10-11 the batch key's two per-request aggregates over 1M+ ledger rows
// ran ~11 s each, 15 at a time, on the 1-CPU VM and delayed every theta turn.
//
// No module mocks here: run-all imports every test file into one process, so a
// mocked "../db" would leak into later files. The test environment has no
// reachable Postgres, so any ledger query would hang or throw — answering
// promptly with the operator shape proves the early return.
import { getQuotaState } from "../lib/quotas";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name} ${detail}`); }
}

console.log("Test: unlimited plan answers without touching usage_ledger");
const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 2_000));
const q = await Promise.race([getQuotaState("operator-user", "super"), timeout]);
check("answered without a database round trip", q !== "timeout");
if (q !== "timeout") {
  check("marked unlimited", q.unlimited === true);
  check("never throttled", q.throttleDelayMs === 0);
  check("never over any window", !q.overThetaWindow && !q.overGlmCalls && !q.overGlmTokens);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} quota-unlimited checks failed`);
