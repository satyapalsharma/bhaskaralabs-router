// Quota tracking: frontier token caps (monthly) + theta rate windows (5h rolling + monthly).
// Backed by usage_ledger aggregation — simple and correct; rate_windows table optimizes later.

import { db } from "../db";
import { usageLedger, rateWindows } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { PLANS } from "@bhaskara/shared/pricing";

export interface QuotaState {
  frontierInUsed: number;
  frontierOutUsed: number;
  thetaThisMonth: number;
  thetaLast5h: number;
  limits: {
    frontierInputM: number;
    frontierOutputM: number;
    thetaPer5h: number;
    thetaMonthly: number;
  };
  overFrontierIn: boolean;
  overFrontierOut: boolean;
  overTheta5h: boolean;
  overThetaMonth: boolean;
}

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function fiveHoursAgo(): Date {
  return new Date(Date.now() - 5 * 60 * 60 * 1000);
}

export async function getQuotaState(userId: string, plan: string): Promise<QuotaState> {
  const p = PLANS[plan as keyof typeof PLANS] ?? PLANS.free;
  const since = monthStart();
  const since5h = fiveHoursAgo();

  const frontierRows = await db
    .select({
      in: sql<number>`coalesce(sum(${usageLedger.promptTokens}), 0)`,
      out: sql<number>`coalesce(sum(${usageLedger.completionTokens}), 0)`,
    })
    .from(usageLedger)
    .where(and(eq(usageLedger.userId, userId), gte(usageLedger.createdAt, since)));

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

  const frontierInUsed = Number(frontierRows[0]?.in ?? 0);
  const frontierOutUsed = Number(frontierRows[0]?.out ?? 0);
  const thetaThisMonth = Number(thetaRows[0]?.month ?? 0);
  const thetaLast5h = Number(thetaRows[0]?.win5h ?? 0);

  const capIn = p.frontierInputM * 1e6;
  const capOut = p.frontierOutputM * 1e6;

  return {
    frontierInUsed,
    frontierOutUsed,
    thetaThisMonth,
    thetaLast5h,
    limits: {
      frontierInputM: p.frontierInputM,
      frontierOutputM: p.frontierOutputM,
      thetaPer5h: p.thetaPer5h,
      thetaMonthly: p.thetaMonthly,
    },
    overFrontierIn: frontierInUsed >= capIn,
    overFrontierOut: frontierOutUsed >= capOut,
    overTheta5h: thetaLast5h >= p.thetaPer5h,
    overThetaMonth: thetaThisMonth >= p.thetaMonthly,
  };
}

export function quotaRejection(state: QuotaState, endpointModel: string): string | null {
  if (state.overFrontierIn && endpointModel !== "theta")
    return "Monthly frontier input quota exhausted. Upgrade at https://bhaskaralabs.com/dashboard";
  if (state.overFrontierOut && endpointModel !== "theta")
    return "Monthly frontier output quota exhausted. Upgrade at https://bhaskaralabs.com/dashboard";
  if (endpointModel === "theta") {
    if (state.overThetaMonth) return "Monthly theta request quota exhausted.";
    if (state.overTheta5h) return "Theta 5-hour window exhausted — resets automatically. Use frontier models meanwhile.";
  }
  return null;
}