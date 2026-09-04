import app from "./routes/chat";
import { seedYoloPressureFromLedger, yoloPressureState } from "./lib/yolo-pressure";
import { yoloEnabled } from "./providers/yolo";

const port = Number(process.env.PORT ?? 8787);
console.log(`[gateway] listening on :${port}`);

// Seed the yolo pressure tracker from the ledger so a restart never forgets
// pressure already burned (silent-wedge guard — see lib/yolo-pressure.ts).
if (yoloEnabled()) {
  void seedYoloPressureFromLedger()
    .then((rows) => {
      const s = yoloPressureState();
      console.log(`[yolo-pressure] seeded ${rows} turns: 1h=${(s.last1h / 1e6).toFixed(2)}M/3M, 24h=${(s.last24h / 1e6).toFixed(2)}M/14M, softDeny=${s.softDeny}`);
    })
    .catch((err) => console.error("[yolo-pressure] seed failed:", (err as Error).message));
}
export default {
  port,
  fetch: app.fetch,
  // Long SSE generations (reasoning TTFT 30-60s+) exceed Bun's default 10s
  // idle timeout. Keep-alive comments (every 25s) reset this timer, so 255s
  // gives wide margin for silent reasoning before first byte.
  idleTimeout: 255,
};