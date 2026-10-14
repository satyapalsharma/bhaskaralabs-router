/**
 * Credit-bucket egress pool (2026-10-14): agnes throttles by CLIENT IP at
 * ~200 req/min sustained (fixed ~5-minute penalty), and the cap is
 * ACCOUNT-AGNOSTIC — every subscription leaving through the same source IP
 * shares one upstream budget. The first fix hardcoded different modal relay
 * regions into different accounts' base_urls (agnes2→us-east, agnes3→
 * us-west, …), which added a relay hop's latency to every single request.
 *
 * This replaces both that and the random egress split: every participating
 * provider's request goes DIRECT while the shared direct bucket has credits,
 * and only overflows to a relay (round-robin across regions, each with its
 * own bucket) when the direct bucket is drained. Buckets reset to capacity
 * at each 60s window boundary. Under normal load (~50-150 turns/min) the
 * direct bucket never drains, so requests pay zero relay latency; during
 * bursts the relays absorb the overflow and the per-IP throttle is never
 * tripped. If every bucket drains (fleet >200 + relays×credits req/min),
 * requests fall back to direct — the existing 429-intelligence (account
 * cooldown) absorbs the remainder rather than failing the turn.
 *
 * Config (env, no DB):
 *   BHASKARA_EGRESS_POOL_PROVIDERS        comma list of provider ids
 *   BHASKARA_EGRESS_POOL_DIRECT_CREDITS   per-minute budget of the VPS IP
 *   BHASKARA_EGRESS_POOL_RELAY_URLS       comma list of relay base URLs
 *   BHASKARA_EGRESS_POOL_RELAY_CREDITS    per-minute budget of EACH relay
 *
 * The pool is ONE shared set of buckets across all participating providers:
 * the upstream throttle is keyed on source IP, not account, so agnes2 and
 * agnes4 leaving via the same VPS share one budget upstream — the buckets
 * must match that reality. Relay regions are likewise shared.
 */

const WINDOW_MS = 60_000;

interface EgressRoute {
  name: string;
  /** null = the provider's own (direct) base URL. */
  url: string | null;
  capacity: number;
  windowStart: number;
  credits: number;
}

let providers = new Set<string>();
let direct: EgressRoute = { name: "direct", url: null, capacity: 0, windowStart: 0, credits: 0 };
let relays: EgressRoute[] = [];
let rr = 0;

function ensureInit(): void {
  if (direct.windowStart !== 0) return;
  const list = (process.env.BHASKARA_EGRESS_POOL_PROVIDERS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  providers = new Set(list);
  const dc = Number(process.env.BHASKARA_EGRESS_POOL_DIRECT_CREDITS ?? 0);
  const rc = Number(process.env.BHASKARA_EGRESS_POOL_RELAY_CREDITS ?? 0);
  const urls = (process.env.BHASKARA_EGRESS_POOL_RELAY_URLS ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  const now = Date.now();
  direct = { name: "direct", url: null, capacity: dc, windowStart: now, credits: dc };
  relays = urls.map((u, i) => ({ name: `relay-${i + 1}`, url: u, capacity: rc, windowStart: now, credits: rc }));
  rr = 0;
}

function refill(route: EgressRoute): void {
  const now = Date.now();
  if (now - route.windowStart >= WINDOW_MS) {
    route.windowStart = now;
    route.credits = route.capacity;
  }
}

/**
 * Pick the egress base URL for a request to a pool provider.
 * Direct while the direct bucket has credits; relay round-robin on
 * overflow; direct as the last resort.
 */
export function egressPoolUrl(providerId: string, baseUrl: string): string {
  ensureInit();
  if (!providers.has(providerId)) return baseUrl;
  refill(direct);
  if (direct.credits > 0) {
    direct.credits--;
    return baseUrl;
  }
  for (let i = 0; i < relays.length; i++) {
    const r = relays[(rr + i) % relays.length];
    refill(r);
    if (r.credits > 0) {
      r.credits--;
      rr = (rr + i + 1) % relays.length;
      console.log(JSON.stringify({ ev: "egress-overflow", provider: providerId, via: r.name }));
      return r.url!;
    }
  }
  console.log(JSON.stringify({ ev: "egress-exhausted", provider: providerId }));
  return baseUrl;
}

/** Test hook: re-read env on next call (module-level state is per-process). */
export function __resetEgressPoolForTest(): void {
  direct = { name: "direct", url: null, capacity: 0, windowStart: 0, credits: 0 };
  relays = [];
  rr = 0;
}

/** Test hook: age every route's window by ms (simulates the minute boundary). */
export function __advanceWindowForTest(ms: number): void {
  direct.windowStart -= ms;
  for (const r of relays) r.windowStart -= ms;
}
