// LogCrusher + SearchCrusher — deterministic output compression
// (headroom-inspired, our independent port of Apache-2.0 concepts).
//
// LogCrusher: build/test output (10K+ lines → errors/fails/stacks/summaries + context)
// SearchCrusher: grep/ripgrep output (file:line:content rows → top-N by file, deduped)
//
// INVARIANTS: kept lines are byte-identical; self-check on size; deterministic.

import { CrushResult } from "./smart-crusher";

const ERROR_PAT = /^(.*\b(error|fatal|critical|exception|panic|failed|failure|✗|✘|FAILED|ERROR)\b.*)$/i;
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

export function looksLikeLogOutput(text: string): boolean {
  const lines = text.split("\n");
  if (lines.length < 40) return false;
  // any line that has a recognizable log structure counts (level markers, timestamps, common prefixes)
  const hits = lines.filter((l) =>
    /^(INFO|DEBUG|WARN|ERROR|TRACE|FATAL|CRITICAL|PASS|FAIL|TEST|BUILD|RUN)/i.test(l.trim()) ||
    scoreLine(l) > 0.05,
  ).length;
  return hits / lines.length > 0.15;
}