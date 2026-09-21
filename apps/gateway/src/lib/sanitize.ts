// Response sanitization — WHITELIST, not blacklist.
// The gateway is a privacy + margin layer: users must see ONLY the endpoint
// model they requested and standard token accounting. Upstream provider
// identity (model ids, build fingerprints, internal cost/remaining meters,
// routing metadata) must never reach the client. A blacklist misses unknown
// upstream fields (e.g. a provider's system_fingerprint build id); a whitelist
// drops everything we don't explicitly forward.

const OPENAI_TOP = new Set(["id", "object", "created", "model", "choices", "usage"]);
// `delta` belongs here, and its absence was not a missing feature — a streamed
// choice carries its payload in `delta`, not `message`, so whitelisting only
// `message` stripped every content fragment from every chunk. The stream still
// framed correctly, still ended with [DONE], and still reported usage: it just
// carried nothing. Clients saw an empty answer, and nothing in the gateway's own
// accounting noticed, because the usage tap reads the raw upstream bytes before
// this function runs.
const OPENAI_CHOICE = new Set(["index", "message", "delta", "finish_reason"]);
const OPENAI_MESSAGE = new Set(["role", "content", "tool_calls", "reasoning_content", "reasoning"]);
const OPENAI_USAGE = new Set([
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "prompt_tokens_details",
  "completion_tokens_details",
]);
const OPENAI_USAGE_DETAILS = new Set(["cached_tokens", "reasoning_tokens", "audio_tokens", "image_tokens"]);

function pick(obj: Record<string, unknown>, keys: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

function sanitizeUsage(u: unknown): Record<string, unknown> {
  if (typeof u !== "object" || u === null) return {};
  const usage = pick(u as Record<string, unknown>, OPENAI_USAGE);
  for (const d of ["prompt_tokens_details", "completion_tokens_details"] as const) {
    if (usage[d] && typeof usage[d] === "object") {
      usage[d] = pick(usage[d] as Record<string, unknown>, OPENAI_USAGE_DETAILS);
    }
  }
  return usage;
}

/**
 * Keep the model's thinking under one canonical name.
 *
 * Providers disagree on the field: DeepSeek-derived servers use
 * `reasoning_content`, Electron Hub uses `reasoning`, and the whitelist above
 * kept only the first. Dropping `reasoning` is silent — the turn still answers,
 * it just arrives shorn of its reasoning, and nothing in the response says so.
 * Renaming rather than forwarding keeps the gateway's contract to clients at
 * one field name instead of leaking whichever shape the upstream chose.
 */
function normalizeReasoning(msg: Record<string, unknown>): void {
  if (msg.reasoning_content === undefined && typeof msg.reasoning === "string") {
    msg.reasoning_content = msg.reasoning;
  }
  delete msg.reasoning;
}

/** OpenAI chat-completion (non-stream) response. */
export function sanitizeOpenAiResponse(json: unknown, endpointModel: string): unknown {
  if (typeof json !== "object" || json === null) return json;
  const top = pick(json as Record<string, unknown>, OPENAI_TOP);
  top.model = endpointModel; // user sees the endpoint they requested, never the upstream
  if (Array.isArray(top.choices)) {
    top.choices = (top.choices as Array<Record<string, unknown>>).map((ch) => {
      const choice = pick(ch, OPENAI_CHOICE);
      // A non-streaming choice carries `message`; a streaming one carries
      // `delta`. They hold the same fields, so they get the same whitelist —
      // and the same reasoning rename.
      for (const key of ["message", "delta"] as const) {
        const container = choice[key];
        if (container && typeof container === "object") {
          const picked = pick(container as Record<string, unknown>, OPENAI_MESSAGE);
          normalizeReasoning(picked);
          choice[key] = picked;
        }
      }
      return choice;
    });
  }
  if (top.usage && typeof top.usage === "object") top.usage = sanitizeUsage(top.usage);
  return top;
}

/** OpenAI SSE chunk. Returns "__DROP__" for usage-only chunks (internal). */
export function sanitizeOpenAiChunk(data: string, endpointModel: string): string {
  try {
    const chunk: unknown = JSON.parse(data);
    if (typeof chunk !== "object" || chunk === null) return data;
    const c = chunk as Record<string, unknown>;
    const hasEmptyChoices = Array.isArray(c.choices) && c.choices.length === 0;
    if (c.usage && hasEmptyChoices) return "__DROP__"; // usage-only chunk — never forward
    return JSON.stringify(sanitizeOpenAiResponse(chunk, endpointModel));
  } catch {
    return data;
  }
}

const ANTHROPIC_TOP = new Set([
  "id",
  "type",
  "role",
  "model",
  "content",
  "stop_reason",
  "stop_sequence",
  "usage",
]);
const ANTHROPIC_USAGE = new Set([
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
]);
const ANTHROPIC_BLOCK = new Set(["type", "text", "id", "name", "input", "citations"]);

/** Anthropic messages (non-stream) response. */
export function sanitizeAnthropicResponse(json: unknown, endpointModel: string): unknown {
  if (typeof json !== "object" || json === null) return json;
  const top = pick(json as Record<string, unknown>, ANTHROPIC_TOP);
  top.model = endpointModel;
  if (Array.isArray(top.content)) {
    top.content = (top.content as Array<Record<string, unknown>>).map((b) => pick(b, ANTHROPIC_BLOCK));
  }
  if (top.usage && typeof top.usage === "object") {
    top.usage = pick(top.usage as Record<string, unknown>, ANTHROPIC_USAGE);
  }
  return top;
}

/** Anthropic SSE event. Rewrites model on message/message_delta, keeps delta/text. */
export function sanitizeAnthropicChunk(data: string, endpointModel: string): string {
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) return data;
    const p = parsed as Record<string, unknown>;
    if (typeof p.model === "string") p.model = endpointModel;
    if (p.message && typeof p.message === "object") {
      const msg = p.message as Record<string, unknown>;
      if (typeof msg.model === "string") msg.model = endpointModel;
    }
    return JSON.stringify(p);
  } catch {
    return data;
  }
}
