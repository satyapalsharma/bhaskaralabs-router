#!/usr/bin/env python3
# A/B: caveman-style terse prompt vs verbose natural prompt.
# Same task, same model, separate sessions (fresh lock per session).
# Measures output tokens + reply quality/structure.
import json, re, subprocess, time

KEY = open("/tmp/proj-key.txt").read().strip()
G = "http://localhost:8787/v1/chat/completions"

TASK_VERBOSE = (
    "Please could you write me a TypeScript function? I need it to debounce calls to a "
    "network request — like when the user is typing in a search box, I don't want to fire "
    "the API on every keystroke. It should take a function and a delay in milliseconds, "
    "and return a new function that waits for the pause. Also maybe cancel support would be nice."
)
TASK_CAVEMAN = (
    "Reply rules: caveman-speak. No pleasantries, no intro, no outro, no prose outside the code block. "
    "One fenced block, one function, no explanation lines after code.\n\n"
    "debounce(fn, ms) TS. return wrapper that delays call + .cancel()."
)

def call(prompt, session):
    body = json.dumps({
        "model": "glm-5.3",  # endpoint name; both arms route to flash tier for routine prompts
        "messages": [
            {"role": "system", "content": "You are a helpful senior engineer."},
            {"role": "user", "content": prompt},
        ],
        "max_tokens": 800, "temperature": 0,
    })
    st = time.time()
    r = subprocess.run(["curl", "-s", "-X", "POST", G,
                        "-H", f"Authorization: Bearer {KEY}",
                        "-H", f"x-bhaskara-session: {session}",
                        "-H", "Content-Type: application/json", "-d", body],
                       capture_output=True, text=True, timeout=180)
    d = json.loads(r.stdout)
    u = d.get("usage", {})
    ch = (d.get("choices") or [{}])[0]
    content = (ch.get("message") or {}).get("content", "")
    blocks = len(re.findall(r"```", content))
    return {"in": u.get("prompt_tokens", 0), "out": u.get("completion_tokens", 0),
            "chars": len(content), "fenced": blocks, "sec": round(time.time() - st, 1)}

for label, prompt in [("verbose", TASK_VERBOSE), ("caveman", TASK_CAVEMAN)]:
    res = call(prompt, f"ab-{label}-{int(time.time())}")
    print(f"{label:8s} in={res['in']:4d} out={res['out']:4d} chars={res['chars']:5d} fence_pairs={res['fenced']//2} {res['sec']}s")
