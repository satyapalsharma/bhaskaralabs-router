import { NextResponse } from "next/server";
import { requireAdmin, isAdminResponse } from "@/lib/admin";
import { db } from "@/db";
import { usageLedger, providerMonthly } from "@/db/schema";
import { gte, sql, eq } from "drizzle-orm";
import { PROVIDER_CLASS } from "@bhaskara/shared/pricing";

// GET /api/admin/providers — this month's token COGS per provider, CORE vs
// BOOTSTRAP tagged, plus manual plan-fee rows (provider_monthly) so margin
// shows the true burn (fees aren't in the ledger).
export async function GET() {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;

  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const ledger = await db
    .select({
      provider: usageLedger.provider,
      requests: sql<number>`count(*)::int`,
      tokens: sql<number>`coalesce(sum(${usageLedger.promptTokens} + ${usageLedger.completionTokens}), 0)::bigint`,
      cached: sql<number>`coalesce(sum(${usageLedger.cachedTokens}), 0)::bigint`,
      meteredUsd: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}::numeric), 0)`,
    })
    .from(usageLedger)
    .where(gte(usageLedger.createdAt, since))
    .groupBy(usageLedger.provider);

  const fees = await db.select().from(providerMonthly).where(eq(providerMonthly.month, month));
  const feeMap = new Map(fees.map((f) => [f.provider, f]));

  const providers = ledger.map((r) => {
    const fee = feeMap.get(r.provider);
    const metered = Number(r.meteredUsd);
    // provider_monthly: planFeeUsd = flat fee; meteredUsd column = ledger-invisible
    // spend (allowance burn, credit amortization). True burn = both + ledger metered.
    const planFee = fee ? Number(fee.planFeeUsd) : 0;
    const extraMetered = fee ? Number(fee.meteredUsd) : 0;
    return {
      provider: r.provider,
      class: PROVIDER_CLASS[r.provider as keyof typeof PROVIDER_CLASS] ?? "core",
      requests: Number(r.requests),
      tokens: Number(r.tokens),
      cacheHitPct: Number(r.tokens) > 0 ? Number(((Number(r.cached) / Number(r.tokens)) * 100).toFixed(1)) : 0,
      meteredUsd: metered,
      planFeeUsd: planFee,
      trueBurnUsd: metered + planFee + extraMetered,
      notes: fee?.notes ?? null,
    };
  });

  const totals = await db
    .select({
      cogs: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}::numeric), 0)`,
      equiv: sql<number>`coalesce(sum(${usageLedger.userEquivalentCostUsd}::numeric), 0)`,
    })
    .from(usageLedger)
    .where(gte(usageLedger.createdAt, since));

  const feesTotal = await db
    .select({
      paid: sql<number>`coalesce(sum(${providerMonthly.planFeeUsd}::numeric + ${providerMonthly.meteredUsd}::numeric), 0)`,
    })
    .from(providerMonthly)
    .where(eq(providerMonthly.month, month));

  return NextResponse.json({
    month,
    providers,
    summary: {
      cogsUsd: Number(totals[0]?.cogs ?? 0),
      equivUsd: Number(totals[0]?.equiv ?? 0),
      providerFeesUsd: Number(feesTotal[0]?.paid ?? 0),
    },
  });
}