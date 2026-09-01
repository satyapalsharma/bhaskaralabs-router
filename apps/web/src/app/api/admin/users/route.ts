import { NextResponse } from "next/server";
import { requireAdmin, isAdminResponse } from "@/lib/admin";
import { db } from "@/db";
import { user as users, usageLedger, subscriptions, couponRedemptions } from "@/db/schema";
import { and, eq, gte, sql, desc } from "drizzle-orm";

const MONTH_START = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1));
};

// GET /api/admin/users — full roster with money columns.
export async function GET() {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const since = MONTH_START();

  const perUser = await db
    .select({
      id: users.id,
      email: users.email,
      plan: users.plan,
      cohort: users.cohort,
      role: users.role,
      createdAt: users.createdAt,
      trainingOptOut: users.trainingOptOut,
      requests: sql<number>`count(${usageLedger.id})::int`,
      tokens: sql<number>`coalesce(sum(${usageLedger.promptTokens} + ${usageLedger.completionTokens}), 0)::bigint`,
      thetaReqs: sql<number>`count(*) filter (where ${usageLedger.endpointModel} = 'theta')::int`,
      cogsUsd: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}::numeric), 0)`,
      equivUsd: sql<number>`coalesce(sum(${usageLedger.userEquivalentCostUsd}::numeric), 0)`,
      cachedTokens: sql<number>`coalesce(sum(${usageLedger.cachedTokens}), 0)::bigint`,
      fullTierReqs: sql<number>`count(*) filter (where ${usageLedger.routedTo} = 'full')::int`,
    })
    .from(users)
    .leftJoin(usageLedger, and(eq(usageLedger.userId, users.id), gte(usageLedger.createdAt, since)))
    .groupBy(users.id)
    .orderBy(desc(users.createdAt));

  // revenue per user this month (subscriptions paid in window)
  const revenue = await db
    .select({
      userId: subscriptions.userId,
      paid: sql<number>`coalesce(sum(${subscriptions.pricePaid}::numeric), 0)`,
    })
    .from(subscriptions)
    .where(gte(subscriptions.createdAt, since))
    .groupBy(subscriptions.userId);
  const revMap = new Map(revenue.map((r) => [r.userId, Number(r.paid)]));

  // coupons used per user
  const redemptions = await db
    .select({ userId: couponRedemptions.userId, code: sql<string>`string_agg(distinct ${couponRedemptions.couponCode}, ',')` })
    .from(couponRedemptions)
    .groupBy(couponRedemptions.userId);
  const redMap = new Map(redemptions.map((r) => [r.userId, r.code]));

  const rows = perUser.map((u) => {
    const rev = revMap.get(u.id) ?? 0;
    const totalTok = Number(u.tokens);
    return {
      id: u.id,
      email: u.email,
      plan: u.plan,
      cohort: u.cohort,
      role: u.role,
      joined: u.createdAt,
      optOut: u.trainingOptOut,
      tokens: totalTok,
      requests: Number(u.requests ?? 0),
      thetaRequests: Number(u.thetaReqs),
      cogsUsd: Number(u.cogsUsd),
      revenueUsd: rev,
      marginUsd: Number((rev - Number(u.cogsUsd)).toFixed(4)),
      equivApiUsd: Number(u.equivUsd),
      cacheHitPct: totalTok > 0 ? Number(((Number(u.cachedTokens) / totalTok) * 100).toFixed(1)) : 0,
      fullSharePct: Number(u.requests) > 0 ? Number((((Number(u.fullTierReqs) || 0) / Number(u.requests)) * 100).toFixed(1)) : 0,
      coupons: redMap.get(u.id) ?? "",
    };
  });

  return NextResponse.json({ users: rows });
}
