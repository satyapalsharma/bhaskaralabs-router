// The Pro throttle.
//
// "Unlimited theta" is real but not unconditioned. Below a threshold the turn is
// served immediately; above it we add latency rather than refusing. The user
// experiences a slow API, not a broken one, and a runaway agent self-limits
// because every request it issues costs it more wall-clock than the last.
//
// This is deliberately NOT surfaced as a limit in the docs or the dashboard — it
// is a throughput curve. The only signal is the x-bhaskara-throttle-ms header,
// which exists so a developer debugging latency can see we added it.

import { THROTTLE } from "@bhaskara/shared/pricing";

/**
 * Apply the delay for this turn, if any.
 *
 * Resolves immediately when there is nothing to wait for, so the common path
 * costs one timer-free branch. Aborting the client cancels the wait — a
 * disconnected client should not keep a timer alive.
 */
export async function applyThrottle(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (!(delayMs > 0)) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Human-readable form for logs. */
export function describeThrottle(delayMs: number): string {
  if (delayMs <= 0) return "none";
  return `+${(delayMs / 1000).toFixed(1)}s (ramp ${THROTTLE.fullSpeedUntil}→${THROTTLE.rejectAfter}/${THROTTLE.windowHours}h)`;
}
