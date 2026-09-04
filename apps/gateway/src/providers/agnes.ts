// [BOOTSTRAP] Agnes — flat-plan bootstrap lane (theta chain).
// Verified live 2026-09-04: base https://apihub.agnes-ai.com/v1, Bearer auth.
// Per-request COGS = 0 (flat plan); ledger tracks request count.
// Key rotated 2026-09-05 (cpk-WvNL..., renewed subscription): plan
// concurrency is 10 — verified by user from the Agnes dashboard.

export const AGNES_BASE = process.env.AGNES_BASE_URL ?? "https://apihub.agnes-ai.com/v1";

/** Agnes concurrency cap — new paid plan allows 10 concurrent. */
export const AGNES_MAX_CONCURRENCY = 10;

let agnesInFlight = 0;
/** True when agnes has a free generation slot (<4 requests in flight). */
export function agnesSlotFree(): boolean {
  return agnesInFlight < AGNES_MAX_CONCURRENCY;
}
function agnesAcquire(): void {
  agnesInFlight++;
}
function agnesRelease(): void {
  agnesInFlight = Math.max(0, agnesInFlight - 1);
}

/** Dead-lane cooldown: 401/402 means the key/subscription is dead —
 *  retrying every turn wastes a round-trip. Subscription-level deaths
 *  (402 subscription_not_found / 401 invalid token on every model) don't
 *  heal in minutes, so cool for 6h; a transient 401 would still retry
 *  within the same workday. */
let deadUntil = 0;
export function agnesEnabled(): boolean {
  return !!process.env.AGNES_API_KEY && Date.now() >= deadUntil;
}
export function markAgnesDead(): void {
  deadUntil = Date.now() + 6 * 60 * 60 * 1000;
}
/** Wrap a Response so the agnes slot is released when the body ends/aborts. */
function wrapRelease(res: Response): Response {
  if (!res.body) {
    agnesRelease();
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
          agnesRelease();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        agnesRelease();
        controller.error(err);
      }
    },
    cancel(reason) {
      agnesRelease();
      return reader.cancel(reason);
    },
  });
  return new Response(passthrough, { status: res.status, headers: res.headers });
}

export async function agnesChat(opts: {
  model: string; // e.g. agnes-2.5-flash
  body: unknown;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Response> {
  agnesAcquire();
  try {
    const res = await fetch(`${AGNES_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify(opts.body),
      signal: opts.signal,
    });
    if (res.status === 402 || res.status === 401) {
      // Dead subscription/invalid key — release immediately; body is an error JSON.
      agnesRelease();
      return res;
    }
    return wrapRelease(res);
  } catch (err) {
    agnesRelease();
    throw err;
  }
}
