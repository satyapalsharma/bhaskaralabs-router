// Lane-level cooldown for a retired/renamed model (404), and the fleet
// multi-account failover fix.
//
// Production evidence (gateway logs, ~29h): tokenharbor2/qwen3.8-flash:free
// 404'd "The free offer ... has ended" 13,368 times (tokenharbor4 the same
// 4,291 times) with zero successes — nothing ever cooled the lane, so every
// theta turn re-tried it and paid an extra round trip before failing over.
//
// genericChat (apps/gateway/src/providers/generic.ts) used to classify and
// cool down only on 429/401/402/403; a 404 fell through untouched — no
// cooldown, lane health stayed green. This file covers the fix: a new
// "model-gone" class (404, long cooldown, LANE only — the same account can
// still serve its other models). 5xx deliberately stays uncooled: the busiest
// lanes throw occasional transient 502/520s, and a minute-long account
// cooldown per blip would cost more than the per-turn failover.
//
// `markAccountCooldown`/`clearAccountCooldown` (lib/upstream-config) write to
// the real Postgres-backed fleet table, which is not available in this test
// environment. They're replaced with in-memory recorders via `mock.module`
// *before* `../providers/generic` is first imported anywhere in this process,
// so genericChat's cooldown decision is observable without a database. No
// other test file touches `lib/upstream-config`, so this mock does not leak
// into anything else in the suite.

import { mock } from "bun:test";
import { COOLDOWN_MS, classifyUpstreamError } from "../lib/upstream-error";
import { laneCooling, laneLoadOf, resetLaneCooldowns, resetLaneLoad } from "../lib/lane-slot";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// ── Recorders standing in for the DB-backed account cooldown ───────────────
type CooldownCall = { accountId: string; providerId: string; ms: number };
const accountCooldownCalls: CooldownCall[] = [];
const clearCooldownCalls: string[] = [];

mock.module("../lib/upstream-config", () => ({
  markAccountCooldown: async (accountId: string, providerId: string, ms: number) => {
    accountCooldownCalls.push({ accountId, providerId, ms });
  },
  clearAccountCooldown: async (accountId: string) => {
    clearCooldownCalls.push(accountId);
  },
}));

// Imported dynamically, after the mock above is installed, so generic.ts
// resolves the mocked upstream-config rather than the real (DB-hitting) one.
const { genericChat, accountSlotFreeFor, FIVE_XX_STREAK_LIMIT, resetFiveXxStreaks } = await import("../providers/generic");

function fakeProvider(id: string) {
  return {
    id,
    baseUrl: "http://example.invalid",
    protocol: "openai" as const,
    authStyle: "bearer" as const,
    billing: "flat" as const,
    accounts: [],
    models: [],
  };
}
function fakeAccount(id: string, maxConcurrent?: number) {
  return {
    id,
    label: id,
    apiKey: "test-key",
    weight: 1,
    disabled: false,
    cooldownUntil: null,
    limits: maxConcurrent != null ? { maxConcurrent } : null,
  };
}

/** Swap global fetch for the duration of `fn`, always restoring it after. */
async function withFetch<T>(impl: (...args: Parameters<typeof fetch>) => Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = impl as unknown as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

console.log("Test 1: classifyUpstreamError routes a retired model to model-gone");
{
  // The exact tokenharbor2 wording from the production logs.
  const TOKENHARBOR2_404 = '{"error":{"message":"The free offer for this model has ended.","type":"not_found"}}';
  const k1 = classifyUpstreamError(404, TOKENHARBOR2_404);
  check("tokenharbor2's 404 classifies as model-gone", k1 === "model-gone", k1);
  check("model-gone gets a long cooldown, not free-quota's short one", COOLDOWN_MS["model-gone"] === 30 * 60_000, String(COOLDOWN_MS["model-gone"]));

  check("a bare 404 with no body signal still classifies as model-gone", classifyUpstreamError(404, "") === "model-gone");
  check('"model not found" classifies as model-gone', classifyUpstreamError(400, "Model not found") === "model-gone");
  check('"does not exist" classifies as model-gone', classifyUpstreamError(400, "The requested model does not exist") === "model-gone");
  check('"no longer available" classifies as model-gone', classifyUpstreamError(400, "This model is no longer available") === "model-gone");
  check('"retired" classifies as model-gone', classifyUpstreamError(400, "This model has been retired") === "model-gone");

  // Precedence: an actual free-quota body must still win over model-gone,
  // and model-quality/throttle must still win over everything below them —
  // this class is inserted into the chain, not prepended ahead of it.
  const stillFreeQuota = classifyUpstreamError(402, "free_request_quota_exhausted: retry later");
  check("a genuine free-quota body is not shadowed by the new class", stillFreeQuota === "free-quota", stillFreeQuota);
}

console.log("\nTest 2: a 404 cools the LANE, not the account");
{
  resetLaneCooldowns();
  resetLaneLoad();
  accountCooldownCalls.length = 0;
  clearCooldownCalls.length = 0;

  const provider = fakeProvider("th2-test");
  const account = fakeAccount("th2-acct-1");
  const modelId = "qwen3.8-flash:free";

  const res = await withFetch(
    (async () => jsonResponse(404, { error: { message: "The free offer for this model has ended.", type: "not_found" } })),
    () => genericChat({ provider, account, modelId, body: { messages: [] } }),
  );

  check("the 404 is returned to the caller unchanged", res.status === 404, String(res.status));
  check("the lane is now cooling", laneCooling(provider.id, modelId), "laneCooling returned false");
  check("the account was NOT cooled", accountCooldownCalls.length === 0, JSON.stringify(accountCooldownCalls));

  resetLaneCooldowns();
  resetLaneLoad();
}

console.log("\nTest 3: 5xx cools the account only after a streak of consecutive failures");
{
  resetLaneCooldowns();
  resetLaneLoad();
  resetFiveXxStreaks();
  accountCooldownCalls.length = 0;

  const provider = fakeProvider("fleet5xx-test");
  const account = fakeAccount("fleet5xx-acct-1");
  const modelId = "some-model";
  const send = async (status: number) => {
    const res = await withFetch(
      (async () => (status === 200
        ? jsonResponse(200, { choices: [{ message: { role: "assistant", content: "ok" } }] })
        : jsonResponse(status, { error: { message: "Service unavailable" } }))),
      () => genericChat({ provider, account, modelId, body: { messages: [] } }),
    );
    await res.text().catch(() => {});
    return res.status;
  };

  for (let i = 1; i < FIVE_XX_STREAK_LIMIT; i++) check(`5xx #${i} is returned unchanged`, (await send(i % 2 ? 502 : 524)) >= 500);
  check(`no cooldown before ${FIVE_XX_STREAK_LIMIT} consecutive 5xx`, accountCooldownCalls.length === 0, JSON.stringify(accountCooldownCalls));
  await send(503);
  check(`the ${FIVE_XX_STREAK_LIMIT}th consecutive 5xx cools the account`, accountCooldownCalls.length === 1, JSON.stringify(accountCooldownCalls));
  check("...for overload's 60s", accountCooldownCalls[0]?.ms === COOLDOWN_MS.overload, String(accountCooldownCalls[0]?.ms));
  check("the lane itself is not cooled by a 5xx streak", !laneCooling(provider.id, modelId));

  // A success in between resets the streak.
  accountCooldownCalls.length = 0;
  for (let i = 1; i < FIVE_XX_STREAK_LIMIT; i++) await send(502);
  await send(200);
  for (let i = 1; i < FIVE_XX_STREAK_LIMIT; i++) await send(502);
  check("a success resets the streak (no cooldown)", accountCooldownCalls.length === 0, JSON.stringify(accountCooldownCalls));
  check("524 classifies as overload", classifyUpstreamError(524, "") === "overload");

  resetFiveXxStreaks();
  resetLaneCooldowns();
  resetLaneLoad();
}

console.log("\nTest 4: 429 behaviour is unchanged by this fix");
{
  resetLaneCooldowns();
  resetLaneLoad();
  accountCooldownCalls.length = 0;

  const provider = fakeProvider("throttle-test");
  const account = fakeAccount("throttle-acct-1");
  const modelId = "some-model";

  const res = await withFetch(
    (async () => jsonResponse(429, { error: { message: "Rate limit exceeded. Please slow down." } })),
    () => genericChat({ provider, account, modelId, body: { messages: [] } }),
  );

  check("the 429 is returned unchanged", res.status === 429);
  check("the account is cooled, as before", accountCooldownCalls.length === 1);
  check("...with throttle's short cooldown, not model-gone's long one", accountCooldownCalls[0]?.ms === COOLDOWN_MS.throttle, String(accountCooldownCalls[0]?.ms));
  check("the lane is NOT cooled for a throttle", !laneCooling(provider.id, modelId));

  resetLaneCooldowns();
  resetLaneLoad();
}

console.log("\nTest 5: the fleet multi-account failover mechanism");
{
  // apps/gateway/src/routes/chat.ts's dispatchUpstream() — the function this
  // bug actually lives in — is not exported, and the module also imports a
  // live Postgres client (`../db`), a Hono app, and every hardcoded provider
  // module at the top level, so importing chat.ts here to reach a private
  // function is impractical without restructuring the route file, which is
  // out of scope for this fix. What IS exercised below is the exact
  // mechanism the fixed loop relies on: genericChat resolves (never throws)
  // on a non-ok status, and for a status it does not classify (not one of
  // 429/401/402/403/404/5xx) the account/lane slot stays held until the body
  // is read to completion — so the fleet loop's "drain, then try the next
  // account" step is what stands between a busy first account and a
  // permanently leaked slot.
  resetLaneCooldowns();
  resetLaneLoad();
  accountCooldownCalls.length = 0;

  const provider = fakeProvider("multi-account-test");
  const accountA = fakeAccount("acct-A", 1); // maxConcurrent 1, so the hold is observable
  const accountB = fakeAccount("acct-B", 1);
  const modelId = "some-model";

  check("account A starts with a free slot", accountSlotFreeFor(accountA));

  // Account A: an upstream status genericChat does NOT classify (so no
  // synchronous releaseNow() happens — the slot rides the response body).
  const resA = await withFetch(
    (async () => jsonResponse(418, { error: "I'm a teapot" })),
    () => genericChat({ provider, account: accountA, modelId, body: { messages: [] } }),
  );
  check("account A's response is not ok", !resA.ok, String(resA.status));
  check("...and its slot is held, not yet released", !accountSlotFreeFor(accountA));
  check("...and the lane load reflects the held weight", laneLoadOf(provider.id) > 0, String(laneLoadOf(provider.id)));

  // This is the fixed loop's step: drain (not cancel — see chat.ts's comment
  // on why cancel() would route through the abort shadow-hold instead).
  await resA.text().catch(() => {});
  check("draining the body releases account A's slot immediately", accountSlotFreeFor(accountA));
  check("...and the lane load returns to zero", laneLoadOf(provider.id) === 0, String(laneLoadOf(provider.id)));

  // Account B: the next account in the fleet loop's `ordered` list succeeds.
  const resB = await withFetch(
    (async () => jsonResponse(200, { id: "chatcmpl-1", choices: [{ message: { content: "ok" } }] })),
    () => genericChat({ provider, account: accountB, modelId, body: { messages: [] } }),
  );
  check("account B (the sibling) is reached and succeeds", resB.ok, String(resB.status));

  resetLaneCooldowns();
  resetLaneLoad();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
