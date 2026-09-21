// Quota tracking.
//
// Quotas are counted in REQUESTS, not tokens, for both products. That is the
// promise the pricing page makes ("300 requests / 5 hours") and it is the only
// unit a user can predict: with token quotas a single 1M-context glm turn can
// silently consume a month of allowance.
//
// The cost that a call cap cannot bound is glm-5.3 context: one call may carry
// a million tokens. So glm-5.3 carries a second cap on total tokens per window.
// Two caps, two failure modes: the call cap protects the provider relationship,
// the token cap protects the margin.
//
// Backed by usage_ledger aggregation. Simple and correct; a dedicated
// rate_windows table optimises later if the aggregate becomes hot.

import { db } from "../db";
import { usageLedger, apiKeys } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { PLANS, THROTTLE, type Plan, type PlanId } from "@bhaskara/shared/pricing";

export interface QuotaState {
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
  /** theta has no window cap: the throttle replaces it. */
  unlimitedTheta: boolean;
  /** Operator key: no cap, no throttle, no rejection. */
  unlimited: boolean;
  overThetaWindow: boolean;
  overGlmCalls: boolean;
  overGlmTokens: boolean;
  /** Delay to apply before serving, in ms. 0 = serve immediately. */
  throttleDelayMs: number;
}

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function windowStart(): Date {
  return new Date(Date.now() - THROTTLE.windowHours * 60 * 60 * 1000);
}

export function planOf(plan: string): Plan {
  return PLANS[plan as PlanId] ?? PLANS.trial;
}

/**
 * The Pro throughput curve, expressed as a delay.
 *
 * Below `fullSpeedUntil` calls in the window the turn is served immediately.
 * Between it and `rejectAfter` the delay ramps linearly to `maxDelayMs`. The
 * point is to make a runaway agent self-limit: the client sees latency, not an
 * error, and a human working normally never reaches the ramp.
 */
export function throttleDelayMs(requestsInWindow: number, plan: Plan): number {
  if (plan.unlimited) return 0; // operator key: never throttled
  if (plan.thetaPer5h !== null) return 0; // no unlimited tier → no throttle
  const { fullSpeedUntil, rejectAfter, minDelayMs, maxDelayMs } = THROTTLE;
  if (requestsInWindow <= fullSpeedUntil) return 0;
  const over = Math.min(requestsInWindow, rejectAfter) - fullSpeedUntil;
  const span = Math.max(1, rejectAfter - fullSpeedUntil);
  const t = over / span;
  return Math.round(minDelayMs + t * (maxDelayMs - minDelayMs));
}

export async function getQuotaState(userId: string, plan: string): Promise<QuotaState> {
  const p = planOf(plan);
  const since = monthStart();
  const sinceWindow = windowStart();

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

  const glmThisWindow = Number(glmRows[0]?.calls ?? 0);
  const glmTokensThisWindow = Number(glmRows[0]?.tokens ?? 0);
  const thetaThisMonth = Number(thetaRows[0]?.month ?? 0);
  const thetaThisWindow = Number(thetaRows[0]?.win ?? 0);

  const unlimitedTheta = p.thetaPer5h === null;
  const thetaCap = p.thetaPer5h ?? Number.POSITIVE_INFINITY;

  return {
    glmThisWindow,
    glmTokensThisWindow,
    thetaThisWindow,
    thetaThisMonth,
    limits: {
      thetaPer5h: p.thetaPer5h,
      thetaExtraMonthly: p.thetaExtraMonthly,
      glmPer5h: p.glmPer5h,
      glmTokensPer5h: p.glmTokensPer5h,
    },
    unlimitedTheta,
    unlimited: p.unlimited === true,
    // An unlimited tier is never blocked by the window — it is throttled.
    overThetaWindow: unlimitedTheta ? false : thetaThisWindow >= thetaCap,
    overGlmCalls: glmThisWindow >= p.glmPer5h,
    overGlmTokens: glmTokensThisWindow >= p.glmTokensPer5h,
    throttleDelayMs: throttleDelayMs(thetaThisWindow, p),
  };
}

// ── Trial velocity gate ──
// Farm friction: trial keys younger than TRIAL_AGE_H hours may not burn more
// than TRIAL_HOURLY_TOKENS per rolling hour. Paid plans are never gated here —
// their quotas and rate windows own that, and a fresh key is not evidence of a
// farm (observed 2026-09-08: a paid user with a 1-day-old key legitimately ran
// 16M theta tokens in two hours). Env-tuned, fail-open on DB error.
const TRIAL_AGE_H = Number(process.env.TRIAL_AGE_H ?? 24);
const TRIAL_HOURLY_TOKENS = Number(process.env.TRIAL_HOURLY_TOKENS ?? 300_000);

export async function checkTrialVelocity(apiKeyId: string, plan: string): Promise<string | null> {
  if (plan !== "trial") return null;
  try {
    const keys = await db
      .select({ createdAt: apiKeys.createdAt })
      .from(apiKeys)
      .where(eq(apiKeys.id, apiKeyId))
      .limit(1);
    const born = keys[0]?.createdAt;
    if (!born || Date.now() - born.getTime() > TRIAL_AGE_H * 3600 * 1000) return null;

    const rows = await db
      .select({ tok: sql<number>`coalesce(sum(${usageLedger.promptTokens} + ${usageLedger.completionTokens}), 0)` })
      .from(usageLedger)
      .where(and(eq(usageLedger.apiKeyId, apiKeyId), gte(usageLedger.createdAt, new Date(Date.now() - 3600 * 1000))));
    const used = Number(rows[0]?.tok ?? 0);
    if (used > TRIAL_HOURLY_TOKENS) {
      console.log(JSON.stringify({ ev: "trial-velocity", key: apiKeyId.slice(0, 8), hourly: used, cap: TRIAL_HOURLY_TOKENS }));
      return `Trial key velocity exceeded (${(used / 1000).toFixed(0)}k tokens in the last hour). Contact support to raise limits.`;
    }
    return null;
  } catch (err) {
    console.error("[trial-velocity] check failed (fail-open):", (err as Error).message);
    return null;
  }
}

/**
 * The rejection message for a quota-exhausted turn, or null to serve.
 *
 * Messages name the window and the reset so a harness can act on them without
 * parsing a number out of prose, and they never mention the plan's internal
 * cost structure.
 */
export function quotaRejection(state: QuotaState, endpointModel: string): string | null {
  if (state.unlimited) return null; // operator key
  if (endpointModel === "theta") {
    if (!state.unlimitedTheta && state.overThetaWindow) {
      return `Theta 5-hour request window exhausted (${state.limits.thetaPer5h} requests). Resets automatically — continue with glm-5.3 meanwhile.`;
    }
    return null;
  }
  if (state.overGlmCalls) {
    return `glm-5.3 5-hour request window exhausted (${state.limits.glmPer5h} requests). Resets automatically.`;
  }
  if (state.overGlmTokens) {
    return `glm-5.3 5-hour token budget exhausted (${(state.limits.glmTokensPer5h / 1e6).toFixed(0)}M tokens). Resets automatically.`;
  }
  return null;
}
