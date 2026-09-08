// Persist-output injection (PUA-concept, NoPUA-framed — our own implementation).
//
// WHAT: opt-in persistence system block. Pushes the agent to exhaust its tools
// before declaring failure: no premature "I can't do this", no identical
// command retried verbatim, use search/read tools instead of guessing.
//
// FRAMING (deliberate): trust-based ownership language (NoPUA-style), NOT
// fear-based PIP rhetoric. Research notes fear-based "PUA" prompting doesn't
// reliably beat baseline and can degrade thoroughness; ownership framing does.
//
// COST DIRECTION (read before enabling broadly): this spends MORE per task
// (extra tool calls = extra input tokens), aiming for fewer abandoned tasks.
// It is a success-rate lever, not a cost lever. Measure net $/completed-task
// in the ledger (persist arm tag), not tokens/turn.
//
// CACHE: same contract as terse.ts — system-only injection, byte-stable per
// session once the client pins the header. One wipe on opt-in, never again.
//
// ACTIVATION: request header `x-bhaskara-persist: 1|on|true` (per-request;
// agents that set it once per session keep the prefix stable).
// A/B readout (provider_meta is text-as-JSON):
//   SELECT provider_meta::json->>'persistArm' AS arm, count(*),
//     avg(completion_tokens)::int AS avg_out,
//     sum(actual_cost_usd::numeric)::numeric(10,4) AS spend
//   FROM usage_ledger WHERE created_at > now() - interval '7 days' GROUP BY 1;

export const PERSIST_BLOCK = `
Persistence discipline (active): own the task end to end.
- Never declare failure while an untried tool call could move the task forward.
- Never retry an identical failing command verbatim — change the approach: read the error, search the codebase, inspect state first.
- Prefer search/read/inspect tools over guessing file contents or APIs.
- When blocked, narrow the problem (reproduce minimal, bisect) instead of widening the blast radius.
- Report dead-ends briefly with evidence, then route around them.`.trim();

export function persistEnabled(headerValue: string | undefined | null): boolean {
  const v = (headerValue ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/** Merge the persist block into a system-prompt string. */
export function applyPersistToSystem(systemText: string): string {
  return `${systemText}\n\n${PERSIST_BLOCK}`;
}
