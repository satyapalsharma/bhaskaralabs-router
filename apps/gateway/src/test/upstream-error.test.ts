// Upstream error classification, and the lane budget's unit.
//
// Both exist because a number on its own was making a decision it could not
// support: a 401 is not always a bad key, a 502 is not always an outage, and a
// plan that says "2 concurrent requests" does not mean 2 units of work.
//
// The cases below are the real bodies observed from the live fleet, kept
// verbatim so a future regex edit that breaks one of them fails here instead of
// in production.

import { COOLDOWN_MS, classifyUpstreamError, describeUpstreamError, retryAfterFrom, retryAfterFromBody, retryAfterFromHeader } from "../lib/upstream-error";
import { LANE_BUDGET, LANE_COUNTS_REQUESTS, LANE_BUDGET_DEFAULT, costOnLane, laneAcquire, laneBudgetFor, laneFree, laneLoadOf, laneWeight, resetLaneLoad } from "../lib/lane-slot";

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

// ── The literal bodies the fleet returned ────────────────────────────────────
const PARETO_502_ARGS = '{"error":{"message":"The model returned invalid tool arguments.","type":"api_error"}}';
const PARETO_503 = '{"error":{"message":"The model request failed.","type":"api_error","code":"503"}}';
const PARETO_504 = '{"error":{"message":"The model request failed.","type":"api_error","code":"504"}}';
const AGNES_500 = '{"error":{"message":"Failed to reach upstream, please retry later.","type":"api_error"}}';
const ELECTRON_429 = '{"error":{"message":"Concurrency limit exceeded: your plan currently allows 2 concurrent request(s) (service mode: interactive)","type":"rate_limit_error"}}';

console.log("Test 1: a model-quality error is not a lane fault");
{
  const k = classifyUpstreamError(502, PARETO_502_ARGS);
  check("pareto's invalid-tool-arguments 502 classifies as model-quality", k === "model-quality", k);
  // The account is healthy and must stay in rotation. Cooling it would also
  // rotate the next turn to a sibling running the same model, which fails the
  // same way — the cooldown would buy nothing and cost a lane.
  check("...and is given no cooldown", COOLDOWN_MS[k] === null, String(COOLDOWN_MS[k]));

  check("a malformed-JSON complaint also classifies as model-quality", classifyUpstreamError(400, "invalid tool call format") === "model-quality");
}

console.log("Test 2: a throttle wearing a 401 is treated as a throttle");
{
  // The failure that motivated this file: a throttle expressed as 401 cooled
  // each account for 30 minutes, indistinguishable from a dead credential.
  const throttle401 = classifyUpstreamError(401, '{"error":{"message":"Rate limit exceeded. Please slow down.","type":"rate_limit_error"}}');
  check("401 + rate-limit body → throttle", throttle401 === "throttle", throttle401);
  check("...with a short cooldown, not 30 minutes", COOLDOWN_MS[throttle401]! < 5 * 60_000, `${COOLDOWN_MS[throttle401]}ms`);

  check(
    "a bare 401 with no body signal is still auth",
    classifyUpstreamError(401, '{"error":{"message":"Unauthorized"}}') === "auth",
  );
  check(
    "an invalid-key body is auth",
    classifyUpstreamError(401, '{"error":{"message":"Invalid API key provided"}}') === "auth",
  );
  check("auth keeps the long cooldown", COOLDOWN_MS.auth === 30 * 60_000);

  check(
    "the electronhub concurrency message is a throttle",
    classifyUpstreamError(429, ELECTRON_429) === "throttle",
  );
  check("a 429 with an empty body is still a throttle", classifyUpstreamError(429, "") === "throttle");
}

console.log("Test 3: quota, overload and the status fallback");
{
  check("402 with insufficient credits → quota", classifyUpstreamError(402, '{"error":{"message":"Insufficient credits"}}') === "quota");
  check("a bare 402 → quota", classifyUpstreamError(402, "") === "quota");
  check("pareto's bare 503 → overload", classifyUpstreamError(503, PARETO_503) === "overload");
  // TeamoRouter's free model runs dry while the paid model on the same key
  // still serves: the lane cools, the account must not.
  const teamoFreeQuota =
    '{"error":{"message":"glm-5.3-flash-free is experiencing high demand right now. Please try again later, or switch the model identifier to glm-5.3-flash to continue.","type":"free_request_quota_exhausted","code":402}}';
  check("teamorouter free-quota 402 → free-quota, not account quota", classifyUpstreamError(402, teamoFreeQuota) === "free-quota");
  check("prose free-tier exhaustion reads as free-quota too", classifyUpstreamError(402, "Free tier quota exhausted for this model") === "free-quota");
  check("pareto's bare 504 → overload", classifyUpstreamError(504, PARETO_504) === "overload");
  check("agnes' reach-upstream 500 → overload", classifyUpstreamError(500, AGNES_500) === "overload");
  check("an unrecognised status falls through to unknown", classifyUpstreamError(418, "teapot") === "unknown");
  check("overload cools briefly", COOLDOWN_MS.overload! <= 60_000);

  // Body signal outranks status, in both directions.
  check(
    "a 500 whose body says rate limit is a throttle, not an outage",
    classifyUpstreamError(500, "rate limit exceeded") === "throttle",
  );
  check(
    "a 429 whose body says invalid key is auth, not a throttle",
    classifyUpstreamError(429, "invalid api key") === "auth",
  );
}

console.log("Test 4: request-counted lanes are counted, not weighed");
{
  resetLaneLoad();
  check("electronhub is declared a request-counted lane", LANE_COUNTS_REQUESTS.has("electronhub"));
  check("pareto is NOT — its limit is on overlapping generations", !LANE_COUNTS_REQUESTS.has("pareto"));

  // The bug: a plan of "2 concurrent requests" charged by weight admitted
  // nothing, because a single typical request already cost 3.
  const typical = 2000; // → laneWeight 3
  check("a typical request weighs more than 1", laneWeight(typical) === 3, String(laneWeight(typical)));
  check("...but costs exactly 1 on a request-counted lane", costOnLane("electronhub", typical) === 1);
  check("...and its full weight on a weighted lane", costOnLane("pareto", typical) === 3);

  // This is the exact assertion that failed in production: 0 load, weight 3,
  // budget 2 → not free → the lane was skipped on every single turn.
  check("at zero load a request-counted lane admits a request", laneFree("electronhub", costOnLane("electronhub", typical)));
  const r1 = laneAcquire("electronhub", costOnLane("electronhub", typical));
  // One, not two. The plan advertises two concurrent requests, but the second
  // slot is what produced the live "Concurrency limit exceeded: your plan
  // currently allows 2 concurrent request(s)" 429s — the advertised count
  // includes the request already running, so admitting two means the second
  // races the first. A lane that admits 2 always rejects the 2nd in practice
  // and pays a wasted round trip; a lane that admits 1 never does.
  check("one request in flight saturates the lane (the 2nd would 429)", !laneFree("electronhub", 1));
  check("...and the load reads as 1 request, not 1 unit of work", laneLoadOf("electronhub") === 1);
  r1();
  check("releasing frees the lane", laneFree("electronhub", 1));

  // A weighted lane still behaves as before: this is the fix, not a rewrite.
  resetLaneLoad();
  const paretoBudget = LANE_BUDGET.pareto;
  check("pareto keeps its weighted budget", costOnLane("pareto", typical) === laneWeight(typical));
  let admitted = 0;
  const held: (() => void)[] = [];
  while (laneFree("pareto", costOnLane("pareto", typical)) && admitted < 40) {
    held.push(laneAcquire("pareto", costOnLane("pareto", typical)));
    admitted++;
  }
  check("a weighted lane admits floor(budget / weight) requests", admitted === Math.floor(paretoBudget / laneWeight(typical)), `${admitted} of ${paretoBudget}`);
  for (const h of held) h();
  check("unmeasured lanes keep the default budget", laneBudgetFor("some-new-provider") === LANE_BUDGET_DEFAULT);
  resetLaneLoad();
}

// ── A spent plan window is a quota, not a throttle ───────────────────────────

{
  // Agnes's rolling 5-hour cap arrives as a 429. Classified as `throttle` it got
  // a 60-second cooldown and was re-probed every minute against a window hours
  // from reopening — 317 consecutive 429s in a single 10-minute report, each one
  // a wasted upstream call and a failover hop counted as a provider fault.
  const body = '{"error":{"code":"","message":"API usage limit reached. Please try again after **2026-09-13 19:00 UTC**. (request id: 20260913183417955106131ZLYk6jiS)","type":"AgnesAI_error"}}';
  check("Agnes's 5h cap is a quota, not a throttle", classifyUpstreamError(429, body) === "quota", classifyUpstreamError(429, body));

  // The sibling wordings, so a provider that rephrases does not silently return
  // to the retry-forever path.
  check("`usage limit exceeded` is a quota", classifyUpstreamError(429, "usage limit exceeded") === "quota");
  check("`daily limit` is a quota", classifyUpstreamError(429, "Daily limit reached, try tomorrow") === "quota");
  check("a plain rate limit is still a throttle", classifyUpstreamError(429, "Rate limit reached, slow down") === "throttle");
  check("a concurrency cap is still a throttle", classifyUpstreamError(429, "concurrency limit exceeded") === "throttle");
}

// ── Providers that name their own reset time ────────────────────────────────

{
  const now = Date.parse("2026-09-13T18:34:17Z");
  const body = '{"error":{"message":"API usage limit reached. Please try again after **2026-09-13 19:00 UTC**."}}';
  const wait = retryAfterFromBody(body, now);
  // 18:34:17 → 19:00:00 is 25m43s. A blind 5-minute backoff would have spent
  // that window re-probing a lane that provably had nothing to give.
  check("the reset time is read from the body", wait === 1_543_000, `${wait}ms`);
  check("...and lands in the future, not the past", (wait ?? 0) > 0);

  // A bare timestamp with no zone means UTC. Reading it as local would shift the
  // cooldown by the machine's offset — five and a half hours, here.
  const noZone = retryAfterFromBody("try again after 2026-09-13 19:00", now);
  check("a zoneless stamp is read as UTC", noZone === wait, `${noZone} vs ${wait}`);

  // An explicit offset must be honoured rather than assumed to be UTC.
  const offset = retryAfterFromBody("try again after 2026-09-14T00:30:00+05:30", now);
  check("an explicit offset is honoured", offset === wait, `${offset} vs ${wait}`);

  // A reset already in the past means the lane is back; cooling it would idle a
  // healthy provider.
  check("a past reset yields no cooldown", retryAfterFromBody("try again after 2026-09-13 17:00 UTC", now) === null);
  // And a timestamp absurdly far out is likelier a misread than a real reset.
  check("an implausible reset is ignored", retryAfterFromBody("try again after 2026-09-20 19:00 UTC", now) === null);
  // A body with no time at all falls back to the caller's backoff.
  check("a body with no time yields null", retryAfterFromBody("API usage limit reached.", now) === null);
  check("an empty body yields null", retryAfterFromBody("", now) === null);

  // Relative durations — providers that cap spend per hour (Claudin's $1/hour)
  // word their 429 as a duration, not a stamp. The parsed duration must beat
  // the class default, or the lane re-probes every 60s against a window that
  // will not reopen for however long the provider said.
  check("retry in 5 minutes is 5 minutes", retryAfterFromBody("rate limited — retry in 5 minutes", now) === 5 * 60_000);
  check("a duration under the 60s floor falls back (null)", retryAfterFromBody("please try again in 30 seconds", now) === null, String(retryAfterFromBody("please try again in 30 seconds", now)));
  check("resets in 2 hours is 2 hours", retryAfterFromBody("hourly limit reached, resets in 2 hours", now) === 2 * 3_600_000);
  check("a duration under the 60s floor falls back (null)", retryAfterFromBody("retry in 45 seconds", now) === null, String(retryAfterFromBody("retry in 45 seconds", now)));
  check("a duration beyond a day is ignored", retryAfterFromBody("retry in 3 days", now) === null);
  // A stamp still beats a duration when both appear.
  const both = retryAfterFromBody("retry in 5 minutes, or try again after **2026-09-13 19:00 UTC**.", now);
  check("an explicit stamp beats a duration when both are present", both === 1_543_000, `${both}ms`);

  // The request id in Agnes's body carries a date — 20260913 — and must not be
  // mistaken for the reset. Anchoring on the phrasing is what prevents it.
  check(
    "the request id is not read as a reset",
    retryAfterFromBody('{"message":"API usage limit reached.","request_id":"20260913183417955106131ZLYk6jiS"}', now) === null,
  );
}

// ── Retry-After: the provider answering for itself ──────────────────────────

{
  const now = Date.parse("2026-09-13T18:46:21Z");
  const mk = (headers: Record<string, string>, status = 429) => new Response("", { status, headers });

  // Agnes sets both and they agree to the second: `retry-after: 819` alongside
  // "try again after 2026-09-13 19:00 UTC". The header is the one to prefer —
  // standardized, already parsed, and the value every proxy already honours.
  const agnes = mk({ "retry-after": "819" });
  check("delta-seconds is read from the header", retryAfterFromHeader(agnes, now) === 819_000, `${retryAfterFromHeader(agnes, now)}`);
  check("the header and the body agree", retryAfterFromHeader(agnes, now) === retryAfterFromBody('{"error":{"message":"try again after 2026-09-13 19:00 UTC"}}', now));

  // RFC 9110 allows an HTTP-date as well as delta-seconds.
  const dated = mk({ "retry-after": "Sun, 13 Sep 2026 19:00:00 GMT" });
  check("an HTTP-date header is accepted", retryAfterFromHeader(dated, now) === 819_000, `${retryAfterFromHeader(dated, now)}`);
  check("a zoneless HTTP form still parses", retryAfterFromHeader(mk({ "retry-after": "Sun, 13 Sep 2026 19:00:00 +0000" }), now) === 819_000);

  // Header first, body as the fallback — the whole point of the helper.
  check("the header wins over the body", retryAfterFrom(mk({ "retry-after": "120" }), "try again after 2026-09-13 19:00:00 UTC", now) === 120_000);
  check("...and the body answers when the header is absent", retryAfterFrom(mk({}), "try again after 2026-09-13 19:00:00 UTC", now) === 819_000);
  check("...and null when neither answers", retryAfterFrom(mk({}), "API usage limit reached.", now) === null);

  // A garbage header must not silently disable the cooldown — the body, and
  // then the caller's own default, are still available behind it.
  check("a malformed header falls through to the body", retryAfterFrom(mk({ "retry-after": "soon-ish" }), "try again after 2026-09-13 19:00:00 UTC", now) === 819_000);
  check("a negative header is ignored", retryAfterFromHeader(mk({ "retry-after": "-30" }), now) === null);
  check("a zero header is ignored", retryAfterFromHeader(mk({ "retry-after": "0" }), now) === null);
  // Under a minute is not worth a cooldown; over a day is likelier a misread.
  check("a sub-minute header is ignored", retryAfterFromHeader(mk({ "retry-after": "30" }), now) === null);
  check("an implausible header is ignored", retryAfterFromHeader(mk({ "retry-after": "604800" }), now) === null);
  check("an absent header yields null", retryAfterFromHeader(mk({}), now) === null);

  // Header names are case-insensitive; a provider sending `Retry-After` must not
  // be read as sending nothing.
  check("the header name is case-insensitive", retryAfterFromHeader(mk({ "Retry-After": "819" }), now) === 819_000);
}

console.log("Test 7: the fault log keeps the reason, not just the envelope");
{
  // The exact failure this replaces: `slice(0, 60)` on a real body left the
  // report saying only "Provider returned error", which is the wrapper. Every
  // Camel 400 in the window was undiagnosable for that reason.
  const CAMEL_400 = '{"error":{"message":"Provider returned error","code":400,"metadata":{"raw":"{\\"error\\":{\\"message\\":\\"System message must be at the beginning.\\"}}"}}}';
  const oldWay = CAMEL_400.slice(0, 60);
  check("the old 60-char slice really did cut the reason off", !oldWay.includes("System message"), oldWay);

  const d = describeUpstreamError(CAMEL_400);
  check("the wrapper's message survives", d.includes("Provider returned error"), d);
  check("the status code survives", d.includes("400"), d);
  check("...and the upstream's own words survive, which is the point", d.includes("System message must be at the beginning."), d);

  // An OpenRouter-style envelope puts the provider's words in metadata.raw.
  check("a nested metadata.raw is unwrapped", describeUpstreamError('{"error":{"message":"upstream failed","metadata":{"raw":"quota exhausted for this key"}}}').includes("quota exhausted for this key"));

  // Non-JSON bodies used to lose everything past the first clause.
  const html = `<html><head><title>502 Bad Gateway</title></head><body>${"x".repeat(400)}</body></html>`;
  const dh = describeUpstreamError(html);
  check("an HTML page keeps its identifying head", dh.includes("502 Bad Gateway"), dh.slice(0, 80));
  check("...bounded rather than dumped whole", dh.length <= 300, String(dh.length));

  check("an empty body yields an empty string", describeUpstreamError("") === "");
  check("whitespace is collapsed, so a pretty-printed body still parses", describeUpstreamError('{\n  "error": {\n    "message": "rate limited"\n  }\n}') === "rate limited");
  check("a duplicate message is not printed twice", describeUpstreamError('{"error":{"message":"boom"},"message":"boom"}') === "boom");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
