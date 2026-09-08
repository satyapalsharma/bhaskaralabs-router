// DensityCrusher — generic fallback for large prose blobs (LeanCTX-density analog).
//
// SmartCrusher owns JSON, SearchCrusher owns grep rows, LogCrusher owns logs,
// GitCrusher owns git output. Everything else large (doc dumps, RAG chunks,
// help text, config files, stack-adjacent prose) used to pass through untouched.
// This is the last-resort crusher: keep head + tail boundaries and the
// highest-signal lines up to a density budget, drop the middle with markers.
//
// Scoring is deliberately boring and deterministic: keyword hits (errors,
// paths, line refs, URLs, TODOs), numbers, and code-ish lines score up;
// empty/short boilerplate scores down. Same input bytes → same output bytes.
//
// INVARIANTS: kept lines byte-identical; self-check on size; deterministic.
// Conservative by design: 40% density floor, 60-line minimum, boundaries kept.

import { CrushResult } from "./smart-crusher";

const SIGNAL_RE = /\b(error|fail|exception|warn|todo|fixme|note|important|caution|deprecated)\b/i;
const REF_RE = /(:\d+(:\d+)?\b|\/[\w.~-]+\/|https?:\/\/|[\w.-]+\.(ts|js|py|rs|go|java|md|json|yaml|toml)\b)/;
const CODEISH_RE = /^[\s]*([{}()[\];=>|•*-]|[a-z_$][\w$]*\s*[:=(])/i;

function scoreDensity(line: string): number {
  const t = line.trim();
  if (t === "") return 0;
  if (t.length < 12) return 0.05;
  let s = 0.15; // base: non-trivial prose line
  if (SIGNAL_RE.test(t)) s += 0.5;
  if (REF_RE.test(t)) s += 0.35;
  if (CODEISH_RE.test(t)) s += 0.2;
  if (/\d/.test(t)) s += 0.1;
  return Math.min(s, 1);
}

export function densityCrush(text: string, keepRatio = 0.4, minLines = 60): CrushResult {
  const original = text;
  const fallback = { text: original, originalTokens: Math.ceil(original.length / 4), kept: -1, total: -1 };
  const lines = text.split("\n");
  if (lines.length < minLines) return fallback;

  const HEAD = 12;
  const TAIL = 12;
  const budget = Math.max(HEAD + TAIL + 8, Math.floor(lines.length * keepRatio));
  const keepIdx = new Set<number>();
  for (let i = 0; i < Math.min(HEAD, lines.length); i++) keepIdx.add(i);
  for (let i = Math.max(HEAD, lines.length - TAIL); i < lines.length; i++) keepIdx.add(i);

  const scored = lines
    .map((l, i) => ({ i, s: scoreDensity(l) }))
    .filter((x) => !keepIdx.has(x.i) && x.s > 0.15)
    .sort((a, b) => b.s - a.s || a.i - b.i);
  for (const x of scored) {
    if (keepIdx.size >= budget) break;
    keepIdx.add(x.i);
  }

  const kept = [...keepIdx].sort((a, b) => a - b);
  const outLines: string[] = [];
  let prev = -1;
  for (const i of kept) {
    if (prev >= 0 && i > prev + 1) outLines.push(`… (${i - prev - 1} lines skipped)`);
    outLines.push(lines[i]);
    prev = i;
  }
  const out =
    outLines.join("\n") + `\n[density crushed: ${lines.length} → ${kept.length} lines; kept boundaries + signal lines]`;
  if (out.length >= original.length) return fallback;
  return { text: out, originalTokens: Math.ceil(original.length / 4), kept: kept.length, total: lines.length };
}
