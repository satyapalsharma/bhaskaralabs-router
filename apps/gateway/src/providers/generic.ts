// Generic OpenAI/Anthropic-compatible dispatcher for DB-registered providers
// (admin panel fleet). Hardcoded providers (hyper/agnes/stepfun/camel/
// llmgateway) keep their specialized modules; everything else — including the
// glm-5.3 ladder's flat lanes — flows through here.
//
// Two concurrency gates, because they answer different questions:
//   - the account slot (limits.maxConcurrent) bounds a single credential;
//   - the lane budget (lib/lane-slot) bounds the provider as a whole.
// A provider with three accounts had three times the concurrency of one
// account's ceiling, with nothing watching the total — which is how a lane
// whose real limit is a couple of long generations ended up being handed
// thirty-two open turns from a single operator key.
//
// Account errors are classified from the response BODY before a cooldown is
// applied, because the status alone conflates conditions that need opposite
// responses — see lib/upstream-error.ts.

import type { UpstreamAccount, UpstreamProviderConfig } from "../lib/upstream-config";
import { markAccountCooldown, clearAccountCooldown } from "../lib/upstream-config";
import { makeShadowRelease, SHADOW_HOLD_MS } from "../lib/shadow-release";
import { OPENCODE_FREE_UA, mintOpencodeMsgId, pickOpencodeSession } from "../lib/opencode-sessions";
import { costOnLane, laneAcquire, wrapLaneRelease, markLaneCooldown } from "../lib/lane-slot";
import { COOLDOWN_MS, classifyUpstreamError, peekBody, retryAfterFrom } from "../lib/upstream-error";
import { foldSseCompletion } from "../lib/stream-to-json";

/**
 * Providers that only expose a streaming endpoint.
 *
 * OpenFERENCE rejects a non-streaming request outright — 400 "Streaming is
 * required for this endpoint" — so a non-streaming client turn could never use
 * the lane, and each attempt cost a ladder rung to discover that. Instead of
 * skipping the lane, the request goes upstream as a stream and is folded back
 * into a single JSON body on the way out, which is what the client asked for
 * anyway. See lib/stream-to-json.ts.
 *
 * Keyed in code rather than in the fleet table for the same reason as
 * LANE_COUNTS_REQUESTS: it is a fixed property of the provider's API, not an
 * operator dial.
 */
export const STREAMING_REQUIRED: ReadonlySet<string> = new Set(["openference", "opencode-free"]);

/**
 * OpenCode zen free-tier body shape (reverse-engineered gate, 2026-10-01):
 * the free models only serve requests that look like real opencode agent
 * turns — a system message carrying the opencode signature, at least five
 * tools NAMED from opencode's toolset (stubs with the right names count;
 * the client's own matching-named tools count too), and stream: true.
 * Verified minimums: 17-char "You are opencode." system + 5 stub-named
 * tools + stream passes; 4 tools, arbitrary names, or a non-streamed body
 * all draw FreeTierError 403.
 */
const OPENCODE_SIG_SYSTEM =
  "You are opencode, an interactive CLI tool that helps users with software engineering tasks.";
const OPENCODE_TOOL_NAMES = [
  "bash", "edit", "glob", "grep", "read", "write", "webfetch", "websearch", "skill", "task", "todowrite",
] as const;

function opencodeFreeBody(body: Record<string, unknown>): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? [...body.messages] : [];
  const hasSig = messages.some(
    (m) =>
      (m as { role?: unknown })?.role === "system" &&
      String((m as { content?: unknown }).content ?? "").startsWith("You are opencode"),
  );
  if (!hasSig) messages.push({ role: "system", content: OPENCODE_SIG_SYSTEM });
  const tools = Array.isArray(body.tools) ? [...(body.tools as unknown[])] : [];
  const named = new Set(
    tools.map((t) => (t as { function?: { name?: unknown } })?.function?.name).filter((n): n is string => typeof n === "string"),
  );
  let matching = OPENCODE_TOOL_NAMES.filter((n) => named.has(n)).length;
  for (const n of OPENCODE_TOOL_NAMES) {
    if (matching >= 5) break;
    if (named.has(n)) continue;
    tools.push({ type: "function", function: { name: n, description: ".", parameters: { type: "object", properties: {} } } });
    matching++;
  }
  return { ...body, messages, tools, stream: true, stream_options: { include_usage: true } };
}

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

/**
 * Accounts with a free slot, in the provider's configured order.
 *
 * Returns the whole candidate list rather than one pick: a single pick that
 * happened to be full used to end the turn with "no healthy account" while a
 * sibling credential sat idle, which turns a rotation problem into an outage.
 */
export function candidatesFor(provider: UpstreamProviderConfig): UpstreamAccount[] {
  return provider.accounts.filter((a) => accountSlotFreeFor(a));
}

/** Dispatch a chat completion to a DB-registered provider account. */
export async function genericChat(opts: GenericChatOpts): Promise<Response> {
  const { provider, account, modelId } = opts;
  // Both gates are acquired together and released together: the account slot
  // keeps rotation honest, the lane weight keeps the provider's own ceiling
  // honest. Callers check `laneFree` first, but acquiring here is what makes
  // that check authoritative — two requests can both pass the check before
  // either one acquires, and only the acquire is serialized.
  const weight = costOnLane(provider.id, typeof opts.body.max_tokens === "number" ? opts.body.max_tokens : undefined);
  acquire(account.id);
  const releaseLane = laneAcquire(provider.id, weight);
  const rawRelease = () => {
    release(account.id);
    releaseLane();
  };
  const [releaseNow, shadowRelease] = makeShadowRelease(
    rawRelease,
    SHADOW_HOLD_MS[provider.id] ?? 15_000,
    provider.id,
  );
  try {
    const url = provider.protocol === "anthropic" ? `${provider.baseUrl}/messages` : `${provider.baseUrl}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (provider.protocol === "anthropic") {
      headers["anthropic-version"] = "2023-06-01";
      if (provider.authStyle === "x-api-key") headers["x-api-key"] = account.apiKey;
      // "none": anonymous endpoints (opencode zen). Sending a placeholder
      // Bearer there draws a 401 — anonymous is a real auth mode, not a missing
      // key, so it must actually omit the header.
      else if (provider.authStyle !== "none") headers["Authorization"] = `Bearer ${account.apiKey}`;
    } else {
      if (provider.authStyle === "x-api-key") headers["x-api-key"] = account.apiKey;
      else if (provider.authStyle === "opencode-free") {
        // OpenCode zen free-tier models are client-gated: the zen gateway
        // validates x-opencode-session against sessions the real opencode
        // client has synced. Requests are otherwise ANONYMOUS — no
        // Authorization header, or the free models draw FreeTierError even
        // with valid credentials. Session comes from the host-minted pool
        // (lib/opencode-sessions.ts); the msg_ request id is minted fresh.
        headers["User-Agent"] = OPENCODE_FREE_UA;
        headers["x-opencode-client"] = "cli";
        headers["x-opencode-project"] = "global";
        headers["x-opencode-session"] = await pickOpencodeSession();
        headers["x-opencode-request"] = mintOpencodeMsgId();
      } else if (provider.authStyle !== "none") headers["Authorization"] = `Bearer ${account.apiKey}`;
    }
    // A stream-only lane is asked for a stream even when the client asked for a
    // single body; the fold below turns it back into one. The client's shape is
    // never changed upstream — only this provider's endpoint sees the stream.
    const foldStream = STREAMING_REQUIRED.has(provider.id) && opts.body.stream !== true;
    let upstreamBody: Record<string, unknown> = { ...opts.body, model: modelId };
    if (provider.authStyle === "opencode-free") {
      // Gate shape (see opencodeFreeBody above) — implies stream: true, so a
      // non-stream client turn is folded back below exactly like openference.
      upstreamBody = opencodeFreeBody(upstreamBody);
    }
    if (foldStream) {
      upstreamBody.stream = true;
      // Required to get token accounting back at all: a streamed response that
      // reports no usage would leave the ledger blind for this lane. Only ever
      // set alongside `stream: true`, because providers that reject the field
      // reject it precisely when there is no stream to carry it.
      upstreamBody.stream_options = { include_usage: true };
    }
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
      signal: opts.signal,
    });
    if (res.status === 429 || res.status === 401 || res.status === 402 || res.status === 403) {
      // Classify from the BODY, not the status. A provider is free to express
      // "slow down" as a 401, and pareto does — under a hard throttle both of
      // its accounts came back 401 and the old status-only rule cooled each one
      // for thirty minutes, which is indistinguishable from a dead credential.
      // Reading the body separates a throttle (a minute) from a genuinely
      // broken key (thirty) and from a model-quality error (no cooldown at all,
      // because the account is fine).
      releaseNow();
      const body = await peekBody(res);
      const kind = classifyUpstreamError(res.status, body);
      // The provider's own reset outranks our table. `COOLDOWN_MS` is a default
      // chosen per class, but a `Retry-After` is the provider telling us the
      // actual answer, and it's the value any proxy already respects. Enough
      // providers state it that ignoring it means cooling for the wrong duration
      // on the lanes that are most specific about their limits.
      const ms = retryAfterFrom(res, body) ?? COOLDOWN_MS[kind];
      // free-quota cools the LANE only: the account still has credit and its
      // paid sibling model must keep serving (an account cooldown would kill
      // exactly the fallback the topped-up balance exists for).
      if (kind === "free-quota") {
        if (ms !== null) markLaneCooldown(provider.id, modelId, ms);
      } else if (ms !== null) {
        await markAccountCooldown(account.id, provider.id, ms).catch(() => {});
      }
      // Logged for every class: the cooldown table decides what we DO, but the
      // class is what tells a reader whether the lane was actually at fault.
      console.log(
        JSON.stringify({ ev: "account-error", provider: provider.id, account: account.label, status: res.status, class: kind, cooldownSec: ms === null ? 0 : Math.round(ms / 1000), retryAfter: res.headers.get("retry-after") ?? null, body: body.slice(0, 120) }),
      );
      return res;
    }
    if (res.ok) await clearAccountCooldown(account.id).catch(() => {});
    // The slot must outlive the fetch (the upstream is busy for the whole
    // generation), so the release rides the body rather than the request.
    const wrapped = wrapLaneRelease(res, releaseNow, shadowRelease);
    if (!foldStream || !res.ok) return wrapped;

    // Fold the stream the client will never see. Doing it here rather than in
    // the route keeps the promise local to the provider that required it: every
    // caller — the routed path, the fleet-alias path, the messages route —
    // receives one JSON body and none of them has to know this lane is special.
    try {
      const folded = await foldSseCompletion(wrapped);
      return new Response(JSON.stringify(folded), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // A stream that failed mid-fold becomes an upstream error so the ordinary
      // failover walk still applies, instead of a malformed body reaching the
      // client as if it were a completion.
      return new Response(
        JSON.stringify({ error: { message: `Streamed response could not be buffered: ${(err as Error).message}`, type: "api_error" } }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch (err) {
    shadowRelease();
    throw err;
  }
}
