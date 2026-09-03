// YOLO-AUTO provider client — OpenAI-compat backchannel (yolo-auto.com/v1).
// Single model: qwen3.8-27b. Limits (docs + /v1/usage):
//   context_window 131072, model output limit 32768 (per opencode config),
//   BUILDER plan: unlimited requests/day, maxConcurrency 4.
// Docs protocol: honor Retry-After on 429 with jitter; cancel abandoned
// streams promptly; do not submit duplicate work while a request is waiting.
// NOTE: no Idempotency-Key — yolo docs don't define one; sequential clients
// + Retry-After backoff is the documented retry contract.

export const YOLO_BASE = process.env.YOLO_BASE_URL ?? "https://yolo-auto.com/v1";
export const YOLO_MODEL = process.env.YOLO_MODEL ?? "qwen3.8-27b";
export const YOLO_MAX_OUTPUT = 32_768;
/** Input budget: context 131072 − max output 32768 − safety margin 1024. */
export const YOLO_INPUT_BUDGET = 97_280;
/** yolo account concurrency (builder plan). Gateway mirrors as a semaphore. */
export const YOLO_MAX_CONCURRENCY = 4;

let yoloInFlight = 0;
/** True when yolo has a free generation slot (<4 requests in flight). */
export function yoloSlotFree(): boolean {
  return yoloInFlight < YOLO_MAX_CONCURRENCY;
}
function yoloAcquire(): void {
  yoloInFlight++;
}
function yoloRelease(): void {
  yoloInFlight = Math.max(0, yoloInFlight - 1);
}

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

  yoloAcquire();
  try {
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
    return wrapRelease(res);
  } catch (err) {
    yoloRelease();
    throw err;
  }
}

/** Wrap a Response so the yolo slot is released when the body ends/aborts. */
function wrapRelease(res: Response): Response {
  if (!res.body) {
    yoloRelease();
    return res;
  }
  const reader = res.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          yoloRelease();
        } else {
          controller.enqueue(value);
        }
      } catch {
        controller.close();
        yoloRelease();
      }
    },
    cancel() {
      yoloRelease();
    },
  });
  return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
}
