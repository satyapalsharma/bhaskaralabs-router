// Stream → buffered completion adaptation.
//
// Some lanes only expose a streaming endpoint. OpenFERENCE answers a
// non-streaming request with 400 "Streaming is required for this endpoint", and
// on a flat (prepaid) lane that is expensive twice over: the turn burns a rung
// of the ladder to learn nothing, and the capacity it was refusing to serve is
// capacity we are already paying for.
//
// The alternative to skipping those lanes is to accept their constraint and
// keep the promise the client actually made — a non-streaming response. So the
// request goes upstream as a stream, and the SSE is folded back into one
// `chat.completion` object here. A non-streaming client cannot tell the
// difference: it asked for one JSON body and it gets one JSON body.
//
// Folding is not concatenating `delta.content` and calling it done. Tool-call
// arguments arrive as fragments spread across chunks and keyed by an index, so
// they have to be accumulated per index and emitted in order; usage arrives in
// a final chunk whose `choices` array is empty; and a mid-stream error arrives
// as a payload with `error` and no `choices` at all. Getting any of those wrong
// produces a response that looks valid and is silently missing a tool call.

/** A fragment that ends the fold. */
class SseError extends Error {}

interface ToolAcc {
  id?: string;
  type?: string;
  name?: string;
  args: string;
}

/**
 * Fold an SSE completion stream into a single non-streaming response object.
 *
 * Throws if the stream reports an error payload — the caller turns that into an
 * upstream error so the normal failover walk still applies.
 */
export async function foldSseCompletion(res: Response): Promise<Record<string, unknown>> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("streaming response had no body");

  const dec = new TextDecoder();
  let buf = "";
  let id = "";
  let created = 0;
  let model = "";
  let content = "";
  let reasoning = "";
  let finish: string | null = null;
  let usage: unknown = null;
  const tools = new Map<number, ToolAcc>();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      // Keep the trailing partial line: an SSE event can straddle two reads.
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trimStart();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "" || payload === "[DONE]") continue;
        let chunk: Record<string, unknown>;
        try {
          chunk = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          // A chunk we cannot parse is not recoverable, but it is also not a
          // reason to discard everything folded so far — the pieces that did
          // parse are still the response.
          continue;
        }
        if (chunk.error) {
          const e = chunk.error as Record<string, unknown>;
          throw new SseError(typeof e.message === "string" ? e.message : JSON.stringify(e).slice(0, 200));
        }
        if (typeof chunk.id === "string" && !id) id = chunk.id;
        if (typeof chunk.created === "number" && !created) created = chunk.created;
        if (typeof chunk.model === "string" && !model) model = chunk.model;
        // Usage rides the final chunk, whose choices array is empty — so it has
        // to be read before the choice check below bails out.
        if (chunk.usage) usage = chunk.usage;

        const choices = chunk.choices;
        if (!Array.isArray(choices) || choices.length === 0) continue;
        const choice = choices[0] as { delta?: Record<string, unknown>; finish_reason?: unknown };
        if (typeof choice.finish_reason === "string") finish = choice.finish_reason;
        const delta = choice.delta;
        if (!delta) continue;
        if (typeof delta.content === "string") content += delta.content;
        // Two names for the same field. DeepSeek-derived servers send
        // `reasoning_content`; Electron Hub sends `reasoning`. Accumulating only
        // one silently drops the model's thinking on the lanes that use the
        // other, and the loss is invisible — the turn still answers correctly,
        // it just arrives without its reasoning.
        if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
        else if (typeof delta.reasoning === "string") reasoning += delta.reasoning;

        const calls = delta.tool_calls;
        if (!Array.isArray(calls)) continue;
        for (const raw of calls as Record<string, unknown>[]) {
          const idx = typeof raw.index === "number" ? raw.index : 0;
          const acc = tools.get(idx) ?? { args: "" };
          if (typeof raw.id === "string") acc.id = raw.id;
          if (typeof raw.type === "string") acc.type = raw.type;
          const fn = raw.function as { name?: unknown; arguments?: unknown } | undefined;
          if (fn) {
            if (typeof fn.name === "string" && fn.name) acc.name = fn.name;
            // Arguments stream in fragments: a partial JSON object is normal
            // mid-stream, so they are joined and only meaningful once finished.
            if (typeof fn.arguments === "string") acc.args += fn.arguments;
          }
          tools.set(idx, acc);
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }

  const message: Record<string, unknown> = { role: "assistant" };
  // `null` rather than `""` when the turn is pure tool calls: an empty string
  // reads to some clients as "the model said nothing", which is different from
  // "the model chose to call a tool".
  message.content = content.length > 0 ? content : null;
  if (reasoning) message.reasoning_content = reasoning;
  if (tools.size > 0) {
    message.tool_calls = [...tools.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, t]) => ({
        id: t.id ?? `call_${idx}`,
        type: t.type ?? "function",
        function: { name: t.name ?? "", arguments: t.args },
      }));
  }

  const out: Record<string, unknown> = {
    id: id || `chatcmpl-${Math.random().toString(36).slice(2, 12)}`,
    object: "chat.completion",
    created: created || Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message, finish_reason: finish ?? "stop" }],
  };
  if (usage) out.usage = usage;
  return out;
}

export { SseError };
