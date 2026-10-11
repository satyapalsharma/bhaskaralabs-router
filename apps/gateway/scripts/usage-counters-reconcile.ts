// Rebuild usage_counters for closed buckets from usage_ledger (the source of
// truth). Idempotent: each bucket in range is overwritten with its exact
// ledger aggregate.
//
// Rollout: db-ensure → start the gateway that writes counters → run this
// (backfill) → run it again ≥10 min later, which closes the cutover buckets
// the old gateway wrote ledger rows into. Also the repair path after any
// ev=usage-counter-error in the gateway log.
//
// Run: docker compose exec -T gateway bun scripts/usage-counters-reconcile.ts [--from ISO] [--until ISO]
// Default range: start of the UTC month (or of the quota window, if earlier)
// up to the last closed bucket. The ledger keeps 14 days (retention.sh), so
// --from may not reach back further than 13 days: overwriting a bucket whose
// ledger rows were already deleted would lower real counts.
import { THROTTLE } from "@bhaskara/shared/pricing";
import {
  BUCKET_SECONDS,
  bucketFloor,
  monthStartUtc,
  reconcileUsageCounters,
} from "../src/lib/usage-counters";

const LEDGER_SAFE_DAYS = 13;
const BUCKET_MS = BUCKET_SECONDS * 1000;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseDate(name: string, raw: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error(`${name}: not a date: ${raw}`);
  return d;
}

const now = new Date();
const oldestSafe = new Date(now.getTime() - LEDGER_SAFE_DAYS * 86_400_000);
// The current and the previous bucket can still receive increments.
const lastClosed = new Date(bucketFloor(now).getTime() - BUCKET_MS);

const windowFrom = new Date(now.getTime() - THROTTLE.windowHours * 3_600_000 - BUCKET_MS);
const monthFrom = monthStartUtc(now);
let from = arg("--from") ? parseDate("--from", arg("--from")!) : windowFrom < monthFrom ? windowFrom : monthFrom;
if (from < oldestSafe) {
  if (arg("--from")) throw new Error(`--from ${from.toISOString()} is past the ledger's retention (oldest safe ${oldestSafe.toISOString()})`);
  from = oldestSafe;
}
const until = arg("--until") ? parseDate("--until", arg("--until")!) : lastClosed;
if (until > lastClosed) throw new Error(`--until ${until.toISOString()} reaches live buckets (last closed ${lastClosed.toISOString()})`);

const t0 = Date.now();
const written = await reconcileUsageCounters(from, until);
console.log(JSON.stringify({
  ev: "usage-counters-reconcile",
  from: bucketFloor(from).toISOString(),
  until: bucketFloor(until).toISOString(),
  buckets: written,
  ms: Date.now() - t0,
}));
process.exit(0);
