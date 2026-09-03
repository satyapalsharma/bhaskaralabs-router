import { NextResponse } from "next/server";
import { requireAdmin, isAdminResponse } from "@/lib/admin";
import { db } from "@/db";
import { usageLedger, subscriptions, user as users, providerMonthly } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { PROVIDER_CLASS, ROUTER } from "@bhaskara/shared/pricing";

// GET /api/admin/alerts — the control loop for the cohort gate:
//   1. abuse/margin alerts (full-share > 8% amber / >= 10% hard cap, negative
//      margin, hit-rate cliff) — recomputed fresh from the ledger, stateless.
//   2. cohort P&L — this month's plan revenue vs provider COGS + infra share
//      (provider_monthly manual rows) → the go/no-go report for opening the
//      next 100 signups.
//   3. Hyper-only shadow margin — weekly COGS recomputed EXCLUDING every
//      [BOOTSTRAP] provider: the standing proof the core stays profitable
//      without the bootstrap hacks (§3 core-vs-bootstrap).

export type Alert = {
  id: string;
  severity: "amber" | "red";
  title: string;
  detail: string;
};

export async function GET() {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

  // ── per-user week of frontier turns: full-share (the margin killer) ──
  const shareRows = await db
    .select({
      userId: usageLedger.userId,
      email: users.email,
      total: sql<number>`count(*)::int`,
      fullReqs: sql<number>`count(*) filter (where ${usageLedger.routedTo} = 'full')::int`,
    })
    .from(usageLedger)
    .innerJoin(users, eq(users.id, usageLedger.userId))
    .where(and(gte(usageLedger.createdAt, weekAgo), sql`${usageLedger.endpointModel} <> 'theta'`))
    .groupBy(usageLedger.userId, users.email);

  // ── per-user month: COGS vs revenue (negative-margin users) ──
  const cogsRows = await db
    .select({
      userId: usageLedger.userId,
      email: users.email,
      cogs: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}::numeric), 0)`,
    })
    .from(usageLedger)
    .innerJoin(users, eq(users.id, usageLedger.userId))
    .where(gte(usageLedger.createdAt, monthStart))
    .groupBy(usageLedger.userId, users.email);

  const revRows = await db
    .select({ userId: subscriptions.userId, paid: sql<number>`coalesce(sum(${subscriptions.pricePaid}::numeric), 0)` })
    .from(subscriptions)
    .where(gte(subscriptions.createdAt, monthStart))
    .groupBy(subscriptions.userId);
  const revMap = new Map(revRows.map((r) => [r.userId, Number(r.paid)]));

  // ── daily cache-hit: yesterday vs trailing-30d average (hit-rate cliff) ──
  const dailyHit = await db
    .select({
      day: sql<string>`to_char(${usageLedger.createdAt}, 'YYYY-MM-DD')`,
      tokens: sql<number>`coalesce(sum(${usageLedger.promptTokens} + ${usageLedger.completionTokens}), 0)::bigint`,
      cached: sql<number>`coalesce(sum(${usageLedger.cachedTokens}), 0)::bigint`,
    })
    .from(usageLedger)
    .where(gte(usageLedger.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
    .groupBy(sql`to_char(${usageLedger.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${usageLedger.createdAt}, 'YYYY-MM-DD')`);

  const alerts: Alert[] = [];

  // 1. full-share breaches (amber > 8%, red at the 10% hard cap)
  for (const r of shareRows) {
    const total = Number(r.total);
    if (total < 10) continue; // tiny samples are noise, not signal
    const share = Number(r.fullReqs) / total;
    if (share >= ROUTER.fullShareCapPerUserPerWeek) {
      alerts.push({
        id: `full-cap:${r.userId}`,
        severity: "red",
        title: `${r.email} hit the weekly full-model hard cap`,
        detail: `${(share * 100).toFixed(1)}% full-share over ${total} frontier turns (cap ${(ROUTER.fullShareCapPerUserPerWeek * 100).toFixed(0)}%) — turns are being served on flash. Heavy planner: fair-use nudge is active; consider pointing them at Advanced.`,
      });
    } else if (share >= ROUTER.fullShareAlertAt) {
      alerts.push({
        id: `full-alert:${r.userId}`,
        severity: "amber",
        title: `${r.email} near the full-model cap`,
        detail: `${(share * 100).toFixed(1)}% full-share over ${total} frontier turns (alert at ${(ROUTER.fullShareAlertAt * 100).toFixed(0)}%, hard cap ${(ROUTER.fullShareCapPerUserPerWeek * 100).toFixed(0)}%).`,
      });
    }
  }

  // 2. negative per-user margin this month
  for (const r of cogsRows) {
    const rev = revMap.get(r.userId) ?? 0;
    const cogs = Number(r.cogs);
    if (cogs >= 1 && rev - cogs < 0) {
      alerts.push({
        id: `neg-margin:${r.userId}`,
        severity: "red",
        title: `${r.email} is margin-negative this month`,
        detail: `COGS $${cogs.toFixed(2)} vs revenue $${rev.toFixed(2)} → $${(rev - cogs).toFixed(2)} margin. Whale or quota leak — inspect their usage rows.`,
      });
    }
  }

  // 3. cache-hit cliff: yesterday's hit ≥15 points under trailing average
  // (steady state is 90%+; a cliff means cache is being wiped — prefix churn,
  // compaction misfire, or upstream behavior change).
  const days = dailyHit
    .map((d) => ({ day: d.day, pct: Number(d.tokens) > 0 ? (Number(d.cached) / Number(d.tokens)) * 100 : null }))
    .filter((d) => d.pct !== null) as Array<{ day: string; pct: number }>;
  if (days.length >= 2) {
    const yesterday = days[days.length - 1];
    const trailing = days.slice(0, -1);
    const avg = trailing.reduce((s, d) => s + d.pct, 0) / trailing.length;
    if (yesterday.pct <= avg - 15) {
      alerts.push({
        id: `hit-cliff:${yesterday.day}`,
        severity: "amber",
        title: "Cache-hit rate cliff detected",
        detail: `${yesterday.day}: ${yesterday.pct.toFixed(1)}% hit vs ${avg.toFixed(1)}% trailing average. Investigate prefix churn / compaction events / upstream cache behavior.`,
      });
    }
  }

  // 4. quota-burst: any user crossing 50% of a monthly frontier quota in a single day
  const burstRows = await db
    .select({
      userId: usageLedger.userId,
      email: users.email,
      day: sql<string>`to_char(${usageLedger.createdAt}, 'YYYY-MM-DD')`,
      tokens: sql<number>`coalesce(sum(${usageLedger.promptTokens} + ${usageLedger.completionTokens}), 0)::bigint`,
    })
    .from(usageLedger)
    .innerJoin(users, eq(users.id, usageLedger.userId))
    .where(and(gte(usageLedger.createdAt, dayAgo), sql`${usageLedger.endpointModel} <> 'theta'`))
    .groupBy(usageLedger.userId, users.email, sql`to_char(${usageLedger.createdAt}, 'YYYY-MM-DD')`);
  // basic plan: 20M in + 5M out monthly — 50% of the input cap in one day = 10M
  const BURST_THRESHOLD = 10_000_000;
  for (const r of burstRows) {
    if (Number(r.tokens) >= BURST_THRESHOLD) {
      alerts.push({
        id: `burst:${r.userId}:${r.day}`,
        severity: "amber",
        title: `${r.email} quota burst`,
        detail: `${(Number(r.tokens) / 1e6).toFixed(1)}M tokens on ${r.day} — 50%+ of a Basic monthly input quota in a day. Trial-farm / runaway-agent pattern.`,
      });
    }
  }

  // ── cohort P&L (this month) ──
  const totals = await db
    .select({
      cogs: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}::numeric), 0)`,
      equiv: sql<number>`coalesce(sum(${usageLedger.userEquivalentCostUsd}::numeric), 0)`,
      frontierTurns: sql<number>`count(*) filter (where ${usageLedger.endpointModel} <> 'theta')::int`,
      errorish: sql<number>`0::int`,
    })
    .from(usageLedger)
    .where(gte(usageLedger.createdAt, monthStart));

  const fees = await db.select().from(providerMonthly).where(eq(providerMonthly.month, month));
  const feesTotal = fees.reduce((s, f) => s + Number(f.planFeeUsd) + Number(f.meteredUsd), 0);

  const revenue = revRows.reduce((s, r) => s + Number(r.paid), 0);
  const [{ activeUsers }] = await db.select({ activeUsers: sql<number>`count(*)::int` }).from(users);

  const cohortPnl = {
    month,
    revenueUsd: revenue,
    cogsUsd: Number(totals[0]?.cogs ?? 0),
    providerFeesUsd: feesTotal,
    infraShareUsd: 0, // real invoices land in provider_monthly as 'infra' rows
    marginUsd: revenue - Number(totals[0]?.cogs ?? 0) - feesTotal,
    frontierTurns: Number(totals[0]?.frontierTurns ?? 0),
    activeUsers: Number(activeUsers),
    equivApiUsd: Number(totals[0]?.equiv ?? 0),
    verdict: "" as "go" | "watch" | "no-go" | "no-revenue-yet",
  };

  // go/no-go verdict for the cohort gate
  const marginPct = revenue > 0 ? (cohortPnl.marginUsd / revenue) * 100 : null;
  cohortPnl.verdict =
    marginPct === null
      ? "no-revenue-yet"
      : marginPct >= 30
        ? "go"
        : marginPct >= 15
          ? "watch"
          : "no-go";

  // ── Hyper-only shadow margin (weekly) ──
  // COGS recomputed EXCLUDING every [BOOTSTRAP] provider — the standing
  // proof the core stays profitable on Hyper alone (§3). Theta requests that
  // would have served on bootstrap backends are priced at their Hyper flash
  // fallback (qwen3.8-flash rates) — what the degrade path actually costs.
  const shadowRows = await db
    .select({
      provider: usageLedger.provider,
      prompt: sql<number>`coalesce(sum(${usageLedger.promptTokens}), 0)::bigint`,
      completion: sql<number>`coalesce(sum(${usageLedger.completionTokens}), 0)::bigint`,
      cached: sql<number>`coalesce(sum(${usageLedger.cachedTokens}), 0)::bigint`,
      cogs: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}::numeric), 0)`,
    })
    .from(usageLedger)
    .where(gte(usageLedger.createdAt, weekAgo))
    .groupBy(usageLedger.provider);

  const HYPER_FLASH_FALLBACK = { input: 0.15, cacheHit: 0.016, output: 0.47 }; // qwen3.8-flash
  let shadowCogs = 0;
  let bootstrapCogs = 0;
  for (const r of shadowRows) {
    if (PROVIDER_CLASS[r.provider as keyof typeof PROVIDER_CLASS] !== "bootstrap") {
      shadowCogs += Number(r.cogs);
    } else {
      bootstrapCogs += Number(r.cogs);
      // cost the same traffic at Hyper flash fallback rates
      const p = Number(r.prompt);
      const cached = Math.min(Number(r.cached), p);
      const fresh = p - cached;
      shadowCogs += (cached * HYPER_FLASH_FALLBACK.cacheHit + fresh * HYPER_FLASH_FALLBACK.input + Number(r.completion) * HYPER_FLASH_FALLBACK.output) / 1e6;
    }
  }

  const shadowWeekRevenue = await db
    .select({ paid: sql<number>`coalesce(sum(${subscriptions.pricePaid}::numeric), 0)` })
    .from(subscriptions)
    .where(gte(subscriptions.createdAt, weekAgo));

  const shadowMargin = {
    window: "7d",
    hyperOnlyCogsUsd: Number(shadowCogs.toFixed(4)),
    bootstrapCogsUsd: Number(bootstrapCogs.toFixed(4)),
    weekRevenueUsd: Number(shadowWeekRevenue[0]?.paid ?? 0),
    marginUsd: Number((Number(shadowWeekRevenue[0]?.paid ?? 0) - shadowCogs).toFixed(4)),
    note: "Weekly COGS as if every [BOOTSTRAP] request had served on the Hyper flash fallback (kill-switch path). Core-only profitability proof.",
  };

  return NextResponse.json({
    alerts,
    cohortPnl,
    shadowMargin,
    fullSharePolicy: {
      alertAt: ROUTER.fullShareAlertAt,
      hardCap: ROUTER.fullShareCapPerUserPerWeek,
    },
  });
}
