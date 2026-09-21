// POST /v1/messages — Anthropic-compatible endpoint for Claude Code / Crush.
// Same pipeline as chat.ts: auth → quota → route → dispatch → stream/non-stream
// → sanitize (Anthropic shape: usage.{input,output}_tokens only) → ledger.

import { Hono } from "hono";
import { authenticate, type AuthContext } from "../lib/auth";
import { estimateTokens, deriveSessionId, type ChatMessage } from "../lib/prefix";
import { getQuotaState, quotaRejection, checkTrialVelocity } from "../lib/quotas";
import { writeLedger } from "../lib/ledger";
import { checkPlanLimits } from "../lib/plan-limits";
import { setQuotaHeaders, setRetryHeaders } from "../lib/quota-headers";
import { decideTurn } from "../lib/decision";
import { recordContentChars, contentCharsOf, hasToolCallsOf, recordDudTurn } from "../lib/escalation";
import { applyTerseToSystem, terseArmOf, type TerseArm } from "../lib/terse";
import { setNudgeHeader } from "../lib/fair-use";
import { resolveFlags, compressLiveZone, maybeCompact, auditPairs } from "../lib/compaction";
import { getPacks, selectPacks, extractTerms, renderPacks, historyTextOf } from "../lib/docs";
import { archiveTurn } from "../lib/archive";
import { persistEnabled, applyPersistToSystem } from "../lib/persist";
import { pickKeyForSession, hyperMessages } from "../providers/hyper";
import { llmGatewayMessages, llmGatewayEnabled } from "../providers/llmgateway";
import { buildLaneHealth } from "../lib/lane-health";
import { reserveHyperBudget, releaseHyperBudget, markHyperDead, hyperAccountAlive } from "../lib/hyper-budget";
import { classifyUpstreamError } from "../lib/upstream-error";
import { type RouterDecision, type LaneHealth } from "../router";
import { chainFor, type EndpointModel } from "@bhaskara/shared/pricing";
import {
  classifyClient,
  isServable,
  uaGateMode,
  UNIDENTIFIED_CLIENT_MESSAGE,
} from "../lib/client-identity";

const app = new Hono();

const IDENTITY_LINE =
  "You are served by Bhaskara Labs' smart-routed endpoint. When asked which model you are, state that you are the Bhaskara Labs endpoint for this model family — a smart-routed system.";

/** One upstream SSE read result (done + optional byte chunk). */
interface UpstreamChunk {
  done: boolean;
  value?: Uint8Array;
}

interface AnthropicUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

function extractAnthropicUsage(json: unknown): AnthropicUsage | null {
  if (typeof json !== "object" || json === null || !("usage" in json)) return null;
  const usage = (json as { usage: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return null;
  const u = usage as Record<string, unknown>;
  return {
    inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
    outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
    cachedTokens: typeof u.cache_read_input_tokens === "number" ? u.cache_read_input_tokens : undefined,
  };
}
// Whitelist sanitization lives in lib/sanitize.ts (upstream identity never leaks).
import { sanitizeAnthropicResponse } from "../lib/sanitize";
/** Convert Anthropic messages shape to internal ChatMessage[]. */
function toChatMessages(body: Record<string, unknown>): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const system = body.system;
  if (typeof system === "string" && system.length > 0) {
    messages.push({ role: "system", content: system });
  } else if (Array.isArray(system)) {
    const text = system
      .map((block) => (typeof block === "object" && block !== null && "text" in block ? String((block as { text: unknown }).text) : ""))
      .join("\n")
      .trim();
    if (text) messages.push({ role: "system", content: text });
  }
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    if (typeof m !== "object" || m === null) continue;
    const msg = m as Record<string, unknown>;
    const role = msg.role === "assistant" ? "assistant" : "user";
    let content: unknown = msg.content;
    if (Array.isArray(content)) {
      content = content
        .map((b) => (typeof b === "object" && b !== null && "text" in b ? (b as { text: unknown }).text : ""))
        .join("");
    }
    messages.push({ role, content });
  }
  return messages;
}

/** Rebuild Anthropic request body with routed model + identity system block. */
function buildAnthropicPayload(body: Record<string, unknown>, decision: RouterDecision, messages: ChatMessage[], terseArm: TerseArm = "off", docsText = "", persist = false): Record<string, unknown> {
  const hasSystem = typeof body.system === "string" && (body.system as string).length > 0;
  const ladder = terseArm === "ladder";
  const systemText = hasSystem
    ? terseArm !== "off"
      ? applyTerseToSystem(`${body.system as string}\n\n${IDENTITY_LINE}`, ladder)
      : `${body.system as string}\n\n${IDENTITY_LINE}`
    : terseArm !== "off"
      ? applyTerseToSystem(IDENTITY_LINE, ladder)
      : IDENTITY_LINE;
  const fullSystem = docsText ? `${systemText}\n\n${docsText}` : systemText;
  const finalSystem = persist ? applyPersistToSystem(fullSystem) : fullSystem;
  const payload: Record<string, unknown> = { ...body, model: decision.upstreamModel, system: finalSystem };
  // Convert internal ChatMessage[] back to Anthropic messages shape
  payload.messages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  return payload;
}


app.post("/v1/messages", async (c) => {
  const turnStartedAt = Date.now();
  const authz = c.req.header("x-api-key") ?? c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const auth = await authenticate(authz.trim() || null);
  if (!auth) return c.json({ type: "error", error: { type: "authentication_error", message: "Invalid API key" } }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ type: "error", error: { type: "invalid_request_error", message: "Invalid JSON body" } }, 400);
  }
  const obj = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  // Same client gate as /v1/chat/completions. This route is the one Anthropic
  // clients reach by default, so leaving it open would make the gate a
  // suggestion rather than a rule.
  const client = classifyClient(c.req.header("user-agent") ?? null, obj);
  console.log(JSON.stringify({
    ev: "client",
    route: "messages",
    user: auth.userId.slice(0, 8),
    kind: client.kind,
    name: client.name,
    version: client.version,
    shaped: client.shaped,
    ua: client.raw,
  }));
  if (!isServable(client) && uaGateMode() === "enforce") {
    return c.json(
      { type: "error", error: { type: "invalid_request_error", message: UNIDENTIFIED_CLIENT_MESSAGE } },
      400,
    );
  }

  const endpointModel = typeof obj.model === "string" ? obj.model : "";
  if (!["glm-5.3", "theta"].includes(endpointModel)) {
    return c.json(
      { type: "error", error: { type: "invalid_request_error", message: `model must be one of glm-5.3, theta (got '${endpointModel}')` } },
      400,
    );
  }
  {
    const gate = await checkPlanLimits(auth.userId, auth.plan, endpointModel);
    if (!gate.allowed) {
      console.log(JSON.stringify({ ev: "plan-limit", route: "messages", user: auth.userId, model: endpointModel, reason: gate.reason }));
      return c.json({ type: "error", error: { type: "rate_limit_error", message: gate.reason ?? "Plan limit reached" } }, 429);
    }
    const velocity = await checkTrialVelocity(auth.apiKeyId, auth.plan);
    if (velocity) {
      return c.json({ type: "error", error: { type: "rate_limit_error", message: velocity } }, 429);
    }
  }
  const sessionId = deriveSessionId(auth.apiKeyId, c.req.raw.headers);
  let messages = toChatMessages(obj);
  const toolTokens = Array.isArray(obj.tools) ? Math.ceil(JSON.stringify(obj.tools).length / 4) : 0;
  const rawInTokens = estimateTokens(messages) + toolTokens;
  // ── Context engine (opt-in) — same as chat route ──
  const flags = resolveFlags(c.req.raw.headers, auth.flags);
  if (flags.compact) {
    const { messages: compacted, stats } = await maybeCompact(messages, {
      alreadyCompacted: messages.some((m) => typeof m.content === "string" && m.content.includes("[COMPACTED HISTORY")),
      logSkip: flags.compactDebug,
      extraTokens: toolTokens,
    });
    if (stats.triggered) {
      messages = compacted;
      console.log(JSON.stringify({ ev: "compact", session: sessionId.slice(0, 8), ...stats }));
    }
  }
  if (flags.compress) {
    const { messages: compressed, stats: lz } = compressLiveZone(messages);
    if (lz.blocksCompressed > 0) {
      messages = compressed;
      console.log(JSON.stringify({ ev: "livezone", session: sessionId.slice(0, 8), ...lz }));
    }
  }
  // Shadow mode: measure-only twin of the chat route (original forwarded).
  let shadowMeta: Record<string, unknown> | undefined;
  if (flags.shadow && !flags.compress) {
    const dry = compressLiveZone(messages, { dryRun: true });
    if (dry.stats.blocksCompressed > 0) {
      const keep = auditPairs(dry.pairs ?? []);
      shadowMeta = {
        shadow: {
          mode: "measure", before: dry.stats.bytesBefore, after: dry.stats.bytesAfter,
          via: dry.stats.transformers.join(","),
          errKept: keep.errKept, errTotal: keep.errTotal,
          refKept: keep.refKept, refTotal: keep.refTotal,
          violations: keep.violations.length,
        },
      };
      console.log(JSON.stringify({ ev: "shadow", session: sessionId.slice(0, 8), ...dry.stats, err: `${keep.errKept}/${keep.errTotal}`, refs: `${keep.refKept}/${keep.refTotal}`, violations: keep.violations.slice(0, 3) }));
    }
  }
  const quota = await getQuotaState(auth.userId, auth.plan);
  const reject = quotaRejection(quota, endpointModel);
  if (reject) {
    setRetryHeaders(c, quota, endpointModel, reject);
    return c.json({ type: "error", error: { type: "quota_exceeded", message: reject } }, 429);
  }
  setQuotaHeaders(c, quota, endpointModel, auth.plan);

  // Session id honors x-bhaskara-session (same as chat route) + shared sticky/reeval decision.
  //
  // This route speaks the Anthropic protocol, and only Hyper and LLMGateway serve
  // it here — the flat lanes are OpenAI-compatible only. So when the router picks
  // a lane this route cannot speak to, both halves of the lane are replaced, not
  // just the provider: pinning `provider` alone would dispatch the flat lane's
  // model id (e.g. Camel's "auto") to Hyper, which answers 404 model-not-found.
  // The substitute comes from the endpoint's own chain so the model id is always
  // one that lane actually serves.
  const routed = await decideTurn(auth, sessionId, endpointModel, messages, {
    skill: flags.skill,
    r: flags.r,
  });
  const chainEndpoint = (endpointModel === "theta" ? "theta" : "glm-5.3") as EndpointModel;
  // The substitute must be HEALTHY, not merely anthropic-capable: chain order
  // puts hyper first, and a find() without health re-picked hyper even when the
  // daily budget gate had marked it down — which let this route spend straight
  // through the $12.5/day ceiling the chat route enforces.
  const health = await buildLaneHealth().catch((): LaneHealth => ({}));
  const pinned =
    routed.provider === "hyper" || routed.provider === "llmgateway"
      ? null
      : chainFor(chainEndpoint, routed.tier).find(
          (l) => (l.provider === "hyper" || l.provider === "llmgateway") && health[l.provider],
        );
  if (!pinned && routed.provider !== "hyper" && routed.provider !== "llmgateway") {
    // Neither anthropic-speaking lane is available (budget spent or outage).
    // Dispatching the routed flat lane's model id to Hyper would just buy a
    // 404 — refuse honestly instead.
    return c.json({ type: "error", error: { type: "api_error", message: "Upstream temporarily unavailable" } }, 503);
  }
  const decision: RouterDecision = pinned
    ? {
        ...routed,
        provider: pinned.provider,
        upstreamModel: pinned.model,
        reason: `${routed.reason} → anthropic-lane(${pinned.provider}:${pinned.model})`,
      }
    : routed;
  setNudgeHeader(c, decision);
  // Docs registry (opt-in): curated packs appended to the system text (the
  // stable-prefix slot; messages[] carries no system entries on this route).
  let docsText = "";
  let docsMeta: Record<string, unknown> | undefined;
  if (flags.docs) {
    const packs = selectPacks(extractTerms(historyTextOf(messages)), await getPacks());
    if (packs.length > 0) {
      docsText = renderPacks(packs);
      const ids = packs.map((p) => p.id);
      docsMeta = { docs: { packs: ids, bytes: docsText.length } };
      console.log(JSON.stringify({ ev: "docs", session: sessionId.slice(0, 8), packs: ids, bytes: docsText.length }));
    }
  }
  const terseArm = terseArmOf(c.req.header("x-bhaskara-terse"));
  const persist = persistEnabled(c.req.header("x-bhaskara-persist"));
  const payload = buildAnthropicPayload(obj, decision, messages, terseArm, docsText, persist);
  const keys = (process.env.HYPER_API_KEYS ?? process.env.HYPER_API_KEY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key, i) => ({ id: `hyper-${i}`, key }));
  if (keys.length === 0) {
    return c.json({ type: "error", error: { type: "api_error", message: `Upstream not configured` } }, 502);
  }
  const key = pickKeyForSession(keys, auth.apiKeyId);
  let upstream: Response;
  // Client-disconnect propagation + 10-min ceiling, combined. A cancelled
  // client must not leave a 12-min generation running on Hyper.
  const dispatchSignal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(10 * 60 * 1000)]);
  const gwDispatch = () =>
    llmGatewayMessages({
      model: decision.upstreamModel,
      body: payload,
      apiKey: process.env.LLMGATEWAY_API_KEY ?? "",
      signal: dispatchSignal,
    });
  // Same in-flight reservation as the chat route: without it, concurrent
  // Anthropic turns each saw budget remaining and collectively overshot the
  // daily ceiling. Released the moment the dispatch settles — exact cost lands
  // via the ledger. Only hyper dispatches count against the hyper budget.
  const reservesHyper = decision.provider === "hyper";
  const estUsd = reservesHyper ? (estimateTokens(messages) * 3 + 8_000 * 8) / 1e6 : 0;
  if (reservesHyper) reserveHyperBudget(estUsd);
  try {
    try {
      // Pre-stream retry on connection errors: no client bytes sent yet, safe to retry once.
      upstream = await hyperMessages({ model: decision.upstreamModel, body: payload, apiKey: key.key, signal: dispatchSignal });
    } catch (err) {
      console.warn(`[messages dispatch] attempt 1 failed (${(err as Error).message.slice(0, 60)}), retrying`);
      try {
        upstream = await hyperMessages({ model: decision.upstreamModel, body: payload, apiKey: key.key, signal: dispatchSignal });
      } catch (err2) {
        // Hyper unreachable twice → llmgateway same-model hop (Anthropic-compat).
        if (llmGatewayEnabled()) {
          console.log(JSON.stringify({ ev: "llmgateway-failover", from: "hyper", to: decision.upstreamModel, route: "messages" }));
          try {
            upstream = await gwDispatch();
          } catch {
            return c.json({ type: "error", error: { type: "api_error", message: `Provider unreachable` } }, 502);
          }
        } else {
          console.error(`[messages dispatch] connection failure:`, (err2 as Error).message);
          return c.json({ type: "error", error: { type: "api_error", message: `Provider unreachable` } }, 502);
        }
      }
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      // Account-refusal (out of credits / auth) dead-marks hyper so later turns
      // pick llmgateway straight away instead of paying a doomed round-trip.
      const hyperCls = classifyUpstreamError(upstream.status, errText);
      if (hyperCls === "quota" || hyperCls === "auth") markHyperDead();
      // Hyper error status (402 credits / 429 / 5xx) → llmgateway same-model hop.
      if (llmGatewayEnabled()) {
        console.log(JSON.stringify({ ev: "llmgateway-failover", from: "hyper", to: decision.upstreamModel, status: upstream.status, route: "messages" }));
        try {
          const gw = await gwDispatch();
          if (gw.ok) {
            upstream = gw;
          } else {
            console.error(`[messages upstream] ${upstream.status}: ${errText.slice(0, 300)}`);
            return c.json({ type: "error", error: { type: "api_error", message: `Upstream error ${upstream.status}` } }, 502);
          }
        } catch {
          console.error(`[messages upstream] ${upstream.status}: ${errText.slice(0, 300)}`);
          return c.json({ type: "error", error: { type: "api_error", message: `Upstream error ${upstream.status}` } }, 502);
        }
      } else {
        console.error(`[messages upstream] ${upstream.status}: ${errText.slice(0, 300)}`);
        return c.json({ type: "error", error: { type: "api_error", message: `Upstream error ${upstream.status}` } }, 502);
      }
    }
  } finally {
    if (reservesHyper) releaseHyperBudget(estUsd);
  }

  const isStream = obj.stream === true;
  // A 2xx proves the account has credits and the key works — clear the
  // dead-mark streak so the lane re-enters rotation at full health.
  if (decision.provider === "hyper") hyperAccountAlive();

  if (!isStream) {
    const json: unknown = await upstream.json();
    const toolUse = hasToolCallsOf(json);
    recordContentChars(sessionId, contentCharsOf(json), toolUse);
    const usage = extractAnthropicUsage(json);
    recordDudTurn(sessionId, usage?.inputTokens ?? 0, usage?.outputTokens ?? 0, Array.isArray((obj as { tools?: unknown }).tools), toolUse);
    if (usage) {
      console.log(JSON.stringify({
        ev: "turn", user: auth.userId.slice(0, 8), session: sessionId.slice(0, 8), ep: endpointModel,
        to: decision.upstreamModel, tier: decision.tier, why: decision.reason,
        tok: `${usage.inputTokens}/${usage.outputTokens}`, raw: rawInTokens, cached: usage.cachedTokens ?? 0,
        ms: Date.now() - turnStartedAt, ttft: null,
      }));
      void writeLedger({
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
        sessionId,
        endpointModel,
        usage: { promptTokens: usage.inputTokens, completionTokens: usage.outputTokens, cachedTokens: usage.cachedTokens, model: decision.upstreamModel, provider: decision.provider },
        routedTo: decision.tier,
        routerEffort: decision.effort,
        routerReason: decision.reason,
        hasToolCalls: toolUse,
        routerSignals: decision.signals ?? {},
        latencyMs: Date.now() - turnStartedAt,
        providerMeta: { terseArm, persistArm: persist ? "on" : "off", ...(shadowMeta ?? {}), ...(docsMeta ?? {}) },
      }).catch((err) => console.error("[ledger] write failed", err));
      void archiveTurn({ userId: auth.userId, apiKeyId: auth.apiKeyId, sessionId, endpointModel, provider: decision.provider, upstreamModel: decision.upstreamModel, routedTo: decision.tier, promptTokens: usage.inputTokens, completionTokens: usage.outputTokens, messages, tools: (obj as { tools?: unknown }).tools }).catch(() => {});
    }
    return c.json(sanitizeAnthropicResponse(json, endpointModel));
  }

  // Streaming pass-through with model rewrite: user must never see the upstream model.
  // We tap each SSE line for usage accounting AND rewrite model fields before forwarding.
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const streamStarted = { ttft: 0 };
  void (async () => {
    const reader = upstream.body?.getReader();
    if (!reader) {
      await writer.close();
      return;
    }
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    const usageBox: { value: AnthropicUsage | null } = { value: null };
    let contentChars = 0;
    /** Set when a tool_use block starts — a productive turn even with no text. */
    let streamedToolUse = false;
    const flushLine = async (line: string) => {
      if (!line.startsWith("data: ")) {
        await writer.write(encoder.encode(line + "\n"));
        return;
      }
      const data = line.slice(6).trim();
      if (!data) {
        await writer.write(encoder.encode(line + "\n"));
        return;
      }
      try {
        const parsed: unknown = JSON.parse(data);
        if (typeof parsed === "object" && parsed !== null) {
          const p = parsed as Record<string, unknown>;
          const u = extractAnthropicUsage(parsed);
          if (u) usageBox.value = u;
          // Anthropic stream content tap: text deltas feed the empty-output streak.
          if (p.type === "content_block_delta" && p.delta && typeof p.delta === "object") {
            const t = (p.delta as { text?: unknown }).text;
            if (typeof t === "string") contentChars += t.length;
          }
          // A tool_use block carries no text delta, so it must be tapped
          // separately or a tool-calling turn looks like an empty one.
          if (p.type === "content_block_start" && p.content_block && typeof p.content_block === "object") {
            if ((p.content_block as { type?: unknown }).type === "tool_use") streamedToolUse = true;
          }
          if (p.message && typeof p.message === "object") {
            const msg = { ...(p.message as Record<string, unknown>) };
            if (typeof msg.model === "string") msg.model = endpointModel;
            p.message = msg;
          }
          if (typeof p.model === "string") p.model = endpointModel;
          await writer.write(encoder.encode(`data: ${JSON.stringify(p)}\n\n`));
          return;
        }
      } catch {
        // non-JSON — forward as-is
      }
      await writer.write(encoder.encode(`data: ${data}\n\n`));
    };
    // SSE keep-alive (cloudflared ~90-100s idle timeout): `:` comment every
    // 25s keeps the tunnel alive; SSE clients ignore comment lines.
    const KEEPALIVE_MS = 25_000;
    let lastWrite = Date.now();
    let pendingRead: Promise<UpstreamChunk> | null = null;
    try {
      while (true) {
        if (!pendingRead) pendingRead = reader.read();
        const wait = Math.max(500, KEEPALIVE_MS - (Date.now() - lastWrite));
        const outcome = await Promise.race([
          pendingRead.then((r) => ({ t: "read" as const, r })),
          new Promise<{ t: "keep" }>((res) => setTimeout(() => res({ t: "keep" }), wait)),
        ]);
        if (outcome.t === "keep") {
          await writer.write(encoder.encode(": keepalive\n\n"));
          lastWrite = Date.now();
          continue;
        }
        pendingRead = null;
        const { done, value } = outcome.r;
        if (done) break;
        if (!streamStarted.ttft) streamStarted.ttft = Date.now() - turnStartedAt;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        for (const line of lines) {
          await flushLine(line);
          lastWrite = Date.now();
        }
      }
    } finally {
      // release the upstream reader on ANY exit path — fires wrapRelease
      // cancel() which releases the lane semaphore slot (leak fix).
      pendingRead = null;
      await reader.cancel().catch(() => {});
    }
    if (usageBox.value !== null) {
      recordContentChars(sessionId, contentChars, streamedToolUse);
      recordDudTurn(sessionId, usageBox.value.inputTokens, usageBox.value.outputTokens, Array.isArray((obj as { tools?: unknown }).tools), streamedToolUse);
      void writeLedger({
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
        sessionId,
        endpointModel,
        usage: { promptTokens: usageBox.value.inputTokens, completionTokens: usageBox.value.outputTokens, cachedTokens: usageBox.value.cachedTokens, model: decision.upstreamModel, provider: decision.provider },
        routedTo: decision.tier,
        routerEffort: decision.effort,
        routerReason: decision.reason,
        hasToolCalls: streamedToolUse,
        routerSignals: decision.signals ?? {},
        latencyMs: Date.now() - turnStartedAt,
        ttftMs: streamStarted.ttft || undefined,
        providerMeta: { terseArm, persistArm: persist ? "on" : "off", ...(shadowMeta ?? {}), ...(docsMeta ?? {}) },
      }).catch((err) => console.error("[ledger] write failed", err));
      void archiveTurn({ userId: auth.userId, apiKeyId: auth.apiKeyId, sessionId, endpointModel, provider: decision.provider, upstreamModel: decision.upstreamModel, routedTo: decision.tier, promptTokens: usageBox.value.inputTokens, completionTokens: usageBox.value.outputTokens, messages, tools: (obj as { tools?: unknown }).tools }).catch(() => {});
    }
    await writer.close();
  })().catch((err) => console.error("[messages stream] error:", (err as Error).message));

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
});

export default app;