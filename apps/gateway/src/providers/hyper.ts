// Hyper provider client [CORE] — OpenAI-compat + Anthropic-compat, streaming pass-through.
// Hyper = our legitimate CORE provider. Team account, master/sub-keys, NO pooling (ToS).

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

/** POST to Hyper, return raw Response for streaming pass-through. Never buffers. */
export async function hyperChat(req: UpstreamRequest): Promise<Response> {
  return fetch(`${HYPER_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.apiKey}`,
    },
    body: JSON.stringify(req.body),
    signal: req.signal,
  });
}

/** Anthropic-compat variant for Claude Code / Crush clients. */
export async function hyperMessages(req: UpstreamRequest): Promise<Response> {
  return fetch(`${HYPER_BASE}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": req.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(req.body),
    signal: req.signal,
  });
}

interface RawUsage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
  cost?: { hypercredits?: number };
  remaining?: { hypercredits?: number };
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" ? value : fallback;
}

function readRawUsage(u: RawUsage) {
  return {
    promptTokens: typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0,
    completionTokens: typeof u.completion_tokens === "number" ? u.completion_tokens : 0,
    cachedTokens: u.prompt_tokens_details?.cached_tokens,
    reasoningTokens: u.completion_tokens_details?.reasoning_tokens,
    hypercredits: u.cost?.hypercredits,
    remaining: u.remaining?.hypercredits,
  };
}

export interface HyperUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  hypercredits?: number;
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
 * escalation empty-output streak. */
export class SseUsageAccumulator {
  usage: HyperUsage | null = null;
  contentChars = 0;

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
        const delta = (parsed as { choices: Array<{ delta?: { content?: unknown } }> }).choices[0]?.delta?.content;
        if (typeof delta === "string") this.contentChars += delta.length;
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