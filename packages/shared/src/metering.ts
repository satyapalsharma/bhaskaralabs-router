// Shared metering types + pure pricing math. No imports from apps.

import { FRONTIER_DISPLAY, THETA_DISPLAY, HYPER, DEVPASS, GENERALCOMPUTE } from "./pricing";

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;    // actual cached tokens from provider response
  reasoningTokens?: number;
  model: string;            // actual upstream model id
  provider: string;         // hyper | devpass | agnes | stepfun | camel | ...
  actualCostOverrideUsd?: number; // provider-reported exact cost (camel metered)
}

export interface UserFacingValuation {
  /** What we show the user: $ they'd pay at list API rates */
  equivalentApiCost: number;
  displayTokens: { input: number; output: number };
}

/** User-facing valuation. Frontier: full-model list rates (no cache discount). Theta: display rates.
 * NOTE: OpenAI-style completion_tokens includes reasoning tokens when the provider reports
 * them separately (completion_tokens_details.reasoning_tokens) — we bill on the total, never
 * double-count. When the provider omits the breakdown (observed on Hyper GLM), the reasoning
 * split in the ledger stays 0 but billing stays correct. */
export function valueUserFacing(u: Usage): UserFacingValuation {
  if (u.provider !== "hyper") {
    const c = THETA_DISPLAY;
    return {
      equivalentApiCost: (u.promptTokens * c.input + u.completionTokens * c.output) / 1e6,
      displayTokens: { input: u.promptTokens, output: u.completionTokens },
    };
  }
  const rate = FRONTIER_DISPLAY[u.model] ?? FRONTIER_DISPLAY["glm-5.3"];
  return {
    equivalentApiCost: (u.promptTokens * rate.input + u.completionTokens * rate.output) / 1e6,
    displayTokens: { input: u.promptTokens, output: u.completionTokens },
  };
}

/**
 * Actual COGS per request (internal ledger, $).
 * Hyper: exact token math from provider-reported usage.
 * DevPass: metered at list rates (allowance burn tracked separately in ledger).
 * Agnes/StepFun: flat plan amortization is applied monthly at margin level — per-request cost is 0,
 *   the request count in the ledger is what amortization divides by.
 */
export function valueActualCost(u: Usage): number {
  if (u.provider === "hyper") {
    const r = HYPER[u.model];
    if (!r) return 0;
    const cached = Math.min(u.cachedTokens ?? 0, u.promptTokens);
    const fresh = u.promptTokens - cached;
    const cacheRate = r.cacheHit ?? r.input;
    return (cached * cacheRate + fresh * r.input + u.completionTokens * r.output) / 1e6;
  }
  if (u.provider === "camel") {
    // Camel Stream: metered per-request — actual cost comes from the
    // provider-reported usage.cost_details.upstream_inference_cost carried
    // in providerMeta by the gateway. When absent (older rows), estimate
    // from tokens at gpt-5.6-class rates ($1.2 in / $6 out per M — the
    // observed upstream_inference rates: 14in/8out → $0.0000124 ≈ these).
    if (typeof u.actualCostOverrideUsd === "number") return u.actualCostOverrideUsd;
    return (u.promptTokens * 1.2 + u.completionTokens * 6.0) / 1e6;
  }
  if (u.provider === "devpass") {
    const r = DEVPASS[u.model];
    if (!r) return 0;
    return (u.promptTokens * r.input + u.completionTokens * r.output) / 1e6;
  }
  if (u.provider === "generalcompute") {
    const r = GENERALCOMPUTE[u.model];
    if (!r) return 0;
    return (u.promptTokens * r.input + u.completionTokens * r.output) / 1e6;
  }
  return 0; // agnes/stepfun — flat-plan providers, amortized monthly
}