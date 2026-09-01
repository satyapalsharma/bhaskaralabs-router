// Server-side quota/usage queries for the dashboard.
// Mirrors gateway/src/lib/quotas.ts semantics against the shared DB.
import { db } from "@/db";
import { usageLedger, subscriptions } from "@/db/schema";
import { user as users } from "@/db/schema";
import { and, eq, gte, sql, desc } from "drizzle-orm";
import { PLANS } from "@bhaskara/shared/pricing";

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface QuotaSnapshot {
  plan: string;
  frontierInUsed: number;
  frontierOutUsed: number;
  thetaThisMonth: number;
  thetaLast5h: number;
  limits: { frontierInputM: number; frontierOutputM: number; thetaPer5h: number; thetaMonthly: number };
  memberSince: Date;
  subRenews: Date | null;
  trainingOptOut: boolean;
  cohort: number;
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

  const p = PLANS[plan as keyof typeof PLANS] ?? PLANS.free;
  const since = monthStart();
  const since5h = new Date(Date.now() - 5 * 60 * 60 * 1000);

  const frontierRows = await db
    .select({
      in: sql<number>`coalesce(sum(${usageLedger.promptTokens}), 0)`,
      out: sql<number>`coalesce(sum(${usageLedger.completionTokens}), 0)`,
    })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.userId, userId),
        gte(usageLedger.createdAt, since),
        sql`${usageLedger.endpointModel} != 'theta'`,
      ),
    );

  const thetaRows = await db
    .select({
      month: sql<number>`count(*)`,
      win5h: sql<number>`count(*) filter (where ${usageLedger.createdAt} >= ${since5h.toISOString()})`,
    })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.userId, userId),
        eq(usageLedger.endpointModel, "theta"),
        gte(usageLedger.createdAt, since),
      ),
    );

  return {
    plan,
    frontierInUsed: Number(frontierRows[0]?.in ?? 0),
    frontierOutUsed: Number(frontierRows[0]?.out ?? 0),
    thetaThisMonth: Number(thetaRows[0]?.month ?? 0),
    thetaLast5h: Number(thetaRows[0]?.win5h ?? 0),
    limits: {
      frontierInputM: p.frontierInputM,
      frontierOutputM: p.frontierOutputM,
      thetaPer5h: p.thetaPer5h,
      thetaMonthly: p.thetaMonthly,
    },
    memberSince: user.createdAt,
    subRenews: subRows[0]?.periodEnd ?? null,
    trainingOptOut: user.trainingOptOut,
    cohort: user.cohort,
  };
}

export interface DayUsage {
  date: string;
  requests: number;
  tokens: number;
  savedUsd: number;
}

// 7-day totals per day: requests, tokens, estimated USD saved (direct-API equiv − theta equiv)
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