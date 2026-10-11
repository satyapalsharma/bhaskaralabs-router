// LogCrusher + SearchCrusher — deterministic output compression
// (headroom-inspired, our independent port of Apache-2.0 concepts).
//
// LogCrusher: build/test output (10K+ lines → errors/fails/stacks/summaries + context)
// SearchCrusher: grep/ripgrep output (file:line:content rows → top-N by file, deduped)
//
// INVARIANTS: kept lines are byte-identical; self-check on size; deterministic.

import { CrushResult } from "./smart-crusher";

// What a failure looks like has to cover every format looksLikeLogOutput
// accepts, or the crusher drops the lines the detector recognised the log by:
// go's "--- FAIL:" and jest's "FAIL file" (bare FAIL), Rust's "panicked at",
// TAP's "not ok", and the cross marks (which `\b…\b` could never match).
const ERROR_PAT = /\b(error|fatal|critical|exception|panic|panicked|fail|failed|failure|not ok)\b|[✗✘✕×]/i;
const WARN_PAT = /^(.*\b(warn|warning|deprecated)\b.*)$/i;
const STACK_PAT = /^\s+(at |in |from |File "|Traceback|…|\.\.\.)/;
const SUMMARY_PAT = /(\d+ (passed|failed|error)|tests?\s+\d+|✓ \d+|✔ \d+|summary|====)/i;
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function scoreLine(line: string): number {
  if (ERROR_PAT.test(line)) return 1.0;
  if (STACK_PAT.test(line)) return 0.7;
  if (SUMMARY_PAT.test(line)) return 0.6;
  if (WARN_PAT.test(line)) return 0.4;
  return 0.05;
}

export function logCrush(text: string, maxLines = 120): CrushResult {
  const original = text;
  const fallback = { text: original, originalTokens: Math.ceil(original.length / 4), kept: -1, total: -1 };
  const clean = text.replace(ANSI_RE, "");
  const lines = clean.split("\n");
  if (lines.length < 40) return fallback;

  const scored = lines.map((l, i) => ({ i, s: scoreLine(l), l }));
  const important = scored.filter((x) => x.s >= 0.6).sort((a, b) => b.s - a.s).slice(0, maxLines);
  const keepIdx = new Set(important.map((x) => x.i));

  // context window: 2 lines around each error
  for (const x of important) {
    if (x.s >= 0.9) {
      for (let d = -2; d <= 2; d++) {
        const idx = x.i + d;
        if (idx >= 0 && idx < lines.length) keepIdx.add(idx);
      }
    }
  }
  // boundaries
  keepIdx.add(0);
  keepIdx.add(lines.length - 1);

  // fill to at least 30 lines with warnings
  if (keepIdx.size < 30) {
    for (const x of scored) {
      if (keepIdx.size >= 30) break;
      if (x.s >= 0.4) keepIdx.add(x.i);
    }
  }

  const kept = [...keepIdx].sort((a, b) => a - b);
  // build with gap markers
  const outLines: string[] = [];
  let prev = -1;
  for (const i of kept) {
    if (prev >= 0 && i > prev + 1) outLines.push(`… (${i - prev - 1} lines skipped)`);
    outLines.push(lines[i]);
    prev = i;
  }
  const out = outLines.join("\n") + `\n[log crushed: ${lines.length} → ${kept.length} lines; kept errors, stack traces, summaries, context]`;
  if (out.length >= original.length) return fallback;
  return { text: out, originalTokens: Math.ceil(original.length / 4), kept: kept.length, total: lines.length };
}

const GREP_ROW = /^(.+?):(\d+):(.*)$/;

export function searchCrush(text: string, maxMatches = 60): CrushResult {
  const original = text;
  const fallback = { text: original, originalTokens: Math.ceil(original.length / 4), kept: -1, total: -1 };
  const lines = text.split("\n").filter((l) => l.trim());
  const rows = lines.filter((l) => GREP_ROW.test(l));
  if (rows.length < maxMatches * 2) return fallback; // not worth it

  // group by file
  const byFile = new Map<string, Array<{ line: number; content: string }>>();
  for (const l of rows) {
    const m = GREP_ROW.exec(l);
    if (!m) continue;
    const [, file, lineNo, content] = m;
    let arr = byFile.get(file);
    if (!arr) {
      arr = [];
      byFile.set(file, arr);
    }
    arr.push({ line: Number(lineNo), content });
  }
  if (byFile.size < 2) return fallback; // single file — model may want all

  const perFileCap = Math.max(4, Math.floor(maxMatches / byFile.size));
  const outLines: string[] = [];
  let keptCount = 0;
  for (const [file, matches] of byFile) {
    const idx = new Set<number>([0, matches.length - 1]);
    const step = Math.max(1, Math.floor(matches.length / perFileCap));
    for (let i = 0; i < matches.length && idx.size < perFileCap; i += step) idx.add(i);
    const kept = [...idx].sort((a, b) => a - b);
    let prev = -1;
    for (const i of kept) {
      if (prev >= 0 && matches[i].line > prev + 1) outLines.push(`…`);
      outLines.push(`${file}:${matches[i].line}:${matches[i].content}`);
      prev = matches[i].line;
      keptCount++;
    }
    if (matches.length > kept.length) outLines.push(`[… ${matches.length - kept.length} more in ${file}]`);
  }
  const out = outLines.join("\n") + `\n[search crushed: ${rows.length} → ${keptCount} matches across ${byFile.size} files]`;
  if (out.length >= original.length) return fallback;
  return { text: out, originalTokens: Math.ceil(original.length / 4), kept: keptCount, total: rows.length };
}

export function looksLikeGrepOutput(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 10) return false;
  const matches = lines.filter((l) => GREP_ROW.test(l)).length;
  return matches / lines.length > 0.8;
}

// A line is log evidence only when it has log STRUCTURE where a log puts it —
// at the start of the line: a timestamp with a level, a level token, a
// compiler diagnostic, a stack frame, a test-runner verdict, a build-tool
// progress row. The word "error" somewhere in a line is not structure:
// `return Err(Error::Io(e))`, `throw new Error(...)` and `logger.error(...)`
// are code, and the previous rule (any line scoreLine() rated, at 15% of
// lines) took error-handling-heavy source files for logs and kept only their
// "error" lines.
//
// A timestamp alone is not enough either. Meeting transcripts, subtitles and
// chat exports lead every line with one, and logCrush's premise — only the
// errors matter — is false for all of them. It takes a level next to the
// timestamp to say "machine log". Timestamps are matched raw and as the
// volatile mask's `<ts>` (the mask runs before routing), with an optional
// date in front: ISO, or Go's "2026/10/11 09:14:02".
const LOG_TS = String.raw`(?:\d{4}[-/]\d{2}[-/]\d{2}[T ])?(?:<ts>|\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)`;
const LOG_LEVEL = String.raw`(?:\[?(?:TRACE|DEBUG|INFO|NOTICE|WARN|WARNING|ERROR|FATAL|CRITICAL)\b|\[(?:trace|debug|info|notice|warn|warning|error|fatal|critical)\]|(?:level|lvl|severity)=)`;
const LOG_LINE_RES: RegExp[] = [
  new RegExp(`^\\[?${LOG_TS}\\]?[ \\t]+(?:\\S+[ \\t]+){0,3}${LOG_LEVEL}`), // 2026-10-11T09:14:02Z INFO …   09:14:02,120 [main] WARN …
  new RegExp(`^${LOG_LEVEL}(?:\\]?:? +\\S|\\w)`), // INFO …   [ERROR] …   WARN: …   level=info …
  /^(?:error|warning|note|help)(?:\[[\w-]+\])?: \S/, // rustc/gcc/clang: error[E0308]: …
  /^[^\s:()]+(?::\d+:\d+:?|\(\d+,\d+\):) (?:- )?(?:fatal )?(?:error|warning)\b/, // src/a.ts(3,1): error TS…   a.c:3:1: warning: …
  /^\s+at .+(?::\d+\)?|\))$/, // JS / Java stack frame
  /^\s*File ".+", line \d+/, // Python stack frame
  /^Traceback \(most recent call last\):/,
  /^(?:PASS|FAIL|FAILED|ERROR)(?:$|[ \t]+\S)|^ok  \t/, // jest "PASS src/a.test.ts", go "ok  \tpkg\t0.3s", pytest "FAILED a.py::t"
  /^(?:=== (?:RUN|PAUSE|CONT|NAME) |\s*--- (?:PASS|FAIL|SKIP): )/, // go test -v
  /^test \S.* \.\.\. (?:ok|FAILED|ignored)\b/, // cargo test
  /^\S+::\S+ (?:PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS)\b/, // pytest -v
  /^E {3,}\S/, // pytest assertion detail
  /^(?:not )?ok \d+\b/, // TAP
  /^\s*(?:[✓✔✗✘✕×] |\((?:pass|fail|skip|todo)\) )/, // jest/vitest/mocha/bun
  /^\s+(?:Compiling|Checking|Finished|Running|Downloading|Downloaded|Building|Fresh|Updating|Locking|Installing|Documenting) \S/, // cargo
  /^npm (?:WARN|ERR!|warn|error|notice)\b/,
  /^#\d+ (?:\[|\d+\.\d+ |DONE |CACHED|ERROR)/, // docker buildkit
  /^\[\s*\d+\/\d+\] \S/, // ninja / make / pip progress counters
];

/** Share of non-blank lines carrying log structure. Exposed for tests and tuning. */
export function logLineShare(text: string): number {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return 0;
  return lines.filter((l) => LOG_LINE_RES.some((re) => re.test(l))).length / lines.length;
}

// Real build/test/app logs sit far above this (most lines are structured);
// real source files sit far below it (see live-zone-source.test.ts for the
// measured ceiling). The gap is the safety margin.
const MIN_LOG_LINE_SHARE = 0.3;

export function looksLikeLogOutput(text: string): boolean {
  if (text.split("\n").length < 40) return false;
  return logLineShare(text) >= MIN_LOG_LINE_SHARE;
}
