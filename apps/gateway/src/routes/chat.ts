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
import { getQuotaState, quotaRejection } from "../lib/quotas";
import { getLock, setLock, touchSession } from "../lib/session-lock";
import { setQuotaHeaders, setRetryHeaders } from "../lib/quota-headers";
import { writeLedger } from "../lib/ledger";
import { pickKeyForSession, hyperChat, SseUsageAccumulator, type HyperUsage } from "../providers/hyper";
import { agnesChat, agnesEnabled } from "../providers/agnes";
import { stepfunChat, stepfunEnabled } from "../providers/stepfun";
import { devpassChat, devpassEnabled } from "../providers/devpass";
import { route, routeTheta, classifyHardness, type RouterDecision } from "../router";
import messagesApp from "./messages";
import { randomUUID } from "node:crypto";

const app = new Hono();

// ── Identity/disclosure line (disclosed routing variant) ──
const IDENTITY_LINE =
  "You are served by Bhaskara Labs' smart-routed endpoint. When asked which model you are, state that you are the Bhaskara Labs endpoint for this model family — a smart-routed system.";
const DISCLOSE_MODELS = new Set(["glm-5.3", "qwen-3.8"]);

function withIdentity(messages: ChatMessage[], endpointModel: string): ChatMessage[] {
  if (!DISCLOSE_MODELS.has(endpointModel)) return messages;
  const first = messages[0];
  if (first?.role === "system" && typeof first.content === "string") {
    if (first.content.includes("Bhaskara Labs")) return messages;
  }
  return [{ role: "system", content: IDENTITY_LINE }, ...messages];
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
}

// Writes ledger after stream completes, using tapped usage.
function trackTurn(pending: PendingTurn, usage: HyperUsage | null, providerMeta?: Record<string, unknown>) {
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

  const assembled = assemble(obj);
  const quota = await getQuotaState(auth.userId, auth.plan);
  const reject = quotaRejection(quota, endpointModel);
  if (reject) {
    setRetryHeaders(c, quota, endpointModel, reject);
    return c.json({ error: { message: reject, type: "quota_exceeded" } }, 429);
  }
  setQuotaHeaders(c, quota, endpointModel, auth.plan);
  for (const w of assembled.warnings) console.warn(`[prefix-lint] ${auth.userId}: ${w}`);

  const sessionId = deriveSessionId(auth.apiKeyId, c.req.raw.headers);
  const decision = await decide(auth, sessionId, endpointModel, assembled.messages);
  let upstream: Response;
  try {
    upstream = await dispatchUpstream(endpointModel, decision, assembled.messages, obj, auth, sessionId);
  } catch (err) {
    console.error(`[dispatch ${decision.provider}] connection failure:`, (err as Error).message);
    return c.json({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }, 502);
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
    decision,
    startedAt: Date.now(),
  };

  if (!isStream) {
    const json: unknown = await upstream.json();
    const usage = extractUsage(json);
    trackTurn(pending, usage);
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
    trackTurn(pending, acc.usage);
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
): Promise<Response> {
  const payload = { ...originalBody, messages: withIdentity(messages, endpointModel), model: decision.upstreamModel, stream_options: { include_usage: true } };
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
  const acc = new SseUsageAccumulator();
  return acc.feed(JSON.stringify((json as { usage: unknown }).usage));
}

async function decide(auth: AuthContext, sessionId: string, endpointModel: string, messages: ChatMessage[]): Promise<RouterDecision> {
  if (endpointModel === "theta") {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const text = typeof lastUser?.content === "string" ? lastUser.content : "";
    return routeTheta(text);
  }

  // Session-sticky lock: an active lock pins the workhorse for the whole session
  // (cache commandment #5 — model switch mid-session = prefix cache wipe).
  const lock = await getLock(sessionId, auth.userId);
  if (lock.lockedModel && !lock.stale) {
    const tier = lock.lockedModel.includes("flash") ? "flash" : "full";
    await touchSession(sessionId, auth.userId);
    return {
      provider: "hyper",
      upstreamModel: lock.lockedModel,
      tier,
      effort: "low",
      reason: "session-sticky",
      hardCapped: false,
    };
  }

  // Fresh (or stale) session: decide from signals, then LOCK the result
  const share = await weeklyFullShare(auth.userId);
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastText = typeof lastUser?.content === "string" ? lastUser.content : "";
  const decision = route({
    endpointModel: endpointModel as "glm-5.3" | "qwen-3.8",
    prefixTokens: estimateTokens(messages),
    isNewSession: true,
    fullShareThisWeek: share,
    hardness: classifyHardness(lastText),
  });
  await setLock(sessionId, auth.userId, decision.upstreamModel);
  return decision;
}

async function weeklyFullShare(userId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ total: sql`count(*)`, full: sql`count(*) filter (where routed_to = 'full')` })
    .from(usageLedger)
    .where(and(eq(usageLedger.userId, userId), gte(usageLedger.createdAt, since)));
  const total = Number(rows[0]?.total ?? 0);
  if (total === 0) return 0;
  return Number(rows[0]?.full ?? 0) / total;
}

// Anthropic-compat endpoint (Claude Code / Crush) — full router pipeline
app.route("/", messagesApp);

app.get("/health", (c) => c.json({ ok: true, providers: { agnes: agnesEnabled(), stepfun: stepfunEnabled(), devpass: devpassEnabled() } }));

export default app;