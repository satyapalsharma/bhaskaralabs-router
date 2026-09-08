// Plan entitlements: per-plan, per-model, per-window caps (admin-managed).
// E.g. bigpro → qwen-3.8: 100 requests / 5h; theta: 500 requests / 5h.
// Counts come straight from usage_ledger aggregates (indexed user+time) —
// no separate counters to drift. Rules cached 15s in-process.

import { db } from "../db";
import { usageLedger, planModelLimits } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export interface PlanRule {
  windowHours: number;
  maxRequests: number | null;
  maxTokens: number | null;
  maxCostUsd: number | null;
}

let rulesCache: { plan: string; at: number; rules: Array<PlanRule & { endpointModel: string }> } | null = null;
const RULES_TTL_MS = 15_000;

async function getRules(plan: string): Promise<Array<PlanRule & { endpointModel: string }>> {
  if (rulesCache && rulesCache.plan === plan && Date.now() - rulesCache.at < RULES_TTL_MS) {
    return rulesCache.rules;
  }
  const rows = await db
    .select()
    .from(planModelLimits)
    .where(and(eq(planModelLimits.plan, plan), eq(planModelLimits.active, true)));
  const rules = rows.map((r) => ({
    endpointModel: r.endpointModel,
    windowHours: r.windowHours,
    maxRequests: r.maxRequests,
    maxTokens: r.maxTokens,
    maxCostUsd: r.maxCostUsd == null ? null : Number(r.maxCostUsd),
  }));
  rulesCache = { plan, at: Date.now(), rules };
  return rules;
}

export interface PlanCheck {
  allowed: boolean;
  reason?: string;
  retryAfterSec?: number;
  limit?: string;
}

/** Enforce plan_model_limits for a user's turn on an endpoint model/alias. */
export async function checkPlanLimits(userId: string, plan: string, endpointModel: string): Promise<PlanCheck> {
  const rules = await getRules(plan).catch(() => []);
  const applicable = rules.filter((r) => r.endpointModel === endpointModel);
  if (applicable.length === 0) return { allowed: true };
  for (const rule of applicable) {
    const since = new Date(Date.now() - rule.windowHours * 3_600_000);
    const rows = await db
      .select({
        requests: sql<number>`count(*)::int`,
        tokens: sql<number>`coalesce(sum(${usageLedger.promptTokens} + ${usageLedger.completionTokens}), 0)::bigint`,
        cost: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}::numeric), 0)`,
      })
      .from(usageLedger)
      .where(
        and(
          eq(usageLedger.userId, userId),
          eq(usageLedger.endpointModel, endpointModel),
          gte(usageLedger.createdAt, since),
        ),
      );
    const u = rows[0] ?? { requests: 0, tokens: 0, cost: 0 };
    if (rule.maxRequests != null && u.requests >= rule.maxRequests) {
      return {
        allowed: false,
        reason: `plan ${plan}: ${rule.maxRequests} requests / ${rule.windowHours}h on ${endpointModel} exhausted`,
        retryAfterSec: rule.windowHours * 3600,
        limit: "requests",
      };
    }
    if (rule.maxTokens != null && Number(u.tokens) >= rule.maxTokens) {
      return {
        allowed: false,
        reason: `plan ${plan}: ${rule.maxTokens} tokens / ${rule.windowHours}h on ${endpointModel} exhausted`,
        retryAfterSec: rule.windowHours * 3600,
        limit: "tokens",
      };
    }
    if (rule.maxCostUsd != null && Number(u.cost) >= rule.maxCostUsd) {
      return {
        allowed: false,
        reason: `plan ${plan}: $${rule.maxCostUsd} / ${rule.windowHours}h on ${endpointModel} exhausted`,
        retryAfterSec: rule.windowHours * 3600,
        limit: "cost",
      };
    }
  }
  return { allowed: true };
}
