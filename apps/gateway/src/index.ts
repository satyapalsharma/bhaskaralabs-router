import app from "./routes/chat";

const port = Number(process.env.PORT ?? 8787);
console.log(`[gateway] listening on :${port}`);
export default {
  port,
  fetch: app.fetch,
};