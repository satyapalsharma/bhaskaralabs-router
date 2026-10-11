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
// Runs on the ORIGINAL text, never the volatile-masked view: status paths,
// diff bodies and commit subjects are things an agent copies back verbatim
// (full SHAs are shortened by crushLog itself).
//
// DETECTION IS STRUCTURAL. A git line is only evidence where git would put
// it: a hunk body line (" ctx", "+add", "-del") after a hunk header inside a
// `diff --git` section, a 4-space message line after a commit header, a
// status row with a real status letter. The previous detector accepted
// `/^[MADRCU?! ]{1,2} /`, i.e. any line indented two or more columns, so
// every indented source file read through a tool scored as `git status` and
// was replaced by "[N non-path lines omitted]".

import { CrushResult } from "./smart-crusher";

// `git status --short` / `--porcelain` row: two status columns (index,
// worktree), one space, the path. At least one column must be a status letter —
// two blanks followed by text is just an indented line of something else. The
// path is a single token or a C-quoted string (git quotes anything with
// whitespace), optionally `old -> new` for renames; prose such as
// "AM radio waves" is therefore not a row.
const STATUS_PATH = String.raw`(?:"(?:[^"\\]|\\.)+"|[^\s"]\S*)`;
const STATUS_ROW = new RegExp(
  `^([MADRCUT][ MADRCUT]| [MADRCUT]|\\?\\?|!!) (${STATUS_PATH}(?: -> ${STATUS_PATH})?)$`,
);
// The first row only: a harness that trims tool output turns an unstaged
// " M path" into "M path". No other row can lose its leading blank that way.
const STATUS_ROW_TRIMMED = new RegExp(`^([MADRCUT]) (${STATUS_PATH}(?: -> ${STATUS_PATH})?)$`);
// Long-format `git status` furniture. Counts as git evidence and is recognised
// by crushStatus, but its "\tmodified:   path" rows are not parsed — a
// long-format status therefore never has a row majority and is left alone.
const STATUS_BRANCH = /^(On branch |Your branch |HEAD detached |nothing to commit|no changes added to commit)/;
const STATUS_HINT = /^(Changes to be committed:|Changes not staged for commit:|Untracked files:|Unmerged paths:|\s+\(use "git )/;

const DIFF_HEAD = /^diff --git a\/.+ b\/.+$/;
const DIFF_EXT =
  /^(index [0-9a-f]+\.\.[0-9a-f]+|--- |\+\+\+ |new file mode |deleted file mode |old mode |new mode |similarity index |dissimilarity index |rename (from|to) |copy (from|to) |Binary files |GIT binary patch)/;
const HUNK_HEAD = /^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/;
const COMMIT_HEAD = /^commit [0-9a-f]{7,40}…?(\s|$)/;
const COMMIT_FIELD = /^(Author|AuthorDate|Commit|CommitDate|Merge|Date):\s/;

/** Count the non-blank lines that are git structure. Stateful on purpose: see
 *  the header. Blank lines are neither evidence nor a section break (a hunk's
 *  blank context line and the gap between a commit header and its message). */
function gitLineCount(lines: string[]): { git: number; total: number } {
  let git = 0;
  let total = 0;
  let section: "none" | "diff" | "hunk" | "commit" = "none";
  for (const line of lines) {
    if (line.trim() === "") continue;
    total++;
    if (DIFF_HEAD.test(line)) {
      git++;
      section = "diff";
      continue;
    }
    if (section === "diff" || section === "hunk") {
      if (HUNK_HEAD.test(line)) {
        git++;
        section = "hunk";
        continue;
      }
      if (section === "diff" ? DIFF_EXT.test(line) : /^[ +\-\\]/.test(line)) {
        git++;
        continue;
      }
    }
    if (COMMIT_HEAD.test(line)) {
      git++;
      section = "commit";
      continue;
    }
    if (section === "commit" && (COMMIT_FIELD.test(line) || line.startsWith("    "))) {
      git++;
      continue;
    }
    section = "none";
    if (STATUS_ROW.test(line) || STATUS_BRANCH.test(line) || STATUS_HINT.test(line)) git++;
  }
  return { git, total };
}

export function looksLikeGitOutput(text: string): boolean {
  const { git, total } = gitLineCount(text.split("\n"));
  if (total < 10) return false;
  return git / total > 0.5;
}

/** Returns null when status rows are not the majority of the non-blank lines:
 *  whatever this is, it is not a `git status` listing, and summarising it as
 *  one would keep a count and drop the content. Lines that are not rows are
 *  carried over verbatim — this used to emit "[N non-path lines omitted]". */
function crushStatus(lines: string[]): string[] | null {
  const branch: string[] = [];
  const other: string[] = [];
  const grouped = new Map<string, string[]>();
  let rows = 0;
  let nonBlank = 0;
  for (const line of lines) {
    if (line.trim() === "") continue;
    nonBlank++;
    // `## main...origin/main [ahead 1]` is the `-b` branch header. Kept here,
    // but not detection evidence: on its own it is a Markdown heading.
    if (STATUS_BRANCH.test(line) || line.startsWith("## ")) {
      branch.push(line);
      continue;
    }
    const m = STATUS_ROW.exec(line) ?? (nonBlank === 1 ? STATUS_ROW_TRIMMED.exec(line) : null);
    if (m) {
      rows++;
      const code = m[1].includes("?") ? "??" : m[1].trim();
      let arr = grouped.get(code);
      if (!arr) {
        arr = [];
        grouped.set(code, arr);
      }
      arr.push(m[2]);
    } else if (!STATUS_HINT.test(line)) {
      other.push(line);
    }
  }
  if (rows * 2 <= nonBlank) return null;
  const out: string[] = [...branch];
  for (const [code, paths] of grouped) {
    out.push(`${code} (${paths.length} files):`);
    const show = paths.slice(0, 15);
    for (const p of show) out.push(`  ${p}`);
    if (paths.length > show.length) out.push(`  … +${paths.length - show.length} more`);
  }
  out.push(...other);
  return out;
}

function crushDiff(lines: string[]): string[] {
  const out: string[] = [];
  let currentFile: string | null = null;
  let fileLines = 0;
  let fileKept = 0;
  let ctxDropped = 0;
  let changedDropped = 0;
  const FILE_LINE_CAP = 60;
  const flushFile = () => {
    if (currentFile && changedDropped > 0) {
      // Past the per-file cap real +/- lines go too; say so rather than
      // letting the model believe it has seen every change.
      out.push(`… (${ctxDropped} context + ${changedDropped} changed lines dropped in ${currentFile})`);
    } else if (currentFile && ctxDropped > 0) {
      out.push(`… (${ctxDropped} context lines dropped in ${currentFile})`);
    }
    currentFile = null;
    fileLines = 0;
    fileKept = 0;
    ctxDropped = 0;
    changedDropped = 0;
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
        changedDropped++;
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
      ctxDropped++;
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

  const hasDiff = lines.some((l) => DIFF_HEAD.test(l));
  const hasCommits = lines.filter((l) => COMMIT_HEAD.test(l)).length;
  let crushed: string[];
  let kind: string;
  if (hasDiff) {
    crushed = crushDiff(lines);
    kind = "diff";
  } else if (hasCommits >= 2) {
    crushed = crushLog(lines);
    kind = "log";
  } else {
    // Status is the catch-all mode, so it is the one that has to prove itself.
    const status = crushStatus(lines);
    if (!status) return fallback;
    crushed = status;
    kind = "status";
  }
  const out = crushed.join("\n") + `\n[git crushed (${kind}): ${lines.length} → ${crushed.length} lines]`;
  if (out.length >= original.length) return fallback;
  return { text: out, originalTokens: Math.ceil(original.length / 4), kept: crushed.length, total: lines.length };
}
