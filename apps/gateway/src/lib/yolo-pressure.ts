// Yolo pressure tracker — server-synced (2026-09-05 redesign).
//
// KEY DISCOVERY: yolo returns EXACT pressure state on EVERY response:
//   x-yolo-pressure-limit-1h / -remaining-1h / -reset-1h
//   x-yolo-pressure-limit-24h / -remaining-24h / -reset-24h
// So the primary signal is the SERVER's own remaining number — synced from
// every response header. Local estimation only fills gaps between syncs
// (and cold-start before the first sync).
//
// Why local tracking at all: when the allowance is exceeded yolo does NOT
// 429 — requests silently queue in Shared Overflow and hang (observed live:
// /models fine, /chat/completions wedged 60s+). The server remaining only
// arrives AFTER a request completes; the estimate guards the turn BEFORE
// dispatch when the last sync is stale.
//
// Derived weights (live probes 2026-09-05, deltas from response headers):
//   flat per-request cost: ~4,039 units (14-token and 30K-token requests
//                          consumed the SAME 4,096 — input weight ~0)
//   output tokens:         ~28.73 units/token (29in/1807out → 55,955)
// Input is effectively FREE; OUTPUT dominates. Our old math (in×1 + out×2
// + 500) over-counted input 30K→28K/req and under-counted output 14x.

import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte } from "drizzle-orm";
import { YOLO_MODEL } from "../providers/yolo";

// Builder-plan limits (server-confirmed via x-yolo-pressure-limit-*).
export const YOLO_PRESSURE_1H = 3_000_000;
export const YOLO_PRESSURE_24H = 14_000_000;

/** Derived from live probes: flat per-request + output weight. */
export const YOLO_MIN_REQUEST_UNITS = 4_039;
export const YOLO_OUTPUT_UNITS_PER_TOKEN = 28.73;

/** Back off before the true allowance — yolo wedges silently near the edge.
 *  The server remaining (when fresh) is exact, so these apply to the
 *  estimate path and to the sync margin only. */
const SOFT_PCT = 0.85;
const HARD_PCT = 0.95;

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
  if (Number.isFinite(r1) && r1 > 0 && Number.isFinite(r24) && r24 > 0) {
    server = { remaining1h: r1, remaining24h: r24, at: Date.now() };
  }
}

// ── Local ring buffer (estimate path + cold-start) ──
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

/** Record a completed yolo turn's pressure units (output-dominated model). */
export function recordYoloTurn(_uncachedIn: number, _cachedIn: number, output: number, at?: Date): void {
  // Input weight ~0 (verified: 14-token and 30K-token requests cost the same);
  // output at ~28.73/token + flat per-request floor.
  const units = Math.round(YOLO_MIN_REQUEST_UNITS + output * YOLO_OUTPUT_UNITS_PER_TOKEN);
  events.push({ at: at ? at.getTime() : Date.now(), units });
  if (events.length > 10_000) events.splice(0, events.length - 10_000);
}

/** Pre-dispatch estimate for a candidate turn (expected output dominates). */
export function estimateYoloPressure(_prefixTokens: number, estOutputTokens = 1_500): number {
  return Math.round(YOLO_MIN_REQUEST_UNITS + estOutputTokens * YOLO_OUTPUT_UNITS_PER_TOKEN);
}

/** True when dispatching this candidate would push us past the soft edge. */
export function yoloWouldOverflow(prefixTokens: number): boolean {
  const s = yoloPressureState();
  if (s.hardDeny) return true;
  const est = estimateYoloPressure(prefixTokens);
  return s.last1h + est > YOLO_PRESSURE_1H * SOFT_PCT || s.last24h + est > YOLO_PRESSURE_24H * SOFT_PCT;
}

// ── Ledger seeding (cold-start only — server sync overrides once traffic flows) ──
// Seeds the ring from usage_ledger's yolo rows of the last 24h with the
// CORRECTED output-dominated weights. The first real response's headers
// replace this with the server's exact number.

export async function seedYoloPressureFromLedger(): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      createdAt: usageLedger.createdAt,
      completionTokens: usageLedger.completionTokens,
    })
    .from(usageLedger)
    .where(and(eq(usageLedger.upstreamModel, YOLO_MODEL), gte(usageLedger.createdAt, since)));
  for (const r of rows) {
    recordYoloTurn(0, 0, r.completionTokens, r.createdAt);
  }
  return rows.length;
}
