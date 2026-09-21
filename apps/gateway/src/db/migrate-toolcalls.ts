// usage_ledger.has_tool_calls — the column that makes the dud rate measurable.
//
// Without it, "the model gave up" and "the model called a tool" are the same
// row: a 49k-token prompt answered with 138 tokens looks identical whether those
// 138 tokens were tool arguments or a shrug. Every dud-rate query run against
// the ledger before this column therefore reported tool calls as duds — 83-89%
// across every provider, which is not a measurement, it is the bug restated.
//
// Nullable on purpose. Existing rows are "unknown", not false: a backfill would
// have to guess, and a guess here silently becomes a provider-quality score.
// Readers must filter `has_tool_calls is not null` rather than treat null as
// "no tool call".
//
//   bun src/db/migrate-toolcalls.ts            # report
//   bun src/db/migrate-toolcalls.ts --apply    # write
//   bun src/db/migrate-toolcalls.ts --revert --apply

import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const revert = args.includes("--revert");

const sql = postgres(url, { connect_timeout: 5 });

const COLUMN = "has_tool_calls";

async function columnExists(): Promise<boolean> {
  const rows = await sql`
    select 1 from information_schema.columns
    where table_name = 'usage_ledger' and column_name = ${COLUMN}`;
  return rows.length > 0;
}

async function rowCount(): Promise<number> {
  const r = await sql`select count(*)::int as n from usage_ledger`;
  return r[0].n as number;
}

async function main() {
  const exists = await columnExists();
  const before = await rowCount();

  console.log(`database : ${url.replace(/:[^:@]*@/, ":***@")}`);
  console.log(`table    : usage_ledger (${before.toLocaleString()} rows)`);
  console.log(`column   : ${COLUMN}`);
  console.log(`state    : ${exists ? "present" : "absent"}`);
  console.log(`action   : ${revert ? "DROP" : "ADD"}${apply ? " (applying)" : " (dry run)"}`);
  console.log();

  if (revert) {
    if (!exists) {
      console.log("nothing to do — column is already absent");
    } else if (!apply) {
      console.log(`would drop ${COLUMN}; ${before.toLocaleString()} rows keep their token history`);
      console.log("nulling is not offered — the flag is not reconstructable from tokens alone");
    } else {
      await sql`alter table usage_ledger drop column ${sql(COLUMN)}`;
      console.log(`dropped ${COLUMN}`);
    }
  } else {
    if (exists) {
      console.log("nothing to do — column already present");
    } else if (!apply) {
      console.log(`would add ${COLUMN} boolean null`);
      console.log(
        `${before.toLocaleString()} existing rows read back null ("unknown") — a backfill would have to guess, and a guessed`,
      );
      console.log("provider-quality score is worse than a missing one.");
    } else {
      await sql`alter table usage_ledger add column ${sql(COLUMN)} boolean`;
      const after = await columnExists();
      console.log(after ? `added ${COLUMN} (null on existing rows)` : "FAILED — column still absent");
    }
  }

  await sql.end();
  if (!apply) console.log("\nDry run. Re-run with --apply to write.");
}

main().catch(async (err) => {
  console.error("migration failed:", err instanceof Error ? err.message : err);
  await sql.end().catch(() => {});
  process.exit(1);
});
