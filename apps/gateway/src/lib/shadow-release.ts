// Shadow-release: zombie-safe semaphore accounting for flat-plan lanes.
//
// Problem: when a client disconnects mid-generation we abort the upstream
// fetch. On flat lanes (stepfun/agnes/camel/electronhub) the server KEEPS
// generating — a zombie holding one of the provider's concurrency slots for
// the remainder of its generation (10-45s observed on stepfun). If the
// semaphore releases instantly, our mirror undercounts the server: 6 mirror
// + 3 zombies = server "current: 9, limit: 8" → 429s (observed 2026-09-05).
//
// Fix: on abort, instead of releasing immediately, SHADOW-HOLD the slot for
// the estimated remaining generation time (p90 of the lane — conservative;
// a flat-lane over-hold costs only briefly reduced throughput, never money).
// The mirror then counts the zombie until it plausibly finished server-side.
//
// Usage: at acquire time a provider wraps its release fn:
//   const [release, shadowRelease] = makeShadowRelease(rawRelease, holdMs, lane);
// Normal completion calls release(); abort/disconnect paths call
// shadowRelease(). Whichever fires first wins; the other is a no-op.

/**
 * Shadow-hold windows per lane, in ms.
 *
 * Re-derived from measured p90 generation time on real traffic (usage_ledger,
 * 3h window, 2026-09-13) rather than from the serve times these lanes were
 * first tuned against. That distinction is the point: the earlier values were
 * written when these lanes carried short, mostly-streaming turns, and agent
 * traffic made the same lanes run far longer. A hold shorter than the real
 * generation does not merely mis-count — it undercounts the server's
 * occupancy, which is the exact failure this file exists to prevent.
 *
 *   pareto       p90  4.9s   p99  30.1s   max 102.9s
 *   agnes        p90 15.4s   p99  58.1s   max 153.4s
 *   camel        p90 14.7s   p99  22.6s   max  24.4s
 *   hyper        p90 98.6s   p99 167.5s   max 227.7s
 *   stepfun      p90 307.3s  (single long-turn sample)
 *   electronhub  p90 10.7s   p99  69.6s
 *
 * Held near p90 with a floor, not at the max: the hold guesses at one zombie,
 * and holding every aborted turn for the observed worst case would idle the
 * lane for no reason. p90 covers the common case; the lane budget in
 * lib/lane-slot absorbs the tail.
 */
export const SHADOW_HOLD_MS: Record<string, number> = {
  // 60s, not the 4.9s p90: pareto's own gateway times out near 60s, so an
  // aborted generation can legitimately still be running right up to it.
  pareto: 60_000,
  stepfun: 45_000, // p90 307s is an outlier path; 45s covers the working band
  agnes: 20_000, // was 5s — measured p90 is 15.4s, so the old value undercounted 3×
  hyper: 60_000, // was the 15s fallback — measured p90 is 98.6s
  electronhub: 20_000,
  camel: 20_000, // p90 14.7s; the one value that was already right
};

/**
 * Wrap a semaphore release with shadow-hold semantics for abort paths.
 * Returns [release, shadowRelease]:
 *   release()       — normal completion: release immediately.
 *   shadowRelease() — abort/disconnect: hold the slot for holdMs (the
 *                     zombie's estimated remaining server generation),
 *                     then release. Idempotent against release().
 */
export function makeShadowRelease(
  release: () => void,
  holdMs: number,
  lane: string,
): [() => void, () => void] {
  let released = false;
  let shadowTimer: ReturnType<typeof setTimeout> | undefined;
  const doRelease = () => {
    if (released) return;
    released = true;
    clearTimeout(shadowTimer);
    release();
  };
  const shadowRelease = () => {
    if (released) return;
    console.log(`[shadow-release] ${lane}: holding slot ${Math.round(holdMs / 1000)}s for server-side zombie`);
    shadowTimer = setTimeout(doRelease, holdMs);
    // Detached: the hold must never keep the process alive on its own.
    shadowTimer.unref?.();
  };
  return [doRelease, shadowRelease];
}
