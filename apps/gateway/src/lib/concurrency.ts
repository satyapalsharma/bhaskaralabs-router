// Per-key concurrency and the Pro throttle.
//
// Both exist for the same reason: the plans sell a shape of usage, and a shape
// is only real if something enforces it. "Unlimited theta" with no concurrency
// bound is not a plan, it is an invitation — one looping agent can hold twenty
// streams open against a flat lane whose real limit is ten.
//
// In-process state, like every other limiter here. That is correct for a
// single-instance gateway and deliberately simple: a second instance would need
// a shared counter, which is a real change with a real cost, and this is not it.

import { CONCURRENCY, PLANS, type PlanId } from "@bhaskara/shared/pricing";

const inFlight = new Map<string, number>();

export function acquired(apiKeyId: string): number {
  return inFlight.get(apiKeyId) ?? 0;
}

/**
 * Concurrency ceiling for a key.
 *
 * The unlimited theta tier is single-stream, and that is the point: it is what
 * makes "unlimited" affordable. Parallelism is a priced feature — the extra
 * monthly pool buys it, up to `extraTierMax`.
 */
export function concurrencyLimit(plan: string, extraPoolActive: boolean): number {
  const p = PLANS[plan as PlanId] ?? PLANS.trial;
  // Operator keys are the load generator: they need real fan-out, not a plan's
  // shape. This bound is per KEY only — what a provider actually receives is
  // regulated separately by the lane budgets in lib/lane-slot, which is where a
  // saturated provider gets skipped. (An earlier version of this comment
  // claimed upstream lane semaphores already bounded the fan-out; they did not,
  // and the gap is what let one operator key hand thirty-two open turns to a
  // single lane whose real ceiling was a couple of long generations.)
  if (p.unlimited) return CONCURRENCY.superTier;
  if (p.thetaPer5h !== null) {
    // Metered tiers have a bounded window, so their concurrency is not the
    // scarce resource. Cap generously rather than inventing a new limit.
    return CONCURRENCY.extraTierMax;
  }
  return extraPoolActive ? CONCURRENCY.extraTierMax : CONCURRENCY.unlimitedTier;
}

export interface ConcurrencyLease {
  release: () => void;
  limit: number;
}

/**
 * Acquire a slot, or return null when the key is already at its ceiling.
 *
 * Returning null rather than queuing is deliberate: a queued request still
 * occupies a client connection and an upstream slot budget, and the honest
 * answer to "you are at your concurrency limit" is an immediate 429 with a
 * Retry-After, which every harness understands.
 */
export function acquireConcurrency(apiKeyId: string, limit: number): ConcurrencyLease | null {
  const current = inFlight.get(apiKeyId) ?? 0;
  if (current >= limit) return null;
  inFlight.set(apiKeyId, current + 1);
  let released = false;
  return {
    limit,
    release: () => {
      if (released) return;
      released = true;
      const n = (inFlight.get(apiKeyId) ?? 1) - 1;
      if (n <= 0) inFlight.delete(apiKeyId);
      else inFlight.set(apiKeyId, n);
    },
  };
}

/** Test seam: reset all counters. */
export function resetConcurrency(): void {
  inFlight.clear();
}
