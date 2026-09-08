// LLMGateway provider (api.llmgateway.io) — the paid fallback lane behind Hyper.
// Same model ids as Hyper (qwen3.8-max/27b/flash, glm-5.3/flash), OpenAI-compat.
// DevPass flat-rate plan: no per-token COGS from our side (allowance burn tracked
// in ledger usage); NO upstream prompt caching (verified live 2026-09-04: cached=0
// on repeated identical prefixes) — so this lane is a fallback, never a cache-sticky
// primary. Latency measured: qwen3.8-27b ~13s, max ~3s non-stream.

export const LLMGATEWAY_BASE = process.env.LLMGATEWAY_BASE_URL ?? "https://api.llmgateway.io/v1";

export function llmGatewayEnabled(): boolean {
  return !!process.env.LLMGATEWAY_API_KEY;
}

export interface LlmGatewayChatOpts {
  model: string;
  body: Record<string, unknown>;
  apiKey: string;
  signal?: AbortSignal;
}

/** POST to LLMGateway chat/completions; returns raw Response for streaming pass-through. */
export async function llmGatewayChat(opts: LlmGatewayChatOpts): Promise<Response> {
  return fetch(`${LLMGATEWAY_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({ ...opts.body, model: opts.model }),
    signal: opts.signal,
  });
}

/** Anthropic-compat variant for Claude Code / Crush clients (verified live:
 *  api.llmgateway.io/v1/messages returns Anthropic-format messages). */
export async function llmGatewayMessages(opts: LlmGatewayChatOpts): Promise<Response> {
  return fetch(`${LLMGATEWAY_BASE}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": opts.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ ...opts.body, model: opts.model }),
    signal: opts.signal,
  });
}
