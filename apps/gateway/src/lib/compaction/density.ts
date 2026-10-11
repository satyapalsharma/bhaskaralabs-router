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
//
// PROSE ONLY. Dropping 60% of the lines of a source file, a config or a path
// listing does not shorten it, it breaks it: the agent edits against text
// that is no longer the file. So this crusher has to be shown prose before it
// acts — looksLikeProse() is a positive test, not a "does not look like code"
// test, because the two failure directions are not equal. Prose it fails to
// recognise costs tokens. Code it fails to recognise costs a corrupted file.
// The caller adds the other half of the guard: it never offers this crusher a
// role "tool" block at all (live-zone.ts, THE OTHER RULE), since a README
// read through a tool is prose by any content test and still a file read.

import { CrushResult } from "./smart-crusher";

// A word as it appears in running text: letters, inner apostrophes/hyphens,
// optional wrapping punctuation. `self.items`, `foo()`, `x=1`, `--flag`,
// `src/a.ts`, `{` and `42` are not words.
const WORD_RE = /^[("'“‘\[*_]*\p{L}+(?:['’-]\p{L}+)*[)"'”’\]*_.,;:!?]*$/u;
// Syntax a sentence does not carry: braces, a statement-ending `;`, operators,
// `name(` calls (but not "file(s)"), ` = ` assignment, indexing, closing
// tags, decorator/variable sigils, and comment leaders no prose format shares.
const CODE_RE =
  /[{}]|;\s*$|=>|->|::|==|!=|<=|>=|&&|\|\||:=|[+\-*\/]=|\s=\s|\w\((?!(?:e?s|ies)\))|\w\[[^\]\s]*\]|<\/[A-Za-z]|\/>|^\s*(?:\/\/|\/\*|\*\/|<!--|"""|'''|[@$]\w)|^\s+\*(?:\s|\/|$)/;
// Any one of these means the block is, or wraps, something structured: a
// fenced code block, a merge-conflict marker, a tag-only line (`<file>`,
// `<system-reminder>`, HTML).
const VETO_RE = /^\s*(?:```|~~~)|^(?:<{7}|>{7})(?:\s|$)|^\s*<\/?[A-Za-z][\w:.-]*(?:\s[^>]*)?>\s*$/;
// Line-number gutter of a file-read rendering: "    12\tcode", "12: code", "00012| code".
const GUTTER_RE = /^\s*\d+(?:\t|→|:\s|\s*\|\s)/;

export interface ProseProfile {
  lines: number; // non-blank
  prose: number; // sentence-like: 5+ tokens, at least 80% of them words
  code: number; // carries code syntax
  hash: number; // "#"-led: a Markdown heading or a Python/shell/YAML comment
  gutter: number; // starts with a line-number gutter
  veto: boolean;
}

export function proseProfile(text: string): ProseProfile {
  const p: ProseProfile = { lines: 0, prose: 0, code: 0, hash: 0, gutter: 0, veto: false };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    p.lines++;
    if (VETO_RE.test(line)) p.veto = true;
    if (GUTTER_RE.test(line)) p.gutter++;
    if (t.startsWith("#")) {
      p.hash++;
    } else if (CODE_RE.test(line)) {
      p.code++;
    } else {
      const tokens = t.split(/\s+/);
      if (tokens.length >= 5 && tokens.filter((w) => WORD_RE.test(w)).length >= tokens.length * 0.8) p.prose++;
    }
  }
  return p;
}

// Thresholds are set from real files, not taste: see live-zone-source.test.ts.
// "#" lines get their own, looser cap because a Markdown document is allowed
// headings while a commented-out config file is not allowed to pass as prose.
const MIN_PROSE_SHARE = 0.6;
const MAX_CODE_SHARE = 0.05;
const MAX_HASH_SHARE = 0.15;
const MAX_GUTTER_SHARE = 0.2;

export function looksLikeProse(text: string): boolean {
  const p = proseProfile(text);
  if (p.veto || p.lines === 0) return false;
  return (
    p.prose >= p.lines * MIN_PROSE_SHARE &&
    p.code <= p.lines * MAX_CODE_SHARE &&
    p.hash <= p.lines * MAX_HASH_SHARE &&
    p.gutter <= p.lines * MAX_GUTTER_SHARE
  );
}

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
  if (!looksLikeProse(text)) return fallback;

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
