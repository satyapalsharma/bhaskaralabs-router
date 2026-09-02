// Gateway entry: OpenAI-completions + Anthropic-messages proxies.
// Flow: auth → assemble+lint → route → provider dispatch → stream pass-through (usage tapped) → ledger.
// Identity/disclosure middleware injects the system line (disclosed routing variant).

import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { authenticate, type AuthContext } from "../lib/auth";
import { assemble, estimateTokens, deriveSessionId, type ChatMessage } from "../lib/prefix";
import { resolveFlags, compressLiveZone, maybeCompact } from "../lib/compaction";
import { getQuotaState, quotaRejection } from "../lib/quotas";
import { getLock, setLock, touchSession } from "../lib/session-lock";
import { setQuotaHeaders, setRetryHeaders } from "../lib/quota-headers";
import { writeLedger } from "../lib/ledger";
import { pickKeyForSession, hyperChat, parseUsageNonStream, SseUsageAccumulator, type HyperUsage } from "../providers/hyper";
import { agnesChat, agnesEnabled } from "../providers/agnes";
import { stepfunChat, stepfunEnabled } from "../providers/stepfun";
import { devpassChat, devpassEnabled } from "../providers/devpass";
import { type RouterDecision, FLASH_OF } from "../router";
import { decideTurn } from "../lib/decision";
import messagesApp from "./messages";
import { applyTerseToSystem, terseEnabled } from "../lib/terse";
const app = new Hono();

// ── Identity/disclosure line (disclosed routing variant) ──
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
  const rawInTokens = estimateTokens(assembled.messages); // client-sent context size pre-compaction
  // ── Context engine (both opt-in): live-zone compression + 200K compaction ──
  const flags = resolveFlags(c.req.raw.headers, auth.flags);
  const doCompress = flags.compress;
  let messages = assembled.messages;
  let compactionMeta: Record<string, unknown> | undefined;
  if (flags.compact) {
    const { messages: compacted, stats } = await maybeCompact(messages, {
      alreadyCompacted: messages.some((m) => typeof m.content === "string" && m.content.includes("[COMPACTED HISTORY")),
      logSkip: flags.compactDebug,
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
  const quota = await getQuotaState(auth.userId, auth.plan);
  const reject = quotaRejection(quota, endpointModel);
  if (reject) {
    setRetryHeaders(c, quota, endpointModel, reject);
    return c.json({ error: { message: reject, type: "quota_exceeded" } }, 429);
  }
  setQuotaHeaders(c, quota, endpointModel, auth.plan);
  for (const w of assembled.warnings) console.warn(`[prefix-lint] ${auth.userId}: ${w}`);

  const sessionId = deriveSessionId(auth.apiKeyId, c.req.raw.headers);
  const decision = await decide(auth, sessionId, endpointModel, messages);
  // Dispatch hardening (ops finding: hyper drops 4–5min generations):
  // 1 retry pre-stream (no client bytes yet), then full→flash degrade for full-tier turns.
  let upstream: Response;
  let usedDecision = decision;
  const terse = terseEnabled(c.req.header("x-bhaskara-terse"));
  const attempt = (d: RouterDecision) => dispatchUpstream(endpointModel, d, messages, obj, auth, sessionId, terse);
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
        console.error(`[dispatch ${decision.provider}] connection failure:`, (err2 as Error).message);
        return c.json({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }, 502);
      }
    }
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error(`[upstream ${decision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
    return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
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
    trackTurn(pending, usage, compactionMeta);
    return c.json(sanitizeUserResponse(json, endpointModel));
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
    while (true) {
      const { done, value } = await reader.read();
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
          continue;
        }
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") {
          await stream.write(line + "\n");
          continue;
        }
        acc.feed(data);
        const sanitized = sanitizeSseChunk(data, endpointModel);
        if (sanitized !== "__DROP__") await stream.write(`data: ${sanitized}\n\n`);
      }
    }
    trackTurn(pending, acc.usage, compactionMeta);
  });
});

// ── User-response sanitization: internal pricing (cost/remaining) NEVER reaches users ──

function sanitizeUserResponse(json: unknown, endpointModel: string): unknown {
  if (typeof json !== "object" || json === null) return json;
  const clone = { ...(json as Record<string, unknown>) };
  if (clone.usage && typeof clone.usage === "object") {
    clone.usage = sanitizeUsage(clone.usage);
  }
  // Never leak the upstream model we routed to — user sees the endpoint model they requested.
  if (typeof clone.model === "string") clone.model = endpointModel;
  delete clone.cost;
  return clone;
}

function sanitizeUsage(usage: unknown): Record<string, unknown> {
  const u = { ...(usage as Record<string, unknown>) };
  delete u.cost;
  delete u.remaining;
  return u;
}

/** SSE chunk: strip usage.cost/usage.remaining; rewrite model to endpoint model; drop usage-only chunks. */
function sanitizeSseChunk(data: string, endpointModel: string): string {
  try {
    const chunk: unknown = JSON.parse(data);
    if (typeof chunk !== "object" || chunk === null) return data;
    const c = chunk as Record<string, unknown>;
    if (c.usage && typeof c.usage === "object") {
      const hasEmptyChoices = Array.isArray(c.choices) && c.choices.length === 0;
      if (hasEmptyChoices) return "__DROP__"; // usage-only chunk — internal, never forward
      c.usage = sanitizeUsage(c.usage);
    }
    if (typeof c.model === "string") c.model = endpointModel;
    return JSON.stringify(c);
  } catch {
    return data;
  }
}

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

async function decide(auth: AuthContext, sessionId: string, endpointModel: string, messages: ChatMessage[]): Promise<RouterDecision> {
  return decideTurn(auth, sessionId, endpointModel, messages);
}

// Anthropic-compat endpoint (Claude Code / Crush) — full router pipeline
app.route("/", messagesApp);

app.get("/health", (c) => c.json({ ok: true, providers: { agnes: agnesEnabled(), stepfun: stepfunEnabled(), devpass: devpassEnabled() } }));

export default app;