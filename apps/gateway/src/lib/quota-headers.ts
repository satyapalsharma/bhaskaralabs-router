// Quota/rate-limit response headers — OpenAI de-facto style + Bhaskara extensions.
// Research-backed (2026-09):
//   - Retry-After (RFC 9110): primary backoff signal, seconds, ONLY on 429s
//   - x-ratelimit-{limit,remaining,reset}-{requests,tokens}: OpenAI de-facto, harnesses (OpenCode/Crush/Claude Code) parse these
//   - reset values: RELATIVE delta-seconds (IETF draft-ietf-httpapi-ratelimit-headers recommendation — avoids clock-sync bugs)
//   - x-quota-*: our monthly plan quota (limit + remaining + reset as ISO date)
// NO pricing data in headers — quota counts only. User-facing costs stay in the dashboard.

import type { Context } from "hono";
import { PLANS } from "@bhaskara/shared/pricing";
import type { QuotaState } from "./quotas";

function secondsUntil(dt: Date): number {
  return Math.max(0, Math.ceil((dt.getTime() - Date.now()) / 1000));
}

function monthEnd(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/**
 * Attach quota headers to a successful response.
 * Dimensions per endpoint type:
 *   - theta:    x-ratelimit-*-requests (5h window + monthly)
 *   - frontier: x-ratelimit-*-tokens (monthly input/output)
 */
export function setQuotaHeaders(c: Context, quota: QuotaState, endpointModel: string, plan: string): void {
  const p = PLANS[plan as keyof typeof PLANS] ?? PLANS.free;
  const monthResetSec = secondsUntil(monthEnd());

  // Common: plan + monthly quota
  c.header("x-quota-plan", plan);
  c.header("x-quota-monthly-reset", monthEnd().toISOString());

  if (endpointModel === "theta") {
    // Rolling 5h window: remaining + reset (next boundary = oldest request in window aging out;
    // approximation: reset at next 5h boundary from window start)
    const windowRemaining = Math.max(0, p.thetaPer5h - quota.thetaLast5h);
    c.header("x-ratelimit-limit-requests", String(p.thetaPer5h));
    c.header("x-ratelimit-remaining-requests", String(windowRemaining));
    c.header("x-ratelimit-reset-requests", "18000"); // 5h in seconds (upper bound)
    c.header("x-quota-requests-remaining-month", String(Math.max(0, p.thetaMonthly - quota.thetaThisMonth)));
  } else {
    const inRemaining = Math.max(0, p.frontierInputM * 1e6 - quota.frontierInUsed);
    const outRemaining = Math.max(0, p.frontierOutputM * 1e6 - quota.frontierOutUsed);
    c.header("x-ratelimit-limit-tokens", String(p.frontierInputM * 1e6));
    c.header("x-ratelimit-remaining-tokens", String(inRemaining));
    c.header("x-ratelimit-reset-tokens", String(monthResetSec));
    c.header("x-quota-output-tokens-remaining", String(outRemaining));
  }
}

/**
 * Attach Retry-After + headers to a 429 quota-rejection.
 * theta 5h window: retry at window boundary (approx); monthly: retry at month start.
 */
export function setRetryHeaders(c: Context, quota: QuotaState, endpointModel: string, reason: string): void {
  const monthResetSec = secondsUntil(monthEnd());
  if (reason.includes("5-hour")) {
    c.header("Retry-After", "18000"); // worst-case 5h; harness backs off, next success refreshes
  } else if (reason.includes("Monthly")) {
    c.header("Retry-After", String(monthResetSec));
  } else {
    c.header("Retry-After", "60");
  }
  if (endpointModel === "theta") {
    c.header("x-ratelimit-limit-requests", String(quota.limits.thetaPer5h));
    c.header("x-ratelimit-remaining-requests", "0");
  } else {
    c.header("x-ratelimit-limit-tokens", String(quota.limits.frontierInputM * 1e6));
    c.header("x-ratelimit-remaining-tokens", "0");
    c.header("x-ratelimit-reset-tokens", String(monthResetSec));
  }
}