#!/usr/bin/env python3
# Multi-turn real-project session against the Bhaskara gateway.
# Stable prefix + append-only history (cache commandments), one session id.
import json, re, subprocess, sys, time

KEY = open("/tmp/proj-key.txt").read().strip()
G = "http://localhost:8787/v1/chat/completions"
SESSION = "todo-project-e2e-2"

SYSTEM = """You are a senior software engineer building one file at a time.
Rules: emit ONLY the complete file content in a single fenced code block, no prose, no placeholders, no TODO comments. The file must compile with Next.js 15 App Router + React 19 + Tailwind v4 + better-sqlite3. Keep every file under 140 lines. Use TypeScript strict mode. Export names exactly as requested."""

TOOLS_HINT = """Project stack: next@latest, react@latest, tailwindcss@4, better-sqlite3@11.
App lives under src/app/. Database helper module: src/lib/db.ts exporting getDb().
Each response is exactly one fenced code block containing one complete file."""

TURNS = [
    ("Design the architecture for a team todo board: SQLite schema + file layout for a Next.js App Router app with tasks (title, status: todo|doing|done, assignee, priority 1-5), a REST route per collection, and server components that read from SQLite. Propose the trade-offs of row-level vs table-level writes.", "architecture"),
    ("Write src/lib/db.ts: better-sqlite3 singleton, WAL mode, tasks table, seedIfEmpty() inserting six sample tasks across statuses and assignees (Asha, Ravi, Meera).", "db.ts"),
    ("Write src/lib/types.ts: Task interface plus Status and Priority unions and a validateTask partial-update type guard.", "types.ts"),
    ("Write src/app/api/tasks/route.ts: GET returns all tasks newest-first; POST creates from JSON body with validation; both in one file, App Router style, no page data fetching here.", "api/tasks"),
    ("Write src/app/api/tasks/[id]/route.ts: GET one, PATCH partial update with the type guard, DELETE.", "api/tasks-id"),
    ("Write src/app/board/page.tsx: server component that queries SQLite and renders three columns (todo/doing/done) as a kanban board with task cards showing title, assignee avatar initials, and priority dot color.", "board page"),
    ("Write src/app/board/TaskCard.tsx: client component card with move-to-next-status buttons that POST to the API then call router.refresh().", "TaskCard"),
    ("Write src/app/stats/page.tsx: server component showing per-assignee counts and percentage done, using SQL aggregation not JS loops.", "stats"),
    ("Write src/app/page.tsx: landing that redirects to /board and must be dynamic, no build-time data.", "landing"),
    ("Write src/app/layout.tsx: root layout with Tailwind import, dark zinc theme, nav bar with Board and Stats links.", "layout"),
    ("Write next.config.ts and package.json for this project pinned to react 19 and tailwind 4 with the PostCSS plugin @tailwindcss/postcss.", "config"),
    ("Refactor the whole board rendering so the three column queries become one query with a windowed sort; show the new board/page.tsx only.", "refactor"),
    ("Batch writes: rewrite src/app/api/tasks/route.ts so POST accepts either a single object or an array in one prepared transaction.", "api batch"),
    ("A race condition appears when two browser tabs move the same task: root cause and fix it in TaskCard with optimistic concurrency (version column).", "race fix"),
    ("Write src/lib/format.ts with a priority label function and relative-time formatter, no Intl usage.", "format.ts"),
]

def call(history):
    payload = json.dumps({
        "model": "glm-5.3",
        "messages": history,
        "max_tokens": 6000,
        "temperature": 0.2,
    })
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", G,
         "-H", f"Authorization: Bearer {KEY}",
         "-H", f"x-bhaskara-session: {SESSION}",
         "-H", "Content-Type: application/json",
         "-d", payload],
        capture_output=True, text=True, timeout=300,
    )
    try:
        return json.loads(r.stdout)
    except Exception:
        return {"_raw": r.stdout[:400]}

def main():
    history = [
        {"role": "system", "content": SYSTEM},
        {"role": "system", "content": TOOLS_HINT},
    ]
    out = open("/tmp/proj-session.jsonl", "w")
    total_in = total_out = total_cached = total_reason = 0
    t0 = time.time()
    for i, (prompt, artifact) in enumerate(TURNS, 1):
        history.append({"role": "user", "content": prompt})
        st = time.time()
        d = call(history)
        dt = time.time() - st
        ch = (d.get("choices") or [{}])[0]
        msg = ch.get("message") or {}
        content = msg.get("content") or ""
        reasoning = msg.get("reasoning_content") or ""
        u = d.get("usage") or {}
        pt, ct = u.get("prompt_tokens", 0), u.get("completion_tokens", 0)
        cached = (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
        reason_toks = (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)
        total_in += pt; total_out += ct; total_cached += cached; total_reason += reason_toks
        rec = {"turn": i, "artifact": artifact, "prompt_tokens": pt, "completion_tokens": ct,
               "reasoning_tokens": reason_toks, "cached_tokens": cached,
               "seconds": round(dt, 1), "finish": ch.get("finish_reason"),
               "reply_chars": len(content)}
        out.write(json.dumps(rec) + "\n"); out.flush()
        print(f"  t{i:02d} {artifact:14s} in={pt:6d} out={ct:5d} reason={reason_toks:5d} "
              f"cached={cached:6d} {dt:5.1f}s {ch.get('finish_reason', '')}", flush=True)
        if not content and not reasoning:
            print("    !! empty reply:", json.dumps(d)[:200]); break
        # empty content but reasoning present = budget spent thinking; note it, don't fabricate code
        carry = content if content else f"[reasoned-only turn, {len(reasoning)} chars reasoning, no code emitted]"
        history.append({"role": "assistant", "content": carry})
        if content:
            m = re.search(r"```(?:[\w.-]+)?\n(.*?)```", content, re.S)
            if m:
                open(f"/tmp/proj-out/turn{i:02d}.txt", "w").write(m.group(1))
    out.close()
    print(f"TOTAL in={total_in} out={total_out} reason={total_reason} cached={total_cached} "
          f"hit%={100 * total_cached / max(1, total_in):.1f} wall={time.time() - t0:.0f}s")

if __name__ == "__main__":
    main()
