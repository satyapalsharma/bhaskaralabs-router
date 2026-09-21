// What clients actually call us.
//
// The User-Agent allowlist in lib/client-identity.ts is a starting point. This
// is how it becomes evidence: every turn records the caller's classified
// identity into usage_ledger.router_signals, and this reads it back.
//
// Run it before turning the gate to `enforce`. The question to answer is not
// "is the list right" but "is there a recognised client in here that we would
// have refused" — that is the only failure that costs a customer.
//
//   bun scripts/ua-report.ts             # last 7 days
//   bun scripts/ua-report.ts --days 1
//   bun scripts/ua-report.ts --refusable  # only what enforce mode would block

import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara";
const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1]) || 7;
const refusableOnly = args.includes("--refusable");

const sql = postgres(url, { connect_timeout: 5 });

interface Row {
  signals: string | null;
  n: string;
}

const rows = await sql<Row[]>`
  select router_signals as signals, count(*) as n
  from usage_ledger
  where created_at >= now() - ${`${days} days`}::interval
    and router_signals like '%"client"%'
  group by 1
`;

interface Bucket {
  kind: string;
  name: string | null;
  shaped: boolean;
  turns: number;
}

const buckets = new Map<string, Bucket>();
let unknownTotal = 0;
let unattributed = 0;

for (const r of rows) {
  let client: { kind?: string; name?: string | null; shaped?: boolean } | undefined;
  try {
    client = (JSON.parse(r.signals ?? "{}") as { client?: typeof client }).client;
  } catch {
    /* a malformed blob is not a reason to fail a report */
  }
  if (!client?.kind) {
    unattributed += Number(r.n);
    continue;
  }
  const key = `${client.kind}|${client.name ?? ""}|${client.shaped ? "1" : "0"}`;
  const prev = buckets.get(key);
  buckets.set(key, {
    kind: client.kind,
    name: client.name ?? null,
    shaped: Boolean(client.shaped),
    turns: (prev?.turns ?? 0) + Number(r.n),
  });
  if (client.kind === "unknown" || client.kind === "absent") unknownTotal += Number(r.n);
}

const all = [...buckets.values()].sort((a, b) => b.turns - a.turns);
const shown = refusableOnly ? all.filter((b) => !b.shaped && (b.kind === "unknown" || b.kind === "absent")) : all;
const total = all.reduce((s, b) => s + b.turns, 0);
const shownTotal = shown.reduce((s, b) => s + b.turns, 0);

console.log(`client identity — last ${days} day(s)\n`);

if (shown.length === 0) {
  console.log(refusableOnly ? "Nothing would be refused in enforce mode." : "No client data recorded yet.");
} else {
  const width = Math.max(...shown.map((b) => (b.name ?? b.kind).length), 8);
  for (const b of shown) {
    const pct = total > 0 ? ((b.turns / total) * 100).toFixed(1).padStart(5) : "  —  ";
    const label = (b.name ?? b.kind).padEnd(width);
    const flags = [b.kind, b.shaped ? "shaped" : "unshaped"].join(" · ");
    console.log(`  ${label}  ${String(b.turns).padStart(7)}  ${pct}%  ${flags}`);
  }
}

console.log(`\n  ${"total".padEnd(8)}  ${String(refusableOnly ? shownTotal : total).padStart(7)} turns${refusableOnly ? ` of ${total}` : ""}`);
if (unattributed > 0) console.log(`  ${"(unlabelled)".padEnd(8)}  ${String(unattributed).padStart(7)} rows predate the client signal`);

if (refusableOnly) {
  console.log(
    shownTotal === 0
      ? "\nEnforce mode would refuse nothing. Safe to switch on."
      : `\n${shownTotal} turn(s) would be refused by enforce mode. Check whether any of them are customers before switching it on.`,
  );
} else if (unknownTotal > 0) {
  console.log(
    `\n${unknownTotal} turn(s) had no recognised client. Those carrying the agent shape are still served — ` +
      `run with --refusable to see only what enforce mode would actually block.`,
  );
}

await sql.end();
