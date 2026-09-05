// Shadow-release: zombie-safe semaphore accounting for flat-plan lanes.
//
// Problem: when a client disconnects mid-generation we abort the upstream
// fetch. On flat lanes (stepfun/agnes/feihoa/yolo) the server KEEPS
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

/** Conservative shadow-hold windows per lane (≈p90 generation ms). */
export const SHADOW_HOLD_MS: Record<string, number> = {
  stepfun: 25_000, // p90 ≈ 24s measured; server generations run to completion
  agnes: 5_000,    // fast lane (0.3-1.1s serves); brief hold suffices
  feihoa: 15_000,  // ~28-30 TPS; typical generations 3-15s
  yolo: 30_000,    // 4 slots; generations commonly 10-30s
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
  };
  return [doRelease, shadowRelease];
}
