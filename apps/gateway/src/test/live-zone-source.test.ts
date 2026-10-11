// Live-zone compression must not rewrite what an agent quotes back.
//
// Compression was switched off for every key on 2026-10-11. The crushers were
// doing what they were written to do — to the wrong content. An indented
// source file scored as `git status` and came out as
//
//   [408 non-path lines omitted]
//   [git crushed (status): 408 → 1 lines]
//
// about 3,100 times an hour on one key. Files the git detector missed lost 60%
// of their lines to the density crusher, and anything left had its timestamps,
// UUIDs and hashes swapped for `<ts>`, `<uuid>` and a 7-character stub, so the
// agent's next `edit` quoted text that was not in the file.
//
// What this file pins down:
//   1. Real source files come out of compressLiveZone BYTE-IDENTICAL — raw and
//      in the line-numbered renderings read tools produce, as a tool result
//      and as a pasted user turn.
//   2. Each detector rejects them on its own, so a failure names its module.
//   3. True git status / diff / log output, real logs, grep rows and prose
//      still compress — and what survives of them is verbatim.
//
// Fixtures are in ./fixtures/live-zone. The source files are real programs:
// each one compiles and passes its own tests (rustc --test; `python3
// ingest.py --self-test`; gofmt, go vet and go test; tsc --strict and
// `--self-test`). The git-*.txt files are the captured output of real git
// commands run against a repository built from those files, and
// go-test-v.txt is a real `go test -v` run. The TypeScript file is stored as
// .ts.txt only to keep it out of this project's own tsc run.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { compressLiveZone } from "../lib/compaction/live-zone";
import { gitCrush, looksLikeGitOutput } from "../lib/compaction/git-crusher";
import { logCrush, logLineShare, looksLikeGrepOutput, looksLikeLogOutput } from "../lib/compaction/crushers";
import { densityCrush, looksLikeProse } from "../lib/compaction/density";
import { maskVolatile } from "../lib/compaction/volatile";
import type { ChatMessage } from "../lib/prefix";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures", "live-zone");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

const SOURCES = ["token_bucket.rs", "ingest.py", "scheduler.go", "scheduler_test.go", "retry-queue.ts.txt"].map((name) => ({
  name,
  text: fixture(name),
}));

/** The block as a fresh tool result: everything after the last assistant message is live zone. */
function asToolResult(content: string, tool = "read"): ChatMessage[] {
  return [
    { role: "system", content: "You are a coding agent." },
    { role: "user", content: "have a look" },
    { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: tool, arguments: "{}" } }] },
    { role: "tool", content, tool_call_id: "call_1" },
  ];
}

/** The block as the current user turn: a pasted file, or a harness that inlines file contents. */
function asUserTurn(content: string): ChatMessage[] {
  return [
    { role: "system", content: "You are a coding agent." },
    { role: "user", content },
  ];
}

function forward(messages: ChatMessage[]) {
  const result = compressLiveZone(messages);
  return { text: result.messages[result.messages.length - 1].content as string, stats: result.stats, messages: result.messages };
}

/** Why two strings differ, short enough for a failure line. */
function firstDifference(want: string, got: string): string {
  const a = want.split("\n");
  const b = got.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return `line ${i + 1}: ${JSON.stringify((a[i] ?? "<end>").slice(0, 70))} → ${JSON.stringify((b[i] ?? "<end>").slice(0, 70))}`;
  }
  return "identical";
}

function expectUntouched(name: string, messages: ChatMessage[]) {
  const original = messages[messages.length - 1].content as string;
  const out = forward(messages);
  check(
    name,
    out.text === original && out.stats.blocksCompressed === 0 && out.stats.transformers.length === 0,
    `${original.length} → ${out.text.length} bytes via [${out.stats.transformers.join(", ")}]; ${firstDifference(original, out.text)}`,
  );
}

const numbered = (text: string, gutter: (n: number) => string) =>
  text
    .split("\n")
    .map((line, i) => gutter(i + 1) + line)
    .join("\n");

// How a file reaches the model. Read tools number lines; shells do not; some
// harnesses wrap the file in tags; Windows checkouts carry CRLF.
const RENDERINGS: Array<[string, (text: string) => string]> = [
  ["raw", (t) => t],
  ["cat -n", (t) => numbered(t, (n) => `${String(n).padStart(6)}\t`)],
  ["N: gutter", (t) => numbered(t, (n) => `${n}: `)],
  ["NNNNN| gutter", (t) => numbered(t, (n) => `${String(n).padStart(5, "0")}| `)],
  ["<file> wrapper", (t) => `<file>\n<path>/repo/src/module</path>\n<content>\n${t}</content>\n</file>`],
  ["CRLF", (t) => t.replace(/\n/g, "\r\n")],
  ["no final newline", (t) => t.replace(/\n+$/, "")],
  ["blank lines around", (t) => `\n\n${t}\n\n`],
];

console.log("Test 1: the fixtures are the kind of file that was being destroyed");
{
  for (const { name, text } of SOURCES) {
    const lines = text.split("\n");
    const indented = lines.filter((l) => /^(\t| {2,})\S/.test(l)).length;
    // scheduler_test.go is the short one on purpose: it is here for the log detector.
    const floor = name === "scheduler_test.go" ? 200 : 300;
    check(`${name}: ${lines.length} lines, ${text.length} bytes`, lines.length >= floor && text.length >= 4096);
    check(`${name}: ${indented} indented lines — the old git marker took any of them for a status row`, indented > lines.length * 0.4);
  }
  // Timestamps, UUIDs and full hashes sit in the files as test data. The mask
  // would rewrite every one of them; it must never get the chance.
  for (const name of ["token_bucket.rs", "ingest.py", "scheduler.go", "retry-queue.ts.txt"]) {
    const text = SOURCES.find((s) => s.name === name)!.text;
    const m = maskVolatile(text);
    check(`${name}: carries ${m.masked} volatile tokens a mask would rewrite`, m.masked >= 5 && m.text !== text);
  }
}

console.log("\nTest 2: source files are forwarded byte-identical, in every rendering and both roles");
{
  for (const { name, text } of SOURCES) {
    for (const [label, render] of RENDERINGS) {
      const rendered = render(text);
      expectUntouched(`${name} · ${label} · tool result`, asToolResult(rendered));
      expectUntouched(`${name} · ${label} · user turn`, asUserTurn(rendered));
    }
  }
}

console.log("\nTest 3: an untouched block is the same object, and dry-run agrees");
{
  const messages = asToolResult(SOURCES[0].text);
  const live = compressLiveZone(messages);
  check("the forwarded message is the caller's own object", live.messages[3] === messages[3]);
  const dry = compressLiveZone(messages, { dryRun: true });
  check("dry-run records no pair for a source file", (dry.pairs ?? []).length === 0 && dry.stats.blocksCompressed === 0);
  // The old dispatcher trimmed every block and reported it as compressed by "none".
  const padded = `\n  ${"plain text that no crusher has any business with. ".repeat(40)}\n\n`;
  const out = forward(asToolResult(padded));
  check("leading and trailing whitespace survive on a block nothing matches", out.text === padded);
  check("and it is not counted as a compressed block", out.stats.blocksCompressed === 0 && !out.stats.transformers.includes("none"));
}

console.log("\nTest 4: each detector rejects source code on its own");
{
  for (const { name, text } of SOURCES) {
    for (const [label, render] of RENDERINGS.slice(0, 4)) {
      const rendered = render(text).trim();
      const share = logLineShare(rendered);
      const verdicts = {
        git: looksLikeGitOutput(rendered),
        grep: looksLikeGrepOutput(rendered),
        log: looksLikeLogOutput(rendered),
        prose: looksLikeProse(rendered),
      };
      const wrong = Object.entries(verdicts)
        .filter(([, v]) => v)
        .map(([k]) => k);
      check(`${name} · ${label}: not git, grep, log or prose`, wrong.length === 0, `detected as ${wrong.join(", ")}`);
      // Threshold is 0.30. Real files measured while tuning topped out at 0.02.
      check(`${name} · ${label}: log-structured lines ${(share * 100).toFixed(1)}% (< 5%)`, share < 0.05);
    }
    // Called directly, with no detector in front of them, the crushers still refuse.
    check(`${name}: gitCrush declines (status mode needs a row majority)`, gitCrush(text).kept === -1);
    check(`${name}: densityCrush declines (not prose)`, densityCrush(text).kept === -1);
  }
  // Finding 4, concretely: Go tests are wall-to-wall "error", "failed",
  // "fatal". The old rule (15% of lines containing such a word) called this
  // file a log and kept 141 of its 214 lines.
  const goTest = SOURCES.find((s) => s.name === "scheduler_test.go")!.text;
  const errorWords = goTest.split("\n").filter((l) => /\b(error|fatal|failed|panic)\b/i.test(l)).length;
  check(`scheduler_test.go: ${errorWords} lines mention an error, none has log structure`, errorWords > 30 && logLineShare(goTest) === 0);
  // logCrush has no guard of its own — it trusts looksLikeLogOutput. This is why the detector matters.
  check("logCrush would still cut it if asked — the detector is the guard", logCrush(goTest).kept > 0);
}

console.log("\nTest 5: a merge-conflict prompt reaches the model whole");
{
  // The v5 incident: a batch job sent a conflicted file for resolution, the
  // prompt was crushed to a one-line summary, the model said it could not
  // see a file, and the job wrote that sentence into the source file.
  const lines = fixture("token_bucket.rs").split("\n");
  const conflict = (needle: string, ours: string[], theirs: string[]) => {
    const at = lines.findIndex((l) => l.includes(needle));
    if (at < 0) throw new Error(`fixture changed: ${needle} not found`);
    lines.splice(at, 1, "<<<<<<< HEAD", ...ours, "=======", ...theirs, ">>>>>>> feature/bigger-fleet");
  };
  conflict("pub const MAX_TENANTS", ["pub const MAX_TENANTS: usize = 4096;"], ["pub const MAX_TENANTS: usize = 16_384;"]);
  conflict(
    "bucket.last_seen_ms = now_ms;",
    ["        bucket.last_seen_ms = now_ms;"],
    ["        bucket.last_seen_ms = bucket.last_seen_ms.max(now_ms);", "        bucket.touched += 1;"],
  );
  const conflicted = lines.join("\n");
  const ask =
    "Resolve the merge conflicts in limiter/token_bucket.rs. Prefer the incoming branch where the two sides " +
    "disagree on a constant, keep both sides where they add different lines. Reply with the complete resolved " +
    "file and nothing else - your reply is written to disk as-is.";
  expectUntouched("conflicted file after the instructions", asUserTurn(`${ask}\n\n${conflicted}`));
  expectUntouched("conflicted file in a code fence", asUserTurn(`${ask}\n\n\`\`\`rust\n${conflicted}\`\`\`\n`));
  expectUntouched("conflicted file as a tool result", asToolResult(conflicted));
  check("conflict markers alone rule out prose", !looksLikeProse(`${fixture("incident-notes.txt")}\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> topic\n`));
}

console.log("\nTest 6: true `git status --short` still compresses, row for row");
{
  const status = fixture("git-status-short.txt");
  const rows = status.split("\n").filter((l) => l !== "");
  const count = (re: RegExp) => rows.filter((l) => re.test(l)).length;
  const out = forward(asToolResult(status, "bash"));
  check("routed to the git crusher", /^gitcrusher\(\d+→\d+\)$/.test(out.stats.transformers[0] ?? ""), out.stats.transformers.join(","));
  check(`smaller: ${status.length} → ${out.text.length} bytes`, out.text.length < status.length);
  check("modified group counts every M row", out.text.includes(`M (${count(/^(M | M) /)} files):`), out.text.split("\n")[0]);
  check("untracked group counts every ?? row", out.text.includes(`?? (${count(/^\?\? /)} files):`));
  check("deleted, added, renamed and both-columns groups are present", ["D (6 files):", "A (2 files):", "R (2 files):", "MM (1 files):"].every((h) => out.text.includes(h)));
  // The first row is " M README.md". Its leading blank is the index column, not padding.
  check("the first row keeps its path (leading status column is not trimmed away)", out.text.includes("\n  README.md\n") || out.text.includes("):\n  README.md"));
  check("a rename keeps both names", out.text.includes("  docs/oncall.md -> docs/on-call.md"));
  check("a quoted path stays quoted", out.text.includes('  "docs/on call notes.md"'));
  check("nothing is reported as omitted", !out.text.includes("omitted"));

  // Harnesses often trim tool output, which eats the first row's leading blank.
  const trimmed = forward(asToolResult(status.trim(), "bash"));
  check("a harness-trimmed listing still counts its first row", trimmed.text.includes(`M (${count(/^(M | M) /)} files):`) && trimmed.text.includes("  README.md"));

  const withBranch = `## main...origin/main [ahead 2]\n${status}warning: in the working copy of 'README.md', LF will be replaced by CRLF\n`;
  const branchOut = forward(asToolResult(withBranch, "bash")).text;
  check("the -b branch header is kept verbatim", branchOut.split("\n")[0] === "## main...origin/main [ahead 2]");
  check("a line that is not a row is carried over, not counted and dropped", branchOut.includes("warning: in the working copy of 'README.md', LF will be replaced by CRLF"));

  // Long format is not parsed ("\tmodified:   path" rows). It used to be
  // detected anyway and reduced to its branch line; now it is left alone.
  expectUntouched("long-format `git status` passes through untouched", asToolResult(fixture("git-status-long.txt"), "bash"));
  // The status crusher is the catch-all mode, so it is the one that must prove itself.
  const halfRows = rows.slice(0, 20).join("\n") + "\n" + SOURCES[0].text.split("\n").slice(0, 40).join("\n");
  check("rows in the minority → gitCrush declines", gitCrush(halfRows).kept === -1);
}

console.log("\nTest 7: true `git diff` still compresses, and its code is not masked");
{
  const diff = fixture("git-diff.txt");
  check("recognised as git output", looksLikeGitOutput(diff.trim()));
  const out = forward(asToolResult(diff, "bash"));
  check("routed to the git crusher alone — no volatile mask", /^gitcrusher\(\d+→\d+\)$/.test(out.stats.transformers.join("+")), out.stats.transformers.join(","));
  check(`smaller: ${diff.length} → ${out.text.length} bytes`, out.text.length < diff.length * 0.6);
  const original = new Set(diff.split("\n"));
  const foreign = out.text.split("\n").filter((l) => !original.has(l) && !/^(diff: |… \(|\[git crushed )/.test(l));
  check("every kept line is an original line or a crusher marker", foreign.length === 0, foreign.slice(0, 2).join(" | "));
  // These are + / - lines an agent reads to see what it changed. Masked, they
  // read `<ts>`, `<uuid>` and `4b825dc…`.
  for (const line of [
    '+    // Captured from the production replay of 2026-04-02T18:05:11Z; do not regenerate.',
    '+    const REPLAY_REQUEST: &str = "c56a4180-65aa-42ec-a945-5fd21dec0538";',
    '+        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";',
    '+    const REPLAY_COMMIT: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";',
    "+2026-03-14T09:26:54Z 1f0e9d8c-7b6a-4f5e-9d4c-3b2a1f0e9d8c POST /v1/embeddings 200 95ms",
  ]) {
    check(`kept verbatim: ${line.slice(0, 64)}…`, original.has(line) && out.text.split("\n").includes(line));
  }
  check("no mask tokens anywhere in the output", !/<ts>|<uuid>|[0-9a-f]{7}…/.test(out.text));
  check("every file header survives", (out.text.match(/^diff: /gm) ?? []).length === (diff.match(/^diff --git /gm) ?? []).length);
  // retry-queue.ts has far more than the 60-line per-file cap of changes. The
  // marker used to call all of them "context lines".
  check(
    "past the per-file cap the marker admits changed lines were dropped",
    /… \(\d+ context \+ \d+ changed lines dropped in dispatch\/retry-queue\.ts\)/.test(out.text),
    out.text.split("\n").find((l) => l.includes("dropped in dispatch/retry-queue.ts")) ?? "no marker",
  );
  check("a file under the cap reports context only", /… \(\d+ context lines dropped in limiter\/token_bucket\.rs\)/.test(out.text));
}

console.log("\nTest 8: true `git log` still compresses to one line per commit");
{
  const log = fixture("git-log.txt");
  const commits = (log.match(/^commit [0-9a-f]{40}$/gm) ?? []).length;
  const out = forward(asToolResult(log, "bash"));
  check("routed to the git crusher alone", /^gitcrusher\(\d+→\d+\)$/.test(out.stats.transformers.join("+")), out.stats.transformers.join(","));
  const kept = out.text.split("\n").filter((l) => !l.startsWith("[git crushed"));
  check(`${commits} commits → ${kept.length} lines`, commits === 20 && kept.length === commits);
  check("each line leads with a 7-character sha", kept.every((l) => /^[0-9a-f]{7} /.test(l)));
  check("the commit time is the real one, not <ts>", out.text.includes("f70af2a Mirela Costa Sun Mar 8 13:20:20 2026 ci: run go vet and the ingest self-test"));
  check(`smaller: ${log.length} → ${out.text.length} bytes`, out.text.length < log.length);
}

console.log("\nTest 9: git-looking fragments inside other content do not make it git");
{
  // A test file that embeds a diff as a string is a test file.
  const embedded = [
    'const SAMPLE = `',
    "diff --git a/src/a.ts b/src/a.ts",
    "index 83db48f..bf2a3c1 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,3 +1,4 @@",
    " import os",
    "+import sys",
    "`;",
    ...SOURCES[4].text.split("\n").slice(0, 120),
  ].join("\n");
  check("a source file with a diff in a string literal", !looksLikeGitOutput(embedded));
  // Indented prose and code used to be "status rows" because they start with blanks.
  const indentedOnly = Array.from({ length: 80 }, (_, i) => `    let value_${i} = compute(${i});`).join("\n");
  check("80 indented lines are not status rows", !looksLikeGitOutput(indentedOnly) && gitCrush(indentedOnly).kept === -1);
  const twoLetterProse = Array.from({ length: 30 }, (_, i) => `AM radio waves propagate further at night, observation ${i}`).join("\n");
  check('"AM radio waves …" is not an added-modified row', !looksLikeGitOutput(twoLetterProse));
  const markdown = Array.from({ length: 30 }, (_, i) => `## Section ${i}\n\nA paragraph under the heading.`).join("\n\n");
  check("Markdown headings are not `status -b` branch lines", !looksLikeGitOutput(markdown));
}

console.log("\nTest 10: real logs still compress — and are the only thing the mask touches");
{
  // A real `go test -v -count=4` run with one failing test.
  const goTestLog = fixture("go-test-v.txt");
  check(`go test -v output is a log (${(logLineShare(goTestLog) * 100).toFixed(0)}% structured lines)`, looksLikeLogOutput(goTestLog.trim()));
  const out = forward(asToolResult(goTestLog, "bash"));
  check("routed to the log crusher", out.stats.transformers.some((t) => t.includes("logcrusher(")), out.stats.transformers.join(","));
  check(`smaller: ${goTestLog.length} → ${out.text.length} bytes`, out.text.length < goTestLog.length);
  check("every failure line survives", (out.text.match(/^--- FAIL: TestBackoffCeiling/gm) ?? []).length === 4);
  check("so does the failing assertion's message", out.text.includes("Backoff(20m, 9) = 1h0m0s, want 2h0m0s"));

  // Application log: one timestamp per line, the mask's home ground.
  const appLog: string[] = [];
  for (let i = 0; i < 240; i++) {
    const ts = new Date(Date.UTC(2026, 9, 11, 9, 14, 2) + i * 137).toISOString();
    if (i === 97) {
      appLog.push(`${ts} ERROR [gateway] upstream call failed: connect ETIMEDOUT 10.0.4.17:443`);
      appLog.push("    at TLSSocket.onConnectEnd (node:_tls_wrap:1731:19)");
      appLog.push("    at dispatch (/app/src/routes/chat.ts:412:17)");
    } else if (i % 53 === 0) {
      appLog.push(`${ts} WARN  [gateway] lane glm-5.3/fleet-b cooling for 30s after 3 consecutive 5xx`);
    } else {
      appLog.push(`${ts} INFO  [gateway] 200 POST /v1/chat/completions lane=glm-5.3 in=${1200 + i} out=${80 + (i % 17)} ${40 + ((i * 31) % 400)}ms`);
    }
  }
  const app = forward(asToolResult(appLog.join("\n") + "\n", "bash"));
  check("app log: mask and log crusher both applied", /^volatile\(\d+\)\+logcrusher\(\d+→\d+\)$/.test(app.stats.transformers[0] ?? ""), app.stats.transformers.join(","));
  check("app log: the error and its stack frames survive", app.text.includes("<ts> ERROR [gateway] upstream call failed: connect ETIMEDOUT 10.0.4.17:443") && app.text.includes("    at dispatch (/app/src/routes/chat.ts:412:17)"));
  check(`app log: ${appLog.join("\n").length} → ${app.text.length} bytes`, app.text.length < appLog.join("\n").length / 4);

  // Formats the detector has to keep recognising. Shapes only; content is filler.
  const repeat = (n: number, line: (i: number) => string) => Array.from({ length: n }, (_, i) => line(i)).join("\n");
  const shapes: Array<[string, string]> = [
    ["cargo test", `running 60 tests\n${repeat(60, (i) => `test limiter::tests::case_${i} ... ${i === 31 ? "FAILED" : "ok"}`)}\n\ntest result: FAILED. 59 passed; 1 failed; 0 ignored`],
    ["pytest -v", repeat(60, (i) => `tests/test_ingest.py::RollupTests::test_case_${i} ${i === 12 ? "FAILED" : "PASSED"} [${String(Math.round(((i + 1) / 60) * 100)).padStart(3)}%]`)],
    ["jest", repeat(20, (i) => `PASS src/lib/module-${i}.test.ts\n  ✓ handles the happy path (${i + 2} ms)\n  ✓ rejects bad input (1 ms)`)],
    ["rustc diagnostics", repeat(25, (i) => `warning: unused variable: \`x${i}\`\n  --> src/lib.rs:${i + 3}:9\nerror[E0308]: mismatched types`)],
    ["tsc", repeat(60, (i) => `src/routes/chat.ts(${i + 10},5): error TS2322: Type 'string' is not assignable to type 'number'.`)],
    ["bracketed levels", repeat(60, (i) => `[${i % 9 === 0 ? "ERROR" : "INFO"}] worker ${i % 4} finished batch ${i}`)],
    ["Python logging", repeat(60, (i) => `2026-03-14 09:26:${String(i).padStart(2, "0")},120 ${i % 9 === 0 ? "WARNING" : "INFO"} ingest: skipping line ${i}`)],
    ["log4j", repeat(60, (i) => `2026-03-14 09:26:${String(i).padStart(2, "0")},120 [worker-${i % 4}] INFO  relay.Dispatcher - delivered batch ${i}`)],
    ["logfmt", repeat(60, (i) => `level=info ts=2026-03-14T09:26:${String(i).padStart(2, "0")}Z msg="delivered" batch=${i}`)],
  ];
  for (const [label, text] of shapes) check(`${label} output is a log`, looksLikeLogOutput(text), `${(logLineShare(text) * 100).toFixed(0)}% structured`);

  // A timestamp on every line is not enough: in a transcript every line
  // matters, and the log crusher keeps the ones that say "error".
  const transcript = `${repeat(120, (i) => `00:${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"} ${["Dana", "Mirela", "Tomasz"][i % 3]}: I think the retry counter has to survive a restart, point ${i}.`)}\n`;
  check("a timestamped meeting transcript is not a log", !looksLikeLogOutput(transcript.trim()));
  expectUntouched("and as a tool result it is forwarded untouched", asToolResult(transcript, "read"));
  const subtitles = `WEBVTT\n\n${repeat(80, (i) => `00:00:${String(i % 60).padStart(2, "0")}.000 --> 00:00:${String((i + 2) % 60).padStart(2, "0")}.500\nLine ${i} of the talk, spoken slowly.\n`)}`;
  check("nor are subtitles", !looksLikeLogOutput(subtitles.trim()));

  // A timestamp in the first column does not make a data file a log.
  const csv = `at,tenant,cost\n${repeat(200, (i) => `2026-10-11T09:${String(i % 60).padStart(2, "0")}:00Z,tenant-${i % 7},${(i * 3) % 11}`)}\n`;
  check("a CSV with a timestamp column is not a log", !looksLikeLogOutput(csv.trim()));
  expectUntouched("and is forwarded untouched, timestamps intact", asToolResult(csv, "bash"));
}

console.log("\nTest 11: text no crusher takes is forwarded unmasked");
{
  // A SQL seed file: every row is a timestamp, a UUID and a digest. No crusher
  // applies, and the old dispatcher forwarded the masked copy regardless.
  const seed = `-- seeds for the replay tests\n${Array.from(
    { length: 80 },
    (_, i) =>
      `INSERT INTO deliveries (id, sent_at, body_sha1) VALUES ('7c9e6679-7425-40de-944b-e07fc1f9${String(i).padStart(4, "0")}', '2026-03-14T09:${String(i % 60).padStart(2, "0")}:53Z', '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');`,
  ).join("\n")}\n`;
  check(`the mask would rewrite ${maskVolatile(seed).masked} tokens in it`, maskVolatile(seed).masked >= 240);
  expectUntouched("SQL seed file as a tool result", asToolResult(seed));
  expectUntouched("SQL seed file as a user turn", asUserTurn(seed));

  // grep rows are source lines. They are sampled per file, but what is kept is kept exactly.
  const rows: string[] = [];
  for (let f = 0; f < 5; f++) {
    for (let i = 0; i < 40; i++) {
      rows.push(`src/lib/module-${f}.ts:${10 + i * 3}:  const id = "550e8400-e29b-41d4-a716-4466554400${String(f * 40 + i).padStart(2, "0")}"; // seen 2026-10-11T09:14:02Z`);
    }
  }
  const grep = forward(asToolResult(rows.join("\n") + "\n", "grep"));
  check("grep rows are routed to the search crusher alone", /^searchcrusher\(\d+→\d+\)$/.test(grep.stats.transformers.join("+")), grep.stats.transformers.join(","));
  const originalRows = new Set(rows);
  const keptRows = grep.text.split("\n").filter((l) => /^src\//.test(l));
  check(`${keptRows.length} kept rows are verbatim — UUIDs and timestamps intact`, keptRows.length > 0 && keptRows.every((l) => originalRows.has(l)));
  check("no mask tokens in the grep output", !/<ts>|<uuid>/.test(grep.text));
}

console.log("\nTest 12: the density crusher only ever sees prose in a user turn");
{
  const notes = fixture("incident-notes.txt");
  check(`incident-notes.txt is prose: ${notes.split("\n").length} lines, ${notes.length} bytes`, looksLikeProse(notes) && notes.length >= 4096);
  // The choice, stated as a test: a tool result may be a file read of
  // anything, including a prose file the agent is about to edit.
  expectUntouched("prose as a tool result (it may be a file read) is untouched", asToolResult(notes));
  const user = forward(asUserTurn(notes));
  check("prose in a user turn is density-crushed", /^density\(\d+→\d+\)$/.test(user.stats.transformers[0] ?? ""), user.stats.transformers.join(","));
  check(`smaller: ${notes.length} → ${user.text.length} bytes`, user.text.length < notes.length);
  const noteLines = notes.trim().split("\n");
  check("first and last lines survive", user.text.startsWith(noteLines[0]) && user.text.includes(noteLines[noteLines.length - 1]));

  // In a user turn, anything that marks the text as a file or as structured keeps it out.
  expectUntouched("user turn · prose with a line-number gutter", asUserTurn(numbered(notes, (n) => `${String(n).padStart(6)}\t`)));
  expectUntouched("user turn · prose inside <document> tags", asUserTurn(`<document>\n${notes}</document>\n`));
  expectUntouched("user turn · prose with one fenced snippet", asUserTurn(`${notes}\n\`\`\`sh\nrelayctl pause --tenant acme\n\`\`\`\n`));
  const listing = Array.from({ length: 300 }, (_, i) => `apps/gateway/src/${["lib", "routes", "router", "test"][i % 4]}/module-${i}.ts`).join("\n") + "\n";
  expectUntouched("user turn · a path listing", asUserTurn(listing));
  const yaml = Array.from({ length: 150 }, (_, i) => `service_${i}:\n  image: registry.example.test/hookrelay/worker:${i}\n  replicas: ${1 + (i % 4)}\n  restart: always`).join("\n") + "\n";
  expectUntouched("user turn · a YAML config", asUserTurn(yaml));
  const commented = Array.from({ length: 120 }, (_, i) => `# Setting ${i} controls how long the relay waits before it gives up.\nrelay_wait_${i} 30`).join("\n") + "\n";
  expectUntouched("user turn · a commented config file", asUserTurn(commented));
  // Half prose, half code: a design note with an unfenced listing. Not prose.
  const mixed = `${notes}\n${SOURCES[2].text.split("\n").slice(60, 160).join("\n")}\n`;
  expectUntouched("user turn · prose followed by 100 lines of unfenced code", asUserTurn(mixed));
}

console.log("\nTest 13: no crusher fires on this gateway's own source tree");
{
  // The detectors were tuned against ~1,500 files each of real Rust, Go and
  // Python from outside this repo; that corpus cannot ship with the tests.
  // This one can: every .ts file here, as a read tool would deliver it.
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir).sort()) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== "fixtures" && entry !== "node_modules") walk(path);
      } else if (entry.endsWith(".ts") && statSync(path).size >= 1024) {
        files.push(path);
      }
    }
  };
  walk(join(HERE, ".."));
  const offenders: string[] = [];
  let ceiling = 0;
  let ceilingFile = "";
  for (const path of files) {
    const text = readFileSync(path, "utf8");
    const share = text.split("\n").length >= 40 ? logLineShare(text) : 0;
    if (share > ceiling) {
      ceiling = share;
      ceilingFile = relative(join(HERE, ".."), path);
    }
    for (const rendered of [text, numbered(text, (n) => `${String(n).padStart(6)}\t`)]) {
      // Redaction is a separate question (a test file may hold a literal that looks like a key).
      const crushers = forward(asToolResult(rendered)).stats.transformers.filter((t) => !/^redact\(\d+\)$/.test(t));
      if (crushers.length > 0) offenders.push(`${relative(join(HERE, ".."), path)} via ${crushers.join(",")}`);
    }
  }
  check(`${files.length} files, raw and numbered: no crusher fires`, files.length > 50 && offenders.length === 0, offenders.slice(0, 3).join("; "));
  check(`highest share of log-structured lines: ${(ceiling * 100).toFixed(1)}% (${ceilingFile || "none"}); threshold is 30%`, ceiling < 0.1);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
