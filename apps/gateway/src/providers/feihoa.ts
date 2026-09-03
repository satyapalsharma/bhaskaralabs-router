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
export const YOLO_MAX_OUTPUT = 32_768;
/** feihoa account concurrency (from /v1/usage). The gateway mirrors this as a
 * semaphore so we never queue a second request onto a busy single slot. */
export const FEIHOA_MAX_CONCURRENCY = 1;

let feihoaInFlight = 0;
/** True when feihoa has a free generation slot (no request in flight). */
export function feihoaSlotFree(): boolean {
  return feihoaInFlight < FEIHOA_MAX_CONCURRENCY;
}
function feihoaAcquire(): void {
  feihoaInFlight++;
}
function feihoaRelease(): void {
  feihoaInFlight = Math.max(0, feihoaInFlight - 1);
}

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

  feihoaAcquire();
  try {
    let res = await call();
    if (res.status === 429) {
      // feihoa is concurrency-1; a 429 means its single slot is busy. The
      // router has a concurrency-4 failover lane (yolo), so waiting out a long
      // Retry-After just stalls the client. Cap the backoff short, then let
      // the router's backchannel failover hop to yolo immediately.
      const ra = Number(res.headers.get("retry-after"));
      const waitMs = Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1500, 2000);
      console.log(`[feihoa] 429 — short backoff ${waitMs}ms, then failover if still busy`);
      await new Promise((r) => setTimeout(r, waitMs));
      res = await call();
    }
    // Release the slot once the response body is fully consumed (streaming)
    // or immediately for non-stream. A wrapped body guarantees release even
    // if the client aborts mid-stream.
    return wrapRelease(res);
  } catch (err) {
    feihoaRelease();
    throw err;
  }
}

/** Wrap a Response so the feihoa slot is released when the body ends/aborts. */
function wrapRelease(res: Response): Response {
  if (!res.body) {
    feihoaRelease();
    return res;
  }
  const reader = res.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          feihoaRelease();
        } else {
          controller.enqueue(value);
        }
      } catch {
        controller.close();
        feihoaRelease();
      }
    },
    cancel() {
      feihoaRelease();
    },
  });
  return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
}
