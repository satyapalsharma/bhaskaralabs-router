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
// ACTIVATION: request header `x-bhaskara-terse: 1` (per-request; agents that
// set it once per session keep the prefix stable across all turns).

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

/** Merge the terse block into a system-prompt string (identity block already there). */
export function applyTerseToSystem(systemText: string): string {
  return `${systemText}\n\n${TERSE_BLOCK}`;
}