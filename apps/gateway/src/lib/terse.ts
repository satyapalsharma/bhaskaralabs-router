// Terse-output injection (Caveman-inspired, MIT-concept — our own implementation).
//
// WHAT: opt-in output-discipline system block. Cuts pleasantries, preambles,
// restatements, and closing summaries from model replies while keeping code,
// commands, file paths, and error text byte-exact.
//
// WHY IT'S SAFE FOR CACHE (the critical property): the block is injected into
// the SYSTEM prompt only. System prompt is part of the stable prefix — it
// changes ONCE when a session enables terse mode, then stays byte-identical
// for every subsequent turn. Cache wipes exactly once per opt-in, never again.
//
// EVIDENCE (our own A/B, 2026-09-01, glm-5.3-flash):
//   verbose arm: 800 output tokens → 34 usable chars (reasoning ate budget)
//   terse  arm: 325 output tokens → 532 usable chars
//   → 2.5× cheaper, 2.6× faster, MORE usable output.
//
// ACTIVATION: request header `x-bhaskara-terse` (per-request; agents that
// set it once per session keep the prefix stable across all turns).
//   "1"/"true"/"on" → terse arm (control: output discipline only)
//   "ladder"        → ladder arm (treatment: terse + YAGNI decision ladder)
// A/B readout (provider_meta is text-as-JSON):
//   SELECT provider_meta::json->>'terseArm' AS arm, count(*),
//     avg(completion_tokens)::int AS avg_out, avg(prompt_tokens)::int AS avg_in
//   FROM usage_ledger WHERE created_at > now() - interval '7 days' GROUP BY 1;
//
// NO EFFORT GATING (deliberate): switching system bytes by effort lane would
// wipe the prefix cache on every escalation. The ladder says "silently" to
// keep thinking-token deliberation off the bill instead.

export type TerseArm = "off" | "terse" | "ladder";

export function terseArmOf(headerValue: string | undefined | null): TerseArm {
  const v = (headerValue ?? "").trim().toLowerCase();
  if (v === "ladder" || v === "yagni") return "ladder";
  if (v === "1" || v === "true" || v === "on") return "terse";
  return "off";
}

/** YAGNI decision ladder (Ponytail-concept, our own words — keep it short:
 *  every word here is input tokens on every request of the session). */
export const LADDER_BLOCK = `
Minimal-code discipline (active): write only what the task needs.
Before writing code, stop at the first rung that holds — silently, no deliberation in the reply:
1. Does this need to exist? If no, skip it.
2. Already in this codebase? Reuse it, don't rewrite.
3. Stdlib does it? Use stdlib.
4. Native platform feature? Use it.
5. Installed dependency? Use it.
6. One line? One line. 7. Else the minimum that works.
Lazy about the solution, never about reading: read the touched code and trace the real flow first.
Never cut: trust-boundary validation, error handling, data-loss guards, security, accessibility.`.trim();

export const TERSE_BLOCK = `
Output discipline (active): answer in compressed engineer-speak.
- No greeting, no preamble, no "Sure!", no restating the question.
- No closing summary, no "Let me know if…", no offers of further help.
- Lead with the answer; one blank line; then only what was asked for.
- Code, commands, file paths, error text, and API names: byte-exact, complete, never abbreviated.
- No bullet-point decoration for single items; no bold when plain text works.
- Exceptions — use full clear prose ONLY for: security warnings, irreversible
  actions needing confirmation, or genuine ambiguity that compressed phrasing
  could make dangerous. Then resume compressed mode.`.trim();

export function terseEnabled(headerValue: string | undefined | null): boolean {
  const v = (headerValue ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/** Merge the terse block (+ ladder for the treatment arm) into a system-prompt string. */
export function applyTerseToSystem(systemText: string, ladder = false): string {
  return ladder ? `${systemText}\n\n${TERSE_BLOCK}\n\n${LADDER_BLOCK}` : `${systemText}\n\n${TERSE_BLOCK}`;
}