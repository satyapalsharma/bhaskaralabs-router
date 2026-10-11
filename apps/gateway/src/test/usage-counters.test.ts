// usage_counters: quota inputs pre-aggregated per 5-minute bucket.
//
// The pure checks always run. The database checks need a throwaway Postgres
// and only run with USAGE_COUNTERS_TEST_DB=1 and a localhost DATABASE_URL, e.g.
//   podman run -d --rm --name uc-pg -e POSTGRES_PASSWORD=t -p 55432:5432 postgres:16-alpine
//   USAGE_COUNTERS_TEST_DB=1 DATABASE_URL=postgres://postgres:t@127.0.0.1:55432/postgres \
//     bun src/test/usage-counters.test.ts
// They write rows only for uc-test-* users and delete them afterwards.
import { sql } from "drizzle-orm";
import { db } from "../db";
import { writeLedger } from "../lib/ledger";
import { getQuotaState } from "../lib/quotas";
import {
  BUCKET_SECONDS,
  bucketFloor,
  monthStartUtc,
  readQuotaCounters,
  reconcileUsageCounters,
} from "../lib/usage-counters";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name} ${detail}`); }
}
const BUCKET_MS = BUCKET_SECONDS * 1000;

console.log("Test: usage counter buckets");
{
  const d = new Date("2026-10-11T13:07:42.123Z");
  check("bucketFloor aligns to 5 minutes", bucketFloor(d).toISOString() === "2026-10-11T13:05:00.000Z");
  check("bucketFloor is idempotent", bucketFloor(bucketFloor(d)).getTime() === bucketFloor(d).getTime());
  check("month start is UTC", monthStartUtc(d).toISOString() === "2026-10-01T00:00:00.000Z");
  check("month start is a bucket boundary", bucketFloor(monthStartUtc(d)).getTime() === monthStartUtc(d).getTime());
}

const url = process.env.DATABASE_URL ?? "";
const dbEnabled = process.env.USAGE_COUNTERS_TEST_DB === "1" && /@(localhost|127\.0\.0\.1)[:/]/.test(url);
if (!dbEnabled) {
  console.log("  - database checks skipped (USAGE_COUNTERS_TEST_DB=1 + localhost DATABASE_URL to run)");
} else {
  console.log("Test: usage counters against Postgres");
  // Mirror of the drizzle schema + scripts/db-ensure.ts DDL.
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS usage_ledger (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, api_key_id TEXT, session_id TEXT NOT NULL,
      endpoint_model TEXT NOT NULL, provider TEXT NOT NULL, upstream_model TEXT NOT NULL,
      routed_to TEXT NOT NULL, router_effort TEXT NOT NULL DEFAULT 'low',
      prompt_tokens BIGINT NOT NULL, completion_tokens BIGINT NOT NULL,
      cached_tokens BIGINT NOT NULL DEFAULT 0, reasoning_tokens BIGINT NOT NULL DEFAULT 0,
      user_equiv_cost_usd NUMERIC(12,6) NOT NULL, actual_cost_usd NUMERIC(12,6) NOT NULL DEFAULT '0',
      provider_meta TEXT, has_tool_calls BOOLEAN, router_reason TEXT, router_signals TEXT,
      latency_ms INTEGER, ttft_ms INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS usage_counters (
      user_id TEXT NOT NULL, endpoint_model TEXT NOT NULL, bucket_start TIMESTAMPTZ NOT NULL,
      calls BIGINT NOT NULL DEFAULT 0, tokens BIGINT NOT NULL DEFAULT 0,
      equiv_usd NUMERIC(16,6) NOT NULL DEFAULT '0', actual_usd NUMERIC(16,6) NOT NULL DEFAULT '0',
      CONSTRAINT usage_counters_user_id_endpoint_model_bucket_start_pk
        PRIMARY KEY (user_id, endpoint_model, bucket_start))`);
  const cleanup = async () => {
    await db.execute(sql`DELETE FROM usage_ledger WHERE user_id LIKE 'uc-test-%'`);
    await db.execute(sql`DELETE FROM usage_counters WHERE user_id LIKE 'uc-test-%'`);
  };
  await cleanup();

  const write = (userId: string, endpointModel: string, promptTokens: number, completionTokens: number, costs = {}) =>
    writeLedger({
      userId, apiKeyId: `${userId}-key`, sessionId: "s1", endpointModel,
      usage: { promptTokens, completionTokens, model: "m", provider: "p" },
      routedTo: "full", routerEffort: "low", ...costs,
    });
  const counterSum = async (userId: string) => {
    const r = await db.execute(sql`SELECT coalesce(sum(calls),0)::int AS calls, coalesce(sum(tokens),0)::bigint AS tokens FROM usage_counters WHERE user_id = ${userId}`);
    return { calls: Number((r as any)[0].calls), tokens: Number((r as any)[0].tokens) };
  };

  // 1. Writes land in counters, and the quota read matches.
  const A = "uc-test-a";
  for (let i = 0; i < 3; i++) await write(A, "theta", 1000, 100);
  await write(A, "glm-5.3", 5000, 500);
  await write(A, "glm-5.3", 7000, 700);
  const qa = await readQuotaCounters(A, 5);
  check("theta window calls", qa.thetaThisWindow === 3, JSON.stringify(qa));
  check("theta month calls", qa.thetaThisMonth === 3, JSON.stringify(qa));
  check("glm window calls", qa.glmThisWindow === 2, JSON.stringify(qa));
  check("glm window tokens", qa.glmTokensThisWindow === 13_200, JSON.stringify(qa));
  const state = await getQuotaState(A, "starter");
  check("getQuotaState reads the counters", state.thetaThisWindow === 3 && state.glmThisWindow === 2 && !state.unlimited);

  // 2. Ledger row and counter share a bucket (same transaction now()).
  const mismatch = await db.execute(sql`
    SELECT count(*)::int AS n FROM usage_ledger l
    WHERE l.user_id = ${A} AND NOT EXISTS (
      SELECT 1 FROM usage_counters c WHERE c.user_id = l.user_id AND c.endpoint_model = l.endpoint_model
        AND c.bucket_start = to_timestamp(floor(extract(epoch from l.created_at) / ${sql.raw(String(BUCKET_SECONDS))}) * ${sql.raw(String(BUCKET_SECONDS))}))`);
  check("every ledger row has its bucket", Number((mismatch as any)[0].n) === 0);

  // 3. Concurrent writes to one hot bucket are all counted.
  const B = "uc-test-b";
  await Promise.all(Array.from({ length: 50 }, () => write(B, "theta", 10, 1)));
  const sb = await counterSum(B);
  check("50 concurrent writes → 50 calls", sb.calls === 50, JSON.stringify(sb));
  check("50 concurrent writes → tokens summed", sb.tokens === 550, JSON.stringify(sb));

  // 4. A failing counter write keeps the ledger row (savepoint). The second
  //    9e18-token write overflows the bucket's bigint but not the ledger row.
  const C = "uc-test-c";
  const huge = { userEquivUsd: 0, actualCostUsd: 0 };
  const origError = console.error;
  const logged: string[] = [];
  console.error = (...a: unknown[]) => { logged.push(a.map(String).join(" ")); };
  try {
    await write(C, "glm-5.3", 9e18, 0, huge);
    await write(C, "glm-5.3", 9e18, 0, huge);
  } finally {
    console.error = origError;
  }
  const lc = await db.execute(sql`SELECT count(*)::int AS n FROM usage_ledger WHERE user_id = ${C}`);
  check("ledger keeps both rows", Number((lc as any)[0].n) === 2);
  check("counter kept the first write only", (await counterSum(C)).calls === 1);
  check("counter failure logged", logged.some((l) => l.includes("usage-counter-error")), logged.join(" | "));
  // Its bucket cannot be rebuilt either (the sum overflows), so keep it out of
  // the reconcile range below.
  await db.execute(sql`DELETE FROM usage_ledger WHERE user_id = ${C}`);

  // 5. Reconcile rebuilds counters from the ledger, including older rows.
  const D = "uc-test-d";
  const sixHoursAgo = new Date(Date.now() - 6 * 3_600_000);
  for (let i = 0; i < 4; i++) {
    await db.execute(sql`
      INSERT INTO usage_ledger (id, user_id, session_id, endpoint_model, provider, upstream_model, routed_to,
        prompt_tokens, completion_tokens, user_equiv_cost_usd, created_at)
      VALUES (${`${D}-${i}`}, ${D}, 's', 'theta', 'p', 'm', 'full', 100, 10, '0.5', ${sixHoursAgo.toISOString()})`);
  }
  await write(D, "theta", 100, 10);
  await db.execute(sql`UPDATE usage_counters SET calls = 999 WHERE user_id = ${D}`); // drift
  const n = await reconcileUsageCounters(new Date(Date.now() - 7 * 3_600_000), new Date(Date.now() + 2 * BUCKET_MS));
  check("reconcile wrote buckets", n >= 2, String(n));
  const qd = await readQuotaCounters(D, 5);
  const oldInMonth = sixHoursAgo >= monthStartUtc();
  check("reconcile restored the window count", qd.thetaThisWindow === 1, JSON.stringify(qd));
  check("reconcile restored the month count", qd.thetaThisMonth === (oldInMonth ? 5 : 1), JSON.stringify(qd));
  const n2 = await reconcileUsageCounters(new Date(Date.now() - 7 * 3_600_000), new Date(Date.now() + 2 * BUCKET_MS));
  const qd2 = await readQuotaCounters(D, 5);
  check("reconcile is idempotent", n2 === n && JSON.stringify(qd2) === JSON.stringify(qd));

  // 6. Window edges: the bucket containing now − window counts, the one before does not.
  const E = "uc-test-e";
  const edge = bucketFloor(new Date(Date.now() - 5 * 3_600_000));
  const before = new Date(edge.getTime() - BUCKET_MS);
  await db.execute(sql`INSERT INTO usage_counters (user_id, endpoint_model, bucket_start, calls) VALUES
    (${E}, 'theta', ${edge.toISOString()}, 7), (${E}, 'theta', ${before.toISOString()}, 100)`);
  const qe = await readQuotaCounters(E, 5);
  check("window includes its first bucket only", qe.thetaThisWindow === 7, JSON.stringify(qe));

  await cleanup();
  if (import.meta.main) await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} usage-counters checks failed`);
