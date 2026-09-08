// Docs-registry setup: idempotent DDL + seed packs. Run: bun scripts/docs-setup.ts
// (from apps/gateway; uses DATABASE_URL or the local default).
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara");

await sql`
  CREATE TABLE IF NOT EXISTS doc_packs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'curated',
    keywords TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
await sql`
  ALTER TABLE doc_packs
    ADD COLUMN IF NOT EXISTS fts TSVECTOR
    GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || keywords || ' ' || left(content, 4000))) STORED`;
await sql`CREATE INDEX IF NOT EXISTS doc_packs_fts_idx ON doc_packs USING GIN (fts)`;

interface Seed { id: string; title: string; keywords: string; content: string; version: number }

const SEEDS: Seed[] = [
  {
    id: "git",
    title: "Git essentials",
    keywords: "git commit rebase stash cherry-pick diff status log branch merge",
    version: 1,
    content: `status/log: git status -sb | git log --oneline -12 --graph | git show <sha> --stat
diff: git diff | git diff --staged | git diff main...HEAD --stat
commit: git add -p && git commit -m "msg" | git commit --amend --no-edit
undo: git restore <f> (worktree) | git restore --staged <f> | git reset --soft HEAD~1
stash: git stash -u | git stash pop | git stash list
branches: git switch -c <b> | git fetch --prune | git branch -d <b>
rebase: git rebase -i main (pick/squash/fixup/reword) | git rebase --abort | git rebase --continue
inspect: git blame -L 10,20 <f> | git log -S "needle" --oneline | git reflog`,
  },
  {
    id: "rg",
    title: "ripgrep essentials",
    keywords: "rg ripgrep grep search find",
    version: 1,
    content: `basic: rg "pat" | rg -i "pat" dir/ | rg -w "word" | rg -S "smartcase"
output: rg -n (line numbers) | rg -l (files only) | rg -c (counts) | rg --json
context: rg -A3 -B1 -C2 "pat" | rg -U "multi\\nline"
filter: rg -tpy -Tjs (types) | rg -g "*.ts" -g "!test*" (globs)
scope: rg --hidden | rg --no-ignore | rg -u/-uu/-uuu (more ignore off) | rg --max-count 5
files: rg --files | rg --files -g "*.json"
preview replace (does NOT write): rg -p "old" -r "new"`,
  },
  {
    id: "bun",
    title: "Bun essentials",
    keywords: "bun bunx",
    version: 1,
    content: `run: bun run <script|file.ts> | bun --watch run dev | bun --hot run server.ts
test: bun test | bun test -t "name-filter" | bun test --coverage
packages: bun install | bun add <pkg> | bun remove <pkg> | bun outdated
exec: bunx <pkg> <args> (no-install run) | bunx --package=<p> <cmd>
build: bun build ./src/index.ts --outdir ./dist --target bun
ci: bun install --frozen-lockfile`,
  },
];

for (const p of SEEDS) {
  await sql`
    INSERT INTO doc_packs (id, title, source, keywords, content, version, updated_at)
    VALUES (${p.id}, ${p.title}, 'curated', ${p.keywords}, ${p.content}, ${p.version}, NOW())
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title, keywords = EXCLUDED.keywords,
      content = EXCLUDED.content, version = EXCLUDED.version, updated_at = NOW()`;
  console.log(`upserted ${p.id} v${p.version}`);
}

const count = await sql`SELECT count(*)::int AS n FROM doc_packs`;
console.log(`doc_packs rows: ${count[0].n}`);
await sql.end();
