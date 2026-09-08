// Mock Hyper-compatible server for deterministic E2E tests (no real key needed).
// Serves OpenAI chat-completions with SSE streaming + usage in final chunk.

import { Hono } from "hono";
import { streamText } from "hono/streaming";

const app = new Hono();

app.post("/v1/chat/completions", async (c) => {
  const body = await c.req.json();
  const model = typeof body.model === "string" ? body.model : "unknown";
  const isStream = body.stream === true;

  if (!isStream) {
    return c.json({
      id: "chatcmpl-mock",
      object: "chat.completion",
      model,
      choices: [{ index: 0, message: { role: "assistant", content: `mock reply from ${model}` }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 1500,
        completion_tokens: 120,
        prompt_tokens_details: { cached_tokens: 1200 },
        completion_tokens_details: { reasoning_tokens: 40 },
        cost: { usd: 0.0001, hypercredits: 2 },
        remaining: { hypercredits: 248 },
      },
    });
  }

  c.header("Content-Type", "text/event-stream");
  return streamText(c, async (stream) => {
    for (const piece of ["mock ", "reply ", "from ", model]) {
      await stream.write(`data: ${JSON.stringify({ id: "chatcmpl-mock", choices: [{ delta: { content: piece } }] })}\n\n`);
    }
    await stream.write(
      `data: ${JSON.stringify({
        id: "chatcmpl-mock",
        choices: [],
        usage: {
          prompt_tokens: 1500,
          completion_tokens: 120,
          prompt_tokens_details: { cached_tokens: 1200 },
          completion_tokens_details: { reasoning_tokens: 40 },
          cost: { usd: 0.0001, hypercredits: 2 },
          remaining: { hypercredits: 248 },
        },
      })}\n\n`,
    );
    await stream.write("data: [DONE]\n\n");
  });
});

export default { port: 9399, fetch: app.fetch };