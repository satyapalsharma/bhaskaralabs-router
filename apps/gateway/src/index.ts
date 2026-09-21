import app from "./routes/chat";
import { refreshFleetDispatchable } from "./routes/chat";

const port = Number(process.env.PORT ?? 8787);

// Cold-start the DB fleet so the first request after a deploy does not pay for
// the fleet read inside its own latency budget. Failures are non-fatal: the
// request path retries, and a provider-less start is a degraded gateway, not a
// broken one.
void refreshFleetDispatchable()
  .then(() => console.log("[gateway] fleet loaded"))
  .catch((err) => console.warn("[gateway] fleet load failed (will retry on request):", (err as Error).message));

console.log(`[gateway] listening on :${port}`);

export default {
  port,
  fetch: app.fetch,
  // Long SSE generations (reasoning TTFT 30-60s+) exceed Bun's default 10s
  // idle timeout. Keep-alive comments (every 25s) reset this timer, so 255s
  // gives wide margin for silent reasoning before first byte.
  idleTimeout: 255,
};
