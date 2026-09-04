import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte } from "drizzle-orm";
import { YOLO_MODEL } from "../providers/yolo";

// Yolo pressure tracker — client-side mirror of Yolo-Auto's Standard pressure
// allowance (Terms §7, verified 2026-09-04: https://yolo-auto.com/terms).
// Builder plan: 3,000,000 pressure units / rolling 1h, 14,000,000 / rolling 24h.
// Pressure per request = uncached_input×1 + cached_input×0.25 + output×2
// + min per-request cost (we assume 500 units; exact weight undisclosed).
//
// Why client-side: when the allowance is exceeded Yolo does NOT 429 — requests
// silently queue in Shared Overflow and hang (observed live: /models fine,
// /chat/completions wedged 60s+ at 82% of the 24h window). By tracking our own
// consumption we proactively back off BEFORE the wedge: soft-deny at SOFT_PCT
// (route new turns elsewhere), hard-deny at HARD_PCT (treat lane as busy).
//
// In-memory ring buffer of (timestamp, units) — single Bun process, matches the
// in-process semaphores design. Ledger is source of truth for post-hoc audit;
// this tracker is the real-time gate.

// Builder-plan constants (Yolo-Auto Terms §7).
export const YOLO_PRESSURE_1H = 3_000_000;
export const YOLO_PRESSURE_24H = 14_000_000;
/** Back off before the true allowance — yolo gives no signal at the edge.
 *  Tightened 2026-09-04 from live observation: yolo wedged at 78% of the
 *  24h window (our estimate) — their accounting is heavier than ours
 *  (per-request cost, rounding, cached discount uncertainty). */
const SOFT_PCT = 0.60;
const HARD_PCT = 0.75;

/** Estimated units per request floor (undisclosed upstream; conservative). */
const MIN_REQUEST_UNITS = 500;

type Stamp = { at: number; units: number };

const events: Stamp[] = [];
/** Prune stamps older than the 24h window (the longer of the two windows). */
function prune(now: number): void {
  const cutoff = now - 24 * 60 * 60 * 1000;
  let i = 0;
  while (i < events.length && events[i].at < cutoff) i++;
  if (i > 0) events.splice(0, i);
}

function sumSince(ms: number, now: number): number {
  let sum = 0;
  const cutoff = now - ms;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].at < cutoff) break;
    sum += events[i].units;
  }
  return sum;
}

export interface YoloPressureState {
  last1h: number;
  last24h: number;
  softDeny: boolean;
  hardDeny: boolean;
}

/** Current pressure state (after pruning). */
export function yoloPressureState(): YoloPressureState {
  const now = Date.now();
  prune(now);
  const last1h = sumSince(60 * 60 * 1000, now);
  const last24h = sumSince(24 * 60 * 60 * 1000, now);
  return {
    last1h,
    last24h,
    softDeny: last1h >= YOLO_PRESSURE_1H * SOFT_PCT || last24h >= YOLO_PRESSURE_24H * SOFT_PCT,
    hardDeny: last1h >= YOLO_PRESSURE_1H * HARD_PCT || last24h >= YOLO_PRESSURE_24H * HARD_PCT,
  };
}

/** Record a completed yolo turn's actual pressure units (from upstream usage). */
export function recordYoloTurn(uncachedIn: number, cachedIn: number, output: number, at?: Date): void {
  const units = Math.round(uncachedIn * 1 + cachedIn * 0.25 + output * 2 + MIN_REQUEST_UNITS);
  events.push({ at: at ? at.getTime() : Date.now(), units });
  if (events.length > 10_000) events.splice(0, events.length - 10_000);
}


// ── Ledger seeding ──
// The tracker is in-memory, but the gateway restarts (deploys, crashes). On
// boot, seed the ring from usage_ledger's yolo rows of the last 24h so a
// restart never forgets pressure already burned (observed 2026-09-04: after a
// restart the tracker thought it was fresh while yolo sat at 82% of its
// rolling 24h allowance → silent wedge + slow feihoa failovers).

export async function seedYoloPressureFromLedger(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      createdAt: usageLedger.createdAt,
      promptTokens: usageLedger.promptTokens,
      cachedTokens: usageLedger.cachedTokens,
      completionTokens: usageLedger.completionTokens,
    })
    .from(usageLedger)
    .where(and(eq(usageLedger.upstreamModel, YOLO_MODEL), gte(usageLedger.createdAt, since)));
  for (const r of rows) {
    recordYoloTurn(
      Math.max(0, r.promptTokens - r.cachedTokens),
      r.cachedTokens,
      r.completionTokens,
      r.createdAt,
    );
  }
  return rows.length;
}
/** Pre-dispatch estimate for a candidate turn (prefix est + expected output). */
export function estimateYoloPressure(prefixTokens: number, estOutputTokens = 1_500): number {
  // Fresh session prefixes are mostly uncached; sticky sessions mostly cached.
  // Estimate conservatively as all-uncached for gate purposes.
  return Math.round(prefixTokens * 1 + estOutputTokens * 2 + MIN_REQUEST_UNITS);
}

/** True when dispatching this candidate would push us past the soft edge. */
export function yoloWouldOverflow(prefixTokens: number): boolean {
  const s = yoloPressureState();
  if (s.hardDeny) return true;
  const est = estimateYoloPressure(prefixTokens);
  return s.last1h + est > YOLO_PRESSURE_1H * SOFT_PCT || s.last24h + est > YOLO_PRESSURE_24H * SOFT_PCT;
}
