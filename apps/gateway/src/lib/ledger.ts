// Ledger writer: dual-accounting rows into usage_ledger (Phase-1 instrumentation heart).
// Side A (user-facing): raw streamed tokens + equivalent cost at list rates.
// Side B (internal): actual provider cost. NEVER mixed outside this module.

import { db } from "../db";
import { usageLedger } from "../db/schema";
import { recordUsage } from "./usage-counters";
import { valueUserFacing, valueActualCost, type Usage } from "@bhaskara/shared/metering";
import { randomUUID } from "node:crypto";

export interface LedgerEntry {
  userId: string;
  apiKeyId: string;
  sessionId: string;
  endpointModel: string;
  usage: Usage;
  routedTo: string;
  routerEffort: string;
  latencyMs?: number;
  ttftMs?: number;
  providerMeta?: Record<string, unknown>;
  /** Router causality. `reason` is the human-readable why; `signals` is the
   *  machine-readable input vector that produced it (capability distribution,
   *  escalation counters, chosen r). Both feed skill-card calibration. */
  routerReason?: string;
  routerSignals?: Record<string, unknown>;
  /** Whether the response asked for a tool. The dud rate cannot be computed
   *  without it: a productive tool call and a model giving up have the same
   *  token shape (large prompt, tiny completion). Undefined records "unknown". */
  hasToolCalls?: boolean;
  /** Override computed costs (admin fleet models with DB pricing; unknown to the static rate card). */
  actualCostUsd?: number;
  userEquivUsd?: number;
}

export async function writeLedger(entry: LedgerEntry): Promise<void> {
  // Providers occasionally report fractional/odd usage; bigint columns reject fractions
  // and the void().catch() in callers would then SILENTLY DROP the billing row. Normalize.
  const r = (n: number | undefined) => Math.round(Number.isFinite(n) ? (n as number) : 0);
  entry.usage.promptTokens = r(entry.usage.promptTokens);
  entry.usage.completionTokens = r(entry.usage.completionTokens);
  entry.usage.cachedTokens = r(entry.usage.cachedTokens);
  entry.usage.reasoningTokens = r(entry.usage.reasoningTokens);
  const valuation = valueUserFacing(entry.usage);
  const actual = valueActualCost(entry.usage);
  const equiv = entry.userEquivUsd ?? valuation.equivalentApiCost;
  const real = entry.actualCostUsd ?? actual;
  const equivUsd = equiv.toFixed(6);
  const actualUsd = real.toFixed(6);
  await db.transaction(async (tx) => {
    await tx.insert(usageLedger).values({
      id: randomUUID(),
      userId: entry.userId,
      apiKeyId: entry.apiKeyId,
      sessionId: entry.sessionId,
      endpointModel: entry.endpointModel,
      provider: entry.usage.provider,
      upstreamModel: entry.usage.model,
      routedTo: entry.routedTo,
      routerEffort: entry.routerEffort,
      promptTokens: entry.usage.promptTokens,
      completionTokens: entry.usage.completionTokens,
      cachedTokens: entry.usage.cachedTokens ?? 0,
      reasoningTokens: entry.usage.reasoningTokens ?? 0,
      userEquivalentCostUsd: equivUsd,
      actualCostUsd: actualUsd,
      providerMeta: entry.providerMeta ? JSON.stringify(entry.providerMeta) : null,
      hasToolCalls: entry.hasToolCalls ?? null,
      routerReason: entry.routerReason ?? null,
      routerSignals: entry.routerSignals ? JSON.stringify(entry.routerSignals) : null,
      latencyMs: entry.latencyMs,
      ttftMs: entry.ttftMs,
    });
    // Quota counters ride in the ledger's transaction so they cannot drift from
    // it. A failing counter write must never cost the billing row: it runs in a
    // savepoint, is logged, and scripts/usage-counters-reconcile.ts repairs it.
    try {
      await tx.transaction((sp) =>
        recordUsage(sp, {
          userId: entry.userId,
          endpointModel: entry.endpointModel,
          tokens: entry.usage.promptTokens + entry.usage.completionTokens,
          equivUsd,
          actualUsd,
        }),
      );
    } catch (err) {
      console.error(JSON.stringify({
        ev: "usage-counter-error",
        user: entry.userId.slice(0, 8),
        model: entry.endpointModel,
        error: (err as Error).message,
      }));
    }
  });
}