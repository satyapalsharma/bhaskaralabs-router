// Overflow.
//
// What happens when our own capacity is the thing that ran out: the preferred
// ladder is exhausted, and a request that is already paid for still needs an
// answer. Overflow is the honest version of "we will serve you anyway".
//
// Two constraints make it safe:
//
//   1. The model must be on the allowlist in shared/overflow-models.ts, which
//      carries a measured benchmark score and a source. No score, no route.
//   2. It is announced. The response says the turn was served by an alternate
//      model, because the whole product promise is that you can tell what
//      answered you. Silently swapping the backend is the thing we are selling
//      against.
//
// Overflow is a last resort, never a cost optimisation. If it starts firing
// routinely, the ladder is too thin — fix the ladder, not the gate.

import {
  findEligibleOverflow,
  isEligible,
  OVERFLOW_ALLOWLIST,
  type OverflowModel,
} from "@bhaskara/shared/overflow-models";
import type { LaneHealth } from "../router";

/**
 * Choose an overflow model, or null when none is eligible right now.
 *
 * `tried` excludes providers already attempted this turn, so a burst cannot
 * bounce back into a lane that just failed.
 */
export function selectOverflowModel(
  health: LaneHealth,
  tried: Set<string> = new Set(),
  now: Date = new Date(),
): OverflowModel | null {
  for (const m of OVERFLOW_ALLOWLIST) {
    if (tried.has(m.provider)) continue;
    if (health[m.provider] !== true) continue;
    // Re-verify through the shared gate rather than trusting list membership —
    // the point of the allowlist is that a stale or unmeasured entry cannot be
    // served, and a stale check here would defeat it.
    if (!isEligible(m, now)) continue;
    if (!findEligibleOverflow(m.modelId, now)) continue;
    return m;
  }
  return null;
}

/** The disclosure line for an overflow-served response. */
export const OVERFLOW_NOTICE =
  "Served by an alternate model at Bhaskara Labs — your requested model was at capacity. This turn is still covered by your plan.";

/** Header name for the disclosure. Clients that show routing state read this. */
export const OVERFLOW_HEADER = "x-bhaskara-overflow";
