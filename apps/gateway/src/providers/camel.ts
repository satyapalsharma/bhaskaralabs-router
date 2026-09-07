// Camel Stream provider (stream.camelai.com) — theta chain, FIRST lane.
// Plan verified live 2026-09-07: model "auto" (routes to gpt-5.6-luna and
// similar), 262K context, plan concurrency 1, OpenAI-compat with SSE +
// include_usage + cached_tokens. Usage carries cost/cost_details — the
// gateway's sanitize layer strips them from user responses (as with Hyper).
// Per-request COGS: usage.cost_details.upstream_inference_cost (metered,
// tiny — logged into ledger via providerMeta).

import { makeShadowRelease, SHADOW_HOLD_MS } from "../lib/shadow-release";

export const CAMEL_BASE = process.env.CAMEL_BASE_URL ?? "https://stream.camelai.com/v1";

/** Camel plan concurrency = 1 (user-verified from plan purchase). */
export const CAMEL_MAX_CONCURRENCY = 1;

let camelInFlight = 0;
/** True when camel has a free generation slot. */
export function camelSlotFree(): boolean {
  return camelInFlight < CAMEL_MAX_CONCURRENCY;
}
function camelAcquire(): void {
  camelInFlight++;
}
function camelRelease(): void {
  camelInFlight = Math.max(0, camelInFlight - 1);
}

/** Dead-lane cooldown with exponential backoff + self-healing (agnes pattern).
 *  401/402/403 (plan quota/key) marks the lane dead; backoff 5m → 15m → 45m
 *  → 2h cap, reset instantly on any 2xx. */
let deadUntil = 0;
let deadStreak = 0;
export function camelEnabled(): boolean {
  return !!process.env.CAMEL_API_KEY && Date.now() >= deadUntil;
}
export function markCamelDead(): void {
  deadStreak++;
  const base = 5 * 60 * 1000;
  const cooldown = Math.min(base * Math.pow(3, deadStreak - 1), 2 * 60 * 60 * 1000);
  deadUntil = Date.now() + cooldown;
  console.log(`[camel] marked dead (streak ${deadStreak}) — cooling ${Math.round(cooldown / 60000)}min`);
}
function camelAlive(): void {
  if (deadStreak > 0 || deadUntil > Date.now()) {
    deadStreak = 0;
    deadUntil = 0;
    console.log("[camel] recovered — cooldown cleared after 2xx response");
  }
}

/** Wrap a Response so the camel slot releases when the body ends; an ABORT
 *  shadow-holds for the server-side zombie (lib/shadow-release). */
function wrapRelease(res: Response): Response {
  if (!res.body) {
    camelRelease();
    return res;
  }
  const [release, shadowRelease] = makeShadowRelease(camelRelease, SHADOW_HOLD_MS.camel, "camel");
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

export async function camelChat(opts: {
  model: string; // "auto" — Camel's router picks the actual model
  body: Record<string, unknown>;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Response> {
  camelAcquire();
  try {
    const res = await fetch(`${CAMEL_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({ ...opts.body, model: opts.model }),
      signal: opts.signal,
    });
    if (res.status === 401 || res.status === 402 || res.status === 403) {
      // Dead plan/invalid key — release immediately; body is error JSON.
      camelRelease();
      markCamelDead();
      return res;
    }
    if (res.ok) camelAlive();
    return wrapRelease(res);
  } catch (err) {
    camelRelease();
    throw err;
  }
}