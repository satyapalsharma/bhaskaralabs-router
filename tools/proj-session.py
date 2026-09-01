#!/usr/bin/env python3
# Multi-turn real-project session against the Bhaskara gateway.
# Stable prefix + append-only history (cache commandments), one session id.
# Resume mode: turns 1–5 outputs in /tmp/proj-out are seeded into history.
import json, os, re, subprocess, sys, time

KEY = open("/tmp/proj-key.txt").read().strip()
G = "http://localhost:8787/v1/chat/completions"
SESSION = os.environ.get("PROJ_SESSION", "todo-project-e2e-3")
RESUME_FROM = int(os.environ.get("PROJ_RESUME", "6"))  # first turn to actually call

SYSTEM = """You are a senior software engineer building one file at a time.
Rules: emit ONLY the complete file content in a single fenced code block, no prose, no placeholders, no TODO comments. The file must compile with Next.js 15 App Router + React 19 + Tailwind v4 + better-sqlite3. Keep every file under 140 lines. Use TypeScript strict mode. Export names exactly as requested."""

TOOLS_HINT = """Project stack: next@latest, react@latest, tailwindcss@4, better-sqlite3@11.
App lives under src/app/. Database helper module: src/lib/db.ts exporting getDb().
Each response is exactly one fenced code block containing one complete file."""

TURNS = [
    (1, "Design the architecture for a team todo board: SQLite schema + file layout for a Next.js App Router app with tasks (title, status: todo|doing|done, assignee, priority 1-5), a REST route per collection, and server components that read from SQLite. Propose the trade-offs of row-level vs table-level writes.", "architecture"),
    (2, "Write src/lib/db.ts: better-sqlite3 singleton, WAL mode, tasks table, seedIfEmpty() inserting six sample tasks across statuses and assignees (Asha, Ravi, Meera).", "db.ts"),
    (3, "Write src/lib/types.ts: Task interface plus Status and Priority unions and a validateTask partial-update type guard.", "types.ts"),
    (4, "Write src/app/api/tasks/route.ts: GET returns all tasks newest-first; POST creates from JSON body with validation; both in one file, App Router style, no page data fetching here.", "api/tasks"),
    (5, "Write src/app/api/tasks/[id]/route.ts: GET one, PATCH partial update with the type guard, DELETE.", "api/tasks-id"),
    (6, "Write src/app/board/page.tsx: server component that queries SQLite and renders three columns (todo/doing/done) as a kanban board with task cards showing title, assignee avatar initials, and priority dot color.", "board page"),
    (7, "Write src/app/board/TaskCard.tsx: client component card with move-to-next-status buttons that POST to the API then call router.refresh().", "TaskCard"),
    (8, "Write src/app/stats/page.tsx: server component showing per-assignee counts and percentage done, using SQL aggregation not JS loops.", "stats"),
    (9, "Write src/app/page.tsx: landing that redirects to /board and must be dynamic, no build-time data.", "landing"),
    (10, "Write src/app/layout.tsx: root layout with Tailwind import, dark zinc theme, nav bar with Board and Stats links.", "layout"),
    (11, "Write next.config.ts and package.json for this project pinned to react 19 and tailwind 4 with the PostCSS plugin @tailwindcss/postcss.", "config"),
    (12, "Refactor the whole board rendering so the three column queries become one query with a windowed sort; show the new board/page.tsx only.", "refactor"),
    (13, "Batch writes: rewrite src/app/api/tasks/route.ts so POST accepts either a single object or an array in one prepared transaction.", "api batch"),
    (14, "A race condition appears when two browser tabs move the same task: root cause and fix it in TaskCard with optimistic concurrency (version column).", "race fix"),
    (15, "Write src/lib/format.ts with a priority label function and relative-time formatter, no Intl usage.", "format.ts"),
]

def call(history):
    payload = json.dumps({"model": "glm-5.3", "messages": history, "max_tokens": 5000, "temperature": 0.2})
    r = subprocess.run(
        ["curl", "-s", "--max-time", "280", "-X", "POST", G,
         "-H", f"Authorization: Bearer {KEY}",
         "-H", f"x-bhaskara-session: {SESSION}",
         "-H", "Content-Type: application/json",
         "-d", payload],
        capture_output=True, text=True, timeout=300,
    )
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"_raw": r.stdout[:300]}

def main():
    history = [{"role": "system", "content": SYSTEM}, {"role": "system", "content": TOOLS_HINT}]
    # seed completed turns from disk (append-only reconstruction)
    for n, prompt, _a in TURNS:
        if n >= RESUME_FROM:
            break
        history.append({"role": "user", "content": prompt})
        path = f"/tmp/proj-out/turn{n:02d}.txt"
        body = open(path).read() if os.path.exists(path) else "// unavailable"
        history.append({"role": "assistant", "content": f"```ts\n{body}\n```"})
    print(f"seeded history from turns 1–{RESUME_FROM - 1}", flush=True)

    out = open("/tmp/proj-session.jsonl", "w")
    total_in = total_out = total_cached = 0
    t0 = time.time()
    for n, prompt, artifact in TURNS:
        if n < RESUME_FROM:
            continue
        history.append({"role": "user", "content": prompt})
        st = time.time()
        content = reasoning = finish = ""
        u: dict = {}
        d: dict = {}
        for attempt in (1, 2, 3):
            d = call(history)
            ch = (d.get("choices") or [{}])[0]
            msg = ch.get("message") or {}
            content = msg.get("content") or ""
            reasoning = msg.get("reasoning_content") or ""
            u = d.get("usage") or {}
            finish = ch.get("finish_reason", "")
            if content or reasoning:
                break
            print(f"    … t{n:02d} attempt {attempt} empty, retrying", flush=True)
            time.sleep(3 * attempt)
        dt = time.time() - st
        pt, ct = u.get("prompt_tokens", 0), u.get("completion_tokens", 0)
        cached = (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
        total_in += pt; total_out += ct; total_cached += cached
        rec = {"turn": n, "artifact": artifact, "prompt_tokens": pt, "completion_tokens": ct,
               "cached_tokens": cached, "seconds": round(dt, 1), "finish": finish,
               "reply_chars": len(content)}
        out.write(json.dumps(rec) + "\n"); out.flush()
        print(f"  t{n:02d} {artifact:14s} in={pt:6d} out={ct:5d} cached={cached:6d} {dt:5.1f}s {finish}", flush=True)
        if not content and not reasoning:
            print("    !! retries exhausted:", json.dumps(d)[:200]); break
        carry = content if content else f"[reasoned-only turn, {len(reasoning)} chars]"
        history.append({"role": "assistant", "content": carry})
        if content:
            m = re.search(r"```(?:[\w.-]+)?\n(.*?)```", content, re.S)
            if m:
                open(f"/tmp/proj-out/turn{n:02d}.txt", "w").write(m.group(1))
    out.close()
    print(f"TOTAL(new) in={total_in} out={total_out} cached={total_cached} hit%={100 * total_cached / max(1, total_in):.1f} wall={time.time() - t0:.0f}s")

if __name__ == "__main__":
    sys.exit(main())
