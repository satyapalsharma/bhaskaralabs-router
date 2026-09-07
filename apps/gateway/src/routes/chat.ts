// Gateway entry: OpenAI-completions + Anthropic-messages proxies.
// Flow: auth → assemble+lint → route → provider dispatch → stream pass-through (usage tapped) → ledger.
// Identity/disclosure middleware injects the system line (disclosed routing variant).

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { streamText } from "hono/streaming";
import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { authenticate, type AuthContext } from "../lib/auth";
import { assemble, estimateTokens, deriveSessionId, type ChatMessage } from "../lib/prefix";
import { resolveFlags, compressLiveZone, maybeCompact, compactThreshold, compactSpan } from "../lib/compaction";
import { recordContentChars, contentCharsOf } from "../lib/escalation";
import { getQuotaState, quotaRejection } from "../lib/quotas";
import { setQuotaHeaders, setRetryHeaders } from "../lib/quota-headers";
import { writeLedger } from "../lib/ledger";
import { pickKeyForSession, hyperChat, parseUsageNonStream, SseUsageAccumulator, type HyperUsage } from "../providers/hyper";
import { camelChat, camelEnabled } from "../providers/camel";
import { agnesChat, agnesEnabled, markAgnesDead } from "../providers/agnes";
import { stepfunChat, stepfunEnabled, markStepfunThrottled } from "../providers/stepfun";
import { devpassChat, devpassEnabled } from "../providers/devpass";
import { llmGatewayChat, llmGatewayEnabled } from "../providers/llmgateway";
import { feihoaChat, feihoaEnabled, feihoaSlotFree, FEIHOA_MODEL, FEIHOA_MAX_OUTPUT, FEIHOA_INPUT_BUDGET } from "../providers/feihoa";
import { yoloChat, yoloEnabled, yoloSlotFree, YOLO_MODEL, YOLO_MAX_OUTPUT, YOLO_INPUT_BUDGET } from "../providers/yolo";
import { fitUpstreamWindow } from "../lib/window-guard";
import { recordYoloTurn } from "../lib/yolo-pressure";
import { hyperBudgetAvailable, reserveHyperBudget, releaseHyperBudget } from "../lib/hyper-budget";
import { type RouterDecision, type BackchannelLane, FLASH_OF, backchannelNext, backchannelPrimary, failoverDecision } from "../router";
import { decideTurn } from "../lib/decision";
import { getFleet, pickAccount, getPublicModels, type UpstreamProviderConfig } from "../lib/upstream-config";
import { checkPlanLimits } from "../lib/plan-limits";
import { checkAccountWindows } from "../lib/account-windows";
import { meterFleetResponse } from "../lib/fleet-meter";
import { genericChat, accountSlotFreeFor } from "../providers/generic";
import messagesApp from "./messages";

// ── DB-fleet (admin-panel) provider dispatch ──
// Providers registered via the admin panel are dispatchable through the
// generic module; hardcoded providers (hyper/feihoa/yolo/agnes/stepfun/
// llmgateway/devpass) keep their specialized branches above.
const FLEET_DISPATCHABLE = new Set<string>(); // populated at boot from the fleet
async function refreshFleetDispatchable(): Promise<void> {
  const fleet = await getFleet().catch(() => new Map());
  const hardcoded = new Set(["hyper", "feihoa", "yolo", "agnes", "stepfun", "llmgateway", "devpass"]);
  FLEET_DISPATCHABLE.clear();
  for (const id of fleet.keys()) if (!hardcoded.has(id)) FLEET_DISPATCHABLE.add(id);
}
import { applyTerseToSystem, terseEnabled } from "../lib/terse";
import { setNudgeHeader } from "../lib/fair-use";
import { sanitizeOpenAiResponse, sanitizeOpenAiChunk } from "../lib/sanitize";

/** TTFT ceiling for backchannel/lane first attempts (yolo/feihoa/llmgateway/
 *  agnes/stepfun). Yolo wedges silently at pressure exhaustion (no 429, no
 *  headers — just a hung connection); this caps the wait so failover fires
 *  in seconds. Cleared once response headers arrive (stream body exempt). */
const BACKCHANNEL_TTFT_CEILING_MS = 25_000;
const app = new Hono();

// ── Identity/disclosure line (disclosed routing variant) ──
/** One upstream SSE read result (done + optional byte chunk). */
interface UpstreamChunk {
  done: boolean;
  value?: Uint8Array;
}
const IDENTITY_LINE =
  "You are served by Bhaskara Labs' smart-routed endpoint. When asked which model you are, state that you are the Bhaskara Labs endpoint for this model family — a smart-routed system.";
const DISCLOSE_MODELS = new Set(["glm-5.3", "qwen-3.8"]);

function withIdentity(messages: ChatMessage[], endpointModel: string, terse = false): ChatMessage[] {
  if (!DISCLOSE_MODELS.has(endpointModel)) return messages;
  let line = IDENTITY_LINE;
  if (terse) line = applyTerseToSystem(line);
  const first = messages[0];
  if (first?.role === "system" && typeof first.content === "string") {
    if (first.content.includes("Bhaskara Labs")) return messages;
    // user has their own system prompt: prepend ours (+terse if on)
    return [{ role: "system", content: `${line}\n\n${first.content}` }, ...messages.slice(1)];
  }
  return [{ role: "system", content: line }, ...messages];
}
function hyperKeys(): Array<{ id: string; key: string }> {
  const raw = process.env.HYPER_API_KEYS ?? process.env.HYPER_API_KEY ?? "";
  const keys = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key, i) => ({ id: `hyper-${i}`, key }));
  if (keys.length === 0) throw new Error("HYPER_API_KEY(S) not configured");
  return keys;
}
interface PendingTurn {
  userId: string;
  apiKeyId: string;
  sessionId: string;
  endpointModel: string;
  decision: RouterDecision;
  startedAt: number;
  ttftMs?: number;
  rawIn: number; // est tokens of the client-sent history (pre-compaction) = true context pressure
  /** Streamed/completed content chars this turn — feeds the empty-output streak. */
  contentChars?: number;
  /** Camel: exact metered cost from usage.cost_details.upstream_inference_cost. */
  camelExactCostUsd?: number;
}

// Writes ledger after stream completes, using tapped usage.
function trackTurn(pending: PendingTurn, usage: HyperUsage | null, providerMeta?: Record<string, unknown>) {
  const u = usage ?? { promptTokens: 0, completionTokens: 0 } as HyperUsage;
  console.log(JSON.stringify({
    ev: "turn",
    user: pending.userId.slice(0, 8),
    session: pending.sessionId.slice(0, 8),
    ep: pending.endpointModel,
    to: pending.decision.upstreamModel,
    tier: pending.decision.tier,
    why: pending.decision.reason,
    tok: `${u.promptTokens}/${u.completionTokens}`,
    raw: pending.rawIn,
    cached: u.cachedTokens ?? 0,
    ms: Date.now() - pending.startedAt,
    ttft: pending.ttftMs ?? null,
  }));
  // Yolo pressure: record this turn's units into the rolling 1h/24h windows
  // (Terms §7 Builder: 3M/h, 14M/24h) — gates future turns away from the lane
  // BEFORE the silent-queue wedge observed 2026-09-04.
  if (pending.decision.provider === "yolo") {
    recordYoloTurn(u.promptTokens - (u.cachedTokens ?? 0), u.cachedTokens ?? 0, u.completionTokens);
  }
  // Empty-output streak: one record per completed turn (stream + non-stream).
  // contentChars is exact when captured (stream tap / non-stream JSON);
  // fall back to completion-token presence so missing capture can't fake an empty streak.
  const chars = pending.contentChars ?? (u.completionTokens > 0 ? 1 : 0);
  recordContentChars(pending.sessionId, chars);
  void writeLedger({
    userId: pending.userId,
    apiKeyId: pending.apiKeyId,
    sessionId: pending.sessionId,
    endpointModel: pending.endpointModel,
    usage: {
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      cachedTokens: usage?.cachedTokens,
      reasoningTokens: usage?.reasoningTokens,
      model: pending.decision.upstreamModel,
      provider: pending.decision.provider,
      // Camel: exact metered cost from provider usage.cost_details.
      ...(pending.decision.provider === "camel" && pending.camelExactCostUsd !== undefined
        ? { actualCostOverrideUsd: pending.camelExactCostUsd }
        : {}),
    },
    routedTo: pending.decision.tier,
    routerEffort: pending.decision.effort,
    latencyMs: Date.now() - pending.startedAt,
    ttftMs: pending.ttftMs,
    providerMeta,
  }).catch((err) => console.error("[ledger] write failed", err));
}

// ── POST /v1/chat/completions (OpenAI-compatible) ──
app.post("/v1/chat/completions", async (c) => {
  const authz = c.req.header("Authorization") ?? "";
  const auth = await authenticate(authz.replace(/^Bearer\s+/i, ""));
  if (!auth) return c.json({ error: { message: "Invalid API key", type: "authentication_error" } }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, 400);
  }

  const obj = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const endpointModel = typeof obj.model === "string" ? obj.model : "";
  const ENDPOINT_MODELS = new Set(["glm-5.3", "qwen-3.8", "theta"]);
  if (!ENDPOINT_MODELS.has(endpointModel)) {
    // DB-fleet aliases (admin panel) are callable too — route to the generic
    // lane when the model matches a fleet alias/modelId.
    const fleet = await getFleet().catch((): Map<string, UpstreamProviderConfig> => new Map());
    let fleetMatch: { providerId: string; modelId: string; inputUsdPerM: number; outputUsdPerM: number } | null = null;
    for (const p of fleet.values()) {
      for (const m of p.models) {
        if (m.alias === endpointModel || m.modelId === endpointModel) {
          fleetMatch = { providerId: p.id, modelId: m.modelId, inputUsdPerM: m.inputUsdPerM, outputUsdPerM: m.outputUsdPerM };
          break;
        }
      }
      if (fleetMatch) break;
    }
    if (!fleetMatch) {
      return c.json(
        { error: { message: `unknown model '${endpointModel}' (endpoint: glm-5.3, qwen-3.8, theta; or an admin-panel fleet model)`, type: "invalid_request_error" } },
        400,
      );
    }
    // Fleet model → generic dispatch directly (bypasses the smart router
    // chains; fleet models are explicitly admin-configured).
    // Account rotation: healthy + slot-free + window-limits-ok.
    const provider = fleet.get(fleetMatch.providerId)!;
    const eligible = provider.accounts.filter((a) => accountSlotFreeFor(a) && checkAccountWindows(a.id, a.limits).allowed);
    const account = pickAccount(fleetMatch.providerId, eligible);
    // Plan entitlement gate (admin-managed caps, e.g. bigpro: 100 req/5h qwen-3.8).
    const gate = await checkPlanLimits(auth.userId, auth.plan, endpointModel);
    if (!gate.allowed) {
      console.log(JSON.stringify({ ev: "plan-limit", user: auth.userId, model: endpointModel, reason: gate.reason }));
      return c.json({ error: { message: gate.reason ?? "Plan limit reached", type: "rate_limit_error" } }, 429);
    }
    if (!account) return c.json({ error: { message: "No healthy account for this model's provider", type: "api_error" } }, 502);
    try {
      const startedAt = Date.now();
      // Combined abort: client disconnect + 10-min ceiling. Without the
      // ceiling a wedged fleet provider hangs the turn forever (the main
      // paths get BACKCHANNEL_TTFT_CEILING_MS or the hyper 10-min ceiling).
      const fleetSignal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(10 * 60 * 1000)]);
      const upstreamRes = await genericChat({
        provider,
        account,
        modelId: fleetMatch.modelId,
        body: obj,
        signal: fleetSignal,
      });
      if (!upstreamRes.ok) return upstreamRes;
      // Meter into the ledger + account windows (plan limits + spend reports
      // need these rows; the fleet path bypasses the smart-router trackTurn).
      return await meterFleetResponse(upstreamRes, {
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
        sessionId: deriveSessionId(auth.apiKeyId, c.req.raw.headers),
        endpointModel,
        providerId: provider.id,
        accountId: account.id,
        accountLabel: account.label,
        upstreamModel: fleetMatch.modelId,
        inputUsdPerM: fleetMatch.inputUsdPerM,
        outputUsdPerM: fleetMatch.outputUsdPerM,
        startedAt,
        isStream: obj.stream === true,
      });
    } catch (err) {
      console.error(`[fleet ${fleetMatch.providerId}] dispatch failed:`, (err as Error).message);
      return c.json({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }, 502);
    }
  }

  // Plan entitlement gate for endpoint models (admin-managed per-model caps).
  {
    const gate = await checkPlanLimits(auth.userId, auth.plan, endpointModel);
    if (!gate.allowed) {
      console.log(JSON.stringify({ ev: "plan-limit", user: auth.userId, model: endpointModel, reason: gate.reason }));
      return c.json({ error: { message: gate.reason ?? "Plan limit reached", type: "rate_limit_error" } }, 429);
    }
  }

  const turnStartedAt = Date.now(); // true request-start clock (was captured post-dispatch → latency_ms ≈ 0)
  const assembled = assemble(obj);
  const toolTokens = obj.tools ? Math.ceil(JSON.stringify(obj.tools).length / 4) : 0;
  const rawInTokens = estimateTokens(assembled.messages) + toolTokens; // client-sent context incl. tool schemas (true provider pressure)
  // ── Context engine (both opt-in): live-zone compression + 200K compaction ──
  const flags = resolveFlags(c.req.raw.headers, auth.flags);
  const doCompress = flags.compress;
  // Backchannel mode: compaction + window guard are load-bearing — force ON
  // regardless of per-key flags (the upstream windows are small, no exceptions).
  const backchannelOn = process.env.BHASKARA_BACKCHANNEL === "feihoa" && (feihoaEnabled() || yoloEnabled());
  const doCompact = flags.compact || backchannelOn;
  // Smart lane selection by context size: small contexts → feihoa (32K,
  // unlimited); large contexts → yolo (128K, less compaction pressure).
  // The window guard fits the payload to the PRIMARY lane's budget; on
  // failover the other lane's budget is re-checked (see tryBackchannelFailover).
  const lane = backchannelPrimary(rawInTokens, FEIHOA_INPUT_BUDGET);
  const laneBudget = lane === "yolo" ? YOLO_INPUT_BUDGET : FEIHOA_INPUT_BUDGET;
  const laneCompact = lane === "yolo" ? { threshold: 96_000, span: 64_000 } : { threshold: compactThreshold(), span: compactSpan() };
  let messages = assembled.messages;
  let compactionMeta: Record<string, unknown> | undefined;
  if (doCompact) {
    const { messages: compacted, stats } = await maybeCompact(messages, {
      alreadyCompacted: messages.some((m) => typeof m.content === "string" && m.content.includes("[COMPACTED HISTORY")),
      logSkip: flags.compactDebug,
      extraTokens: toolTokens, // tool schemas count toward the threshold, never compacted themselves
      threshold: backchannelOn ? laneCompact.threshold : undefined,
      span: backchannelOn ? laneCompact.span : undefined,
    });
    if (stats.triggered) {
      messages = compacted;
      compactionMeta = { compact: { span: stats.spanMessages, tokBefore: stats.tokensBefore, tokAfter: stats.tokensAfter } };
      console.log(JSON.stringify({ ev: "compact", session: deriveSessionId(auth.apiKeyId, c.req.raw.headers).slice(0, 8), ...stats }));
    }
  }
  if (doCompress) {
    const { messages: compressed, stats: lzStats } = compressLiveZone(messages);
    if (lzStats.blocksCompressed > 0) {
      messages = compressed;
      compactionMeta = { ...(compactionMeta ?? {}), livezone: { bytes: `${lzStats.bytesBefore}→${lzStats.bytesAfter}`, via: lzStats.transformers.join(",") } };
      console.log(JSON.stringify({ ev: "livezone", session: deriveSessionId(auth.apiKeyId, c.req.raw.headers).slice(0, 8), ...lzStats }));
    }
  }
  // ── Backchannel window guard: hard-fit the payload to the primary lane's
  // upstream window (runs after compaction + compression; trims OLDEST
  // history, keeps the live zone).
  if (backchannelOn) {
    const { messages: fitted, stats } = fitUpstreamWindow(messages, toolTokens, laneBudget);
    if (stats.triggered) {
      messages = fitted;
      compactionMeta = { ...(compactionMeta ?? {}), windowGuard: { dropped: stats.droppedMessages, tokBefore: stats.tokensBefore, tokAfter: stats.tokensAfter, lane } };
      console.log(JSON.stringify({ ev: "window-guard", session: deriveSessionId(auth.apiKeyId, c.req.raw.headers).slice(0, 8), ...stats }));
    }
  }
  const quota = await getQuotaState(auth.userId, auth.plan);
  const reject = quotaRejection(quota, endpointModel);
  if (reject) {
    setRetryHeaders(c, quota, endpointModel, reject);
    return c.json({ error: { message: reject, type: "quota_exceeded" } }, 429);
  }
  setQuotaHeaders(c, quota, endpointModel, auth.plan);
  for (const w of assembled.warnings) console.warn(`[prefix-lint] ${auth.userId}: ${w}`);

  const sessionId = deriveSessionId(auth.apiKeyId, c.req.raw.headers);
  const decision = await decide(auth, sessionId, endpointModel, messages, backchannelOn ? lane : undefined);
  setNudgeHeader(c, decision);
  // Dispatch hardening (ops finding: hyper drops 4–5min generations):
  // 1 retry pre-stream (no client bytes yet), then full→flash degrade for full-tier turns.
  let upstream: Response;
  let usedDecision = decision;
  const terse = terseEnabled(c.req.header("x-bhaskara-terse"));
  const attempt = (d: RouterDecision) => dispatchUpstream(endpointModel, d, messages, obj, auth, sessionId, terse, c.req.raw.signal);
  // Backchannel failover (smart routing): the router owns the chain policy
  // (backchannelNext / failoverDecision); this handler only executes a hop.
  // Bidirectional now that yolo is a full lane: feihoa→yolo always (128K
  // window fits anything); yolo→feihoa only when the fitted payload fits
  // feihoa's 32K budget.
  const tryBackchannelFailover = async (cause: string, status: number): Promise<Response | null> => {
    const fitsFeihoa = estimateTokens(messages) + toolTokens <= FEIHOA_INPUT_BUDGET;
    const next = backchannelNext(usedDecision.provider, status, { fitsFeihoa });
    if (!next) return null;
    // HEALTH GATES: never dispatch into a busy/wedged lane. enabled() alone
    // is not enough — a wedged yolo (pressure/global-capacity) passes
    // enabled() but every dispatch burns the full 25s TTFT ceiling before
    // failing (observed: feihoa↔yolo bounce loop, 90s client timeout).
    if (next === "yolo" && (!yoloEnabled() || !yoloSlotFree())) return null;
    if (next === "feihoa" && (!feihoaEnabled() || !feihoaSlotFree())) return null;
    const alt = failoverDecision(usedDecision, next, cause);
    console.log(JSON.stringify({ ev: "backchannel-failover", from: usedDecision.provider, to: next, status, cause: cause.slice(0, 80) }));
    try {
      const res = await attempt(alt);
      if (res.ok) {
        usedDecision = alt;
        return res;
      }
    } catch {
      // terminal lane failed too — bubble the primary error up
    }
    return null;
  };
  // Hyper-budget failover: hyper lane errored or its $12.5/day budget is out →
  // hop to llmgateway with the SAME model id (verified same catalog upstreams).
  const tryLlmGatewayFailover = async (cause: string): Promise<Response | null> => {
    if (!llmGatewayEnabled() || usedDecision.provider === "llmgateway") return null;
    // FREE-BACKCHANNEL models (27b) must NEVER hop to llmgateway — it's the
    // PAID fallback. 27b exists to be free; paying per-token for it defeats
    // the whole lane design (observed: 54 turns / 852K tokens leaked here).
    // Free-lane failure falls back to hyper flash (cheap paid) instead.
    if (usedDecision.upstreamModel === YOLO_MODEL || usedDecision.upstreamModel === FEIHOA_MODEL) return null;
    const alt = failoverDecision(usedDecision, "llmgateway", cause);
    console.log(JSON.stringify({ ev: "llmgateway-failover", from: usedDecision.provider, to: usedDecision.upstreamModel, cause: cause.slice(0, 80) }));
    try {
      const res = await attempt(alt);
      if (res.ok) {
        usedDecision = alt;
        return res;
      }
    } catch {
      // llmgateway also unreachable — give up on this chain
    }
    return null;
  };
  // Connection-failure fallback chain, shared by the first-attempt and
  // retry-exhausted paths. Order: degraded flash (hyper full) → healthy
  // backchannel peer → same-catalog llmgateway → paid flash tier.
  const connectionFailover = async (errMsg: string): Promise<Response | null> => {
    const flashModel = decision.provider === "hyper" && decision.tier === "full"
      ? FLASH_OF[decision.upstreamModel] ?? null
      : null;
    if (flashModel) {
      const degraded: RouterDecision = {
        ...decision,
        upstreamModel: flashModel,
        tier: "flash",
        effort: "low",
        reason: `${decision.reason} → degraded-flash(retry-failed)`,
        hardCapped: true,
      };
      try {
        const res = await attempt(degraded);
        if (res.ok) {
          usedDecision = degraded;
          console.log(JSON.stringify({ ev: "dispatch-degraded", from: decision.upstreamModel, to: flashModel, cause: errMsg }));
          return res;
        }
      } catch { /* fall through */ }
    }
    // Free backchannel lanes: hop to the HEALTHY peer (gated).
    if (decision.provider === "feihoa" || decision.provider === "yolo") {
      const hop = await tryBackchannelFailover(`connection:${errMsg}`, 502);
      if (hop) return hop;
    }
    // Hyper/same-catalog lanes: same-model llmgateway hop.
    const gw = await tryLlmGatewayFailover(`connection:${errMsg}`);
    if (gw) return gw;
    // Free lanes whose peers are also unhealthy/busy → paid flash tier.
    // (Both free lanes dead must never 502 while paid lanes sit idle.)
    if (decision.provider === "feihoa" || decision.provider === "yolo") {
      if (await hyperBudgetAvailable()) {
        const paidFlash: RouterDecision = {
          ...decision,
          provider: "hyper",
          upstreamModel: endpointModel === "theta" ? "glm-5.3-flash" : "qwen3.8-flash",
          tier: "flash",
          effort: "low",
          reason: `${decision.reason} → paid-flash(connection-failover)`,
          hardCapped: true,
        };
        try {
          const res = await attempt(paidFlash);
          if (res.ok) {
            usedDecision = paidFlash;
            console.log(JSON.stringify({ ev: "paid-flash-fallback", from: decision.provider, to: paidFlash.upstreamModel, cause: errMsg }));
            return res;
          }
        } catch { /* fall through */ }
      }
    }
    return null;
  };

  try {
    upstream = await attempt(decision);
  } catch (err) {
    // Client gone → no point retrying (each attempt would abort instantly
    // via the propagated signal; and the response has no reader anyway).
    if (c.req.raw.signal.aborted) {
      console.log(`[dispatch ${decision.provider}] client disconnected mid-generation — aborting turn`);
      return c.json({ error: { message: "Client disconnected", type: "api_error" } }, 408);
    }
    const msg = (err as Error).message.slice(0, 60);
    if (msg.includes("ttft ceiling")) {
      // Wedged lane: same-lane retry is a guaranteed 25s waste (observed:
      // 50s+ per turn against the yolo wedge). Fail over immediately.
      console.log(`[dispatch ${decision.provider}] ttft ceiling — lane wedged, failing over (no same-lane retry)`);
      const alt = await connectionFailover(msg);
      if (alt) {
        upstream = alt;
      } else {
        console.error(`[dispatch ${decision.provider}] connection failure:`, msg);
        return c.json({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }, 502);
      }
    } else {
      console.warn(`[dispatch ${decision.provider}] attempt 1 failed (${msg}), retrying`);
      try {
        upstream = await attempt(decision);
      } catch (err2) {
        console.error(`[dispatch ${decision.provider}] connection failure:`, (err2 as Error).message);
        const alt = await connectionFailover((err2 as Error).message.slice(0, 60));
        if (alt) {
          upstream = alt;
        } else {
          return c.json({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }, 502);
        }
      }
    }
  }
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    const hop = await tryBackchannelFailover(errText, upstream.status);
    if (hop) {
      upstream = hop;
    } else if (usedDecision.provider === "hyper") {
      // Hyper returned an error status (e.g. 402 credits, 429, 5xx) → same-model
      // llmgateway hop. Agnes 402 (dead subscription) also lands here via theta chain.
      const gw = await tryLlmGatewayFailover(`status ${upstream.status}: ${errText.slice(0, 60)}`);
      if (gw) {
        upstream = gw;
      } else {
        console.error(`[upstream ${usedDecision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
        return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
      }
    } else {
      // Theta/bootstrap lane returned an error status (agnes 401/402 dead
      // subscription observed live 2026-09-04) → mark the lane dead so the
      // re-decide naturally skips it, then hop down the theta chain.
      if (usedDecision.provider === "agnes" && (upstream.status === 401 || upstream.status === 402)) markAgnesDead();
      if (usedDecision.provider === "stepfun" && upstream.status === 429) markStepfunThrottled(20);
      // re-decide with the failed provider's lane marked unavailable, which
      // naturally lands on yolo → hyper-flash → llmgateway.
      console.log(JSON.stringify({ ev: "theta-failover", from: usedDecision.provider, status: upstream.status, cause: errText.slice(0, 60) }));
      const retry = await decideTurn(auth, sessionId, endpointModel, messages, lane);
      if (retry.provider !== usedDecision.provider) {
        try {
          const res = await attempt(retry);
          if (res.ok) {
            usedDecision = retry;
            upstream = res;
          } else {
            console.error(`[upstream ${usedDecision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
            return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
          }
        } catch {
          console.error(`[upstream ${usedDecision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
          return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
        }
      } else {
        // Re-decide returned the SAME provider (e.g. feihoa still busy,
        // yolo wedged, no free lane) — fall through to the paid FLASH tier
        // so a concurrent burst never 502s while paid lanes sit idle.
        // (Observed live: 2 parallel turns → feihoa 429 + yolo wedge → 502
        // with both paid lanes healthy. Paid flash is the same capability
        // class as the free 27b lanes for routine turns.)
        const paidFlash = await hyperBudgetAvailable();
        if (paidFlash) {
          const degraded: RouterDecision = {
            ...usedDecision,
            provider: "hyper",
            upstreamModel: FLASH_OF[usedDecision.upstreamModel] ?? (endpointModel === "theta" ? "glm-5.3-flash" : "qwen3.8-flash"),
            tier: "flash",
            effort: "low",
            reason: `${usedDecision.reason} → paid-flash(all-free-lanes-busy)`,
            hardCapped: true,
          };
          try {
            const res = await attempt(degraded);
            if (res.ok) {
              usedDecision = degraded;
              upstream = res;
              console.log(JSON.stringify({ ev: "paid-flash-fallback", from: usedDecision.reason.slice(0, 30), to: degraded.upstreamModel }));
            } else {
              console.error(`[upstream ${usedDecision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
              return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
            }
          } catch {
            console.error(`[upstream ${usedDecision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
            return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
          }
        } else if (llmGatewayEnabled()) {
          const gw = await tryLlmGatewayFailover(`all-free-lanes-busy status ${upstream.status}`);
          if (gw) {
            upstream = gw;
          } else {
            console.error(`[upstream ${usedDecision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
            return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
          }
        } else {
          console.error(`[upstream ${usedDecision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
          return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
        }
      }
    }
  }
  const isStream = obj.stream === true;
  const pending: PendingTurn = {
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    sessionId,
    endpointModel,
    decision: usedDecision,
    startedAt: turnStartedAt,
    rawIn: rawInTokens,
  };

  if (!isStream) {
    const json: unknown = await upstream.json();
    const usage = extractUsage(json);
    pending.contentChars = contentCharsOf(json);
    pending.camelExactCostUsd = usage?.camelCostUsd;
    const hyperMeta = extractHyperMeta(json);
    trackTurn(pending, usage, { ...(compactionMeta ?? {}), ...(hyperMeta ?? {}) });
    return c.json(sanitizeOpenAiResponse(json, endpointModel));
  }

  // Streaming pass-through with usage tap (SSE)
  let ttftSet = false;
  const acc = new SseUsageAccumulator();
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  return streamText(c, async (stream) => {
    const reader = upstream.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    // SSE keep-alive: proxies (cloudflared ~90-100s idle timeout) drop silent
    // streams; a `:` comment every 25s keeps the tunnel alive without
    // touching client parsing (SSE spec: comment lines are ignored).
    const KEEPALIVE_MS = 25_000;
    let lastWrite = Date.now();
    let pendingRead: Promise<UpstreamChunk> | null = null;
    // FINALLY: guaranteed cleanup — reader cancel (releases upstream backchannel
    // semaphore slots via wrapRelease.cancel()) even when the loop throws
    // (connection reset, client abort, keepalive write failure). Without this,
    // error paths LEAK yolo/feihoa slots and the whole lane goes "busy" forever.
    try {
      while (true) {
        if (!pendingRead) pendingRead = reader.read();
        const wait = Math.max(500, KEEPALIVE_MS - (Date.now() - lastWrite));
        const outcome = await Promise.race([
          pendingRead.then((r) => ({ t: "read" as const, r })),
          new Promise<{ t: "keep" }>((res) => setTimeout(() => res({ t: "keep" }), wait)),
        ]);
        if (outcome.t === "keep") {
          await stream.write(": keepalive\n\n");
          lastWrite = Date.now();
          continue;
        }
        pendingRead = null;
        const { done, value } = outcome.r;
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (!ttftSet) {
          pending.ttftMs = Date.now() - pending.startedAt;
          ttftSet = true;
        }
        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            await stream.write(line + "\n");
            lastWrite = Date.now();
            continue;
          }
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") {
            await stream.write(line + "\n");
            lastWrite = Date.now();
            continue;
          }
          acc.feed(data);
          const sanitized = sanitizeOpenAiChunk(data, endpointModel);
          if (sanitized !== "__DROP__") await stream.write(`data: ${sanitized}\n\n`);
          lastWrite = Date.now();
        }
      }
      pending.contentChars = acc.contentChars;
      pending.camelExactCostUsd = acc.usage?.camelCostUsd;
      const hyperMeta = acc.usage ? extractHyperMeta({ usage: acc.usage }) : undefined;
      trackTurn(pending, acc.usage, { ...(compactionMeta ?? {}), ...(hyperMeta ?? {}) });
    } finally {
      // release the upstream reader on ANY exit path (normal, error, abort)
      // — this fires wrapRelease.cancel() which releases the lane slot.
      pendingRead = null;
      await reader.cancel().catch(() => {});
    }
  });
});

// ── User-response sanitization: WHITELIST (lib/sanitize.ts) — upstream provider
// identity (model ids, build fingerprints, cost/remaining meters) never reaches
// users; they see only the endpoint model + standard token accounting.

async function dispatchUpstream(
  endpointModel: string,
  decision: RouterDecision,
  messages: ChatMessage[],
  originalBody: Record<string, unknown>,
  auth: AuthContext,
  sessionId: string,
  terse = false,
  clientSignal?: AbortSignal,
): Promise<Response> {
  const payload = { ...originalBody, messages: withIdentity(messages, endpointModel, terse), model: decision.upstreamModel, stream_options: { include_usage: true } };
  // yolo /models served fine but /chat/completions hung 60s+). A tight
  // TTFT-style ceiling caps the CONNECT+HEADERS phase so failover to the
  // next lane fires in seconds, not minutes (yolo/feihoa only). Exemptions:
  // Stepfun EXEMPT: aborting a slow stepfun request creates a ZOMBIE server-side
  // (observed: "current: 9, limit: 8" 429 shower). p90=24s sits at the ceiling.
  // Agnes EXEMPT (2026-09-07): real-traffic ledger shows p90=10.9s, p99=22.9s,
  // worst=37.5s — under 6-project load its turns legitimately cross 25s, and
  // the ceiling aborted 60 turns as "lane wedged", silently skipping a healthy
  // free lane (300k calls/month!) and burning hyper flash instead. Agnes has
  // never exhibited the silent-hang wedge that yolo/feihoa show; slot pressure
  // resolves on its own. Wide ceiling for agnes too.
  // Camel EXEMPT: metered lane (no zombie cost), "auto" models reach ~10s p90 TTFT.
  // Only yolo/feihoa keep the tight wedge-guard ceiling (those lanes genuinely
  // hang silently at pressure exhaustion).
  const ttftMs = decision.provider === "hyper" || decision.provider === "stepfun" || decision.provider === "llmgateway" || decision.provider === "agnes" || decision.provider === "camel" ? 10 * 60 * 1000 : BACKCHANNEL_TTFT_CEILING_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("backchannel ttft ceiling")), ttftMs);
  // Client-disconnect propagation — ALL lanes. Paid lanes (hyper/llmgateway)
  // save per-token money on abort; flat lanes free the turn instantly. The
  // flat-lane zombie risk (server keeps generating after our abort, holding
  // one of its server slots while our mirror reads free — observed as
  // "current: 9, limit: 8" 429s) is handled at the semaphore: providers
  // shadow-hold the slot for the estimated remaining generation
  // (lib/shadow-release.ts) so the mirror stays conservative.
  const signal = ac.signal;
  const onClientAbort = () => ac.abort(new Error("client disconnected"));
  clientSignal?.addEventListener("abort", onClientAbort, { once: true });
  const clearTtft = () => {
    clearTimeout(timer);
    clientSignal?.removeEventListener("abort", onClientAbort);
  };
  if (decision.provider === "hyper") {
    const key = pickKeyForSession(hyperKeys(), sessionId);
    // TOCTOU guard: reserve a worst-case estimate so N concurrent turns can't
    // each individually pass hyperBudgetAvailable() while collectively blowing
    // past $12.5 (reserveHyperBudget was dead code — in-flight turns were
    // invisible to the gate). Released on settle; exact cost lands via ledger.
    const estTokens = estimateTokens(messages);
    const estUsd = (estTokens * 3 + 8_000 * 8) / 1e6; // ~prompt at $3/M + 8K out at $8/M worst case
    reserveHyperBudget(estUsd);
    return hyperChat({ model: decision.upstreamModel, body: payload, apiKey: key.key, signal })
      .finally(() => {
        clearTtft();
        releaseHyperBudget(estUsd);
      });
  }
  if (decision.provider === "feihoa") {
    // Backchannel: unique Idempotency-Key per dispatch — feihoa replays are
    // only valid while the original is unfinished; a repeated key on a NEW
    // turn gets 409 idempotency_conflict. In-client 429 retry (feihoaChat)
    // reuses this key — that's the documented retry contract.
    const p = { ...(payload as Record<string, unknown>), max_tokens: FEIHOA_MAX_OUTPUT };
    return feihoaChat({
      body: { ...p, model: FEIHOA_MODEL },
      apiKey: process.env.FEIHOA_API_KEY ?? "",
      idempotencyKey: randomUUID(),
      signal,
    }).finally(clearTtft);
  }
  if (decision.provider === "yolo") {
    // Backchannel failover lane: 128K window, no idempotency-key protocol.
    const p = { ...(payload as Record<string, unknown>), max_tokens: YOLO_MAX_OUTPUT };
    return yoloChat({
      body: { ...p, model: YOLO_MODEL },
      apiKey: process.env.YOLO_AUTO_API_KEY ?? "",
      signal,
    }).finally(clearTtft);
  }
  if (decision.provider === "llmgateway") {
    // Paid fallback lane behind hyper — same model ids, no upstream caching.
    const apiKey = process.env.LLMGATEWAY_API_KEY ?? "";
    return llmGatewayChat({ model: decision.upstreamModel, body: payload, apiKey, signal }).finally(clearTtft);
  }
  if (decision.provider === "camel") {
    // Camel Stream — theta FIRST lane. Metered (usage.cost_details lands in
    // ledger via providerMeta); concurrency 1 guarded inside camelChat.
    // TTFT ceiling: metered lane aborts save money (no zombie risk — the
    // server-side generation is billed only if completed and doesn't hold
    // flat-plan slots), but "auto" routes to frontier-class models whose
    // p90 TTFT can reach ~10s — use the wide ceiling, not the backchannel 25s.
    ac.abort; // no-op reference guard — camel rides the standard 10-min ceiling below
    const camelTtftMs = 10 * 60 * 1000;
    clearTimeout(timer);
    const camelTimer = setTimeout(() => ac.abort(new Error("camel ttft ceiling")), camelTtftMs);
    const apiKey = process.env.CAMEL_API_KEY ?? "";
    return camelChat({ model: decision.upstreamModel, body: payload as Record<string, unknown>, apiKey, signal }).finally(() => {
      clearTimeout(camelTimer);
      clearTtft();
    });
  }
  if (decision.provider === "agnes") {
    const apiKey = process.env.AGNES_API_KEY ?? "";
    return agnesChat({ model: decision.upstreamModel, body: payload, apiKey, signal }).finally(clearTtft);
  }
  if (decision.provider === "stepfun") {
    const apiKey = process.env.STEPFUN_API_KEY ?? "";
    return stepfunChat({ model: decision.upstreamModel, body: payload, apiKey, signal }).finally(clearTtft);
  }
  if (FLEET_DISPATCHABLE.has(decision.provider)) {
    // Providers registered via the admin panel (upstream_providers table)
    // route through the generic dispatcher with account rotation.
    const fleet = await getFleet();
    const provider = fleet.get(decision.provider);
    if (provider && provider.accounts.length > 0) {
      const account = pickAccount(provider.id, provider.accounts);
      if (account && accountSlotFreeFor(account)) {
        return genericChat({ provider, account, modelId: decision.upstreamModel, body: payload, signal }).finally(clearTtft);
      }
    }
    // No healthy account → fall through to 502 via empty response contract:
    return new Response(JSON.stringify({ error: { message: "No healthy account for provider", type: "api_error" } }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
  const apiKey = process.env.DEVPASS_API_KEY ?? "";
  return devpassChat({ model: decision.upstreamModel, body: payload, apiKey, signal }).finally(clearTtft);
}

function extractUsage(json: unknown): HyperUsage | null {
  if (typeof json !== "object" || json === null || !("usage" in json)) return null;
  return parseUsageNonStream(json);
}

/** Extract Hyper cost/credits metadata for the ledger's provider_meta column.
 *  Hyper returns cost.usd, cost.hypercredits, remaining.hypercredits per call.
 *  Storing these gives us the TRUE billed amount, not just our computed estimate. */
function extractHyperMeta(json: unknown): Record<string, unknown> | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const obj = json as Record<string, unknown>;
  const usage = obj.usage as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== "object") return undefined;
  const cost = usage.cost as Record<string, unknown> | undefined;
  const remaining = usage.remaining as Record<string, unknown> | undefined;
  const meta: Record<string, unknown> = {};
  if (cost && typeof cost.usd === "number") meta.hyperCostUsd = cost.usd;
  if (cost && typeof cost.hypercredits === "number") meta.hypercredits = cost.hypercredits;
  if (remaining && typeof remaining.hypercredits === "number") meta.hyperRemaining = remaining.hypercredits;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

async function decide(auth: AuthContext, sessionId: string, endpointModel: string, messages: ChatMessage[], lane?: BackchannelLane): Promise<RouterDecision> {
  return decideTurn(auth, sessionId, endpointModel, messages, lane);
}

// Anthropic-compat endpoint (Claude Code / Crush) — full router pipeline
app.route("/", messagesApp);

app.get("/health", (c) => c.json({ ok: true, providers: { camel: camelEnabled(), agnes: agnesEnabled(), stepfun: stepfunEnabled(), devpass: devpassEnabled(), feihoa: feihoaEnabled(), yolo: yoloEnabled(), llmgateway: llmGatewayEnabled() }, backchannel: process.env.BHASKARA_BACKCHANNEL === "feihoa" && feihoaEnabled() ? "feihoa" : null }));

// Client-facing model catalog. Endpoint models are always listed; public
// models from the DB fleet (admin panel) extend the catalog — private ones
// stay routable but hidden (OpenRouter private-model semantics).
app.get("/v1/models", async (c) => {
  const endpointModels = [
    { id: "glm-5.3", object: "model", owned_by: "bhaskara" },
    { id: "qwen-3.8", object: "model", owned_by: "bhaskara" },
    { id: "theta", object: "model", owned_by: "bhaskara" },
  ];
  try {
    const fleetModels = await getPublicModels();
    const extra = fleetModels
      .filter((m) => !endpointModels.some((e) => e.id === m.id))
      .map((m) => ({ id: m.id, object: "model", owned_by: "bhaskara-fleet" }));
    return c.json({ object: "list", data: [...endpointModels, ...extra] });
  } catch {
    return c.json({ object: "list", data: endpointModels });
  }
});

// Boot + periodic refresh of DB-fleet dispatchability (admin panel additions
// go live without restart; 60s cadence matches the fleet TTL generously).
void refreshFleetDispatchable();
setInterval(() => void refreshFleetDispatchable(), 60_000);

export default app;