// Stream folding, archive serialization, and stream-only lanes.
//
// Three fixes that all share a shape: the gateway was letting a constraint of
// one layer leak into another.
//
//   A stream-only provider forced non-streaming turns off its lane entirely,
//   when the request could simply be streamed upstream and folded back.
//   An over-cap archive row was sliced mid-token, storing JSON that no longer
//   parsed — 31% of rows, silently unusable for the training they exist for.
//   An admission refusal of our own was logged as a lane failover, so the
//   failure rate read 90% on a fleet that was serving normally.

import { foldSseCompletion, SseError } from "../lib/stream-to-json";
import { serializeArchive } from "../lib/archive";
import { STREAMING_REQUIRED } from "../providers/generic";
import { sanitizeOpenAiResponse, sanitizeOpenAiChunk } from "../lib/sanitize";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Build an SSE Response from raw chunk payloads, exactly as a provider sends them. */
function sse(chunks: unknown[], { done = true } = {}): Response {
  const body = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + (done ? "data: [DONE]\n\n" : "");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function delta(d: Record<string, unknown>, extra: Record<string, unknown> = {}): unknown {
  return { id: "chatcmpl-1", object: "chat.completion.chunk", created: 1700000000, model: "glm-5.3", choices: [{ index: 0, delta: d, finish_reason: null }], ...extra };
}

// ── Folding a plain text stream ──────────────────────────────────────────────

{
  const res = sse([
    delta({ role: "assistant", content: "Hel" }),
    delta({ content: "lo, " }),
    delta({ content: "world" }),
    { id: "chatcmpl-1", object: "chat.completion.chunk", created: 1700000000, model: "glm-5.3", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    { id: "chatcmpl-1", object: "chat.completion.chunk", created: 1700000000, model: "glm-5.3", choices: [], usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 } },
  ]);
  const out = await foldSseCompletion(res);
  const choice = (out.choices as { message: Record<string, unknown>; finish_reason: string }[])[0];
  check("content fragments are joined in order", choice.message.content === "Hello, world", String(choice.message.content));
  check("the fold produces a non-streaming object", out.object === "chat.completion");
  check("finish_reason survives the fold", choice.finish_reason === "stop");
  check("no tool_calls key when the turn called no tools", choice.message.tool_calls === undefined);
  // Usage rides a chunk whose choices array is empty. Reading it after the
  // choice check is the easy way to lose it and bill every folded turn as zero.
  check("usage is read from the empty-choices final chunk", (out.usage as { total_tokens: number })?.total_tokens === 15, JSON.stringify(out.usage));
}

// ── Folding a tool call, which arrives in fragments ──────────────────────────

{
  const res = sse([
    delta({ role: "assistant", content: null }),
    delta({ tool_calls: [{ index: 0, id: "call_a", type: "function", function: { name: "write_file", arguments: '{"pa' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: 'th":"a.ts","con' } }] }),
    delta({ tool_calls: [{ index: 0, function: { arguments: 'tent":"x"}' } }] }),
    delta({ tool_calls: [{ index: 1, id: "call_b", type: "function", function: { name: "read_file", arguments: '{"path":"b.ts"}' } }] }),
    { id: "chatcmpl-1", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
  ]);
  const out = await foldSseCompletion(res);
  const msg = (out.choices as { message: Record<string, unknown> }[])[0].message;
  const calls = msg.tool_calls as { id: string; function: { name: string; arguments: string } }[];
  check("two tool calls survive the fold", calls?.length === 2, String(calls?.length));
  check("fragmented arguments are concatenated", calls[0].function.arguments === '{"path":"a.ts","content":"x"}', calls[0].function.arguments);
  check("...and parse as JSON, which is the whole point", (() => {
    try {
      JSON.parse(calls[0].function.arguments);
      return true;
    } catch {
      return false;
    }
  })());
  check("the tool name is taken from the first fragment that carries it", calls[0].function.name === "write_file");
  check("the call id is preserved", calls[0].id === "call_a", calls[0].id);
  check("calls are emitted in index order", calls[1].function.name === "read_file");
  // A pure tool call has no text. `null` and `""` mean different things to a
  // client: the first is "the model chose a tool", the second is "the model
  // said nothing".
  check("content is null on a pure tool-call turn", msg.content === null, JSON.stringify(msg.content));
}

// ── Reasoning content is a separate field, not part of the answer ────────────

{
  const res = sse([
    delta({ role: "assistant", reasoning_content: "let me think" }),
    delta({ reasoning_content: " about it" }),
    delta({ content: "answer" }),
    { id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ]);
  const out = await foldSseCompletion(res);
  const msg = (out.choices as { message: Record<string, unknown> }[])[0].message;
  check("reasoning accumulates into its own field", msg.reasoning_content === "let me think about it", String(msg.reasoning_content));
  check("...and does not leak into content", msg.content === "answer", String(msg.content));
}

// Electron Hub names the same field `reasoning`. Accumulating only
// `reasoning_content` drops its thinking entirely, and the turn still answers —
// so nothing downstream reports the loss.
{
  const res = sse([
    delta({ role: "assistant", reasoning: "step one" }),
    delta({ reasoning: ", step two" }),
    delta({ content: "done" }),
    { id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
  ]);
  const out = await foldSseCompletion(res);
  const msg = (out.choices as { message: Record<string, unknown> }[])[0].message;
  check("a lane that says `reasoning` is folded too", msg.reasoning_content === "step one, step two", String(msg.reasoning_content));
}

// The sanitizer is what sits in front of every response, streamed or not, so
// the rename has to happen there as well — the fold alone would still lose
// reasoning on the pass-through path.
{
  const msg = { role: "assistant", content: "hi", reasoning: "because" };
  const cleaned = sanitizeOpenAiResponse({ id: "1", object: "chat.completion", created: 1, model: "x", choices: [{ index: 0, message: msg, finish_reason: "stop" }] }, "glm-5.3") as {
    choices: { message: Record<string, unknown> }[];
  };
  const out = cleaned.choices[0].message;
  check("the sanitizer renames `reasoning` to the canonical field", out.reasoning_content === "because", JSON.stringify(out));
  check("...and does not forward both names", out.reasoning === undefined);
  check("...nor invent one when neither is present", (() => {
    const plain = sanitizeOpenAiResponse({ choices: [{ index: 0, message: { role: "assistant", content: "x" }, finish_reason: "stop" }] }, "m") as { choices: { message: Record<string, unknown> }[] };
    return plain.choices[0].message.reasoning_content === undefined && plain.choices[0].message.reasoning === undefined;
  })());

  // A streaming delta is the same shape one level down.
  const chunk = sanitizeOpenAiChunk(JSON.stringify({ id: "1", choices: [{ index: 0, delta: { reasoning: "hmm", content: null }, finish_reason: null }] }), "glm-5.3");
  const deltaOut = (JSON.parse(chunk) as { choices: { delta: Record<string, unknown> }[] }).choices[0].delta;
  check("a streamed delta is renamed too", deltaOut.reasoning_content === "hmm", JSON.stringify(deltaOut));
  check("...without leaving the original behind", deltaOut.reasoning === undefined);
}

// ── An error payload mid-stream must not become a fake completion ────────────

{
  const res = sse([delta({ content: "partial" }), { error: { message: "upstream died", type: "api_error" } }]);
  let threw = false;
  try {
    await foldSseCompletion(res);
  } catch (err) {
    threw = err instanceof SseError;
  }
  check("an error chunk aborts the fold instead of returning partial text", threw);
}

// ── Chunk boundaries are arbitrary and must not eat an event ────────────────

{
  // One SSE event split across two reads — a fold that parses per-read instead
  // of per-line would drop or corrupt this, and it happens constantly in
  // production because a chunk boundary has nothing to do with event framing.
  const enc = new TextEncoder();
  const a = `data: ${JSON.stringify(delta({ role: "assistant", content: "AB" }))}\n\ndata: ${JSON.stringify(delta({ content: "CD" }))}`;
  const b = `\n\ndata: [DONE]\n\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(enc.encode(a));
      c.enqueue(enc.encode(b));
      c.close();
    },
  });
  const out = await foldSseCompletion(new Response(stream));
  const msg = (out.choices as { message: Record<string, unknown> }[])[0].message;
  check("an event straddling two reads is still parsed", msg.content === "ABCD", String(msg.content));
}

// ── Archive serialization stays parseable at any cap ─────────────────────────

{
  const msgs = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `message ${i} `.repeat(200) }));
  const tools = [{ type: "function", function: { name: "t", parameters: { type: "object" } } }];

  const small = serializeArchive(msgs, tools, 5000);
  check("an over-cap archive is marked truncated", small.truncated);
  let parsed: { messages: { role: string; content: string }[] } | null = null;
  try {
    parsed = JSON.parse(small.json) as { messages: { role: string; content: string }[] };
  } catch (err) {
    check("...and still parses as JSON", false, (err as Error).message);
  }
  check("...and still parses as JSON", parsed !== null);
  check("the cap is respected", small.json.length <= 5000, String(small.json.length));
  check("the newest messages are the ones kept", parsed?.messages.at(-1)?.content.startsWith("message 39") === true, parsed?.messages.at(-1)?.content.slice(0, 20));
  check("tools are preserved", small.json.includes('"function"'));

  // A kept slice must never open with a tool reply whose assistant call fell
  // outside the window — that reads as a malformed request and would be
  // reported as a gateway defect by the very audit this archive feeds.
  const withTools = [
    { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }] },
    { role: "tool", tool_call_id: "c1", content: "result ".repeat(400) },
    { role: "tool", tool_call_id: "c2", content: "orphan ".repeat(400) },
  ];
  const sliced = serializeArchive(withTools, null, 900);
  const cut = JSON.parse(sliced.json) as { messages: { role: string }[] };
  check("a truncated slice does not begin with an orphaned tool reply", cut.messages[0]?.role !== "tool", cut.messages[0]?.role);

  const fits = serializeArchive([{ role: "user", content: "hi" }], tools, 100_000);
  check("an under-cap archive is not marked truncated", !fits.truncated);
  check("...and is byte-identical to a plain stringify", JSON.parse(fits.json).messages[0].content === "hi");
}

// ── Delta survival: the whitelist that erased every streamed answer ─────────

{
  // A streamed choice carries its payload in `delta`. The response whitelist
  // listed only `message`, so every chunk went out as
  // `{"choices":[{"index":0}]}` — correctly framed, correctly terminated with
  // [DONE], correctly metered, and empty. The gateway's own usage tap reads the
  // raw upstream bytes before sanitization, so nothing in the ledger showed it
  // either; the first symptom is a client that receives no answer at all.
  const chunk = sanitizeOpenAiChunk(
    JSON.stringify({
      id: "1",
      object: "chat.completion.chunk",
      created: 1,
      model: "glm-5.3:dev",
      system_fingerprint: "vllm-internal-build",
      choices: [{ index: 0, delta: { role: "assistant", content: "hello" }, finish_reason: null }],
    }),
    "theta",
  );
  const out = JSON.parse(chunk) as { model: string; choices: { delta?: Record<string, unknown> }[] };
  check("a streamed delta survives sanitization", out.choices[0]?.delta?.content === "hello", JSON.stringify(out.choices[0]));
  check("...and keeps its role", out.choices[0]?.delta?.role === "assistant");
  check("the endpoint model is still substituted for the upstream one", out.model === "theta", out.model);
  check("upstream build fingerprints are still stripped", !chunk.includes("vllm-internal-build"));

  // Tool-call fragments are deltas too, so they were erased by the same bug —
  // a streamed tool call would arrive as a call with no name and no arguments.
  const tcChunk = sanitizeOpenAiChunk(
    JSON.stringify({
      choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "write_file", arguments: '{"path"' } }] }, finish_reason: null }],
    }),
    "theta",
  );
  const tc = (JSON.parse(tcChunk) as { choices: { delta: { tool_calls: { function: { name: string; arguments: string } }[] } }[] }).choices[0].delta.tool_calls[0];
  check("a streamed tool-call fragment survives too", tc?.function?.name === "write_file" && tc.function.arguments === '{"path"', JSON.stringify(tc));

  // Usage-only chunks are internal and must still be dropped, not forwarded as
  // an empty choice.
  const usageOnly = sanitizeOpenAiChunk(JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } }), "theta");
  check("a usage-only chunk is still dropped", usageOnly === "__DROP__", usageOnly);

  // An empty delta is a real condition (keep-alive style chunks) and must not
  // be papered over with invented content.
  const empty = JSON.parse(sanitizeOpenAiChunk(JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: null }] }), "theta")) as { choices: { delta: Record<string, unknown> }[] };
  check("an empty delta stays empty rather than gaining invented content", Object.keys(empty.choices[0].delta).length === 0, JSON.stringify(empty.choices[0].delta));
}

// ── The stream-only lane set ────────────────────────────────────────────────

{
  check("openference is declared stream-only", STREAMING_REQUIRED.has("openference"));
  check("a normal lane is not", !STREAMING_REQUIRED.has("pareto"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
