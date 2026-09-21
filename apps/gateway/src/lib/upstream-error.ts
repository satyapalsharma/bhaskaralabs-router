// Upstream error classification.
//
// The gateway used to route purely on HTTP status, and that is not enough: two
// different conditions arrive wearing the same number, and they need opposite
// responses.
//
//   A 401 carrying "rate limit exceeded" is the provider telling us to slow
//   down. The old code read the number alone and cooled the account for 30
//   minutes — the same treatment as a dead credential — which is how a
//   throttle that should have lasted seconds silenced a healthy account for
//   half an hour.
//
//   A 502 carrying "The model returned invalid tool arguments" is not a lane
//   fault at all. Nothing about our request was wrong and the account is fine;
//   the model emitted arguments its own server could not parse. Treating it as
//   a transient outage pointed the investigation at the network for weeks.
//
// So classification reads the body. Status stays the fallback for the cases
// where the provider says nothing useful, because status alone is still the
// best guess when there is no other signal.

export type UpstreamErrorClass =
  /** Slow down: rate limit, concurrency cap, momentary capacity. Short cooldown. */
  | "throttle"
  /** Out of credit or past a plan quota. Longer cooldown; not a credential problem. */
  | "quota"
  /** A single model's free tier is unavailable (TeamoRouter's
   *  free_request_quota_exhausted — an availability refusal, "high demand
   *  right now", not a daily quota). The LANE cools briefly, the account does
   *  not — a sibling paid model on the same account is fine. */
  | "free-quota"
  /** Credential is actually bad or missing. Long cooldown. */
  | "auth"
  /** The model produced something the provider could not parse. Account is healthy. */
  | "model-quality"
  /** Provider is up but overloaded or timing out. Short cooldown. */
  | "overload"
  /** Anything else. */
  | "unknown";

/** Cooldown to apply per class. `null` means leave the account in rotation.
 *  For free-quota the value is applied to the LANE (provider+model), never the
 *  account — see the class doc. Short, because TeamoRouter's free tier is
 *  AVAILABILITY-based ("high demand right now"), not a daily quota: it can
 *  recover in seconds, and a long cooldown would idle a free lane that came
 *  back while the walk was happily paying for the paid one. */
export const COOLDOWN_MS: Record<UpstreamErrorClass, number | null> = {
  throttle: 60_000,
  quota: 30 * 60_000,
  "free-quota": 60_000,
  auth: 30 * 60_000,
  // Deliberately null: cooling the account would be wrong, because the account
  // is not the problem — the model is. Cooling it also has a cost beyond being
  // wrong: it would rotate the *next* request to a sibling account that runs
  // the same model and fails the same way.
  "model-quality": null,
  overload: 60_000,
  unknown: 60_000,
};

const THROTTLE = [
  /rate\s*limit/i,
  /too\s*many\s*requests/i,
  /concurren(cy|t)/i,
  /slow\s*down/i,
  /throttl/i,
  /requests?\s*(per|\/)\s*(min|sec|hour|day)/i,
];

const AUTH = [
  /invalid\s*api\s*key/i,
  /incorrect\s*api\s*key/i,
  /unauthoriz/i,
  /authentication/i,
  /api\s*key\s*(is\s*)?(not\s*)?(valid|found|provided|missing)/i,
  /no\s*such\s*(api\s*)?key/i,
  /(token|key)\s*(has\s*)?(expired|revoked|disabled)/i,
];

const QUOTA = [
  /insufficient\s*(credit|balance|funds|quota)/i,
  /insufficient_quota/i,
  /out\s*of\s*credit/i,
  /exceeded\s*your\s*(current\s*)?quota/i,
  /quota\s*exceeded/i,
  // "API usage limit reached" — how Agnes words its rolling 5-hour cap. It
  // arrives as a 429, so without this pattern it lands in `throttle` and gets a
  // 60-second cooldown: the lane is re-probed fifty times an hour against a
  // window that will not reopen for hours, and every probe is a wasted upstream
  // call and a failover hop the report then counts as a provider fault.
  /usage\s*limit\s*(reached|exceeded|hit|exhausted)/i,
  /(reached|exceeded)\s*(your\s*)?(api\s*)?usage\s*limit/i,
  /(daily|hourly|monthly|weekly)\s*(usage\s*)?limit/i,
  /billing/i,
  /payment\s*required/i,
  /plan\s*(limit|exceeded)/i,
  /subscription/i,
  /devpass/i,
];

/** Bounds shared by both reset sources: below this the cooldown is pointless,
 *  above it we are likelier misreading something than looking at a real reset. */
const MIN_RESET_MS = 60_000;
const MAX_RESET_MS = 24 * 60 * 60 * 1000;
function saneReset(wait: number): number | null {
  return wait >= MIN_RESET_MS && wait <= MAX_RESET_MS ? wait : null;
}

/**
 * Read the reset from the `Retry-After` header, per RFC 9110.
 *
 * The header beats the body on every axis: it is standardized, it is already
 * parsed by the platform, it survives a body we cannot see or decode, and it is
 * the value every proxy between us and the provider already honours — so
 * disagreeing with it buys nothing. Agnes sets both and they agree to the
 * second (`retry-after: 819` alongside "try again after 2026-09-13 19:00 UTC"),
 * which is the usual arrangement; the body parser stays because some providers
 * write the reset only in prose.
 *
 * Returns ms to wait, or null when the header is absent, malformed, or outside
 * the sane window. Both RFC forms are accepted: delta-seconds ("819") and an
 * HTTP-date ("Sun, 13 Sep 2026 19:00:00 GMT").
 */
export function retryAfterFromHeader(res: Response, now: number = Date.now()): number | null {
  const raw = res.headers.get("retry-after")?.trim();
  if (!raw) return null;
  // delta-seconds is the common form and the only one that needs no clock.
  if (/^[0-9]+$/.test(raw)) return saneReset(Number(raw) * 1000);
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return null;
  return saneReset(at - now);
}

/**
 * How long to wait after a provider rejects a request.
 *
 * Header first, body second — see `retryAfterFromHeader` for why. Caller keeps
 * its own default when this returns null, so a provider that tells us nothing
 * still gets a cooldown, just a guessed one.
 */
export function retryAfterFrom(res: Response, body: string, now: number = Date.now()): number | null {
  return retryAfterFromHeader(res, now) ?? retryAfterFromBody(body, now);
}

/**
 * Read an explicit reset time out of an error body.
 *
 * Agnes answers a spent 5-hour window with
 * `"API usage limit reached. Please try again after **2026-09-13 19:00 UTC**."`
 * — it names the exact moment the lane comes back. Any backoff we invent is
 * strictly worse than that number: too short and we burn a doomed request per
 * minute, too long and we idle a lane that was already healthy again. So when a
 * provider tells us, we use its answer instead of our guess.
 *
 * Returns milliseconds to wait, or null when the body names no usable time.
 * A time already in the past yields null, since the lane is presumably back.
 */
export function retryAfterFromBody(body: string, now: number = Date.now()): number | null {
  if (!body) return null;
  // "try again after <time>" / "available again at <time>" / "resets at <time>".
  // Anchored on the phrasing so a stray date elsewhere in the body — a request
  // id, a log line — cannot be mistaken for the reset. Providers commonly wrap
  // the stamp in markdown or quotes (Agnes writes `after **19:00 UTC**`), so
  // that decoration is stepped over rather than being allowed to defeat the
  // match — which is the failure mode that matters here, because a missed reset
  // silently reverts the caller to a backoff that is far too short.
  const m =
    /(?:try\s*again|retry|available\s*again|resets?(?:\s*at)?|reset\s*at|comes?\s*back)\s*(?:after|at|on|in)?\s*[*`"'\s]*([0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2})?(?:\s*(?:Z|UTC|GMT|[+-][0-9]{2}:?[0-9]{2}))?)/i.exec(
      body,
    );
  if (!m) return null;
  const raw = m[1].replace(/\s+/, " ").trim();
  // A bare "YYYY-MM-DD HH:MM" has no zone; providers that write one mean UTC,
  // and reading it as local would shift the cooldown by the offset — five and a
  // half hours, here.
  const hasZone = /(?:Z|UTC|GMT|[+-][0-9]{2}:?[0-9]{2})$/i.test(raw);
  const stamp = hasZone ? raw.replace(/\s*UTC$/i, "Z").replace(/\s*GMT$/i, "Z") : `${raw.replace(" ", "T")}Z`;
  const at = Date.parse(stamp);
  if (!Number.isFinite(at)) return null;
  return saneReset(at - now);
}

/** The model's own output was unusable — a quality problem, not an outage. */
const MODEL_QUALITY = [
  /invalid\s*tool\s*argument/i,
  /invalid\s*function\s*argument/i,
  /failed\s*to\s*(parse|validate)/i,
  /(could\s*not|unable\s*to)\s*parse/i,
  /invalid\s*(json|tool\s*call|response\s*format)/i,
  /malformed/i,
];

const OVERLOAD = [
  /overload/i,
  /timed?\s*out/i,
  /timeout/i,
  /temporarily\s*unavailable/i,
  /service\s*unavailable/i,
  /capacity/i,
  /upstream/i,
];

/** The free tier of one model is unavailable right now — an availability
 *  refusal ("high demand"), not a daily quota, and not an account problem.
 *  TeamoRouter words it `free_request_quota_exhausted` and tells the caller to
 *  switch to the paid id, which is exactly what the ladder does with this class. */
const FREE_QUOTA = [
  /free_request_quota/i,
  /free\s+(quota|tier|allowance|plan)[^.]*(exhaust|reached|limit|spent)/i,
];

export function classifyUpstreamError(status: number, body: string): UpstreamErrorClass {
  const text = (body || "").slice(0, 2000);

  // Body first, for every status. A 401 that says "rate limit" is a throttle,
  // and a 502 that says "invalid tool arguments" is a model problem — the
  // number does not get to overrule what the provider actually wrote.
  if (MODEL_QUALITY.some((re) => re.test(text))) return "model-quality";
  if (THROTTLE.some((re) => re.test(text))) return "throttle";
  if (FREE_QUOTA.some((re) => re.test(text))) return "free-quota";
  if (QUOTA.some((re) => re.test(text))) return "quota";
  if (AUTH.some((re) => re.test(text))) return "auth";
  if (OVERLOAD.some((re) => re.test(text))) return "overload";

  switch (status) {
    case 429:
      return "throttle";
    case 401:
    case 403:
      // No body signal at all and the provider said "unauthorized": believe it.
      return "auth";
    case 402:
      return "quota";
    case 408:
    case 500:
    case 502:
    case 503:
    case 504:
      return "overload";
    default:
      return "unknown";
  }
}

/**
 * Read a response body for classification without consuming the caller's copy.
 *
 * Only used on non-2xx responses, which are small — the clone exists so the
 * error body still reaches the client and the failover path unchanged.
 */
export async function peekBody(res: Response): Promise<string> {
  try {
    return await res.clone().text();
  } catch {
    return "";
  }
}

/** Room for an unwrapped reason plus the identifiers needed to search for it. */
const ERROR_DETAIL_MAX = 300;

/**
 * The part of an error body worth keeping in the fault log.
 *
 * The log used to store `body.slice(0, 60)`, and for the JSON envelope every
 * provider returns that is not enough to reach the reason. A Camel 400 recorded
 * as
 *
 *   {"error":{"message":"Provider returned error","code":400,"me
 *
 * carries the wrapper, the number, and none of the detail — so every entry in
 * the report read "Provider returned error" and the cause stayed unknown. The
 * truncation defeated the report it was feeding.
 *
 * Bodies that parse are therefore unwrapped rather than cut: the nested
 * message, its code, and any deeper `raw`/`detail`/`metadata` text, because a
 * router (the OpenRouter-style envelopes) puts the upstream's own words there
 * and that copy is the only one that says what actually broke. Bodies that do
 * not parse — an HTML error page, plain prose — keep their head, with far more
 * room than the old 60 characters.
 */
export function describeUpstreamError(body: string): string {
  const flat = (body || "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  try {
    const parsed = JSON.parse(flat) as Record<string, unknown>;
    const err = (parsed.error && typeof parsed.error === "object" ? parsed.error : parsed) as Record<string, unknown>;
    const bits: string[] = [];
    const push = (v: unknown): void => {
      if (typeof v === "number") bits.push(String(v));
      else if (typeof v === "string" && v.trim() && !bits.includes(v.trim())) bits.push(v.trim());
    };
    push(err.message ?? parsed.message);
    push(err.code ?? parsed.code);
    const meta = (err.metadata ?? parsed.metadata) as Record<string, unknown> | undefined;
    if (meta) {
      push(meta.raw);
      push(meta.message);
      push(meta.provider_name);
    }
    push(err.detail);
    const out = bits.join(" — ");
    if (out) return out.slice(0, ERROR_DETAIL_MAX);
  } catch {
    // Not JSON. Fall through to the raw head rather than losing the body
    // entirely — some providers answer 5xx with an HTML page whose title is the
    // only signal there is.
  }
  return flat.slice(0, ERROR_DETAIL_MAX);
}
