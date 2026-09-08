import app from "./routes/chat";
import { syncYoloPressureFromHeaders, yoloPressureState } from "./lib/yolo-pressure";
import { yoloEnabled, markYoloWedged } from "./providers/yolo";

const port = Number(process.env.PORT ?? 8787);
console.log(`[gateway] listening on :${port}`);

// Bootstrap-sync the yolo pressure tracker from the SERVER's own headers.
// Yolo returns exact remaining pressure on every response
// (x-yolo-pressure-remaining-1h/24h) — a single 5-token probe at startup
// gives us the authoritative number (ledger-seed estimates drifted 2.4x
// from the server's count: missing aborted-turn output + window-alignment
// differences). The probe costs ~4096 pressure units (flat per-request
// floor) once per boot.
if (yoloEnabled()) {
  const key = process.env.YOLO_AUTO_API_KEY ?? "";
  // 15s deadline: a healthy yolo answers a 1-token call in seconds. A
  // timeout here means the lane is wedged (global capacity) — pre-mark the
  // wedge cooldown so the FIRST real turn doesn't burn 25s discovering it.
  const probe = fetch(`${process.env.YOLO_BASE_URL ?? "https://yolo-auto.com/v1"}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "qwen3.8-27b", messages: [{ role: "user", content: "hi" }], max_tokens: 1, reasoning_effort: "none" }),
    signal: AbortSignal.timeout(15_000),
  });
  probe
    .then((res) => {
      const r1 = Number(res.headers.get("x-yolo-pressure-remaining-1h"));
      const r24 = Number(res.headers.get("x-yolo-pressure-remaining-24h"));
      if (Number.isFinite(r1) && Number.isFinite(r24)) {
        syncYoloPressureFromHeaders({ remaining1h: r1, remaining24h: r24 });
        const s = yoloPressureState();
        console.log(`[yolo-pressure] server-synced: 1h used=${(s.last1h / 1e6).toFixed(2)}M/3M, 24h used=${(s.last24h / 1e6).toFixed(2)}M/14M, softDeny=${s.softDeny}, source=${s.source}`);
      } else {
        console.warn("[yolo-pressure] bootstrap probe returned no pressure headers");
      }
    })
    .catch((err) => {
      console.warn("[yolo-pressure] bootstrap probe failed:", (err as Error).message, "— marking yolo wedged");
      markYoloWedged(30 * 60 * 1000);
    });
}
export default {
  port,
  fetch: app.fetch,
  // Long SSE generations (reasoning TTFT 30-60s+) exceed Bun's default 10s
  // idle timeout. Keep-alive comments (every 25s) reset this timer, so 255s
  // gives wide margin for silent reasoning before first byte.
  idleTimeout: 255,
};