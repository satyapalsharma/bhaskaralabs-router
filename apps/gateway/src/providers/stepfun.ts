// [BOOTSTRAP] StepFun Step Plan — credit allowance (no tiered RPM/TPM limits per
// docs, verified 2026-09-04); OpenAI-compat. COGS: plan credits amortized.
// Mirror as an 8-slot semaphore — Step Plan has no published concurrency number,
// 8 keeps us well under any plausible admission throttle while allowing parallel
// theta traffic to overlap with stepfun's ~19s latency.

export const STEPFUN_BASE = process.env.STEPFUN_BASE_URL ?? "https://api.stepfun.ai/step_plan/v1";

/** StepFun concurrency cap (user-specified 2026-09-04). */
export const STEPFUN_MAX_CONCURRENCY = 8;

let stepfunInFlight = 0;
/** True when stepfun has a free generation slot (<8 requests in flight). */
export function stepfunSlotFree(): boolean {
  return stepfunInFlight < STEPFUN_MAX_CONCURRENCY;
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
    if (res.status === 401 || res.status === 402) {
      stepfunRelease();
      return res;
    }
    return wrapRelease(res);
  } catch (err) {
    stepfunRelease();
    throw err;
  }
}
