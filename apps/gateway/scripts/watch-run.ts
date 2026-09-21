// Live digest for a test run: what the fleet is doing, and what broke.
//
// Two audiences in one report, because they fail together — a lane that starts
// 400-ing shows up as a routing shift (cheap lane stops winning) before anyone
// notices the error line, and a capability vector that stops being written shows
// up here before calibration silently starves.
//
//   bun apps/gateway/scripts/watch-run.ts [--since 30m] [--log <path>]

import postgres from "postgres";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
function argOf(name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}
const since = argOf("--since") ?? "30m";

/**
 * Find the newest live gateway log without being told which one it is.
 *
 * The runner captures stdout to a fresh timestamped file on every restart, so a
 * hardcoded path goes stale the moment the gateway is restarted — and a stale
 * path reads as "no faults" rather than "wrong file", which is the dangerous
 * direction to be wrong in. Picking the newest file that actually contains turn
 * events makes the report survive restarts on its own.
 */
function newestGatewayLog(): string {
  const roots = [
    process.env.GATEWAY_LOG_DIR,
    "/var/folders",
  ].filter((r): r is string => Boolean(r));
  const dirs: string[] = [];
  for (const root of roots) {
    if (root !== "/var/folders") {
      dirs.push(root);
      continue;
    }
    // /var/folders/<xx>/<hash>/T/commandcode/shellout
    let l1: string[] = [];
    try {
      l1 = readdirSync(root);
    } catch {
      continue;
    }
    for (const a of l1) {
      let l2: string[] = [];
      try {
        l2 = readdirSync(join(root, a));
      } catch {
        continue;
      }
      for (const b of l2) dirs.push(join(root, a, b, "T", "commandcode", "shellout"));
    }
  }
  // Newest first, and stop at the first file that carries turn events: the
  // runner writes a fresh log per restart, so the live one is always the most
  // recently written. Reading every candidate would be wasteful and pointless.
  const candidates: { path: string; mtime: number }[] = [];
  for (const dir of dirs) {
    let names: string[] = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!n.endsWith(".log")) continue;
      try {
        candidates.push({ path: join(dir, n), mtime: statSync(join(dir, n)).mtimeMs });
      } catch {
        continue;
      }
    }
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  for (const c of candidates.slice(0, 12)) {
    try {
      if (readFileSync(c.path, "utf8").includes('"ev":"turn"')) return c.path;
    } catch {
      continue;
    }
  }
  return "";
}
const logPath = argOf("--log") ?? process.env.GATEWAY_LOG ?? newestGatewayLog();

const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara");

const sinceClause = `created_at >= NOW() - INTERVAL '${since.replace(/[^0-9a-z]/gi, "")}'`;
// Same window, table-qualified: the join below pulls in other tables that also
// carry `created_at`, and an unqualified reference there is an ambiguity error.
const sinceClauseQualified = `l.created_at >= NOW() - INTERVAL '${since.replace(/[^0-9a-z]/gi, "")}'`;

const bar = "─".repeat(66);

// ── Traffic ──────────────────────────────────────────────────────────────────

const traffic = await sql<
  { endpoint_model: string; upstream_model: string; provider: string; turns: number; p50: number; maxMs: number; cost: string }[]
>`
  SELECT endpoint_model, upstream_model, provider, count(*)::int AS turns,
         percentile_disc(0.5) WITHIN GROUP (ORDER BY latency_ms)::int AS p50,
         max(latency_ms)::int AS "maxMs",
         coalesce(round(sum(actual_cost_usd), 4), 0)::text AS cost
  FROM usage_ledger
  WHERE ${sql.unsafe(sinceClause)}
  GROUP BY 1, 2, 3
  ORDER BY turns DESC`;

console.log(`\n${bar}\n  TRAFFIC  (last ${since})\n${bar}`);
if (traffic.length === 0) console.log("  no turns yet");
for (const t of traffic) {
  console.log(
    `  ${t.endpoint_model.padEnd(9)} → ${t.upstream_model.padEnd(22)} via ${t.provider.padEnd(11)} ${String(t.turns).padStart(5)} turns   p50 ${String(t.p50).padStart(6)}ms  max ${String(t.maxMs).padStart(6)}ms  $${t.cost.padStart(8)}`,
  );
}
const totalCost = traffic.reduce((s, t) => s + Number(t.cost), 0);
const totalTurns = traffic.reduce((s, t) => s + t.turns, 0);
console.log(`  ${"".padEnd(62)}${totalTurns} turns  $${totalCost.toFixed(4)}`);

// ── Errors ───────────────────────────────────────────────────────────────────

// Error evidence lives in the process log, not the ledger: a lane that failed
// never produced a row. Counted by event name so a new failure mode surfaces as
// its own line instead of dissolving into a total.
//
// Provider faults and our own admission refusals are counted separately and
// printed under separate headings, because they answer opposite questions. A
// `lane-failover` says a provider let us down; a `lane-saturated-hop` says our
// own lane budget said no and the turn moved on. Summed together they read as
// provider instability that does not exist — in one measured window 1,274 of
// 1,413 failovers were refusals we generated and never sent anywhere, which
// made a healthy fleet look like it was failing 90% of the time.
//
// The log lines carry no timestamp, so "last 11m" cannot be answered from the
// text. Reading the whole file instead made this section a lifetime total
// printed under a windowed heading: a single dud at line 459 of 6,369 was
// re-reported every ten minutes as if it had just happened, and a fault that
// resolved hours ago looked permanent. A byte cursor is the honest boundary —
// it means "since this report last ran", which for a cron on the same interval
// is the window the heading already claimed. `--full` opts back into the
// lifetime view when that is what you actually want.
const counts = new Map<string, number>();
const samples = new Map<string, string>();
const admissionCounts = new Map<string, number>();
const admissionSamples = new Map<string, string>();

/** Bytes of the log already reported. Kept beside the log so a restart of the
 *  gateway (which starts a new file) cannot strand it. */
function cursorPathFor(p: string): string {
  return `${p}.cursor`;
}

/** Read only the part of the log this report has not seen yet. */
function readNewLogText(p: string): { text: string; windowed: boolean } {
  if (args.includes("--full")) return { text: readFileSync(p, "utf8"), windowed: false };
  const cur = cursorPathFor(p);
  let from = 0;
  try {
    const saved = Number(readFileSync(cur, "utf8").trim());
    if (Number.isFinite(saved) && saved >= 0) from = saved;
  } catch {
    // No cursor yet — first run. Report the whole file so the first report is
    // not empty, then start windowing.
  }
  const size = statSync(p).size;
  // A smaller file is a rotated or restarted log; its cursor refers to a file
  // that no longer exists, so read from the top rather than from a stale offset.
  if (from > size) from = 0;
  const buf = readFileSync(p);
  const text = buf.subarray(from).toString("utf8");
  try {
    writeFileSync(cur, String(size));
  } catch {
    // Unwritable cursor degrades to the lifetime view, which is the same
    // behaviour as before this change — never worse.
  }
  return { text, windowed: true };
}

let faultWindowed = true;
let logText = "";
if (logPath) {
  try {
    const read = readNewLogText(logPath);
    logText = read.text;
    faultWindowed = read.windowed;
  } catch {
    console.log(`\n  (log not readable: ${logPath})`);
  }
  for (const line of logText.split("\n")) {
    if (!line.includes('"ev":"')) continue;
    const ev = /"ev":"([^"]+)"/.exec(line)?.[1];
    if (!ev) continue;
    if (/saturat/i.test(ev)) {
      admissionCounts.set(ev, (admissionCounts.get(ev) ?? 0) + 1);
      if (!admissionSamples.has(ev)) admissionSamples.set(ev, line.trim().slice(0, 150));
      continue;
    }
    if (!/error|fail|dud|orphan|exhaust|degraded|compaction|escalat/i.test(ev)) continue;
    const status = /"status":(\d+)/.exec(line)?.[1] ?? "";
    const key = status ? `${ev} (${status})` : ev;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!samples.has(key)) samples.set(key, line.trim().slice(0, 150));
  }
}

console.log(`\n${bar}\n  FAULTS  ${faultWindowed ? "(since last report)" : "(whole log — --full)"}\n${bar}`);
const faultRows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
if (faultRows.length === 0) console.log(logPath ? "  none" : "  (pass --log <path> to include)");
for (const [key, n] of faultRows) {
  console.log(`  ${String(n).padStart(5)}  ${key}`);
  console.log(`         ${samples.get(key)}`);
}

// Our own queueing, kept out of the fault counts above on purpose.
const admissionRows = [...admissionCounts.entries()].sort((a, b) => b[1] - a[1]);
if (admissionRows.length > 0) {
  console.log(`\n${bar}\n  ADMISSION  (our own lane budget — not a provider fault)\n${bar}`);
  for (const [key, n] of admissionRows) {
    console.log(`  ${String(n).padStart(5)}  ${key}`);
    console.log(`         ${admissionSamples.get(key)}`);
  }
}

// ── Context techniques ───────────────────────────────────────────────────────
//
// The compression stack is invisible in the ledger — a compacted turn and a
// plain one look identical downstream — so the only evidence that any of it
// fired is in the process log. Reported per technique rather than as one total
// because "compaction never runs" and "compaction runs constantly" call for
// opposite responses, and a single number cannot tell them apart.
//
// `livezone` is the tool-output crusher: it rewrites oversized tool results in
// place (git diffs, directory dumps) before the prompt is built. Layer-2
// compaction is the 200k-token history summarizer, and a zero there is expected
// on agent traffic that never approaches the threshold rather than a fault.

const tech = { livezone: 0, bytesBefore: 0, bytesAfter: 0, crusherBlocks: 0, crusherIn: 0, crusherOut: 0 };
const techniqueCounts = new Map<string, number>();
const transformerCounts = new Map<string, number>();
if (logPath) {
  const text = logText;
  for (const line of text.split("\n")) {
    if (!line.includes('"ev":"')) continue;
    const ev = /"ev":"([^"]+)"/.exec(line)?.[1];
    if (!ev) continue;
    if (
      ev === "livezone" ||
      ev === "compact" ||
      ev === "compact-skip" ||
      ev === "overflow" ||
      ev === "throttle" ||
      ev === "de-escalation" ||
      ev === "dud-escalation" ||
      ev === "plan-limit" ||
      ev === "dispatch-degraded"
    ) {
      techniqueCounts.set(ev, (techniqueCounts.get(ev) ?? 0) + 1);
    }
    if (ev !== "livezone") continue;
    try {
      const d = JSON.parse(line.slice(line.indexOf("{"))) as Record<string, unknown>;
      tech.livezone += 1;
      const b = typeof d.bytesBefore === "number" ? d.bytesBefore : 0;
      const a = typeof d.bytesAfter === "number" ? d.bytesAfter : 0;
      tech.bytesBefore += b;
      tech.bytesAfter += a;
      for (const t of (Array.isArray(d.transformers) ? d.transformers : []) as string[]) {
        const m = /^([a-z_]+)\((\d+)[^0-9]+(\d+)\)$/.exec(t);
        if (!m) continue;
        transformerCounts.set(m[1], (transformerCounts.get(m[1]) ?? 0) + 1);
        if (m[1] === "gitcrusher" || m[1] === "logcrusher" || m[1] === "density") {
          tech.crusherBlocks += 1;
          tech.crusherIn += Number(m[2]);
          tech.crusherOut += Number(m[3]);
        }
      }
    } catch {
      /* a malformed line should not sink the report */
    }
  }
}

console.log(`\n${bar}\n  CONTEXT TECHNIQUES  ${faultWindowed ? "(since last report)" : "(whole log — --full)"}\n${bar}`);
if (techniqueCounts.size === 0) {
  console.log("  none fired in this window");
} else {
  for (const [ev, n] of [...techniqueCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${ev}`);
  }
}
if (tech.livezone > 0) {
  const saved = tech.bytesBefore - tech.bytesAfter;
  const pct = tech.bytesBefore > 0 ? (saved / tech.bytesBefore) * 100 : 0;
  console.log(
    `\n  livezone rewrote ${tech.bytesBefore.toLocaleString()} → ${tech.bytesAfter.toLocaleString()} bytes` +
      `  (${saved.toLocaleString()} saved, ${pct.toFixed(1)}%)`,
  );
  if (tech.crusherBlocks > 0) {
    console.log(
      `  crushers: ${tech.crusherBlocks} blocks, ${tech.crusherIn.toLocaleString()} → ${tech.crusherOut.toLocaleString()} lines` +
        ` (${(100 * (1 - tech.crusherOut / tech.crusherIn)).toFixed(1)}% fewer)`,
    );
  }
  const names = [...transformerCounts.entries()].sort((a, b) => b[1] - a[1]);
  if (names.length > 0) console.log(`  by transformer: ${names.map(([n, c]) => `${n} ×${c}`).join(", ")}`);
}
// Why a technique is at zero matters more than the zero itself. Both the
// crusher and the summarizer are opt-in per key, so "compress is not enabled
// for the keys that served this window" and "compress ran and found nothing
// worth crushing" are opposite diagnoses that look identical in an event count.
// Resolve the flags for the keys that actually produced traffic and say which.
const flagRows = await sql<{ email: string; flags: string | null; turns: number }[]>`
  SELECT u.email, k.flags, count(*)::int AS turns
  FROM usage_ledger l
  JOIN api_keys k ON k.id = l.api_key_id
  JOIN "user" u ON u.id = k.user_id
  WHERE ${sql.unsafe(sinceClauseQualified)}
  GROUP BY 1, 2
  ORDER BY turns DESC`;

const ALL_FLAGS = ["compress", "compact", "shadow", "docs", "skill"] as const;
const flagSetOf = (s: string | null) => new Set((s ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const compressOn = flagRows.some((r) => flagSetOf(r.flags).has("compress"));
const compactOn = flagRows.some((r) => flagSetOf(r.flags).has("compact"));

if (flagRows.length > 0) {
  console.log("\n  enablement (keys behind this window's traffic):");
  for (const r of flagRows) {
    const set = flagSetOf(r.flags);
    const on = ALL_FLAGS.filter((f) => set.has(f));
    const off = ALL_FLAGS.filter((f) => !set.has(f));
    console.log(`    ${String(r.turns).padStart(4)} turns  ${r.email.padEnd(30)} on: ${on.join(",") || "—"}   off: ${off.join(",") || "—"}`);
  }
}
if (tech.livezone === 0) {
  console.log(
    compressOn
      ? "  livezone is ON for this traffic but crushed nothing — no prompt in this window held a compressible block."
      : "  livezone is OFF for this traffic (no serving key has the `compress` flag) — the pipeline never ran, so this zero is not evidence about compressibility.",
  );
}
if ((techniqueCounts.get("compact") ?? 0) === 0 && (techniqueCounts.get("compact-skip") ?? 0) === 0) {
  console.log(
    compactOn
      ? "  layer-2 compaction is ON; a zero means no session reached the 200k-token threshold."
      : "  layer-2 compaction is OFF for this traffic (no serving key has the `compact` flag) — the 200k threshold is not the reason it did not run.",
  );
}

// ── Router learning data ─────────────────────────────────────────────────────

const learning = await sql<{ model_id: string; with_cap: number; total: number }[]>`
  SELECT upstream_model AS model_id,
         count(*) FILTER (WHERE router_signals LIKE '%"capability"%')::int AS with_cap,
         count(*)::int AS total
  FROM usage_ledger
  WHERE ${sql.unsafe(sinceClause)}
  GROUP BY 1
  ORDER BY total DESC`;

console.log(`\n${bar}\n  CALIBRATION INPUTS  (capability vector present = learnable)\n${bar}`);
for (const r of learning) {
  const pct = r.total > 0 ? Math.round((r.with_cap / r.total) * 100) : 0;
  const flag = r.with_cap === 0 ? "  ← unlabelled" : "";
  console.log(`  ${r.model_id.padEnd(24)} ${String(r.with_cap).padStart(5)}/${String(r.total).padEnd(5)} (${String(pct).padStart(3)}%)${flag}`);
}

const cells = await sql<{ n: number }[]>`
  SELECT count(*)::int AS n FROM skill_cards`;
console.log(`\n  skill_cards populated: ${cells[0]?.n ?? 0} cells`);

const fair = await sql<{ share: number }[]>`
  SELECT round(avg((router_signals::jsonb ->> 'fairUseShare')::numeric), 3)::float8 AS share
  FROM usage_ledger
  WHERE ${sql.unsafe(sinceClause)}
    AND router_signals LIKE '%fairUseShare%'
    AND (router_signals::jsonb ->> 'fairUseShare') IS NOT NULL`;
console.log(`  avg full-model share: ${fair[0]?.share ?? "n/a"}  (cap 0.25)`);

console.log(`\n${bar}\n`);
await sql.end();
process.exit(0);
