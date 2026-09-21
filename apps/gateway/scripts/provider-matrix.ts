// Where requests actually went, per endpoint model, per upstream provider.
//
// Two views, because they answer different questions and disagree in a way that
// matters. "Served" is the ledger — the lane that carried the turn. "Attempted"
// is the process log — every lane the router tried, including the ones that
// failed and forced a failover. A provider can look healthy in the first table
// (traffic reaches it) while the second shows it only ever sees traffic because
// something ahead of it in the chain is broken.
//
//   bun apps/gateway/scripts/provider-matrix.ts [--since 24h] [--log <path>]

import postgres from "postgres";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
function argOf(name: string): string | null {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? null) : null;
}
const since = argOf("--since") ?? "24h";
const logPath = argOf("--log") ?? process.env.GATEWAY_LOG ?? "";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara");
const sinceClause = `created_at >= NOW() - INTERVAL '${since.replace(/[^0-9a-z]/gi, "")}'`;

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  const out = [line(headers), widths.map((w) => "─".repeat(w)).join("  ")];
  for (const r of rows) out.push(line(r));
  return out.join("\n");
}

// ── Served: which lane carried the turn ──────────────────────────────────────

const served = await sql<
  { endpoint_model: string; provider: string; upstream_model: string; turns: number; cost: number }[]
>`
  SELECT endpoint_model, provider, upstream_model,
         count(*)::int AS turns,
         COALESCE(sum(actual_cost_usd), 0)::float8 AS cost
  FROM usage_ledger
  WHERE ${sql.unsafe(sinceClause)}
  GROUP BY 1, 2, 3
  ORDER BY endpoint_model, turns DESC`;

console.log(`\nSERVED — where turns landed (ledger, last ${since})\n`);
console.log(
  table(
    ["endpoint", "provider", "upstream model", "requests", "cost usd"],
    served.map((r) => [
      r.endpoint_model,
      r.provider,
      r.upstream_model,
      String(r.turns),
      r.cost.toFixed(4),
    ]),
  ),
);

for (const ep of [...new Set(served.map((r) => r.endpoint_model))]) {
  const rows = served.filter((r) => r.endpoint_model === ep);
  const total = rows.reduce((s, r) => s + r.turns, 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  console.log(
    `\n  ${ep}: ${total} requests, $${cost.toFixed(4)}  →  ` +
      rows.map((r) => `${r.provider} ${((r.turns / total) * 100).toFixed(0)}%`).join(", "),
  );
}

// ── Served by tier, for the plan-mix question ────────────────────────────────

const tiers = await sql<{ endpoint_model: string; routed_to: string; turns: number; cost: number }[]>`
  SELECT endpoint_model, COALESCE(routed_to, '(unset)') AS routed_to,
         count(*)::int AS turns, COALESCE(sum(actual_cost_usd), 0)::float8 AS cost
  FROM usage_ledger
  WHERE ${sql.unsafe(sinceClause)}
  GROUP BY 1, 2
  ORDER BY endpoint_model, turns DESC`;

console.log(`\n\nTIER — full vs flash within each endpoint\n`);
console.log(
  table(
    ["endpoint", "tier", "requests", "cost usd", "avg/req"],
    tiers.map((r) => [
      r.endpoint_model,
      r.routed_to,
      String(r.turns),
      r.cost.toFixed(4),
      (r.cost / Math.max(r.turns, 1)).toFixed(5),
    ]),
  ),
);

// ── Attempted: every lane tried, including failures ──────────────────────────

if (logPath) {
  let text = "";
  try {
    text = readFileSync(logPath, "utf8");
  } catch {
    console.log(`\n(log not readable: ${logPath})`);
    await sql.end();
    process.exit(0);
  }

  const failed = new Map<string, Map<string, number>>();
  const failovers = new Map<string, number>();
  for (const line of text.split("\n")) {
    if (line.includes('"ev":"lane-error"')) {
      const from = /"from":"([^"]+)"/.exec(line)?.[1];
      const status = /"status":(\d+)/.exec(line)?.[1] ?? "?";
      if (!from) continue;
      const byStatus = failed.get(from) ?? new Map<string, number>();
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
      failed.set(from, byStatus);
    }
    if (line.includes('"ev":"lane-failover"')) {
      const from = /"from":"([^"]+)"/.exec(line)?.[1] ?? "?";
      const to = /"to":"([^"]+)"/.exec(line)?.[1] ?? "?";
      const key = `${from} → ${to}`;
      failovers.set(key, (failovers.get(key) ?? 0) + 1);
    }
  }

  console.log(`\n\nFAILED — lane-error counts by provider and status (log: ${logPath.split("/").pop()})\n`);
  const failedRows = [...failed.entries()]
    .sort((a, b) => [...b[1].values()].reduce((s, v) => s + v, 0) - [...a[1].values()].reduce((s, v) => s + v, 0))
    .map(([provider, byStatus]) => {
      const total = [...byStatus.values()].reduce((s, v) => s + v, 0);
      const detail = [...byStatus.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}×${n}`).join(" ");
      return [provider, String(total), detail];
    });
  console.log(failedRows.length ? table(["provider", "errors", "by status"], failedRows) : "  none");

  console.log(`\n\nFAILOVER — where failed lanes sent their traffic\n`);
  const foRows = [...failovers.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => k.split(" → ").concat(String(n)));
  console.log(foRows.length ? table(["from", "to", "count"], foRows) : "  none");
}

console.log();
await sql.end();
process.exit(0);
