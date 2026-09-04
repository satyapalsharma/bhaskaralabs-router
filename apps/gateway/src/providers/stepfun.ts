// [BOOTSTRAP] StepFun Step Plan — credit allowance per docs; OpenAI-compat.
// COGS: plan credits amortized.
//
// Concurrency: SERVER-ENFORCED limit 8 ("concurrency reached, current: 9,
// limit: 8" observed live 2026-09-04 at 429). Mirror at 6, not 8 — running at
// exactly the server limit leaves zero headroom for the retry burst after a
// failover, which is how we hit current:9. Non-2xx releases the slot
// immediately (the request is dead upstream; holding the slot only starves
// the retry).

export const STEPFUN_BASE = process.env.STEPFUN_BASE_URL ?? "https://api.stepfun.ai/step_plan/v1";

/** StepFun concurrency cap — server limit is 8; mirror at 6 for headroom. */
export const STEPFUN_MAX_CONCURRENCY = 6;

let stepfunInFlight = 0;

/** 429 throttle: server said concurrency-full. Cool the lane briefly so the
 *  failover retry lands on yolo/hyper instead of hammering stepfun again
 *  (observed 317 429s vs 259 served = 122% waste, 2026-09-04). */
let throttleUntil = 0;
/** True when stepfun has a free generation slot AND isn't in 429 cooldown. */
export function stepfunSlotFree(): boolean {
  return stepfunInFlight < STEPFUN_MAX_CONCURRENCY && Date.now() >= throttleUntil;
}
export function markStepfunThrottled(seconds = 20): void {
  throttleUntil = Date.now() + seconds * 1000;
}
function stepfunAcquire(): void {
  stepfunInFlight++;
}
function stepfunRelease(): void {
  stepfunInFlight = Math.max(0, stepfunInFlight - 1);
}

export function stepfunEnabled(): boolean {
  return !!process.env.STEPFUN_API_KEY;
}

/** Wrap a Response so the stepfun slot is released when the body ends/aborts. */
function wrapRelease(res: Response): Response {
  if (!res.body) {
    stepfunRelease();
    return res;
  }
  const body = res.body.tee();
  const tracked = body[0];
  void tracked.cancel().catch(() => {});
  const reader = body[1].getReader();
  const passthrough = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          stepfunRelease();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        stepfunRelease();
        controller.error(err);
      }
    },
    cancel(reason) {
      stepfunRelease();
      return reader.cancel(reason);
    },
  });
  return new Response(passthrough, { status: res.status, headers: res.headers });
}

export async function stepfunChat(opts: {
  model: string; // step-3.7-flash
  body: unknown;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Response> {
  stepfunAcquire();
  try {
    const res = await fetch(`${STEPFUN_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
    if (!res.ok) {
      // 429/5xx/4xx — request is dead upstream; release NOW. Holding the slot
      // until body-consume starves the failover retry (observed: retry burst
      // at full mirror → server "current: 9, limit: 8" → more 429s).
      stepfunRelease();
      return res;
    }
    return wrapRelease(res);
  } catch (err) {
    stepfunRelease();
    throw err;
  }
}
