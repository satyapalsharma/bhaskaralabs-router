// Fair-use nudge headers — the only user-facing surface of router margin policy.
// Full-model requests are capped at 10% of a user's weekly turns (alert at 8%).
// When a decision crosses those lines the response carries:
//   x-bhaskara-fair-use: alert|capped   — current state
//   x-bhaskara-full-share: 8.3%        — the weekly full-model share
// No pricing data, no error — a plain hint harnesses may surface to the user.

import type { Context } from "hono";
import type { RouterDecision } from "../router";

export function setNudgeHeader(c: Context, decision: RouterDecision): void {
  if (!decision.fairUse) return;
  c.header("x-bhaskara-fair-use", decision.fairUse);
  if (typeof decision.fairUseShare === "number") {
    c.header("x-bhaskara-full-share", `${(decision.fairUseShare * 100).toFixed(1)}%`);
  }
}
