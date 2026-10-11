// Pre-aggregated usage: one usage_counters row per (user, endpoint model,
// 5-minute bucket).
//
// Quota checks used to aggregate usage_ledger on every request, which costs
// O(rows the user sent this month). For the batch key (1M+ rows) each check
// read the whole ~900 MB table: 1 s alone, ~11 s with 15 in flight on the
// 1-CPU VM (2026-10-11). The ledger also keeps only 14 days (retention.sh), so
// "this month" counted from it came up short after the 14th.
//
// writeLedger increments the bucket in the same transaction as the ledger row,
// so the two cannot drift. A quota check then sums at most one month of
// buckets for one user through the primary key, independent of traffic. The
// rolling window is read at bucket granularity, so it can reach up to one
// bucket (5 min) further back than nominal — it errs toward counting, never
// toward letting a user past a cap.
//
// reconcileUsageCounters rebuilds closed buckets from the ledger (the source of
// truth): the initial backfill, and the repair path if a counter write ever
// fails (logged as ev=usage-counter-error).

import { and, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { usageCounters } from "../db/schema";

export const BUCKET_SECONDS = 300;
const BUCKET_MS = BUCKET_SECONDS * 1000;

/** Start of the bucket containing `d` (epoch-aligned, so UTC hours/days align). */
export function bucketFloor(d: Date): Date {
  return new Date(Math.floor(d.getTime() / BUCKET_MS) * BUCKET_MS);
}

export function monthStartUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** SQL for the bucket of a timestamptz expression; same alignment as bucketFloor. */
export function bucketSql(ts: SQL): SQL {
  const s = sql.raw(String(BUCKET_SECONDS));
  return sql`to_timestamp(floor(extract(epoch from ${ts}) / ${s}) * ${s})`;
}

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface UsageIncrement {
  userId: string;
  endpointModel: string;
  tokens: number;
  /** Decimal strings, as written to the ledger (numeric columns). */
  equivUsd: string;
  actualUsd: string;
}

/**
 * Add one call to the current bucket. Uses the transaction's now(), the same
 * instant the ledger row's created_at default takes, so a ledger row and its
 * counter always land in the same bucket.
 */
export async function recordUsage(exec: Db | Tx, u: UsageIncrement): Promise<void> {
  await exec
    .insert(usageCounters)
    .values({
      userId: u.userId,
      endpointModel: u.endpointModel,
      bucketStart: bucketSql(sql`now()`),
      calls: 1,
      tokens: u.tokens,
      equivUsd: u.equivUsd,
      actualUsd: u.actualUsd,
    })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.endpointModel, usageCounters.bucketStart],
      set: {
        calls: sql`${usageCounters.calls} + 1`,
        tokens: sql`${usageCounters.tokens} + excluded.tokens`,
        equivUsd: sql`${usageCounters.equivUsd} + excluded.equiv_usd`,
        actualUsd: sql`${usageCounters.actualUsd} + excluded.actual_usd`,
      },
    });
}

export interface QuotaCounters {
  thetaThisWindow: number;
  thetaThisMonth: number;
  glmThisWindow: number;
  glmTokensThisWindow: number;
}

/** The quota inputs for one user: one indexed read, no ledger scan. */
export async function readQuotaCounters(
  userId: string,
  windowHours: number,
  now: Date = new Date(),
): Promise<QuotaCounters> {
  const windowFrom = bucketFloor(new Date(now.getTime() - windowHours * 3_600_000));
  const monthFrom = monthStartUtc(now);
  const since = windowFrom < monthFrom ? windowFrom : monthFrom;
  const w = windowFrom.toISOString();
  const m = monthFrom.toISOString();

  const rows = await db
    .select({
      model: usageCounters.endpointModel,
      winCalls: sql<string>`coalesce(sum(${usageCounters.calls}) filter (where ${usageCounters.bucketStart} >= ${w}), 0)`,
      winTokens: sql<string>`coalesce(sum(${usageCounters.tokens}) filter (where ${usageCounters.bucketStart} >= ${w}), 0)`,
      monthCalls: sql<string>`coalesce(sum(${usageCounters.calls}) filter (where ${usageCounters.bucketStart} >= ${m}), 0)`,
    })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.userId, userId),
        inArray(usageCounters.endpointModel, ["theta", "glm-5.3"]),
        gte(usageCounters.bucketStart, since),
      ),
    )
    .groupBy(usageCounters.endpointModel);

  const theta = rows.find((r) => r.model === "theta");
  const glm = rows.find((r) => r.model === "glm-5.3");
  return {
    thetaThisWindow: Number(theta?.winCalls ?? 0),
    thetaThisMonth: Number(theta?.monthCalls ?? 0),
    glmThisWindow: Number(glm?.winCalls ?? 0),
    glmTokensThisWindow: Number(glm?.winTokens ?? 0),
  };
}

/**
 * Overwrite the buckets in [from, until) with exact aggregates from the ledger.
 * Idempotent. Only call it for closed buckets (until ≤ now − 2 buckets): a live
 * bucket can take an increment between the aggregate and the overwrite. Never
 * reach past the ledger's retention, or the overwrite would lower real counts.
 * Returns the number of buckets written.
 */
export async function reconcileUsageCounters(from: Date, until: Date): Promise<number> {
  const f = bucketFloor(from).toISOString();
  const u = bucketFloor(until).toISOString();
  const res = await db.execute(sql`
    insert into usage_counters (user_id, endpoint_model, bucket_start, calls, tokens, equiv_usd, actual_usd)
    select user_id, endpoint_model, ${bucketSql(sql`created_at`)},
           count(*),
           coalesce(sum(prompt_tokens + completion_tokens), 0),
           coalesce(sum(user_equiv_cost_usd), 0),
           coalesce(sum(actual_cost_usd), 0)
    from usage_ledger
    where created_at >= ${f} and created_at < ${u}
    group by 1, 2, 3
    on conflict (user_id, endpoint_model, bucket_start) do update
      set calls = excluded.calls, tokens = excluded.tokens,
          equiv_usd = excluded.equiv_usd, actual_usd = excluded.actual_usd`);
  return Number((res as unknown as { count?: number }).count ?? 0);
}
