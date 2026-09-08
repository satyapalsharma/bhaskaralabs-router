// Fleet metering: ledger + account-window accounting for DB-fleet turns.
// The fleet early-return path bypasses the smart-router trackTurn pipeline,
// so without this, fleet turns would be invisible to plan limits, spend
// reports, and account windows. Non-stream: parse usage JSON directly.
// Stream: tap SSE data lines through SseUsageAccumulator, settle on end.

import { writeLedger } from "./ledger";
import { parseUsageNonStream, SseUsageAccumulator } from "../providers/hyper";
import { recordAccountUsage } from "./account-windows";

export interface FleetMeterCtx {
  userId: string;
  apiKeyId: string;
  sessionId: string;
  endpointModel: string; // the alias the client called
  providerId: string;
  accountId: string;
  accountLabel: string;
  upstreamModel: string;
  inputUsdPerM: number;
  outputUsdPerM: number;
  startedAt: number;
  isStream: boolean;
}

function settle(ctx: FleetMeterCtx, prompt: number, completion: number, cached: number, reasoning: number, ttftMs?: number): void {
  const cost = (prompt * ctx.inputUsdPerM + completion * ctx.outputUsdPerM) / 1e6;
  recordAccountUsage(ctx.accountId, prompt + completion, cost);
  void writeLedger({
    userId: ctx.userId,
    apiKeyId: ctx.apiKeyId,
    sessionId: ctx.sessionId,
    endpointModel: ctx.endpointModel,
    usage: {
      provider: ctx.providerId,
      model: ctx.upstreamModel,
      promptTokens: prompt,
      completionTokens: completion,
      cachedTokens: cached,
      reasoningTokens: reasoning,
    },
    routedTo: "fleet",
    routerEffort: "low",
    latencyMs: Date.now() - ctx.startedAt,
    ttftMs,
    providerMeta: { fleet: true, accountId: ctx.accountId, accountLabel: ctx.accountLabel },
    actualCostUsd: cost,
    userEquivUsd: cost,
  }).catch((err) => console.error("[fleet-meter] ledger write failed:", (err as Error).message));
}

/** Wrap an upstream fleet Response with metering; returns the client response. */
export async function meterFleetResponse(res: Response, ctx: FleetMeterCtx): Promise<Response> {
  const ttftMs = Date.now() - ctx.startedAt;
  if (!ctx.isStream) {
    const json: unknown = await res.json().catch(() => null);
    if (json && typeof json === "object") {
      const u = parseUsageNonStream(json);
      settle(ctx, u.promptTokens, u.completionTokens, u.cachedTokens ?? 0, u.reasoningTokens ?? 0, ttftMs);
    } else {
      recordAccountUsage(ctx.accountId, 0, 0);
    }
    return new Response(JSON.stringify(json), { status: res.status, headers: { "Content-Type": "application/json" } });
  }
  if (!res.body) {
    recordAccountUsage(ctx.accountId, 0, 0);
    return res;
  }
  const acc = new SseUsageAccumulator();
  const decoder = new TextDecoder();
  let buffer = "";
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    const u = acc.usage;
    if (u) settle(ctx, u.promptTokens, u.completionTokens, u.cachedTokens ?? 0, u.reasoningTokens ?? 0, ttftMs);
    else recordAccountUsage(ctx.accountId, 0, 0);
  };
  const [clientBranch, meterBranch] = res.body.tee();
  void (async () => {
    const reader = meterBranch.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (t.startsWith("data:")) acc.feed(t.slice(5).trim());
        }
      }
    } catch {
      // stream aborted — settle with whatever accumulated
    } finally {
      finish();
    }
  })();
  return new Response(clientBranch, { status: res.status, headers: res.headers });
}
