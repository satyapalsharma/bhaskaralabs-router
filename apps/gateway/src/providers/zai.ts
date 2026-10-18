// Z.AI GLM Coding Plan lane — the flat fallback behind Hyper on the theta
// chain (operator plan, 2026-10-18). Coding-plan keys are SEPARATE product
// keys from the standard model API (docs.z.ai/devpack/quick-start: the three
// key types are not interchangeable) and ride the DEDICATED coding endpoint:
//   OpenAI chat completions: https://api.z.ai/api/coding/paas/v4
//   Anthropic messages:     https://api.z.ai/api/anthropic
// The standard endpoint (api/paas/v4) bills pay-as-you-go balance and answers
// 1113 "Insufficient balance" for a coding-plan key that strays there. Plan
// usage is prepaid — the ledger rate card is 0/0, real cost is the sub fee.

import { makeShadowRelease, SHADOW_HOLD_MS } from "../lib/shadow-release";
import { laneAcquire, costOnLane, wrapLaneRelease } from "../lib/lane-slot";

export const ZAI_BASE = process.env.ZAI_BASE_URL ?? "https://api.z.ai/api/coding/paas/v4";

export function zaiEnabled(): boolean {
  return !!process.env.ZAI_API_KEY;
}

export interface ZaiChatOpts {
  model: string;
  body: Record<string, unknown>;
  apiKey: string;
  signal?: AbortSignal;
}

/**
 * Lane admission: request-counted (LANE_COUNTS_REQUESTS — the coding plan's
 * own limit is concurrent requests, and the real ceiling has not been probed
 * yet; the default budget of 5 is conservative until then). Release rides
 * the response body exactly like hyper's dispatch.
 */
function zaiLaneAcquire(body: unknown): [() => void, () => void] {
  const maxTokens =
    typeof body === "object" && body !== null && typeof (body as { max_tokens?: unknown }).max_tokens === "number"
      ? (body as { max_tokens: number }).max_tokens
      : undefined;
  const releaseLane = laneAcquire("zai", costOnLane("zai", maxTokens));
  return makeShadowRelease(releaseLane, SHADOW_HOLD_MS.zai ?? 15_000, "zai");
}

/** POST to Z.AI coding chat/completions; raw streaming pass-through. */
export async function zaiChat(opts: ZaiChatOpts): Promise<Response> {
  const [release, shadowRelease] = zaiLaneAcquire(opts.body);
  try {
    const res = await fetch(`${ZAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({ ...opts.body, model: opts.model }),
      signal: opts.signal,
    });
    return wrapLaneRelease(res, release, shadowRelease);
  } catch (err) {
    shadowRelease();
    throw err;
  }
}

// Account-level dead-mark. 1113 "Insufficient balance or no resource package"
// is the plan refusing (or a standard key with no coding entitlement), not a
// momentary throttle — without a dead-mark every flash turn pays a doomed
// round trip before the walk moves on. Streak-backed like hyper's: repeated
// refusals lengthen the cooldown, any 2xx clears it.
let deadStreak = 0;
let deadUntil = 0;

export function markZaiDead(overrideMs?: number): void {
  deadStreak++;
  const base = 10 * 60_000;
  const backoff = Math.min(base * Math.pow(2, deadStreak - 1), 2 * 60 * 60_000);
  const cooldown = overrideMs && overrideMs > 0 ? overrideMs : backoff;
  deadUntil = Date.now() + cooldown;
  console.log(JSON.stringify({ ev: "zai-cooldown", streak: deadStreak, cooldownSec: Math.round(cooldown / 1000), source: overrideMs ? "provider-reset" : "backoff" }));
}

/** A 2xx proves the key carries the plan — clear the streak. */
export function zaiAccountAlive(): void {
  deadStreak = 0;
  deadUntil = 0;
}

/** False while the plan is refusing (1113 / auth), independent of lane slots. */
export function zaiAlive(): boolean {
  return Date.now() >= deadUntil;
}
