// POST /v1/messages — Anthropic-compatible endpoint for Claude Code / Crush.
// Same pipeline as chat.ts: auth → quota → route → dispatch → stream/non-stream
// → sanitize (Anthropic shape: usage.{input,output}_tokens only) → ledger.

import { Hono } from "hono";
import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { authenticate, type AuthContext } from "../lib/auth";
import { estimateTokens, type ChatMessage } from "../lib/prefix";
import { getQuotaState, quotaRejection } from "../lib/quotas";
import { writeLedger } from "../lib/ledger";
import { setQuotaHeaders, setRetryHeaders } from "../lib/quota-headers";
import { pickKeyForSession, hyperMessages } from "../providers/hyper";
import { route, classifyHardness, type RouterDecision } from "../router";

const app = new Hono();

const IDENTITY_LINE =
  "You are served by Bhaskara Labs' smart-routed endpoint. When asked which model you are, state that you are the Bhaskara Labs endpoint for this model family — a smart-routed system.";

interface AnthropicUsage {
  inputTokens: number;
  outputTokens: number;
}

function extractAnthropicUsage(json: unknown): AnthropicUsage | null {
  if (typeof json !== "object" || json === null || !("usage" in json)) return null;
  const usage = (json as { usage: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return null;
  const u = usage as Record<string, unknown>;
  return {
    inputTokens: typeof u.input_tokens === "number" ? u.input_tokens : 0,
    outputTokens: typeof u.output_tokens === "number" ? u.output_tokens : 0,
  };
}

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
function buildAnthropicPayload(body: Record<string, unknown>, decision: RouterDecision, messages: ChatMessage[]): Record<string, unknown> {
  const hasSystem = typeof body.system === "string" && (body.system as string).length > 0;
  const systemText = hasSystem
    ? `${body.system as string}\n\n${IDENTITY_LINE}`
    : IDENTITY_LINE;
  const payload: Record<string, unknown> = { ...body, model: decision.upstreamModel, system: systemText };
  // Convert internal ChatMessage[] back to Anthropic messages shape
  payload.messages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  return payload;
}

function sanitizeAnthropicResponse(json: unknown): unknown {
  if (typeof json !== "object" || json === null) return json;
  const clone = { ...(json as Record<string, unknown>) };
  if (clone.usage && typeof clone.usage === "object") {
    clone.usage = { ...(clone.usage as Record<string, unknown>) };
    delete (clone.usage as Record<string, unknown>).cost;
    delete (clone.usage as Record<string, unknown>).remaining;
  }
  return clone;
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

app.post("/v1/messages", async (c) => {
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
  const endpointModel = typeof obj.model === "string" ? obj.model : "";
  if (!["glm-5.3", "qwen-3.8", "theta"].includes(endpointModel)) {
    return c.json(
      { type: "error", error: { type: "invalid_request_error", message: `model must be one of glm-5.3, qwen-3.8, theta (got '${endpointModel}')` } },
      400,
    );
  }

  const messages = toChatMessages(obj);
  const quota = await getQuotaState(auth.userId, auth.plan);
  const reject = quotaRejection(quota, endpointModel);
  if (reject) {
    setRetryHeaders(c, quota, endpointModel, reject);
    return c.json({ type: "error", error: { type: "quota_exceeded", message: reject } }, 429);
  }
  setQuotaHeaders(c, quota, endpointModel, auth.plan);

  // Route decision — same policy as chat endpoint
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

  const payload = buildAnthropicPayload(obj, decision, messages);
  const keys = (process.env.HYPER_API_KEYS ?? process.env.HYPER_API_KEY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key, i) => ({ id: `hyper-${i}`, key }));
  if (keys.length === 0) {
    return c.json({ type: "error", error: { type: "api_error", message: "Upstream not configured" } }, 502);
  }
  const key = pickKeyForSession(keys, auth.apiKeyId);

  let upstream: Response;
  try {
    upstream = await hyperMessages({ model: decision.upstreamModel, body: payload, apiKey: key.key, signal: AbortSignal.timeout(10 * 60 * 1000) });
  } catch (err) {
    console.error(`[messages dispatch] connection failure:`, (err as Error).message);
    return c.json({ type: "error", error: { type: "api_error", message: `Provider unreachable` } }, 502);
  }

  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    console.error(`[messages upstream] ${upstream.status}: ${errText.slice(0, 300)}`);
    return c.json({ type: "error", error: { type: "api_error", message: `Upstream error ${upstream.status}` } }, 502);
  }

  const isStream = obj.stream === true;

  if (!isStream) {
    const json: unknown = await upstream.json();
    const usage = extractAnthropicUsage(json);
    if (usage) {
      void writeLedger({
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
        sessionId: auth.apiKeyId,
        endpointModel,
        usage: { promptTokens: usage.inputTokens, completionTokens: usage.outputTokens, model: decision.upstreamModel, provider: decision.provider },
        routedTo: decision.tier,
        routerEffort: decision.effort,
        latencyMs: 0,
      }).catch((err) => console.error("[ledger] write failed", err));
    }
    return c.json(sanitizeAnthropicResponse(json));
  }

  // Streaming pass-through (Anthropic SSE shape)
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
});

export default app;