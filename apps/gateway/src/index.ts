import app from "./routes/chat";

const port = Number(process.env.PORT ?? 8787);
console.log(`[gateway] listening on :${port}`);
export default {
  port,
  fetch: app.fetch,
  // Long SSE generations (reasoning TTFT 30-60s+) exceed Bun's default 10s
  // idle timeout. Keep-alive comments (every 25s) reset this timer, so 255s
  // gives wide margin for silent reasoning before first byte.
  idleTimeout: 255,
};