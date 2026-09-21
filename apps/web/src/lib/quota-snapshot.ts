// Server-side quota/usage queries for the dashboard.
// Mirrors gateway/src/lib/quotas.ts semantics against the shared DB. Keep the
// two in step — the dashboard promises the same numbers the gateway enforces,
// and a drift here is a support ticket ("it says I have 12 left").
//
// Quotas are counted in requests for both products; glm-5.3 carries a second
// cap on tokens because a single call may carry a million-token context.

import { db } from "@/db";
import { usageLedger, subscriptions } from "@/db/schema";
import { user as users } from "@/db/schema";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import { PLANS, THROTTLE, type PlanId } from "@bhaskara/shared/pricing";

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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
  const sinceWindow = new Date(Date.now() - THROTTLE.windowHours * 60 * 60 * 1000);

  const glmRows = await db
    .select({
      calls: sql<number>`count(*) filter (where ${usageLedger.createdAt} >= ${sinceWindow.toISOString()})`,
      tokens: sql<number>`coalesce(sum(
        case when ${usageLedger.createdAt} >= ${sinceWindow.toISOString()}
          then ${usageLedger.promptTokens} + ${usageLedger.completionTokens}
          else 0 end
      ), 0)`,
    })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.userId, userId),
        eq(usageLedger.endpointModel, "glm-5.3"),
        gte(usageLedger.createdAt, since),
      ),
    );

  const thetaRows = await db
    .select({
      month: sql<number>`count(*)`,
      win: sql<number>`count(*) filter (where ${usageLedger.createdAt} >= ${sinceWindow.toISOString()})`,
    })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.userId, userId),
        eq(usageLedger.endpointModel, "theta"),
        gte(usageLedger.createdAt, since),
      ),
    );

  const equivRows = await db
    .select({ total: sql<number>`coalesce(sum(${usageLedger.userEquivalentCostUsd}::numeric), 0)` })
    .from(usageLedger)
    .where(and(eq(usageLedger.userId, userId), gte(usageLedger.createdAt, since)));

  return {
    plan,
    glmThisWindow: Number(glmRows[0]?.calls ?? 0),
    glmTokensThisWindow: Number(glmRows[0]?.tokens ?? 0),
    thetaThisWindow: Number(thetaRows[0]?.win ?? 0),
    thetaThisMonth: Number(thetaRows[0]?.month ?? 0),
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
    equivCostMonthUsd: Number(equivRows[0]?.total ?? 0),
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
      date: sql<string>`to_char(${usageLedger.createdAt}, 'YYYY-MM-DD')`,
      requests: sql<number>`count(*)`,
      tokens: sql<number>`coalesce(sum(${usageLedger.promptTokens} + ${usageLedger.completionTokens}), 0)`,
      equiv: sql<number>`coalesce(sum(${usageLedger.userEquivalentCostUsd}::numeric), 0)`,
      actual: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}::numeric), 0)`,
    })
    .from(usageLedger)
    .where(and(eq(usageLedger.userId, userId), gte(usageLedger.createdAt, since)))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  return rows.map((r) => ({
    date: r.date,
    requests: Number(r.requests),
    tokens: Number(r.tokens),
    savedUsd: Math.max(0, Number(r.equiv) - Number(r.actual)),
  }));
}
