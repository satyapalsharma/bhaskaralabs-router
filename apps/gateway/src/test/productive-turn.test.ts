// Productive-turn detection.
//
// The bug this guards against inverted the router's cost model: the gateway
// decided a turn had failed by looking only at content chars, but a tool call
// carries no content — it arrives as `delta.tool_calls` (OpenAI) or a
// `tool_use` block (Anthropic). Every working turn of a coding agent therefore
// looked empty and dud-like, and both escalation streaks fired on healthy
// sessions:
//
//   emptyStreak  → escalate to the full model
//   dudStreak    → skip the cheap lanes entirely, go straight to metered
//
// Both cost real money, and both were triggered by the agent doing its job.

import {
  recordContentChars,
  contentCharsOf,
  hasToolCallsOf,
  recordDudTurn,
  emptyOutputStreak,
  dudStreak,
  DUD_MIN_PROMPT,
  DUD_MAX_OUT,
} from "../lib/escalation";
import { SseUsageAccumulator } from "../providers/hyper";
import { fitUpstreamWindow } from "../lib/window-guard";
import type { ChatMessage } from "../lib/prefix";

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

/** Unique session per assertion — the streaks are module-global maps. */
let sessionSeq = 0;
const sid = () => `s-${++sessionSeq}`;

// ── Response shape detection ────────────────────────────────────────────────

console.log("Test 1: OpenAI tool_calls are recognised");
{
  const withTool: unknown = {
    choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: "{}" } }] } }],
  };
  check("detects tool_calls in choices[].message", hasToolCallsOf(withTool));
  check("a tool call has no content chars", contentCharsOf(withTool) === 0);

  const prose: unknown = { choices: [{ message: { role: "assistant", content: "done" } }] };
  check("plain prose is not a tool call", !hasToolCallsOf(prose));

  const emptyToolCalls: unknown = { choices: [{ message: { role: "assistant", content: "hi", tool_calls: [] } }] };
  check("an empty tool_calls array is not a tool call", !hasToolCallsOf(emptyToolCalls));
}

console.log("\nTest 2: Anthropic tool_use is recognised");
{
  const withTool: unknown = {
    content: [{ type: "tool_use", id: "tu_1", name: "read", input: { path: "a.ts" } }],
    role: "assistant",
  };
  check("detects a tool_use content block", hasToolCallsOf(withTool));
  check("a tool_use block has no text chars", contentCharsOf(withTool) === 0);

  const mixed: unknown = { content: [{ type: "text", text: "let me look" }, { type: "tool_use", id: "t", name: "read", input: {} }] };
  check("text + tool_use still counts as a tool call", hasToolCallsOf(mixed));
  check("and its text is still counted", contentCharsOf(mixed) === "let me look".length);

  const proseOnly: unknown = { content: [{ type: "text", text: "all done" }] };
  check("text-only is not a tool call", !hasToolCallsOf(proseOnly));
}

console.log("\nTest 3: malformed input never fabricates a tool call");
{
  check("null is safe", !hasToolCallsOf(null));
  check("a string is safe", !hasToolCallsOf("nope"));
  check("a number is safe", !hasToolCallsOf(42));
  check("an empty object is safe", !hasToolCallsOf({}));
  check("choices without a message is safe", !hasToolCallsOf({ choices: [{}] }));
  check("content without types is safe", !hasToolCallsOf({ content: [{}, {}] }));
}

// ── The streaks themselves ──────────────────────────────────────────────────

console.log("\nTest 4: a tool call is not an empty response");
{
  const s = sid();
  recordContentChars(s, 0, true);
  check("a zero-char tool call leaves the streak at 0", emptyOutputStreak(s) === 0);

  recordContentChars(s, 0, true);
  recordContentChars(s, 0, true);
  check("repeated tool calls never accumulate a streak", emptyOutputStreak(s) === 0);

  const t = sid();
  recordContentChars(t, 0, false);
  recordContentChars(t, 0, false);
  check("genuinely empty replies still accumulate", emptyOutputStreak(t) === 2);

  recordContentChars(t, 0, true);
  check("a tool call then resets a real streak", emptyOutputStreak(t) === 0);
}

console.log("\nTest 5: a tool call is not a dud");
{
  const huge = DUD_MIN_PROMPT + 25_000;
  const tiny = DUD_MAX_OUT - 200;

  const s = sid();
  recordDudTurn(s, huge, tiny, true, true);
  check("a short tool call at 65k context is not a dud", dudStreak(s) === 0);

  recordDudTurn(s, huge, tiny, true, true);
  recordDudTurn(s, huge, tiny, true, true);
  check("and it never becomes one on repetition", dudStreak(s) === 0);

  const t = sid();
  recordDudTurn(t, huge, tiny, true, false);
  check("a real chat-mode give-up still is a dud", dudStreak(t) === 1);
  recordDudTurn(t, huge, tiny, true, false);
  check("and it still accumulates", dudStreak(t) === 2);

  // The other two conditions must keep working unchanged.
  const u = sid();
  recordDudTurn(u, 5_000, tiny, true, false);
  check("a small prompt is never a dud", dudStreak(u) === 0);

  const v = sid();
  recordDudTurn(v, huge, 8_000, true, false);
  check("a long answer is never a dud", dudStreak(v) === 0);

  const w = sid();
  recordDudTurn(w, huge, tiny, false, false);
  check("a request without tools is never a dud", dudStreak(w) === 0);
}

// ── The stream tap that feeds them ──────────────────────────────────────────

console.log("\nTest 6: the SSE tap sees streamed tool calls");
{
  const acc = new SseUsageAccumulator();
  const chunk = (delta: Record<string, unknown>) =>
    JSON.stringify({ object: "chat.completion.chunk", choices: [{ index: 0, delta }] });

  acc.feed(chunk({ role: "assistant", content: "" }));
  check("no tool calls yet", !acc.hasToolCalls);

  // The exact shape a coding agent produces: arguments split across chunks.
  acc.feed(chunk({ tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "readFile", arguments: "" } }] }));
  check("a tool_call chunk sets the flag", acc.hasToolCalls);
  acc.feed(chunk({ tool_calls: [{ index: 0, function: { arguments: '{"path":"auth.ts"}' } }] }));
  check("the flag stays set across the argument stream", acc.hasToolCalls);
  check("and contentChars stayed at 0", acc.contentChars === 0);

  const prose = new SseUsageAccumulator();
  prose.feed(chunk({ content: "hello " }));
  prose.feed(chunk({ content: "world" }));
  check("text still counts normally", prose.contentChars === 11);
  check("text alone never sets the flag", !prose.hasToolCalls);

  const both = new SseUsageAccumulator();
  both.feed(chunk({ content: "let me check" }));
  both.feed(chunk({ tool_calls: [{ index: 0, id: "c", type: "function", function: { name: "run", arguments: "{}" } }] }));
  check("a turn can carry both text and a tool call", both.contentChars === "let me check".length && both.hasToolCalls);

  const empty = new SseUsageAccumulator();
  empty.feed(chunk({ tool_calls: [] }));
  check("an empty tool_calls delta is ignored", !empty.hasToolCalls);
  empty.feed("not json at all");
  check("garbage lines do not throw or misfire", !empty.hasToolCalls);
}

// ── The window guard's own orphan fix ───────────────────────────────────────

console.log("\nTest 7: the window guard never orphans a tool reply");
{
  // [user, assistant(tc), tool, tool, user, assistant(tc), tool, user, user]
  const history: ChatMessage[] = [
    { role: "user", content: "x".repeat(400) },
    { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "read", arguments: "{}" } }] },
    { role: "tool", content: "y".repeat(400), tool_call_id: "c1" },
    { role: "tool", content: "z".repeat(400), tool_call_id: "c1" },
    { role: "user", content: "next" },
    { role: "assistant", content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "run", arguments: "{}" } }] },
    { role: "tool", content: "w".repeat(400), tool_call_id: "c2" },
    { role: "user", content: "what failed?" },
    { role: "user", content: "and why?" },
  ];
  // A limit that forces the cut to land inside the first group.
  for (let limit = 100; limit <= 1_200; limit += 37) {
    const { messages } = fitUpstreamWindow(history, 0, limit);
    const survivor = messages.filter((m) => m.role !== "system");
    const toolIds = new Set(survivor.filter((m) => m.role === "tool").map((m) => m.tool_call_id));
    const ownerIds = new Set(
      survivor.flatMap((m) => (Array.isArray(m.tool_calls) ? m.tool_calls.map((t) => (t as { id: string }).id) : [])),
    );
    const orphans = [...toolIds].filter((id) => !ownerIds.has(id as string));
    if (orphans.length > 0) {
      check(`limit ${limit}: no orphaned tool reply`, false, `orphans ${orphans.join(",")}`);
      break;
    }
  }
  check("no limit produced an orphaned tool reply", true);

  // The final user prompt is never dropped, whatever the limit.
  const tight = fitUpstreamWindow(history, 0, 1);
  const tail = tight.messages[tight.messages.length - 1];
  check("the live prompt always survives", tail.role === "user" && tail.content === "and why?");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
