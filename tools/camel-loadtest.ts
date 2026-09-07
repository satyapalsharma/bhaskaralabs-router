// CamelAI load test — TPS / P50 / P90 / latency / cost profile.
// Plan constraints: concurrency 1 (sequential main test), plus a 2-parallel
// probe to see how the server treats over-concurrency (queue vs 429).

const KEY = "qaml_live_A6LTN-THROlODFwZDRa_IDKz4EiqOtSlDw2OGJWLanA";
const BASE = "https://stream.camelai.com/v1/chat/completions";

const PROMPTS = [
  "Write a TypeScript debounce function with cancel() and flush() methods, fully typed.",
  "Fix this bug: function sum(a, b) { return a - b; } — explain the fix in one line.",
  "Refactor this to async/await: fetch(url).then(r => r.json()).then(d => console.log(d)).catch(e => console.error(e));",
  "Explain in 3 bullets: difference between TCP_NODELAY and Nagle's algorithm.",
  "Write a SQL query: top 5 customers by revenue in the last 30 days, with email join.",
  "Review this regex for ReDoS: /^(a+)+$/ and suggest a safe alternative.",
  "Write a bash one-liner: find all .log files over 100MB, print size sorted.",
  "Convert this Python to Rust: def fib(n): return n if n < 2 else fib(n-1) + fib(n-2)",
  "Design a rate limiter interface in TypeScript — 5 methods max, no implementation.",
  "What's the time complexity of this: for i in range(n): for j in range(i, n): print(i, j)? One line answer.",
];

interface Turn {
  ok: boolean;
  status: number;
  ttfbMs: number | null;  // time to first byte
  totalMs: number;
  outTokens: number;
  costUsd: number | null;
  upstreamModel: string | null;
}

async function oneTurn(prompt: string, stream: boolean, signal?: AbortSignal): Promise<Turn> {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: "auto",
        stream,
        stream_options: stream ? { include_usage: true } : undefined,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 400,
      }),
      signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, ttfbMs: null, totalMs: Date.now() - t0, outTokens: 0, costUsd: null, upstreamModel: null };
    }
    if (!stream || !res.body) {
      const j: unknown = await res.json();
      const u = (j as { usage?: Record<string, unknown> }).usage ?? {};
      const cd = (u.cost_details as { upstream_inference_cost?: number } | undefined)?.upstream_inference_cost ?? null;
      return {
        ok: true, status: 200, ttfbMs: null, totalMs: Date.now() - t0,
        outTokens: Number(u.completion_tokens ?? 0), costUsd: cd,
        upstreamModel: (j as { model?: string }).model ?? null,
      };
    }
    // Stream: measure TTFB on first chunk, parse usage from final chunk.
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let ttfb: number | null = null;
    let buf = "";
    let outTokens = 0;
    let cost: number | null = null;
    let model: string | null = null;
    let outChars = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (ttfb === null) ttfb = Date.now() - t0;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data) as Record<string, unknown>;
          const delta = (chunk.choices as Array<{ delta?: { content?: string } }> | undefined)?.[0]?.delta?.content;
          if (typeof delta === "string") outChars += delta.length;
          if (typeof chunk.model === "string") model = chunk.model;
          const u = chunk.usage as Record<string, unknown> | undefined;
          if (u) {
            outTokens = Number(u.completion_tokens ?? 0);
            cost = (u.cost_details as { upstream_inference_cost?: number } | undefined)?.upstream_inference_cost ?? null;
          }
        } catch { /* skip */ }
      }
    }
    return {
      ok: true, status: 200, ttfbMs: ttfb, totalMs: Date.now() - t0,
      outTokens: outTokens || Math.round(outChars / 4), costUsd: cost, upstreamModel: model,
    };
  } catch (err) {
    return { ok: false, status: 0, ttfbMs: null, totalMs: Date.now() - t0, outTokens: 0, costUsd: null, upstreamModel: (err as Error).name };
  }
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

// ── Phase 1: sequential streaming (respects concurrency 1) — 10 turns ──
console.log("═══ PHASE 1: sequential STREAM turns (concurrency 1) ═══");
const streamTurns: Turn[] = [];
for (let i = 0; i < 10; i++) {
  const t = await oneTurn(PROMPTS[i % PROMPTS.length], true);
  streamTurns.push(t);
  console.log(`  ${i + 1}. ${t.ok ? "✓" : "✗"} ${t.upstreamModel ?? "?"} ttfb=${t.ttfbMs}ms total=${t.totalMs}ms out=${t.outTokens}tok cost=${t.costUsd ?? "?"}`);
}

// ── Phase 2: sequential non-stream — 5 turns ──
console.log("═══ PHASE 2: sequential NON-STREAM turns ═══");
const nsTurns: Turn[] = [];
for (let i = 0; i < 5; i++) {
  const t = await oneTurn(PROMPTS[(i + 3) % PROMPTS.length], false);
  nsTurns.push(t);
  console.log(`  ${i + 1}. ${t.ok ? "✓" : "✗"} ${t.upstreamModel ?? "?"} total=${t.totalMs}ms out=${t.outTokens}tok cost=${t.costUsd ?? "?"}`);
}

// ── Phase 3: 2-parallel probe (does plan concurrency 1 reject or queue?) ──
console.log("═══ PHASE 3: 2-PARALLEL probe (plan says concurrency 1) ═══");
const ac = new AbortController();
const [a, b] = await Promise.all([
  oneTurn("Write a haiku about rate limits.", true, ac.signal),
  oneTurn("Write a haiku about queues.", true, ac.signal),
]);
console.log(`  A: ${a.ok ? "✓" : "✗" + a.status} ${a.totalMs}ms | B: ${b.ok ? "✓" : "✗" + b.status} ${b.totalMs}ms ${b.upstreamModel ?? ""}`);

// ── Stats ──
const all = [...streamTurns, ...nsTurns].filter((t) => t.ok);
const ttfbs = streamTurns.filter((t) => t.ttfbMs !== null).map((t) => t.ttfbMs!).sort((x, y) => x - y);
const totals = all.map((t) => t.totalMs).sort((x, y) => x - y);
const genMs = all.map((t) => t.totalMs).sort((x, y) => x - y);
const tpsEst = all.map((t) => (t.outTokens > 0 && t.totalMs > 0 ? (t.outTokens * 1000) / (t.totalMs) : 0)).filter((v) => v > 0);
const tpsSorted = [...tpsEst].sort((x, y) => x - y);
const costs = all.map((t) => t.costUsd).filter((c): c is number => c !== null);

console.log("\n═══ STATS ═══");
console.log(`Turns ok: ${all.length}/${streamTurns.length + nsTurns.length}`);
console.log(`TTFB  — p50=${pct(ttfbs, 50)}ms p90=${pct(ttfbs, 90)}ms max=${ttfbs[ttfbs.length - 1] ?? 0}ms`);
console.log(`TOTAL — p50=${pct(totals, 50)}ms p90=${pct(totals, 90)}ms max=${totals[totals.length - 1] ?? 0}ms`);
console.log(`TPS (incl. TTFB) — p50=${tpsSorted.length ? pct(tpsSorted, 50).toFixed(1) : "?"} p90=${tpsSorted.length ? pct(tpsSorted, 90).toFixed(1) : "?"} max=${tpsSorted.length ? tpsSorted[tpsSorted.length - 1].toFixed(1) : "?"}`);
console.log(`Avg out tokens: ${all.length ? Math.round(all.reduce((s, t) => s + t.outTokens, 0) / all.length) : 0}`);
console.log(`Cost/turn — avg=${costs.length ? (costs.reduce((s, c) => s + c, 0) / costs.length).toExponential(3) : "?"} total=${costs.length ? costs.reduce((s, c) => s + c, 0).toExponential(3) : "?"} USD`);
const fails = [...streamTurns, ...nsTurns].filter((t) => !t.ok);
if (fails.length) console.log(`FAILS: ${fails.map((f) => `status=${f.status} (${f.upstreamModel})`).join(", ")}`);
const models = [...new Set(all.map((t) => t.upstreamModel))];
console.log(`Upstream models seen: ${models.join(", ")}`);

export {};