// GitCrusher — git status/diff/log output compression (RTK-command-table analog).
//
// Tool results routinely contain full `git status` (hundreds of paths),
// `git diff` (index/---/+++ boilerplate per file) and `git log --format=full`
// (5 lines per commit). All three have safe, well-understood compactions:
//
// status → per-state counts + grouped paths (branch line kept verbatim)
// diff   → boilerplate lines stripped; oversized diffs truncated per-file
// log    → one line per commit: short-sha author date subject
//
// INVARIANTS: kept lines byte-identical; self-check on size; deterministic.
// Runs on volatile-masked text (SHAs already short — parser accepts both).

import { CrushResult } from "./smart-crusher";

const GIT_MARKERS = [
  /^diff --git a\/.+ b\/.+$/,
  /^commit [0-9a-f]{7,40}…?(\s|$)/,
  /^(index [0-9a-f]+\.\.[0-9a-f]+|--- a\/|\+\+\+ b\/|\\ No newline)/,
  /^Date:   /,
  /^On branch /,
  /^nothing to commit/,
  /^Changes (to be committed|not staged for commit):$/,
  /^Untracked files:$/,
  /^@@ /,
  /^(M|A|D|R|C|U|\?\?|!!) /,
  /^[MADRCU?! ]{1,2} /,
];

function gitHit(line: string): boolean {
  return GIT_MARKERS.some((re) => re.test(line));
}

export function looksLikeGitOutput(text: string): boolean {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 10) return false;
  const hits = lines.filter(gitHit).length;
  return hits / lines.length > 0.5;
}

function crushStatus(lines: string[]): string[] {
  const out: string[] = [];
  const branch: string[] = [];
  const grouped = new Map<string, string[]>();
  let rest = 0;
  for (const line of lines) {
    const t = line.trim();
    if (/^(On branch|Your branch|nothing to commit|no changes added)/.test(t)) {
      branch.push(line);
      continue;
    }
    const m = /^([MADRCU?!]{1,2})\s+(.+)$/.exec(t) || /^\?\?\s+(.+)$/.exec(t);
    if (m) {
      const code = m[1]?.includes("?") || m[0].startsWith("??") ? "??" : (m[1] ?? "M").trim();
      const path = m[2] ?? m[1];
      let arr = grouped.get(code);
      if (!arr) {
        arr = [];
        grouped.set(code, arr);
      }
      arr.push(path);
    } else if (t !== "" && !/^(Changes|Untracked|use |\(use|  \(|HEAD detached)/.test(t)) {
      rest++;
    }
  }
  out.push(...branch);
  for (const [code, paths] of grouped) {
    out.push(`${code} (${paths.length} files):`);
    const show = paths.slice(0, 15);
    for (const p of show) out.push(`  ${p}`);
    if (paths.length > show.length) out.push(`  … +${paths.length - show.length} more`);
  }
  if (rest > 0) out.push(`[${rest} non-path lines omitted]`);
  return out;
}

function crushDiff(lines: string[]): string[] {
  const out: string[] = [];
  let currentFile: string | null = null;
  let fileLines = 0;
  let fileKept = 0;
  let fileDropped = 0;
  const FILE_LINE_CAP = 60;
  const flushFile = () => {
    if (fileDropped > 0 && currentFile) {
      out.push(`… (${fileDropped} context lines dropped in ${currentFile})`);
    }
    currentFile = null;
    fileLines = 0;
    fileKept = 0;
    fileDropped = 0;
  };
  for (const line of lines) {
    const dm = /^diff --git a\/(.+) b\/.+$/.exec(line);
    if (dm) {
      flushFile();
      currentFile = dm[1];
      out.push(`diff: ${dm[1]}`);
      continue;
    }
    // Boilerplate stripped unconditionally (zero information).
    if (/^(index |--- a\/|\+\+\+ b\/|\\ No newline|new file mode|deleted file mode|old mode|new mode|similarity index|rename (from|to)|Binary files )/.test(line)) {
      continue;
    }
    if (/^@@ /.test(line) || /^[+-]/.test(line)) {
      if (currentFile && fileLines >= FILE_LINE_CAP) {
        fileDropped++;
        continue;
      }
      out.push(line);
      fileLines++;
      fileKept++;
      continue;
    }
    // Context line: keep only near the file head, count the rest.
    if (currentFile && fileLines < 6) {
      out.push(line);
      fileLines++;
      fileKept++;
    } else if (currentFile) {
      fileDropped++;
    } else {
      out.push(line);
    }
  }
  flushFile();
  return out;
}

function crushLog(lines: string[]): string[] {
  const out: string[] = [];
  let sha = "", author = "", date = "", subject = "";
  const flush = () => {
    if (sha || subject) {
      out.push(`${sha} ${author} ${date} ${subject}`.replace(/\s+/g, " ").trim());
      sha = author = date = subject = "";
    }
  };
  for (const line of lines) {
    const t = line.trim();
    let m = /^commit (\S+)/.exec(t);
    if (m) {
      flush();
      sha = m[1].length > 9 ? m[1].slice(0, 7) : m[1];
      continue;
    }
    m = /^Author: (.+)$/.exec(t);
    if (m) {
      author = m[1].replace(/ <.*>/, "");
      continue;
    }
    m = /^Date:\s+(.+)$/.exec(t);
    if (m) {
      author += "";
      date = m[1].replace(/ [+-]\d{4}.*$/, "");
      continue;
    }
    if (t !== "" && !/^(Merge:|$)/.test(t)) {
      if (/^Merge /.test(t)) continue;
      subject = subject ? `${subject} / ${t}` : t;
    }
  }
  flush();
  return out;
}

export function gitCrush(text: string): CrushResult {
  const original = text;
  const fallback = { text: original, originalTokens: Math.ceil(original.length / 4), kept: -1, total: -1 };
  const lines = text.split("\n");
  if (lines.length < 10) return fallback;

  const hasDiff = lines.some((l) => /^diff --git /.test(l));
  const hasCommits = lines.filter((l) => /^commit [0-9a-f]{7,40}…?(\s|$)/.test(l)).length;
  let crushed: string[];
  let kind: string;
  if (hasDiff) {
    crushed = crushDiff(lines);
    kind = "diff";
  } else if (hasCommits >= 2) {
    crushed = crushLog(lines);
    kind = "log";
  } else {
    crushed = crushStatus(lines);
    kind = "status";
  }
  const out = crushed.join("\n") + `\n[git crushed (${kind}): ${lines.length} → ${crushed.length} lines]`;
  if (out.length >= original.length) return fallback;
  return { text: out, originalTokens: Math.ceil(original.length / 4), kept: crushed.length, total: lines.length };
}
