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
import { agnesChat, agnesEnabled } from "../providers/agnes";
import { stepfunChat, stepfunEnabled } from "../providers/stepfun";
import { devpassChat, devpassEnabled } from "../providers/devpass";
import { feihoaChat, feihoaEnabled, FEIHOA_MODEL, FEIHOA_MAX_OUTPUT, FEIHOA_INPUT_BUDGET } from "../providers/feihoa";
import { yoloChat, yoloEnabled, YOLO_MODEL, YOLO_MAX_OUTPUT, YOLO_INPUT_BUDGET } from "../providers/yolo";
import { fitUpstreamWindow } from "../lib/window-guard";
import { type RouterDecision, type BackchannelLane, FLASH_OF, backchannelNext, backchannelPrimary, failoverDecision } from "../router";
import { decideTurn } from "../lib/decision";
import messagesApp from "./messages";
import { applyTerseToSystem, terseEnabled } from "../lib/terse";
import { setNudgeHeader } from "../lib/fair-use";
import { sanitizeOpenAiResponse, sanitizeOpenAiChunk } from "../lib/sanitize";
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
  if (!["glm-5.3", "qwen-3.8", "theta"].includes(endpointModel)) {
    return c.json(
      { error: { message: `model must be one of glm-5.3, qwen-3.8, theta (got '${endpointModel}')`, type: "invalid_request_error" } },
      400,
    );
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
  const attempt = (d: RouterDecision) => dispatchUpstream(endpointModel, d, messages, obj, auth, sessionId, terse);
  // Backchannel failover (smart routing): the router owns the chain policy
  // (backchannelNext / failoverDecision); this handler only executes a hop.
  // Bidirectional now that yolo is a full lane: feihoa→yolo always (128K
  // window fits anything); yolo→feihoa only when the fitted payload fits
  // feihoa's 32K budget.
  const tryBackchannelFailover = async (cause: string, status: number): Promise<Response | null> => {
    const fitsFeihoa = estimateTokens(messages) + toolTokens <= FEIHOA_INPUT_BUDGET;
    const next = backchannelNext(usedDecision.provider, status, { fitsFeihoa });
    if (!next) return null;
    if (next === "yolo" && !yoloEnabled()) return null;
    if (next === "feihoa" && !feihoaEnabled()) return null;
    const alt = failoverDecision(usedDecision, next, cause);
    alt.upstreamModel = next === "yolo" ? YOLO_MODEL : FEIHOA_MODEL;
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
  try {
    upstream = await attempt(decision);
  } catch (err) {
    console.warn(`[dispatch ${decision.provider}] attempt 1 failed (${(err as Error).message.slice(0, 60)}), retrying`);
    try {
      upstream = await attempt(decision);
    } catch (err2) {
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
          upstream = await attempt(degraded);
          usedDecision = degraded;
          console.log(JSON.stringify({ ev: "dispatch-degraded", from: decision.upstreamModel, to: flashModel, cause: String((err2 as Error).message).slice(0, 60) }));
        } catch (err3) {
          console.error(`[dispatch ${decision.provider}] degraded attempt also failed:`, (err3 as Error).message);
          return c.json({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }, 502);
        }
      } else {
        // Backchannel lane unreachable → hop to the next lane in the chain.
        const hop = await tryBackchannelFailover(`connection:${(err2 as Error).message.slice(0, 60)}`, 502);
        if (hop) {
          upstream = hop;
        } else {
          console.error(`[dispatch ${decision.provider}] connection failure:`, (err2 as Error).message);
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
    } else {
      console.error(`[upstream ${usedDecision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
      return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
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
    trackTurn(pending, usage, compactionMeta);
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
    trackTurn(pending, acc.usage, compactionMeta);
  });
});

// ── User-response sanitization: WHITELIST (lib/sanitize.ts) — upstream provider
// identity (model ids, build fingerprints, cost/remaining meters) never reaches
// users; they see only the endpoint model + standard token accounting.

function dispatchUpstream(
  endpointModel: string,
  decision: RouterDecision,
  messages: ChatMessage[],
  originalBody: Record<string, unknown>,
  auth: AuthContext,
  sessionId: string,
  terse = false,
): Promise<Response> {
  const payload = { ...originalBody, messages: withIdentity(messages, endpointModel, terse), model: decision.upstreamModel, stream_options: { include_usage: true } };
  const signal = AbortSignal.timeout(10 * 60 * 1000); // 10-min ceiling for long generations
  if (decision.provider === "hyper") {
    const key = pickKeyForSession(hyperKeys(), sessionId);
    return hyperChat({ model: decision.upstreamModel, body: payload, apiKey: key.key, signal });
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
    });
  }
  if (decision.provider === "yolo") {
    // Backchannel failover lane: 128K window, no idempotency-key protocol.
    const p = { ...(payload as Record<string, unknown>), max_tokens: YOLO_MAX_OUTPUT };
    return yoloChat({
      body: { ...p, model: YOLO_MODEL },
      apiKey: process.env.YOLO_AUTO_API_KEY ?? "",
      signal,
    });
  }
  if (decision.provider === "agnes") {
    const apiKey = process.env.AGNES_API_KEY ?? "";
    return agnesChat({ model: decision.upstreamModel, body: payload, apiKey, signal });
  }
  if (decision.provider === "stepfun") {
    const apiKey = process.env.STEPFUN_API_KEY ?? "";
    return stepfunChat({ model: decision.upstreamModel, body: payload, apiKey, signal });
  }
  const apiKey = process.env.DEVPASS_API_KEY ?? "";
  return devpassChat({ model: decision.upstreamModel, body: payload, apiKey, signal });
}

function extractUsage(json: unknown): HyperUsage | null {
  if (typeof json !== "object" || json === null || !("usage" in json)) return null;
  return parseUsageNonStream(json);
}

async function decide(auth: AuthContext, sessionId: string, endpointModel: string, messages: ChatMessage[], lane?: BackchannelLane): Promise<RouterDecision> {
  return decideTurn(auth, sessionId, endpointModel, messages, lane);
}

// Anthropic-compat endpoint (Claude Code / Crush) — full router pipeline
app.route("/", messagesApp);

app.get("/health", (c) => c.json({ ok: true, providers: { agnes: agnesEnabled(), stepfun: stepfunEnabled(), devpass: devpassEnabled(), feihoa: feihoaEnabled(), yolo: yoloEnabled() }, backchannel: process.env.BHASKARA_BACKCHANNEL === "feihoa" && feihoaEnabled() ? "feihoa" : null }));

export default app;