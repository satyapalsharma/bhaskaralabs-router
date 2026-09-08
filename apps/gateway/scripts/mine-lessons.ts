// Learn v1 miner (headroom-learn analog): ledger patterns → candidate lessons.
// Run manually: bun scripts/mine-lessons.ts [--apply] (default dry-run prints).
// --apply inserts status='candidate' rows for admin review (SQL today, UI later).
// Approved lessons ship as injections in a later phase — this script proposes,
// never auto-enables. Patterns mined (all from usage_ledger, no new signals):
//   loop-recovery   — session with ≥3 same-model turns then a model switch
//                     (stuck → recovered shape; correction: loop-break habits)
//   escalation-good — flash → full → flash with output after full (escalation
//                     paid off; correction: escalate earlier on same signals)
//   struggle        — ≥15 turns in one hour (hard session; correction: ask for
//                     a plan/split-up reminder injected at turn 1 — future work)

import postgres from "postgres";
import { randomUUID } from "node:crypto";

const APPLY = process.argv.includes("--apply");
const WINDOW_DAYS = Number(process.env.MINE_WINDOW_DAYS ?? 7);

const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara");

interface Turn { session_id: string; user_id: string; upstream_model: string; routed_to: string; completion_tokens: number; created_at: Date }

const turns = (await sql`
  SELECT session_id, user_id, upstream_model, routed_to, completion_tokens, created_at
  FROM usage_ledger
  WHERE created_at > NOW() - (${WINDOW_DAYS} || ' days')::INTERVAL
  ORDER BY session_id, created_at`) as Turn[];

const bySession = new Map<string, Turn[]>();
for (const t of turns) {
  const arr = bySession.get(t.session_id) ?? [];
  arr.push(t);
  bySession.set(t.session_id, arr);
}

interface Candidate { kind: string; userId: string | null; sessionId: string; evidence: string; correction: string }

const out: Candidate[] = [];
const perSessionKind = new Map<string, number>();
const note = (c: Candidate) => {
  const k = `${c.sessionId}:${c.kind}`;
  if ((perSessionKind.get(k) ?? 0) >= 5) return; // cap noise per session
  perSessionKind.set(k, (perSessionKind.get(k) ?? 0) + 1);
  out.push(c);
};
for (const [sid, ts] of bySession) {
  if (ts.length > 500) continue; // poll-cycle sessions, not agent loops
  // loop-recovery: run of ≥3 same-model turns then a switch
  let run = 1;
  for (let i = 1; i < ts.length; i++) {
    if (ts[i].upstream_model === ts[i - 1].upstream_model) run++;
    else {
      if (run >= 3) {
        note({
          kind: "loop-recovery",
          userId: ts[0].user_id,
          sessionId: sid,
          evidence: JSON.stringify({ turns: ts.length, stuckModel: ts[i - 1].upstream_model, run, recoveredTo: ts[i].upstream_model }),
          correction: "When the same call fails twice with no new information, change approach (read error, search codebase) instead of retrying verbatim.",
        });
      }
      run = 1;
    }
  }
  const tiers = ts.map((t) => t.routed_to);
  const fi = tiers.indexOf("full");
  if (fi >= 0 && fi < ts.length - 1 && ts.slice(fi + 1).some((t) => t.completion_tokens > 0)) {
    note({
      kind: "escalation-good",
      userId: ts[0].user_id,
      sessionId: sid,
      evidence: JSON.stringify({ turns: ts.length, fullAt: fi, model: ts[fi].upstream_model }),
      correction: "Escalation to the full model unblocked this session — treat repeated failure signals as escalation-worthy earlier.",
    });
  }
  const spanH = (ts[ts.length - 1].created_at.getTime() - ts[0].created_at.getTime()) / 3600000;
  if (ts.length >= 15 && spanH <= 1) {
    note({
      kind: "struggle",
      userId: ts[0].user_id,
      sessionId: sid,
      evidence: JSON.stringify({ turns: ts.length, spanMin: Math.round(spanH * 60) }),
      correction: "Long sessions drift — restate the plan and open TODOs early so compaction preserves direction.",
    });
  }
}

console.log(`sessions scanned: ${bySession.size}, candidates: ${out.length}`);
for (const c of out) console.log(`- [${c.kind}] session ${c.sessionId.slice(0, 8)} user ${(c.userId ?? "?").slice(0, 8)} :: ${c.evidence}`);

if (APPLY && out.length > 0) {
  for (const c of out) {
    await sql`INSERT INTO learned_lessons (id, user_id, session_id, kind, evidence, correction, status)
      VALUES (${randomUUID()}, ${c.userId}, ${c.sessionId}, ${c.kind}, ${c.evidence}, ${c.correction}, 'candidate')`;
  }
  console.log(`inserted ${out.length} candidates (status=candidate, review via SQL)`);
} else if (!APPLY) {
  console.log("dry-run (no writes). Re-run with --apply to insert candidates.");
}
await sql.end();
