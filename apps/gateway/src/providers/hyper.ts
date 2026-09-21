// Hyper provider client [CORE] — OpenAI-compat + Anthropic-compat, streaming pass-through.
// Hyper = our legitimate CORE provider. Team account, master/sub-keys, NO pooling (ToS).

import { makeShadowRelease, SHADOW_HOLD_MS } from "../lib/shadow-release";
import { laneAcquire, laneWeight, wrapLaneRelease } from "../lib/lane-slot";

export const HYPER_BASE = process.env.HYPER_BASE_URL ?? "https://hyper.charm.land";

export interface HyperKey {
  id: string;
  key: string;
}

// Session→key affinity: consistent hash. For v1, one sub-key; pool manager lands in Phase 2.
export function pickKeyForSession(keys: HyperKey[], sessionId: string): HyperKey {
  let hash = 2166136261;
  for (let i = 0; i < sessionId.length; i++) {
    hash ^= sessionId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return keys[Math.abs(hash) % keys.length];
}

export interface UpstreamRequest {
  model: string; // hyper model id e.g. glm-5.3-flash
  body: unknown; // raw provider payload (already assembled)
  apiKey: string;
  signal?: AbortSignal;
}

/**
 * Lane admission for hyper.
 *
 * Hyper is dispatched outside the DB-fleet path, so it never reached the
 * generic dispatcher's account semaphore and had no concurrency bound at all —
 * every one of the operator key's open turns could land on it simultaneously.
 * That is how a lane whose p90 generation is ~98s ends up being handed more
 * work than it can drain, and why its long turns were arriving as 226s
 * outliers. The budget lives in lib/lane-slot with the other lanes; this
 * function is what takes it.
 *
 * `laneFree` is checked by the caller before dispatch (a saturated lane is
 * skipped in favour of the next rung), so this acquire is enforcement, not the
 * decision. Returns the release pair the body wrapper needs: a normal finish
 * releases immediately, an abort shadow-holds for the zombie's estimated
 * remaining generation.
 */
function hyperLaneAcquire(body: unknown): [() => void, () => void] {
  const maxTokens =
    typeof body === "object" && body !== null && typeof (body as { max_tokens?: unknown }).max_tokens === "number"
      ? (body as { max_tokens: number }).max_tokens
      : undefined;
  const releaseLane = laneAcquire("hyper", laneWeight(maxTokens));
  return makeShadowRelease(releaseLane, SHADOW_HOLD_MS.hyper ?? 15_000, "hyper");
}

/** POST to Hyper, return raw Response for streaming pass-through. Never buffers. */
export async function hyperChat(req: UpstreamRequest): Promise<Response> {
  const [release, shadowRelease] = hyperLaneAcquire(req.body);
  try {
    const res = await fetch(`${HYPER_BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify(req.body),
      signal: req.signal,
    });
    return wrapLaneRelease(res, release, shadowRelease);
  } catch (err) {
    shadowRelease();
    throw err;
  }
}

/** Anthropic-compat variant for Claude Code / Crush clients.
 * Lane-slot accounting is identical to hyperChat: the /v1/messages route
 * occupies the same provider concurrency, and a dispatch that skipped the
 * acquire would make the mirror undercount exactly the traffic that route
 * carries. */
export async function hyperMessages(req: UpstreamRequest): Promise<Response> {
  const [release, shadowRelease] = hyperLaneAcquire(req.body);
  try {
    const res = await fetch(`${HYPER_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": req.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
      signal: req.signal,
    });
    return wrapLaneRelease(res, release, shadowRelease);
  } catch (err) {
    shadowRelease();
    throw err;
  }
}

interface RawUsage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  cost?: { hypercredits?: number };
  remaining?: { hypercredits?: number };
  // Camel Stream metered fields
  cost_details?: { upstream_inference_cost?: number };
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

export function readRawUsage(u: RawUsage) {
  return {
    promptTokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0,
    completionTokens: typeof u.completion_tokens === "number" ? u.completion_tokens : 0,
    cachedTokens: u.prompt_tokens_details?.cached_tokens,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
    hypercredits: u.cost?.hypercredits,
    camelCostUsd: u.cost_details?.upstream_inference_cost,
    remaining: u.remaining?.hypercredits,
  };
}

export interface HyperUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  hypercredits?: number;
  camelCostUsd?: number; // Camel Stream: usage.cost_details.upstream_inference_cost
  remaining?: number;
}

/** Parse usage from a completed (non-stream) JSON response. */
export function parseUsageNonStream(json: unknown): HyperUsage {
  const usage =
    typeof json === "object" && json !== null && "usage" in json
      ? (json as { usage: unknown }).usage
      : {};
  const u: RawUsage = typeof usage === "object" && usage !== null ? (usage as RawUsage) : {};
  return readRawUsage(u);
}

/** Accumulate usage from OpenAI-style SSE chunks (with stream_options.include_usage).
 * Also counts streamed content chars — zero-content completions feed the
 * escalation empty-output streak.
 *
 * Tool calls are tracked separately because they do not arrive as content:
 * OpenAI streams them as `delta.tool_calls[]`, leaving `contentChars` at 0 for
 * a turn that is doing exactly what a coding agent should. Reading only
 * contentChars made every tool-calling turn look like an empty response. */
export class SseUsageAccumulator {
  usage: HyperUsage | null = null;
  contentChars = 0;
  /** True once any chunk carried a non-empty `delta.tool_calls`. */
  hasToolCalls = false;

  /** Returns parsed usage when a chunk carries it; else null. Call with every data line. */
  feed(sseData: string): HyperUsage | null {
    try {
      const parsed: unknown = JSON.parse(sseData);
      if (parsed && typeof parsed === "object" && "usage" in parsed) {
        const chunk = parsed as { usage: unknown };
        if (chunk.usage && typeof chunk.usage === "object") {
          this.usage = readRawUsage(chunk.usage as RawUsage);
          return this.usage;
        }
      }
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { choices?: unknown }).choices)) {
        const delta = (parsed as { choices: Array<{ delta?: { content?: unknown; tool_calls?: unknown } }> }).choices[0]
          ?.delta;
        if (typeof delta?.content === "string") this.contentChars += delta.content.length;
        if (Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0) this.hasToolCalls = true;
      }
    } catch {
      // non-JSON line, ignore
    }
    return null;
  }
}

// ── Retry/backoff for 429/5xx (non-streaming calls only; streaming retries are client's job) ──
function backoff(attempt: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  const ms = 500 * 2 ** attempt + Math.random() * 250;
  setTimeout(resolve, ms);
  return promise;
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, max = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < max; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number }).status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);
      if (!retryable) throw e;
      await backoff(attempt);
    }
  }
  throw lastErr;
}