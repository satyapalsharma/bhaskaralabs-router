// Per-account rolling usage windows for admin fleet accounts (in-process).
// Enforces the limits JSON on upstream_accounts: per5hRequests/per5hTokens,
// perWeekRequests/perWeekTokens, dailyCostUsd. Single Bun process like the
// semaphores; ring pruned past the longest window (7d). Counts land on
// completion (from fleet metering); concurrent in-flight turns are not
// pre-counted — same accepted tradeoff as the lane mirrors.

import type { AccountLimits } from "./upstream-config";

interface Stamp {
  at: number;
  tokens: number;
  costUsd: number;
}

const rings = new Map<string, Stamp[]>();
const WEEK_MS = 7 * 24 * 3_600_000;

function ring(accountId: string): Stamp[] {
  let r = rings.get(accountId);
  if (!r) {
    r = [];
    rings.set(accountId, r);
  }
  return r;
}

function prune(accountId: string, now: number): void {
  const r = rings.get(accountId);
  if (!r) return;
  const cutoff = now - WEEK_MS;
  let i = 0;
  while (i < r.length && r[i].at < cutoff) i++;
  if (i > 0) r.splice(0, i);
}

function sums(accountId: string, windowMs: number, now: number): { requests: number; tokens: number; cost: number } {
  const r = rings.get(accountId) ?? [];
  const cutoff = now - windowMs;
  let requests = 0;
  let tokens = 0;
  let cost = 0;
  for (let i = r.length - 1; i >= 0; i--) {
    if (r[i].at < cutoff) break;
    requests++;
    tokens += r[i].tokens;
    cost += r[i].costUsd;
  }
  return { requests, tokens, cost };
}

/** Record a completed turn against an account's windows. */
export function recordAccountUsage(accountId: string, tokens: number, costUsd: number, at = Date.now()): void {
  const r = ring(accountId);
  r.push({ at, tokens, costUsd });
  prune(accountId, at);
  if (r.length > 20_000) r.splice(0, r.length - 20_000);
}

export interface WindowCheck {
  allowed: boolean;
  reason?: string;
}

/** Check an account's windows before dispatch. */
export function checkAccountWindows(accountId: string, limits: AccountLimits | null): WindowCheck {
  if (!limits) return { allowed: true };
  const now = Date.now();
  prune(accountId, now);
  const H5 = 5 * 3_600_000;
  const D24 = 24 * 3_600_000;
  const W = 7 * 24 * 3_600_000;
  if (limits.per5hRequests != null || limits.per5hTokens != null) {
    const s = sums(accountId, H5, now);
    if (limits.per5hRequests != null && s.requests >= limits.per5hRequests) {
      return { allowed: false, reason: `account 5h request cap (${limits.per5hRequests}) reached` };
    }
    if (limits.per5hTokens != null && s.tokens >= limits.per5hTokens) {
      return { allowed: false, reason: `account 5h token cap (${limits.per5hTokens}) reached` };
    }
  }
  if (limits.perWeekRequests != null || limits.perWeekTokens != null) {
    const s = sums(accountId, W, now);
    if (limits.perWeekRequests != null && s.requests >= limits.perWeekRequests) {
      return { allowed: false, reason: `account weekly request cap (${limits.perWeekRequests}) reached` };
    }
    if (limits.perWeekTokens != null && s.tokens >= limits.perWeekTokens) {
      return { allowed: false, reason: `account weekly token cap (${limits.perWeekTokens}) reached` };
    }
  }
  if (limits.dailyCostUsd != null) {
    const s = sums(accountId, D24, now);
    if (s.cost >= limits.dailyCostUsd) {
      return { allowed: false, reason: `account daily cost cap ($${limits.dailyCostUsd}) reached` };
    }
  }
  return { allowed: true };
}
