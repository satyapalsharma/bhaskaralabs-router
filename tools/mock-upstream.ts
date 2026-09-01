// Mock OpenAI-compatible upstream for theta-provider E2E (localhost only).
// Mimics agnes/stepfun/devpass response shape incl. usage object.
const app = {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname.endsWith("/chat/completions")) {
      const body = (await req.json()) as Record<string, unknown>;
      const msgs = (body.messages ?? []) as Array<{ role: string; content: unknown }>;
      const last = [...msgs].reverse().find((m) => m.role === "user");
      const text = typeof last?.content === "string" ? last.content : "";
      return Response.json({
        id: `chatcmpl-mock-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model ?? "mock",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: `[mock:${body.model}] ${text.slice(0, 60)} — done.` },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 120 + text.length / 4,
          completion_tokens: 42,
          total_tokens: 162 + text.length / 4,
        },
      });
    }
    return new Response("mock upstream", { status: 200 });
  },
};
Bun.serve({ port: 9999, fetch: app.fetch });
console.log("mock-upstream on :9999");
