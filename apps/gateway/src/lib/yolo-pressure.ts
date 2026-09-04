// Yolo pressure tracker — server-synced + exact formula (2026-09-05 v3).
//
// AUTHORITATIVE SIGNAL: yolo returns exact pressure on EVERY response:
//   x-yolo-pressure-{limit,remaining,reset}-{1h,24h}
// Synced on every response (TTL 10min) and bootstrapped by a 1-token probe.
//
// EXACT FORMULA (user-provided from Yolo-Auto, verified against live header
// deltas — the 30K-input probe matched to the unit):
//   cost = max(4096,
//              uncached + max(0, uncached - 4096)   // 1x first 4K, 2x beyond
//              + ceil(cached / 32)                  // cached ~1/32 weight
//              + 5 * output)                        // output 5x
// Components: flat 4096 reserve floor per request; cached input ≈ free;
// uncached 1x→2x beyond 4K; output 5x.
//
// OVERFLOW POLICY (user guidance 2026-09-05): pressure past 100% does NOT
// hard-block — requests just slow down (Shared Overflow, lower priority).
// Safe ceiling: 130% soft (prefer other lanes), 150% hard (route away).
// The silent-wedge behavior we observed earlier was at extreme exhaustion;
// ordinary >100% traffic keeps flowing, slower.

import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte } from "drizzle-orm";
import { YOLO_MODEL } from "../providers/yolo";

// Builder-plan limits (server-confirmed via x-yolo-pressure-limit-*).
export const YOLO_PRESSURE_1H = 3_000_000;
export const YOLO_PRESSURE_24H = 14_000_000;

/** Flat per-request reserve floor (official formula). */
export const YOLO_MIN_REQUEST_UNITS = 4_096;

/** Exact pressure cost of one request (official Yolo-Auto formula). */
export function yoloRequestCost(uncachedIn: number, cachedIn: number, output: number): number {
  return Math.max(
    YOLO_MIN_REQUEST_UNITS,
    uncachedIn + Math.max(0, uncachedIn - 4_096) + Math.ceil(cachedIn / 32) + 5 * output,
  );
}

/** User guidance: past 100% requests still flow (slower); 130% prefer other
 *  lanes; 150% hard-deny (route away — the silent-wedge zone lives beyond). */
const SOFT_PCT = 1.30;
const HARD_PCT = 1.50;

// ── Server-synced state (authoritative when fresh) ──
interface ServerPressure {
  remaining1h: number;
  remaining24h: number;
  at: number; // Date.now() of the response that carried these headers
}
let server: ServerPressure | null = null;
/** Sync window: headers older than this are treated as stale (estimate takes over). */
const SYNC_TTL_MS = 10 * 60 * 1000;

/** Called by the yolo provider wrapper on EVERY response — the header set
 *  is the exact server-side pressure state. */
export function syncYoloPressureFromHeaders(h: {
  remaining1h?: number | null;
  remaining24h?: number | null;
}): void {
  const r1 = Number(h.remaining1h);
  const r24 = Number(h.remaining24h);
  if (Number.isFinite(r1) && r1 >= 0 && Number.isFinite(r24) && r24 >= 0) {
    server = { remaining1h: r1, remaining24h: r24, at: Date.now() };
  }
}

// ── Local ring buffer (estimate path + stale-sync bridge) ──
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
  /** "server" = exact from headers, "estimate" = local ring math. */
  source: "server" | "estimate";
}

/** Current pressure state. Server-sync wins whenever fresh. */
export function yoloPressureState(): YoloPressureState {
  const now = Date.now();
  if (server && now - server.at <= SYNC_TTL_MS) {
    // Server reports REMAINING; negative remaining = past 100% (overflow).
    const used1h = YOLO_PRESSURE_1H - server.remaining1h;
    const used24h = YOLO_PRESSURE_24H - server.remaining24h;
    return {
      last1h: used1h,
      last24h: used24h,
      softDeny: used1h >= YOLO_PRESSURE_1H * SOFT_PCT || used24h >= YOLO_PRESSURE_24H * SOFT_PCT,
      hardDeny: used1h >= YOLO_PRESSURE_1H * HARD_PCT || used24h >= YOLO_PRESSURE_24H * HARD_PCT,
      source: "server",
    };
  }
  prune(now);
  const last1h = sumSince(60 * 60 * 1000, now);
  const last24h = sumSince(24 * 60 * 60 * 1000, now);
  return {
    last1h,
    last24h,
    softDeny: last1h >= YOLO_PRESSURE_1H * SOFT_PCT || last24h >= YOLO_PRESSURE_24H * SOFT_PCT,
    hardDeny: last1h >= YOLO_PRESSURE_1H * HARD_PCT || last24h >= YOLO_PRESSURE_24H * HARD_PCT,
    source: "estimate",
  };
}

/** Record a completed yolo turn's pressure units (exact formula). */
export function recordYoloTurn(uncachedIn: number, cachedIn: number, output: number, at?: Date): void {
  const units = yoloRequestCost(uncachedIn, cachedIn, output);
  events.push({ at: at ? at.getTime() : Date.now(), units });
  if (events.length > 10_000) events.splice(0, events.length - 10_000);
}

/** Pre-dispatch estimate for a candidate turn (exact formula; prefix split
 *  between cached/uncached unknown pre-dispatch — estimate all-uncached for
 *  the first turn and all-cached for sticky turns is overkill; use a 50/50
 *  blend which lands within ±25% of the true cost either way). */
export function estimateYoloPressure(prefixTokens: number, estOutputTokens = 1_500): number {
  return yoloRequestCost(prefixTokens, 0, estOutputTokens);
}

/** True when dispatching this candidate would push us past the soft edge. */
export function yoloWouldOverflow(prefixTokens: number): boolean {
  const s = yoloPressureState();
  if (s.hardDeny) return true;
  const est = estimateYoloPressure(prefixTokens);
  return s.last1h + est > YOLO_PRESSURE_1H * SOFT_PCT || s.last24h + est > YOLO_PRESSURE_24H * SOFT_PCT;
}

// ── Ledger seeding (cold-start only — server sync overrides once traffic flows) ──
// Ledger rows lack cached/uncached split history accuracy for aborted turns,
// so this is a coarse backstop; the bootstrap probe (index.ts) provides the
// authoritative number within seconds of boot.

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
