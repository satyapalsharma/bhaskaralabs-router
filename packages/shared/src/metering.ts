// Shared metering types + pure pricing math. No imports from apps.
//
// Two ledgers ride on every request and must never be mixed:
//   Side A (user-facing) — raw streamed tokens valued at list rates. What the
//                          dashboard shows and the quota is counted against.
//   Side B (internal)    — what we actually pay. Never leaves this module and
//                          the admin surfaces.
//
// Providers are shared between the two products (Hyper serves both), so
// valuation keys on the *endpoint the client called*, not on the provider.

import {
  FRONTIER_DISPLAY,
  THETA_DISPLAY,
  FLAT_PROVIDERS,
  UPSTREAM_RATES,
} from "./pricing";

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number; // actual cached tokens from the provider response
  reasoningTokens?: number;
  model: string; // actual upstream model id
  provider: string; // hyper | agnes | stepfun | camel | pareto | ...
  /** The product endpoint the client called. Decides which display rate card
   *  applies. Optional so rows written before this field existed still value. */
  endpoint?: string;
  /** Provider-reported exact cost, when the provider gives one. */
  actualCostOverrideUsd?: number;
}

export interface UserFacingValuation {
  /** What we show the user: what the same tokens would cost at list rates. */
  equivalentApiCost: number;
  displayTokens: { input: number; output: number };
}

/**
 * Runtime rate overlay for providers the static table does not know.
 *
 * `UPSTREAM_RATES` is compiled in and covers the hardcoded lanes only. Every
 * provider registered through the admin panel is invisible to it, and an
 * invisible provider prices at $0 — right for a flat subscription lane, badly
 * wrong for a metered one. Openference served 200 turns that way: it bills per
 * request against credits at GLM-5.3 list rates, and the ledger recorded the
 * whole window as free.
 *
 * The gateway registers the fleet's own rate cards here once they load, so the
 * ledger values a fleet turn the same way it values a built-in one. Kept as an
 * overlay rather than a mutation of `UPSTREAM_RATES` so the compiled table
 * stays a constant and tests can reset to a known state.
 */
const RATE_OVERLAY = new Map<string, Map<string, RateCardLike>>();

export interface RateCardLike {
  input: number;
  output: number;
  cacheHit?: number;
}

/** Register (or clear, with an empty list) a provider's runtime rate cards. */
export function registerUpstreamRates(provider: string, cards: Record<string, RateCardLike>): void {
  const entries = Object.entries(cards);
  if (entries.length === 0) {
    RATE_OVERLAY.delete(provider);
    return;
  }
  RATE_OVERLAY.set(provider, new Map(entries));
}

/** Drop every overlay — tests and a fleet reload both need a clean slate. */
export function clearUpstreamRates(): void {
  RATE_OVERLAY.clear();
}

function cardIn(cards: Map<string, RateCardLike> | Record<string, RateCardLike>, model: string, base: string): RateCardLike | undefined {
  const read = (k: string) => (cards instanceof Map ? cards.get(k) : cards[k]);
  const direct = read(model) ?? read(base) ?? read(`${base}:dev`);
  if (direct) return direct;
  // Case-differing ids: Openference advertises `GLM-5.3` while a call routes to
  // `glm-5.3`, and a lookup that misses on case books the turn at zero rather
  // than at list.
  const wanted = base.toLowerCase();
  const entries = cards instanceof Map ? [...cards.entries()] : Object.entries(cards);
  for (const [id, card] of entries) {
    if (id.toLowerCase().replace(/:dev$/, "") === wanted) return card;
  }
  return undefined;
}

function rateCardFor(provider: string, model: string): RateCardLike | undefined {
  const base = model.replace(/:dev$/, "");
  const overlay = RATE_OVERLAY.get(provider);
  if (overlay) {
    const hit = cardIn(overlay, model, base);
    if (hit) return hit;
  }
  const statics = UPSTREAM_RATES[provider];
  return statics ? cardIn(statics, model, base) : undefined;
}

/**
 * User-facing valuation.
 *
 * theta is valued at its display rates regardless of which upstream answered,
 * which is the whole point of the endpoint: the user bought requests, not a
 * specific backend. glm-5.3 is valued at the full-model list rates with no cache
 * discount, because that is the honest "what you would have paid direct"
 * comparison the calculator also makes.
 *
 * NOTE: OpenAI-style completion_tokens includes reasoning tokens when the
 * provider reports them separately. We bill the total and never double-count.
 * When a provider omits the breakdown the reasoning split stays 0 in the ledger
 * but billing stays correct.
 */
export function valueUserFacing(u: Usage): UserFacingValuation {
  const isTheta =
    u.endpoint === "theta" ||
    // Fallback for rows without an endpoint: anything not identifiable as a
    // glm model is valued at theta rates.
    (u.endpoint === undefined && !u.model.startsWith("glm-5.3"));

  const rate = isTheta ? THETA_DISPLAY : FRONTIER_DISPLAY;
  return {
    equivalentApiCost:
      (u.promptTokens * rate.input + u.completionTokens * rate.output) / 1e6,
    displayTokens: { input: u.promptTokens, output: u.completionTokens },
  };
}

/**
 * Actual COGS per request, in dollars.
 *
 * Flat-plan providers return 0 here on purpose: their real cost is the monthly
 * invoice, amortized at margin level against the request counts the ledger
 * records. Booking a fake per-request cost for them would hide which providers
 * are actually consuming budget.
 */
export function valueActualCost(u: Usage): number {
  // A provider-reported exact cost always wins — it is ground truth.
  if (typeof u.actualCostOverrideUsd === "number") return u.actualCostOverrideUsd;

  if (FLAT_PROVIDERS.includes(u.provider)) return 0;

  const card = rateCardFor(u.provider, u.model);
  if (!card) return 0;

  const cached = Math.min(u.cachedTokens ?? 0, u.promptTokens);
  const fresh = u.promptTokens - cached;
  const cacheRate = card.cacheHit ?? card.input;
  return (cached * cacheRate + fresh * card.input + u.completionTokens * card.output) / 1e6;
}

/** Whether a provider's cost is a flat plan fee rather than per-token. */
export function isFlatProvider(provider: string): boolean {
  return FLAT_PROVIDERS.includes(provider);
}
