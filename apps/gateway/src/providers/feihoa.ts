// FEIHOA provider client — OpenAI-compat backchannel (api.feihoa.com/v1).
// Single model: Qwen3.8-27B-Uncensored. HARD limits (from /v1/models):
//   context_window 32768 (input), max_output_tokens 4096.
// Docs protocol: sequential requests, honor Retry-After, reuse the same
// Idempotency-Key when retrying. Streaming built in.

export const FEIHOA_BASE = process.env.FEIHOA_BASE_URL ?? "https://api.feihoa.com/v1";
export const FEIHOA_MODEL = process.env.FEIHOA_MODEL ?? "Qwen3.8-27B-Uncensored";
export const FEIHOA_MAX_OUTPUT = 4096;
/** Input budget: context 32768 − max output 4096 − safety margin 1024. */
export const FEIHOA_INPUT_BUDGET = 27_648;

export function feihoaEnabled(): boolean {
  return Boolean(process.env.FEIHOA_API_KEY);
}

export interface FeihoaRequest {
  body: unknown; // OpenAI-compat payload, model already set
  apiKey: string;
  /** Stable across retries of the same logical turn (docs: reuse on retry). */
  idempotencyKey: string;
  signal?: AbortSignal;
}

/**
 * POST to FEIHOA chat/completions. On 429: honor Retry-After (bounded ≤60s),
 * retry once with the SAME Idempotency-Key. Returns raw Response for
 * streaming pass-through.
 */
export async function feihoaChat(req: FeihoaRequest): Promise<Response> {
  const call = () =>
    fetch(`${FEIHOA_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`,
        "Idempotency-Key": req.idempotencyKey,
      },
      body: JSON.stringify(req.body),
      signal: req.signal,
    });

  let res = await call();
  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after"));
    const waitMs = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5000, 60_000);
    console.log(`[feihoa] 429 — backing off ${waitMs}ms, retrying same Idempotency-Key`);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await call();
  }
  return res;
}
