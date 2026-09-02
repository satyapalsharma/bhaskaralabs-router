#!/usr/bin/env python3
# Test idea #3: replace older turns' full code with 1-line summaries.
# Same final task, two arms: FULL history (what agents send today) vs
# COMPACTED (prior assistant file bodies → one-line summaries).
# Measures prompt-token savings + whether the compacted arm still produces
# a compilable file (quality check: does it reference correct export names?).
import json, re, subprocess, time

KEY = open("/tmp/proj-key.txt").read().strip()
G = "http://localhost:8787/v1/chat/completions"

SYSTEM = open("/dev/stdin").read() if False else """You are a senior software engineer building one file at a time.
Rules: emit ONLY the complete file content in a single fenced code block, no prose, no placeholders, no TODO comments. The file must compile with Next.js 15 App Router + React 19 + Tailwind v4 + better-sqlite3. Keep every file under 140 lines. Use TypeScript strict mode."""

HISTORY = []
for n in range(1, 8):  # seeded from real session outputs
    try:
        HISTORY.append(open(f"/tmp/proj-out/turn{n:02d}.txt").read())
    except FileNotFoundError:
        break

PROMPTS = [
    "Design the architecture for a team todo board: SQLite schema + file layout for a Next.js App Router app with tasks (title, status: todo|doing|done, assignee, priority 1-5), a REST route per collection, and server components that read from SQLite. Propose the trade-offs of row-level vs table-level writes.",
    "Write src/lib/db.ts: better-sqlite3 singleton, WAL mode, tasks table, seedIfEmpty() inserting six sample tasks across statuses and assignees (Asha, Ravi, Meera).",
    "Write src/lib/types.ts: Task interface plus Status and Priority unions and a validateTask partial-update type guard.",
    "Write src/app/api/tasks/route.ts: GET returns all tasks newest-first; POST creates from JSON body with validation; both in one file.",
    "Write src/app/api/tasks/[id]/route.ts: GET one, PATCH partial update with the type guard, DELETE.",
    "Write src/app/board/page.tsx: server component that queries SQLite and renders three columns (todo/doing/done) as a kanban board with task cards showing title, assignee avatar initials, and priority dot color.",
    "Write src/app/board/TaskCard.tsx: client component card with move-to-next-status buttons that POST to the API then call router.refresh().",
]

SUMMARIES = [
    "[turn1 summary] architecture: SQLite tasks table (id,title,status todo|doing|done,assignee,priority 1-5,created_at), src/app/api/* routes, server components read via src/lib/db.ts getDb()",
    "[turn2 summary] src/lib/db.ts exports getDb() (better-sqlite3 WAL singleton) and seedIfEmpty() seeding 6 tasks",
    "[turn3 summary] src/lib/types.ts exports Task, Status, Priority, validateTask()",
    "[turn4 summary] src/app/api/tasks/route.ts exports GET (newest-first) and POST (validated create)",
    "[turn5 summary] src/app/api/tasks/[id]/route.ts exports GET, PATCH (validateTask partial), DELETE",
    "[turn6 summary] src/app/board/page.tsx renders 3 kanban columns from SQLite query, TaskCard per task",
]

TASK = "Write src/app/stats/page.tsx: server component showing per-assignee counts and percentage done, using SQL aggregation not JS loops. It may import from src/lib/db.ts (getDb) and src/lib/types.ts (Task)."

def call(history, session):
    payload = json.dumps({"model": "glm-5.3", "messages": history, "max_tokens": 3000, "temperature": 0.2})
    r = subprocess.run(["curl", "-s", "--max-time", "660", "-X", "POST", G,
                        "-H", f"Authorization: Bearer {KEY}",
                        "-H", f"x-bhaskara-session: {session}",
                        "-H", "Content-Type: application/json", "-d", payload],
                       capture_output=True, text=True, timeout=300)
    return json.loads(r.stdout)

def arm(name, build_history, session):
    hist = [{"role": "system", "content": SYSTEM}]
    hist += build_history()
    hist.append({"role": "user", "content": TASK})
    st = time.time()
    d = call(hist, session)
    u = d.get("usage") or {}
    ch = (d.get("choices") or [{}])[0]
    content = (ch.get("message") or {}).get("content", "")
    pt = u.get("prompt_tokens", 0)
    cached = (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
    ok = ("stats" in content or "GET" in content) and "getDb" in content and "<" in content
    print(f"{name:10s} in={pt:6d} cached={cached:6d} out={u.get('completion_tokens',0):5d} "
          f"{time.time()-st:5.1f}s refs_getDb={'getDb' in content} jsx={'return (' in content or '<' in content}")
    open(f"/tmp/ab-compaction-{name}.txt", "w").write(content)
    return pt

full = arm("full", lambda: [
    m for p, body in zip(PROMPTS, HISTORY) for m in (
        {"role": "user", "content": p},
        {"role": "assistant", "content": f"```ts\n{body}\n```"},
    )
], f"ab-full-{int(time.time())}")

compact = arm("compact", lambda: [
    {"role": "user", "content": PROMPTS[0]},
    {"role": "assistant", "content": SUMMARIES[0]},
    *[m for s in SUMMARIES[1:] for m in (
        {"role": "user", "content": "continue"},  # minimal anchor per summary
        {"role": "assistant", "content": s},
    )]
], f"ab-compact-{int(time.time())}")

print(f"\nsavings: {100*(full-compact)/full:.1f}% input tokens ({full} → {compact})")
