// Gateway-side upstream fleet config (DB-driven, admin-managed).
// Reads upstream_providers/accounts/models with a short in-process cache so
// admin changes go live within TTL without a deploy. Env-based hardcoded
// providers remain the bootstrap fallback — DB rows EXTEND the fleet.
//
// Design notes (LiteLLM-style):
// - Multiple accounts per provider → weighted round-robin with cooldown skip.
// - Account limits JSON drives the limiter (concurrency + 5h/weekly request &
//   usage windows + daily cost), enforced in lib/upstream-limits.ts.
// - Model visibility: public models surface on /v1/models; private ones stay
//   routable (alias-callable) but unlisted.

import { db } from "../db";
import { upstreamProviders, upstreamAccounts, upstreamModels } from "../db/schema";
import { eq, and } from "drizzle-orm";

export interface UpstreamAccount {
  id: string;
  label: string;
  apiKey: string;
  weight: number;
  disabled: boolean;
  cooldownUntil: number | null; // epoch ms
  limits: AccountLimits | null;
}

export interface AccountLimits {
  maxConcurrent?: number;
  per5hRequests?: number;
  per5hTokens?: number;
  perWeekRequests?: number;
  perWeekTokens?: number;
  dailyCostUsd?: number;
}

export interface UpstreamModel {
  modelId: string;
  alias: string | null;
  visibility: "public" | "private";
  tier: "full" | "flash" | "cheap";
  contextWindow: number;
  maxOutput: number;
  inputUsdPerM: number;
  outputUsdPerM: number;
  cacheReadUsdPerM: number;
}

export interface UpstreamProviderConfig {
  id: string;
  baseUrl: string;
  protocol: "openai" | "anthropic";
  authStyle: "bearer" | "x-api-key";
  billing: "flat" | "metered" | "credits";
  accounts: UpstreamAccount[];
  models: UpstreamModel[];
}

interface FleetSnapshot {
  providers: Map<string, UpstreamProviderConfig>;
  at: number;
}

let snapshot: FleetSnapshot | null = null;
const TTL_MS = 15_000;

export async function getFleet(force = false): Promise<Map<string, UpstreamProviderConfig>> {
  if (!force && snapshot && Date.now() - snapshot.at < TTL_MS) return snapshot.providers;
  const [provRows, accRows, modelRows] = await Promise.all([
    db.select().from(upstreamProviders).where(eq(upstreamProviders.active, true)),
    db.select().from(upstreamAccounts),
    db.select().from(upstreamModels).where(eq(upstreamModels.active, true)),
  ]);
  const providers = new Map<string, UpstreamProviderConfig>();
  for (const p of provRows) {
    providers.set(p.id, {
      id: p.id,
      baseUrl: p.baseUrl,
      protocol: p.protocol === "anthropic" ? "anthropic" : "openai",
      authStyle: p.authStyle === "x-api-key" ? "x-api-key" : "bearer",
      billing: (p.billing as UpstreamProviderConfig["billing"]) ?? "flat",
      accounts: [],
      models: [],
    });
  }
  for (const a of accRows) {
    const p = providers.get(a.providerId);
    if (!p || a.disabled) continue;
    let limits: AccountLimits | null = null;
    if (a.limits) {
      try {
        limits = JSON.parse(a.limits) as AccountLimits;
      } catch {
        limits = null;
      }
    }
    p.accounts.push({
      id: a.id,
      label: a.label,
      apiKey: a.apiKey,
      weight: a.weight,
      disabled: a.disabled,
      cooldownUntil: a.cooldownUntil ? new Date(a.cooldownUntil).getTime() : null,
      limits,
    });
  }
  for (const m of modelRows) {
    const p = providers.get(m.providerId);
    if (!p) continue;
    p.models.push({
      modelId: m.modelId,
      alias: m.alias,
      visibility: m.visibility === "private" ? "private" : "public",
      tier: (m.tier as UpstreamModel["tier"]) ?? "flash",
      contextWindow: m.contextWindow,
      maxOutput: m.maxOutput,
      inputUsdPerM: Number(m.inputUsdPerM),
      outputUsdPerM: Number(m.outputUsdPerM),
      cacheReadUsdPerM: Number(m.cacheReadUsdPerM),
    });
  }
  snapshot = { providers, at: Date.now() };
  return providers;
}

/** Public models for the client-facing /v1/models endpoint (visibility=public). */
export async function getPublicModels(): Promise<Array<{ id: string; tier: string; context: number }>> {
  const fleet = await getFleet();
  const out: Array<{ id: string; tier: string; context: number }> = [];
  for (const p of fleet.values()) {
    for (const m of p.models) {
      if (m.visibility !== "public") continue;
      out.push({ id: m.alias ?? m.modelId, tier: m.tier, context: m.contextWindow });
    }
  }
  return out;
}

/** Pick an account for a provider: weighted round-robin over healthy accounts. */
const rrCursor = new Map<string, number>();
export function pickAccount(providerId: string, accounts: UpstreamAccount[]): UpstreamAccount | null {
  const now = Date.now();
  const healthy = accounts.filter((a) => !a.disabled && (a.cooldownUntil ?? 0) <= now);
  if (healthy.length === 0) return null;
  const total = healthy.reduce((s, a) => s + Math.max(1, a.weight), 0);
  let cursor = (rrCursor.get(providerId) ?? 0) % total;
  rrCursor.set(providerId, cursor + 1);
  for (const a of healthy) {
    cursor -= Math.max(1, a.weight);
    if (cursor < 0) return a;
  }
  return healthy[0];
}

/** Mark an account cooling after errors (self-healing cooldown). */
export async function markAccountCooldown(accountId: string, providerId: string, ms: number): Promise<void> {
  await db
    .update(upstreamAccounts)
    .set({ cooldownUntil: new Date(Date.now() + ms) })
    .where(eq(upstreamAccounts.id, accountId));
  if (snapshot) snapshot.at = 0; // force refresh on next read
  rrCursor.delete(providerId);
}

/** Clear cooldown on success (lane proven alive). */
export async function clearAccountCooldown(accountId: string): Promise<void> {
  await db.update(upstreamAccounts).set({ cooldownUntil: null }).where(and(eq(upstreamAccounts.id, accountId)));
  if (snapshot) snapshot.at = 0;
}
