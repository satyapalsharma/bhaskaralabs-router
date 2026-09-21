// Plan id migration: free → trial, basic → starter, advanced → pro.
//
// The old ids named a ladder of sizes; the new ones name two products and a
// trial. Nothing about what a user gets is decided here — the plan config in
// packages/shared/src/pricing.ts is the single source for that. This script
// only moves the label so the config can be read.
//
// Both directions are mapped so the change is reversible from the same file.
// Run with --apply to write; the default is a dry run, because a migration that
// runs by accident is worse than one that runs twice.
//
//   bun scripts/migrate-plans.ts            # report
//   bun scripts/migrate-plans.ts --apply    # write
//   bun scripts/migrate-plans.ts --revert --apply

import postgres from "postgres";

const FORWARD: Record<string, string> = {
  free: "trial",
  basic: "starter",
  advanced: "pro",
};
const REVERSE: Record<string, string> = {
  trial: "free",
  starter: "basic",
  pro: "advanced",
};

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const mapping = args.includes("--revert") ? REVERSE : FORWARD;
const label = args.includes("--revert") ? "revert" : "forward";

const sql = postgres(url, { connect_timeout: 5 });

interface Counts {
  before: string;
  after: string;
  n: number;
}

async function migrateTable(table: string, column: string): Promise<Counts[]> {
  const rows = await sql<{ value: string; n: string }[]>`
    select ${sql(column)} as value, count(*) as n
    from ${sql(table)}
    group by 1 order by 1
  `;
  const out: Counts[] = [];
  for (const r of rows) {
    const to = mapping[r.value];
    if (!to) continue; // already migrated, or a plan slug we do not manage
    out.push({ before: r.value, after: to, n: Number(r.n) });
    if (apply) {
      await sql`
        update ${sql(table)}
        set ${sql(column)} = ${to}
        where ${sql(column)} = ${r.value}
      `;
    }
  }
  return out;
}

console.log(`plan migration (${label}) — ${apply ? "APPLYING" : "dry run"}`);
console.log(`  target: ${url.replace(/:[^:@]*@/, ":***@")}\n`);

let total = 0;
for (const [table, column] of [
  ["user", "plan"],
  ["subscriptions", "plan"],
] as const) {
  const changes = await migrateTable(table, column);
  if (changes.length === 0) {
    console.log(`${table}.${column}: nothing to migrate`);
    continue;
  }
  for (const c of changes) {
    console.log(`${table}.${column}: ${c.before} → ${c.after}  (${c.n} row${c.n === 1 ? "" : "s"})`);
    total += c.n;
  }
}

console.log(`\n${total} row${total === 1 ? "" : "s"} ${apply ? "migrated" : "would change"}.`);
if (!apply && total > 0) console.log("Re-run with --apply to write.");

// Verify afterwards so a partial run is visible rather than silent.
if (apply) {
  const left = await sql<{ plan: string; n: string }[]>`
    select plan, count(*) as n from "user" group by 1 order by 1
  `;
  console.log("\nuser.plan after:", left.map((r) => `${r.plan}=${r.n}`).join(" "));
}

await sql.end();
