// Idempotent DDL for gateway-managed tables (no drizzle-kit runner in this
// repo — this script is the migration path). Safe to re-run.
// Run: bun scripts/db-ensure.ts (uses DATABASE_URL or the local default).
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
await sql`CREATE INDEX IF NOT EXISTS doc_packs_updated_idx ON doc_packs (updated_at)`;

await sql`
  CREATE TABLE IF NOT EXISTS request_archives (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    api_key_id TEXT,
    session_id TEXT NOT NULL,
    endpoint_model TEXT NOT NULL,
    provider TEXT NOT NULL,
    upstream_model TEXT NOT NULL,
    routed_to TEXT NOT NULL,
    prompt_tokens BIGINT NOT NULL DEFAULT 0,
    completion_tokens BIGINT NOT NULL DEFAULT 0,
    request_json TEXT NOT NULL,
    truncated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
await sql`CREATE INDEX IF NOT EXISTS archives_session_idx ON request_archives (session_id, created_at)`;
await sql`CREATE INDEX IF NOT EXISTS archives_user_created_idx ON request_archives (user_id, created_at)`;

await sql`
  CREATE TABLE IF NOT EXISTS session_locks (
    session_id TEXT NOT NULL,
    endpoint_model TEXT NOT NULL,
    user_id TEXT NOT NULL,
    locked_model TEXT,
    switch_count INTEGER NOT NULL DEFAULT 0,
    routine_streak INTEGER NOT NULL DEFAULT 0,
    locked_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_switch_at TIMESTAMPTZ,
    PRIMARY KEY (session_id, endpoint_model)
  )`;
await sql`CREATE INDEX IF NOT EXISTS locks_user_idx ON session_locks (user_id)`;

await sql`
  CREATE TABLE IF NOT EXISTS learned_lessons (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    session_id TEXT,
    kind TEXT NOT NULL,
    evidence TEXT NOT NULL,
    correction TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
await sql`CREATE INDEX IF NOT EXISTS lessons_status_idx ON learned_lessons (status, created_at)`;
await sql`CREATE INDEX IF NOT EXISTS lessons_user_idx ON learned_lessons (user_id)`;

// Routing causality on the ledger: the `reason` string was stdout-only, so
// nothing could be calibrated from traffic. These two columns unblock it.
await sql`ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS router_reason TEXT`;
await sql`ALTER TABLE usage_ledger ADD COLUMN IF NOT EXISTS router_signals TEXT`;
await sql`CREATE INDEX IF NOT EXISTS usage_endpoint_created_idx ON usage_ledger (endpoint_model, created_at)`;

// Skill cards: measured per-model per-capability success rates (routing asset).
await sql`
  CREATE TABLE IF NOT EXISTS skill_cards (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    success_rate NUMERIC(6,4) NOT NULL,
    support INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'escalation-derived',
    confidence TEXT NOT NULL DEFAULT 'low',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
await sql`CREATE UNIQUE INDEX IF NOT EXISTS skill_card_unique ON skill_cards (model_id, capability)`;
await sql`CREATE INDEX IF NOT EXISTS skill_card_model_idx ON skill_cards (model_id)`;

console.log(
  "db-ensure: doc_packs, request_archives, learned_lessons, usage_ledger(router_*), skill_cards OK",
);
await sql.end();
