import { syncYoloPressureFromHeaders } from "../lib/yolo-pressure";
import { makeShadowRelease, SHADOW_HOLD_MS } from "../lib/shadow-release";
// Backchannel failover lane: qwen3.8-27b @ yolo-auto.com (Builder plan).
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
/** Wedge cooldown: a TTFT abort/connection death means the lane is silently
 *  wedged (pressure exhaustion gives NO 429/headers — requests just hang).
 *  Cool the lane 10 min so dispatches skip it instead of burning the
 *  25s ceiling per turn. Pressure tracker may re-admit earlier if the
 *  window drains; the cooldown is the hard floor. */
let wedgedUntil = 0;
/** True when yolo has a free generation slot AND isn't in wedge cooldown. */
export function yoloSlotFree(): boolean {
  return yoloInFlight < YOLO_MAX_CONCURRENCY && Date.now() >= wedgedUntil;
}
export function markYoloWedged(cooldownMs = 10 * 60 * 1000): void {
  wedgedUntil = Date.now() + cooldownMs;
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
    // Server pressure sync: yolo reports EXACT remaining on every response
    // (x-yolo-pressure-remaining-1h/24h) — authoritative for the tracker.
    syncYoloPressureFromHeaders({
      remaining1h: parsePressureHeader(res.headers, "x-yolo-pressure-remaining-1h"),
      remaining24h: parsePressureHeader(res.headers, "x-yolo-pressure-remaining-24h"),
    });
    return wrapRelease(res);
  } catch (err) {
    yoloRelease();
    // TTFT-ceiling abort or connection death: the lane is likely wedged
    // (pressure exhaustion wedges silently — no 429, no headers). Cool the
    // lane for 10 min so fresh dispatches skip yolo instead of burning a
    // 25s ceiling per turn (observed: 6h+ wedges).
    markYoloWedged();
    throw err;
  }
}

/** Wrap a Response so the yolo slot is released when the body ends;
 *  an ABORT shadow-holds for the server-side zombie (lib/shadow-release). */
function wrapRelease(res: Response): Response {
  if (!res.body) {
    yoloRelease();
    return res;
  }
  const [release, shadowRelease] = makeShadowRelease(yoloRelease, SHADOW_HOLD_MS.yolo, "yolo");
  const reader = res.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          release();
        } else {
          controller.enqueue(value);
        }
      } catch {
        controller.close();
        release();
      }
    },
    cancel(reason) {
      shadowRelease();
      return reader.cancel(reason);
    },
  });
  return new Response(stream, { status: res.status, statusText: res.statusText, headers: res.headers });
}

/** Parse a yolo pressure header (numeric string) → number | null. */
function parsePressureHeader(h: Headers, name: string): number | null {
  const v = Number(h.get(name));
  return Number.isFinite(v) && v >= 0 ? v : null;
}
