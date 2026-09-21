// Quota/rate-limit response headers — OpenAI de-facto style + Bhaskara extensions.
//
//   - Retry-After (RFC 9110): primary backoff signal, seconds, ONLY on 429s
//   - x-ratelimit-{limit,remaining,reset}-{requests,tokens}: OpenAI de-facto;
//     harnesses (OpenCode, Crush, Claude Code) parse these
//   - reset values are RELATIVE delta-seconds (IETF rate-limit-headers draft
//     recommends this — it avoids clock-sync bugs across machines)
//
// No pricing data in headers. Quota counts only; user-facing costs live in the
// dashboard, where they can be explained.

import type { Context } from "hono";
import { PLANS, THROTTLE, type PlanId } from "@bhaskara/shared/pricing";
import type { QuotaState } from "./quotas";

function secondsUntil(dt: Date): number {
  return Math.max(0, Math.ceil((dt.getTime() - Date.now()) / 1000));
}

function monthEnd(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Upper bound on how long until the rolling window frees a slot: the full
 *  window length, since the oldest call may have just been recorded. */
const WINDOW_RESET_SEC = THROTTLE.windowHours * 3600;

export function setQuotaHeaders(c: Context, quota: QuotaState, endpointModel: string, plan: string): void {
  const p = PLANS[plan as PlanId] ?? PLANS.trial;
  const monthResetSec = secondsUntil(monthEnd());

  c.header("x-quota-plan", plan);
  c.header("x-quota-monthly-reset", monthEnd().toISOString());

  if (endpointModel === "theta") {
    if (quota.unlimitedTheta) {
      // "Unlimited" is not a number, and inventing one would be a lie the
      // harness would act on. The throttle is reported separately instead.
      c.header("x-ratelimit-limit-requests", "unlimited");
      c.header("x-ratelimit-remaining-requests", "unlimited");
      if (quota.throttleDelayMs > 0) {
        c.header("x-bhaskara-throttle-ms", String(quota.throttleDelayMs));
      }
    } else {
      const cap = quota.limits.thetaPer5h ?? 0;
      c.header("x-ratelimit-limit-requests", String(cap));
      c.header("x-ratelimit-remaining-requests", String(Math.max(0, cap - quota.thetaThisWindow)));
      c.header("x-ratelimit-reset-requests", String(WINDOW_RESET_SEC));
    }
    if (quota.limits.thetaExtraMonthly > 0) {
      c.header("x-quota-extra-remaining", String(Math.max(0, quota.limits.thetaExtraMonthly)));
    }
  } else if (p.unlimited) {
    c.header("x-ratelimit-limit-requests", "unlimited");
    c.header("x-ratelimit-remaining-requests", "unlimited");
    c.header("x-ratelimit-limit-tokens", "unlimited");
    c.header("x-ratelimit-remaining-tokens", "unlimited");
  } else {
    c.header("x-ratelimit-limit-requests", String(quota.limits.glmPer5h));
    c.header("x-ratelimit-remaining-requests", String(Math.max(0, quota.limits.glmPer5h - quota.glmThisWindow)));
    c.header("x-ratelimit-reset-requests", String(WINDOW_RESET_SEC));
    c.header("x-ratelimit-limit-tokens", String(quota.limits.glmTokensPer5h));
    c.header("x-ratelimit-remaining-tokens", String(Math.max(0, quota.limits.glmTokensPer5h - quota.glmTokensThisWindow)));
    c.header("x-ratelimit-reset-tokens", String(WINDOW_RESET_SEC));
  }
}

/**
 * Headers for a 429. `Retry-After` is the only signal a harness reliably
 * respects, so it is set to the real window length rather than a guess — a
 * short value would produce a retry storm against a window that has not moved.
 */
export function setRetryHeaders(c: Context, quota: QuotaState, endpointModel: string, reason: string): void {
  const monthResetSec = secondsUntil(monthEnd());
  if (reason.includes("Monthly")) {
    c.header("Retry-After", String(monthResetSec));
  } else if (reason.toLowerCase().includes("trial")) {
    c.header("Retry-After", "3600");
  } else {
    c.header("Retry-After", String(WINDOW_RESET_SEC));
  }

  if (endpointModel === "theta") {
    const cap = quota.limits.thetaPer5h;
    c.header("x-ratelimit-limit-requests", cap === null ? "unlimited" : String(cap));
    c.header("x-ratelimit-remaining-requests", "0");
  } else {
    c.header("x-ratelimit-limit-requests", String(quota.limits.glmPer5h));
    c.header("x-ratelimit-remaining-requests", "0");
    c.header("x-ratelimit-limit-tokens", String(quota.limits.glmTokensPer5h));
    c.header("x-ratelimit-remaining-tokens", "0");
  }
}
