#!/usr/bin/env bun
// Gateway load test: N concurrent sessions x M sequential tiny turns.
// Run from apps/gateway:  bun scripts/load-test.ts [--sessions=20] [--turns=3]
// Env: GATEWAY_URL (default http://localhost:8793), BHASKARA_TEST_KEY (sk-bhaskara-… client key).
// Never logs key material.
export {};

const GATEWAY_URL = (process.env.GATEWAY_URL ?? "http://localhost:8793").replace(/\/$/, "");
const API_KEY = process.env.BHASKARA_TEST_KEY ?? "";

interface Args {
  sessions: number;
  turns: number;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { sessions: 20, turns: 3, help: false };
  for (const a of argv) {
    if (a === "--help" || a === "-h") {
      args.help = true;
    } else if (a.startsWith("--sessions=")) {
      const v = Number(a.split("=")[1]);
      if (!Number.isInteger(v) || v < 1) throw new Error(`bad --sessions value: ${a}`);
      args.sessions = v;
    } else if (a.startsWith("--turns=")) {
      const v = Number(a.split("=")[1]);
      if (!Number.isInteger(v) || v < 1) throw new Error(`bad --turns value: ${a}`);
      args.turns = v;
    } else {
      throw new Error(`unknown arg: ${a}`);
    }
  }
  return args;
}

function usage(): string {
  return [
    "Usage: bun scripts/load-test.ts [--sessions=N] [--turns=M]",
    "",
    "  Fires N concurrent sessions x M sequential turns of tiny",
    "  POST /v1/chat/completions requests (model theta, max_tokens 5, stream false).",
    "",
    "  Env:",
    "    GATEWAY_URL        default http://localhost:8793",
    "    BHASKARA_TEST_KEY  sk-bhaskara-… client key (required, never logged)",
    "",
    "  Reports p50/p95 latency, non-2xx count, and a usage_ledger",
    "  before/after SQL snippet. Exits non-zero when error rate > 5%.",
  ].join("\n");
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, i)];
}

async function oneTurn(session: string, turn: number): Promise<{ ok: boolean; status: number; ms: number }> {
  const started = Date.now();
  let status = 0;
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        "x-bhaskara-session": session,
      },
      body: JSON.stringify({
        model: "theta",
        max_tokens: 5,
        stream: false,
        messages: [{ role: "user", content: `load ping s${session} t${turn}` }],
      }),
    });
    status = res.status;
    await res.arrayBuffer().catch(() => {});
    return { ok: status >= 200 && status < 300, status, ms: Date.now() - started };
  } catch {
    return { ok: false, status, ms: Date.now() - started };
  }
}

async function oneSession(idx: number, turns: number): Promise<Array<{ ok: boolean; status: number; ms: number }>> {
  const session = `load-${Date.now().toString(36)}-${idx}`;
  const out: Array<{ ok: boolean; status: number; ms: number }> = [];
  for (let t = 0; t < turns; t++) out.push(await oneTurn(session, t));
  return out;
}

const args = parseArgs(Bun.argv.slice(2));
if (args.help) {
  console.log(usage());
  process.exit(0);
}
if (!API_KEY) {
  console.error("error: BHASKARA_TEST_KEY is not set (sk-bhaskara-… client key required)");
  process.exit(2);
}

const runStart = new Date();
const results = (await Promise.all(Array.from({ length: args.sessions }, (_, i) => oneSession(i, args.turns)))).flat();
const runEnd = new Date();

const total = results.length;
const errors = results.filter((r) => !r.ok);
const errRate = total === 0 ? 0 : errors.length / total;
const lat = results.map((r) => r.ms).sort((a, b) => a - b);
const byStatus = new Map<number, number>();
for (const r of results) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);

console.log(`sessions=${args.sessions} turns=${args.turns} total=${total} ok=${total - errors.length} errors=${errors.length} errRate=${(errRate * 100).toFixed(2)}%`);
console.log(`latency ms: p50=${pct(lat, 50)} p95=${pct(lat, 95)} max=${lat[lat.length - 1] ?? 0}`);
console.log(`status mix: ${[...byStatus.entries()].map(([s, n]) => `${s}x${n}`).join(" ") || "(none)"}`);
console.log("");
console.log("-- usage_ledger before/after (run these against postgres) --");
console.log(`-- window: ${runStart.toISOString()} .. ${runEnd.toISOString()}`);
console.log(
  `SELECT count(*), sum(prompt_tokens + completion_tokens) AS tokens, sum(actual_cost_usd::numeric) AS spend_usd FROM usage_ledger WHERE created_at >= '${runStart.toISOString()}' AND created_at <= '${runEnd.toISOString()}';`,
);

if (errRate > 0.05) {
  console.error(`FAIL: error rate ${(errRate * 100).toFixed(2)}% exceeds 5% budget`);
  process.exit(1);
}
console.log("PASS: error rate within 5% budget");
