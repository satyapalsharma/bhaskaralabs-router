// Shared metering types + pure pricing math. No imports from apps.

import { FRONTIER_DISPLAY, THETA_DISPLAY, HYPER, DEVPASS } from "./pricing";

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;    // actual cached tokens from provider response
  reasoningTokens?: number;
  model: string;            // actual upstream model id
  provider: string;         // hyper | devpass | agnes | stepfun
}

export interface UserFacingValuation {
  /** What we show the user: $ they'd pay at list API rates */
  equivalentApiCost: number;
  displayTokens: { input: number; output: number };
}

/** User-facing valuation. Frontier: full-model list rates (no cache discount). Theta: display rates. */
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
  if (u.provider === "devpass") {
    const r = DEVPASS[u.model];
    if (!r) return 0;
    return (u.promptTokens * r.input + u.completionTokens * r.output) / 1e6;
  }
  return 0; // agnes/stepfun — flat-plan providers, amortized monthly
}