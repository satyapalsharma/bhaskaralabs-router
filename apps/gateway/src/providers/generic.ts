// Generic OpenAI/Anthropic-compatible dispatcher for DB-registered providers
// (admin panel fleet). Hardcoded providers (hyper/feihoa/yolo/...) keep their
// specialized modules; anything added via the admin panel flows through here.
//
// Concurrency limiting: per-account in-process semaphore honoring the
// account's limits.maxConcurrent; 429s apply an escalating cooldown via
// upstream-config.markAccountCooldown so rotation moves to sibling accounts.

import type { UpstreamAccount, UpstreamProviderConfig } from "../lib/upstream-config";
import { markAccountCooldown, clearAccountCooldown } from "../lib/upstream-config";
import { makeShadowRelease, SHADOW_HOLD_MS } from "../lib/shadow-release";

const inflight = new Map<string, number>();

function slotFree(accountId: string, max: number): boolean {
  return (inflight.get(accountId) ?? 0) < max;
}
function acquire(accountId: string): void {
  inflight.set(accountId, (inflight.get(accountId) ?? 0) + 1);
}
function release(accountId: string): void {
  inflight.set(accountId, Math.max(0, (inflight.get(accountId) ?? 1) - 1));
}

export interface GenericChatOpts {
  provider: UpstreamProviderConfig;
  account: UpstreamAccount;
  modelId: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
}

/** Per-account concurrency gate for the router (DB limits.maxConcurrent). */
export function accountSlotFreeFor(account: UpstreamAccount): boolean {
  return slotFree(account.id, account.limits?.maxConcurrent ?? 4);
}

/** Dispatch a chat completion to a DB-registered provider account. */
export async function genericChat(opts: GenericChatOpts): Promise<Response> {
  const { provider, account, modelId } = opts;
  acquire(account.id);
  const [releaseNow, shadowRelease] = makeShadowRelease(
    () => release(account.id),
    SHADOW_HOLD_MS[provider.id] ?? 15_000,
    provider.id,
  );
  try {
    const url = provider.protocol === "anthropic" ? `${provider.baseUrl}/messages` : `${provider.baseUrl}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (provider.protocol === "anthropic") {
      headers["anthropic-version"] = "2023-06-01";
      if (provider.authStyle === "x-api-key") headers["x-api-key"] = account.apiKey;
      else headers["Authorization"] = `Bearer ${account.apiKey}`;
    } else {
      if (provider.authStyle === "x-api-key") headers["x-api-key"] = account.apiKey;
      else headers["Authorization"] = `Bearer ${account.apiKey}`;
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ ...opts.body, model: modelId }),
      signal: opts.signal,
    });
    if (res.status === 429 || res.status === 401 || res.status === 402) {
      // Dead/throttled account: rotate to siblings via cooldown (5min for 429,
      // 30min for auth/billing failures — self-healing on next success).
      releaseNow();
      const ms = res.status === 429 ? 5 * 60_000 : 30 * 60_000;
      await markAccountCooldown(account.id, provider.id, ms).catch(() => {});
      return res;
    }
    if (res.ok) await clearAccountCooldown(account.id).catch(() => {});
    // Body-wrapped release (stream-safe) with zombie shadow-hold on abort.
    if (!res.body) {
      releaseNow();
      return res;
    }
    const body = res.body.tee();
    void body[0].cancel().catch(() => {});
    const reader = body[1].getReader();
    const passthrough = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            releaseNow();
            return;
          }
          controller.enqueue(value);
        } catch (err) {
          releaseNow();
          controller.error(err);
        }
      },
      cancel(reason) {
        shadowRelease();
        return reader.cancel(reason);
      },
    });
    return new Response(passthrough, { status: res.status, headers: res.headers });
  } catch (err) {
    shadowRelease();
    throw err;
  }
}
