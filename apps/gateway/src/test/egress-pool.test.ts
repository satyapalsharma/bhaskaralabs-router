// Credit-bucket egress pool: direct-first with zero relay latency while the
// direct bucket has credits, round-robin relay overflow after it drains,
// 60s window reset, non-pool providers pass through untouched.
//
// Env is read lazily on first call (and via __resetEgressPoolForTest), so
// this file can set its own small capacities regardless of import order in
// run-all's single process.

process.env.BHASKARA_EGRESS_POOL_PROVIDERS = "agnes4,agnes5";
process.env.BHASKARA_EGRESS_POOL_DIRECT_CREDITS = "3";
process.env.BHASKARA_EGRESS_POOL_RELAY_CREDITS = "2";
process.env.BHASKARA_EGRESS_POOL_RELAY_URLS = "https://relay-a.example/v1,https://relay-b.example/v1";

export {};

const { egressPoolUrl, __resetEgressPoolForTest } = await import("../lib/egress-pool");
__resetEgressPoolForTest();

const DIRECT = "https://direct.example/v1";
const log: string[] = [];
const pick = (p: string) => log.push(egressPoolUrl(p, DIRECT));

// First 3 requests: direct credits only (agnes4 and agnes5 SHARE the direct
// bucket — the upstream throttle is per-IP, not per-account).
pick("agnes4"); pick("agnes4"); pick("agnes5");
if (log[0] !== DIRECT || log[1] !== DIRECT || log[2] !== DIRECT) {
  throw new Error(`expected first 3 direct, got ${JSON.stringify(log)}`);
}

// Next 4: relays, round-robin across regions (also shared across providers;
// 2 relays × 2 credits = 4 overflow slots).
pick("agnes4"); pick("agnes5"); pick("agnes4"); pick("agnes5");
if (log[3] !== "https://relay-a.example/v1" || log[4] !== "https://relay-b.example/v1"
  || log[5] !== "https://relay-a.example/v1" || log[6] !== "https://relay-b.example/v1") {
  throw new Error(`expected relay round-robin a,b,a,b, got ${JSON.stringify(log)}`);
}

// All buckets drained: fall back to direct (429-intelligence handles the rest).
pick("agnes4");
if (log[7] !== DIRECT) throw new Error(`expected direct fallback, got ${log[7]}`);

// Non-pool provider: passthrough even though buckets are drained.
if (egressPoolUrl("openrouter", DIRECT) !== DIRECT) throw new Error("non-pool provider must pass through");

// Window reset: force the direct bucket's window into the past; credits
// come back and requests go direct again.
const { __advanceWindowForTest } = await import("../lib/egress-pool");
__advanceWindowForTest(61_000);
pick("agnes5");
if (log[8] !== DIRECT) throw new Error(`expected direct after window reset, got ${log[8]}`);

console.log("egress-pool: all passed");
