// Answer-Keep structural audit (Shadow-Mode gate, our own implementation).
//
// HONEST SCOPE: this does NOT prove the model's answer is unchanged (that
// needs running the model twice — the job of the opencode task-tracker eval,
// not the hot path). It proves the crushers didn't eat what matters most:
// error lines, file:line refs, and head/tail boundaries. Error-line drops and
// boundary drops are VIOLATIONS (tuning signal, sampled review). Ref drops
// are REPORTED only — status/density crushers drop refs by design.
//
// Runs on the shadow path (measurement traffic), never gating live sends:
// a violation logs, it doesn't block. Deterministic, pure, linear scans.
//
// MASK-AWARE COMPARISON: crushed lines passed through the volatile mask
// (timestamps → <ts>, full SHAs shortened) and JSON pairs through a
// parse/stringify round-trip. Survival is therefore checked on NORMALIZED
// lines (mask + whitespace-collapse), not raw bytes — the question is "did
// the content survive?", not "are the bytes identical?".

import type { CrushedPair } from "./live-zone";
import { maskVolatile } from "./volatile";

function norm(line: string): string {
  return maskVolatile(line).text.replace(/\s+/g, "");
}

const ERROR_LINE_RE = /\b(error|fatal|critical|exception|panic|failed|failure)\b/i;
const REF_RE = /[\w./~$-]+\.(ts|js|mjs|cjs|py|rs|go|java|rb|php|md|json|yaml|yml|toml|sql|sh)\s*:\s*\d+/g;

export interface KeepSummary {
  blocks: number;
  errTotal: number;
  errKept: number;
  refTotal: number;
  refKept: number;
  firstKept: number;
  firstTotal: number;
  lastKept: number;
  lastTotal: number;
  violations: string[];
}

function nonEmptyLines(text: string): string[] {
  return text.split("\n").filter((l) => l.trim() !== "");
}

export function auditPairs(pairs: CrushedPair[]): KeepSummary {
  const out: KeepSummary = {
    blocks: pairs.length,
    errTotal: 0, errKept: 0, refTotal: 0, refKept: 0,
    firstKept: 0, firstTotal: 0, lastKept: 0, lastTotal: 0,
    violations: [],
  };
  for (const p of pairs) {
    const crushedSet = new Set(p.crushed.split("\n").map(norm));
    const crushedText = p.crushed;
    const origLines = nonEmptyLines(p.original);

    const errLines = origLines.filter((l) => ERROR_LINE_RE.test(l));
    out.errTotal += errLines.length;
    const dropped = errLines.filter((l) => !crushedSet.has(norm(l)));
    out.errKept += errLines.length - dropped.length;
    if (dropped.length > 0) {
      out.violations.push(
        `[${p.transformer}] dropped ${dropped.length}/${errLines.length} error lines, e.g. ${dropped.slice(0, 3).map((l) => l.slice(0, 120)).join(" | ")}`,
      );
    }

    const refs = new Set<string>();
    for (const l of origLines) {
      REF_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = REF_RE.exec(l)) !== null) refs.add(m[0]);
    }
    out.refTotal += refs.size;
    for (const r of refs) if (crushedText.includes(r)) out.refKept++;

    if (origLines.length > 0) {
      out.firstTotal++;
      if (crushedSet.has(norm(origLines[0]))) out.firstKept++;
      else out.violations.push(`[${p.transformer}] dropped first line: ${origLines[0].slice(0, 100)}`);
      out.lastTotal++;
      if (crushedSet.has(norm(origLines[origLines.length - 1]))) out.lastKept++;
      else out.violations.push(`[${p.transformer}] dropped last line: ${origLines[origLines.length - 1].slice(0, 100)}`);
    }
  }
  return out;
}
