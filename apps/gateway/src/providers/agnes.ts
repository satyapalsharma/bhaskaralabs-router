// [BOOTSTRAP] Agnes — flat-plan bootstrap lane (theta chain).
// Verified live 2026-09-04: base https://apihub.agnes-ai.com/v1, Bearer auth.
// Per-request COGS = 0 (flat plan); ledger tracks request count.
// Key rotated 2026-09-05 (cpk-WvNL..., renewed subscription): plan
// concurrency is 10 — verified by user from the Agnes dashboard.

import { makeShadowRelease, SHADOW_HOLD_MS } from "../lib/shadow-release";
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

/** Dead-lane cooldown with EXPONENTIAL backoff + self-healing.
 *  A single 401/402 is often transient (plan quota blip, provider restart);
 *  a hard 6h cooldown on the first failure silenced a healthy lane for
 *  50+ minutes today (381 successful turns, one error, lane off until a
 *  gateway restart cleared it). Backoff: 5min → 15min → 45min → 2h cap,
 *  reset instantly when any agnes response comes back 2xx. */
let deadUntil = 0;
let deadStreak = 0;
export function agnesEnabled(): boolean {
  return !!process.env.AGNES_API_KEY && Date.now() >= deadUntil;
}
export function markAgnesDead(): void {
  deadStreak++;
  const base = 5 * 60 * 1000;
  const cooldown = Math.min(base * Math.pow(3, deadStreak - 1), 2 * 60 * 60 * 1000);
  deadUntil = Date.now() + cooldown;
  console.log(`[agnes] marked dead (streak ${deadStreak}) — cooling ${Math.round(cooldown / 60000)}min`);
}
/** Any successful response proves the lane is alive — clear the streak. */
function agnesAlive(): void {
  if (deadStreak > 0 || deadUntil > Date.now()) {
    deadStreak = 0;
    deadUntil = 0;
    console.log("[agnes] recovered — cooldown cleared after 2xx response");
  }
}
/** Wrap a Response so the agnes slot is released when the body ends;
 *  an ABORT shadow-holds for the server-side zombie (lib/shadow-release). */
function wrapRelease(res: Response): Response {
  if (!res.body) {
    agnesRelease();
    return res;
  }
  const [release, shadowRelease] = makeShadowRelease(agnesRelease, SHADOW_HOLD_MS.agnes, "agnes");
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
          release();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        release();
        controller.error(err);
      }
    },
    cancel(reason) {
      shadowRelease();
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
    if (res.ok) agnesAlive(); // 2xx proves the lane is healthy — clear cooldown streak
    return wrapRelease(res);
  } catch (err) {
    agnesRelease();
    throw err;
  }
}
