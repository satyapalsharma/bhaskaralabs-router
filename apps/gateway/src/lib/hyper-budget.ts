// Hyper daily budget gate — $12.5/day global ceiling (account-level, 2026-09-04).
// When exhausted, all hyper-tier turns must fall over to llmgateway instead of
// burning credits past the cap. In-flight spend is reserved atomically at
// dispatch time so concurrent turns can't collectively blow past the cap.

import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export const HYPER_DAILY_BUDGET_USD = Number(process.env.HYPER_DAILY_BUDGET_USD ?? 12.5);
/** Keep a safety margin for in-flight cost uncertainty (cache hit % unknown pre-dispatch). */
const MARGIN_USD = 0.5;

let cachedSpendToday = 0;
let cachedAt = 0;
/** Refresh the ledger-backed spend at most once per 30s — the gate is per-turn, the
 *  DB doesn't need a hit every turn. In-flight reservations cover the gap. */
async function spendToday(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - cachedAt < 30_000) return cachedSpendToday;
  const since = new Date();
  since.setHours(0, 0, 0, 0); // local midnight — Hyper's daily cap is calendar-day
  const rows = await db
    .select({ spend: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}), 0)` })
    .from(usageLedger)
    .where(and(eq(usageLedger.provider, "hyper"), gte(usageLedger.createdAt, since)));
  cachedSpendToday = Number(rows[0]?.spend ?? 0);
  cachedAt = now;
  return cachedSpendToday;
}

/** Amount reserved by turns currently in flight (released on completion/failure). */
let inFlightUsd = 0;

export interface HyperBudgetState {
  spentToday: number;
  remaining: number;
  available: boolean;
}

/** Snapshot for logging / admin: spend so far + availability. */
export async function hyperBudgetState(): Promise<HyperBudgetState> {
  const spent = await spendToday();
  const remaining = Math.max(0, HYPER_DAILY_BUDGET_USD - spent - inFlightUsd);
  return { spentToday: spent, remaining, available: remaining > MARGIN_USD };
}

/** Can a hyper turn be dispatched right now? */
export async function hyperBudgetAvailable(): Promise<boolean> {
  const s = await hyperBudgetState();
  return s.available;
}

/** Reserve an estimated cost for an in-flight hyper turn (best-effort estimate;
 *  caller passes rough worst-case; exact cost lands via the ledger on completion). */
export function reserveHyperBudget(estUsd: number): void {
  inFlightUsd += Math.max(0, estUsd);
}

/** Release an in-flight reservation once the turn settles (exact cost is in the ledger). */
export function releaseHyperBudget(estUsd: number): void {
  inFlightUsd = Math.max(0, inFlightUsd - Math.max(0, estUsd));
  cachedAt = 0; // force refresh on next read
}
