// Server-side quota/usage queries for the dashboard.
// Reads usage_counters, the same 5-minute buckets the gateway's quotas.ts
// enforces against (the ledger keeps only 14 days and is too large to
// aggregate per page view). Mirrors gateway/src/lib/quotas.ts. Keep the
// two in step — the dashboard promises the same numbers the gateway enforces,
// and a drift here is a support ticket ("it says I have 12 left").
//
// Quotas are counted in requests for both products; glm-5.3 carries a second
// cap on tokens because a single call may carry a million-token context.

import { db } from "@/db";
import { usageCounters, subscriptions } from "@/db/schema";
import { user as users } from "@/db/schema";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import { PLANS, THROTTLE, type PlanId } from "@bhaskara/shared/pricing";

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** usage_counters bucket size; keep equal to gateway usage-counters.ts. */
const BUCKET_MS = 5 * 60 * 1000;
function bucketFloor(d: Date): Date {
  return new Date(Math.floor(d.getTime() / BUCKET_MS) * BUCKET_MS);
}

export interface QuotaSnapshot {
  plan: string;
  /** glm-5.3 calls in the trailing window. */
  glmThisWindow: number;
  /** glm-5.3 total tokens in the trailing window. */
  glmTokensThisWindow: number;
  /** theta calls in the trailing window. */
  thetaThisWindow: number;
  /** theta calls this calendar month. */
  thetaThisMonth: number;
  limits: {
    thetaPer5h: number | null; // null = unlimited
    thetaExtraMonthly: number;
    glmPer5h: number;
    glmTokensPer5h: number;
  };
  unlimitedTheta: boolean;
  memberSince: Date;
  subRenews: Date | null;
  daysLeft: number | null; // resolved server-side so the client never calls Date.now() mid-render
  trainingOptOut: boolean;
  cohort: number;
  equivCostMonthUsd: number; // this month's traffic valued at direct API list rates
}

export async function getQuotaSnapshot(userId: string): Promise<QuotaSnapshot | null> {
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userRows[0];
  if (!user) return null;

  const subRows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.periodEnd))
    .limit(1);
  const plan = subRows[0]?.plan ?? user.plan;

  const p = PLANS[plan as PlanId] ?? PLANS.trial;
  const since = monthStart();
  // Same 5-minute buckets the gateway enforces against (usage-counters.ts):
  // the window starts at the bucket containing now − windowHours.
  const windowFrom = bucketFloor(new Date(Date.now() - THROTTLE.windowHours * 60 * 60 * 1000));
  const from = windowFrom < since ? windowFrom : since;
  const w = windowFrom.toISOString();
  const m = since.toISOString();

  const rows = await db
    .select({
      model: usageCounters.endpointModel,
      winCalls: sql<string>`coalesce(sum(${usageCounters.calls}) filter (where ${usageCounters.bucketStart} >= ${w}), 0)`,
      winTokens: sql<string>`coalesce(sum(${usageCounters.tokens}) filter (where ${usageCounters.bucketStart} >= ${w}), 0)`,
      monthCalls: sql<string>`coalesce(sum(${usageCounters.calls}) filter (where ${usageCounters.bucketStart} >= ${m}), 0)`,
      monthEquiv: sql<string>`coalesce(sum(${usageCounters.equivUsd}) filter (where ${usageCounters.bucketStart} >= ${m}), 0)`,
    })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), gte(usageCounters.bucketStart, from)))
    .groupBy(usageCounters.endpointModel);
  const glm = rows.find((r) => r.model === "glm-5.3");
  const theta = rows.find((r) => r.model === "theta");
  const equivMonth = rows.reduce((sum, r) => sum + Number(r.monthEquiv), 0);

  return {
    plan,
    glmThisWindow: Number(glm?.winCalls ?? 0),
    glmTokensThisWindow: Number(glm?.winTokens ?? 0),
    thetaThisWindow: Number(theta?.winCalls ?? 0),
    thetaThisMonth: Number(theta?.monthCalls ?? 0),
    limits: {
      thetaPer5h: p.thetaPer5h,
      thetaExtraMonthly: p.thetaExtraMonthly,
      glmPer5h: p.glmPer5h,
      glmTokensPer5h: p.glmTokensPer5h,
    },
    unlimitedTheta: p.thetaPer5h === null,
    memberSince: user.createdAt,
    subRenews: subRows[0]?.periodEnd ?? null,
    daysLeft: subRows[0]?.periodEnd
      ? Math.max(0, Math.ceil((subRows[0].periodEnd.getTime() - Date.now()) / 86_400_000))
      : null,
    trainingOptOut: user.trainingOptOut,
    cohort: user.cohort,
    equivCostMonthUsd: equivMonth,
  };
}

export interface DayUsage {
  date: string;
  requests: number;
  tokens: number;
  savedUsd: number;
}

/** 7-day totals per day: requests, tokens, and dollars saved (direct-API
 *  equivalent minus what the turn actually cost us). */
export async function getRecentUsage(userId: string): Promise<DayUsage[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      date: sql<string>`to_char(${usageCounters.bucketStart}, 'YYYY-MM-DD')`,
      requests: sql<number>`coalesce(sum(${usageCounters.calls}), 0)`,
      tokens: sql<number>`coalesce(sum(${usageCounters.tokens}), 0)`,
      equiv: sql<number>`coalesce(sum(${usageCounters.equivUsd}), 0)`,
      actual: sql<number>`coalesce(sum(${usageCounters.actualUsd}), 0)`,
    })
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), gte(usageCounters.bucketStart, bucketFloor(since))))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return rows.map((r) => ({
    date: r.date,
    requests: Number(r.requests),
    tokens: Number(r.tokens),
    savedUsd: Math.max(0, Number(r.equiv) - Number(r.actual)),
  }));
}
