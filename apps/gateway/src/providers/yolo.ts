// YOLO-AUTO provider client — OpenAI-compat backchannel (yolo-auto.com/v1).
// Single model: qwen3.8-27b. Limits (docs + /v1/usage):
//   context_window 131072, model output limit 32768 (per opencode config),
//   FREE plan: 15 requests/day, maxConcurrency 1.
// Docs protocol: honor Retry-After on 429 with jitter; cancel abandoned
// streams promptly; do not submit duplicate work while a request is waiting.
// NOTE: no Idempotency-Key — yolo docs don't define one; sequential clients
// + Retry-After backoff is the documented retry contract.

export const YOLO_BASE = process.env.YOLO_BASE_URL ?? "https://yolo-auto.com/v1";
export const YOLO_MODEL = process.env.YOLO_MODEL ?? "qwen3.8-27b";
export const YOLO_MAX_OUTPUT = 32_768;
/** Input budget: context 131072 − max output 32768 − safety margin 1024. */
export const YOLO_INPUT_BUDGET = 97_280;

export function yoloEnabled(): boolean {
  return Boolean(process.env.YOLO_AUTO_API_KEY);
}

export interface YoloRequest {
  body: unknown; // OpenAI-compat payload, model already set
  apiKey: string;
  signal?: AbortSignal;
}

/**
 * POST to YOLO chat/completions. On 429: honor Retry-After (bounded ≤60s),
 * retry up to twice with ±20% jitter. Returns raw Response (streaming-safe).
 */
export async function yoloChat(req: YoloRequest): Promise<Response> {
  const call = () =>
    fetch(`${YOLO_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`,
      },
      body: JSON.stringify(req.body),
      signal: req.signal,
    });

  let res = await call();
  for (let attempt = 0; attempt < 2 && res.status === 429; attempt++) {
    const ra = Number(res.headers.get("retry-after"));
    const base = Number.isFinite(ra) && ra > 0 ? ra * 1000 : 5000;
    const jitter = base * (0.8 + Math.random() * 0.4); // ±20%
    const waitMs = Math.min(jitter, 60_000);
    console.log(`[yolo] 429 — backing off ${Math.round(waitMs)}ms (attempt ${attempt + 1}/2)`);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await call();
  }
  return res;
}
