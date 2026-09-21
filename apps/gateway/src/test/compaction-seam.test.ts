// Compaction seam safety.
//
// The failure this guards against is not a crash — it is a session that works,
// then stops working forever. Compaction runs once, cuts a tool-call group in
// half, and every subsequent turn is rejected by the provider with:
//
//   400 Messages with role 'tool' must be a response to a preceding
//       message with 'tool_calls'
//
// The client sees a 400 it cannot fix, because the broken history is on our
// side of the wire. That asymmetry is why this has its own test file.

import { safeSpanBoundary, messagesTokens } from "../lib/compaction/compact";
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

/** A tool-call group: the assistant that issued it, plus its replies. */
function group(id: string, replies: number): ChatMessage[] {
  return [
    { role: "assistant", content: null, tool_calls: [{ id, type: "function", function: { name: "readFile", arguments: "{}" } }] },
    ...Array.from({ length: replies }, () => ({ role: "tool" as const, content: "file contents", tool_call_id: id })),
  ];
}

const u = (t: string): ChatMessage => ({ role: "user", content: t });

console.log("Test 1: a cut inside a tool group moves back to the owner");
{
  // [user, assistant(tc), tool, tool, user, user]
  //                       ^ span=2 lands on the first tool reply
  const history = [u("a"), ...group("c1", 2), u("b"), u("c")];
  const snapped = safeSpanBoundary(history, 2);
  check("span 2 (first tool reply) → 1 (the assistant)", snapped === 1, `got ${snapped}`);
  check("the surviving history starts on the assistant", history[snapped].role === "assistant");
  check("the surviving history still holds the whole group", history.slice(snapped).filter((m) => m.role === "tool").length === 2);
}

console.log("\nTest 2: every cut position inside a group lands on its owner");
{
  // A group of 4 replies occupies indices 1..5 after a leading user message.
  const history = [u("a"), ...group("c1", 4), u("b"), u("c")];
  for (let span = 2; span <= 5; span++) {
    const snapped = safeSpanBoundary(history, span);
    check(
      `span ${span} → ${snapped}, no orphaned tool reply`,
      snapped === 1 && history[snapped].role === "assistant",
      `got ${snapped} (${history[snapped]?.role})`,
    );
  }
}

console.log("\nTest 3: a cut already on a clean seam is left alone");
{
  const history = [u("a"), ...group("c1", 2), u("b"), u("c")];
  check("cut at the assistant is unchanged", safeSpanBoundary(history, 1) === 1);
  check("cut after the group is unchanged", safeSpanBoundary(history, 4) === 4, String(safeSpanBoundary(history, 4)));
  check("cut at 0 is unchanged", safeSpanBoundary(history, 0) === 0);
  const noTools: ChatMessage[] = [u("a"), u("b"), u("c"), u("d")];
  check("a tool-free history is untouched", safeSpanBoundary(noTools, 2) === 2);
}

console.log("\nTest 4: consecutive groups each snap to their own owner");
{
  // Two adjacent groups: [u, a(tc), t, a(tc), t, u, u]
  //                      0  1      2  3      4  5  6
  const history: ChatMessage[] = [u("a"), ...group("c1", 1), ...group("c2", 1), u("b"), u("c")];
  check("cut at the second group's reply snaps to its own assistant", safeSpanBoundary(history, 4) === 3, String(safeSpanBoundary(history, 4)));
  check("cut at the first group's reply snaps to the first assistant", safeSpanBoundary(history, 2) === 1, String(safeSpanBoundary(history, 2)));
}

console.log("\nTest 5: degenerate inputs fall back to a safe zero");
{
  const history = [u("a"), ...group("c1", 2), u("b"), u("c")];
  // An orphaned `tool` at the very start has no owner to walk back to — and it
  // needs none: a cut at index 1 summarizes it away, which repairs the history
  // rather than breaking it. The walk-back only fires when the cut itself lands
  // on a tool reply.
  const leadWithTool: ChatMessage[] = [{ role: "tool", content: "x", tool_call_id: "c1" }, u("a"), u("b"), u("c")];
  check("a cut after a leading orphan is already clean", safeSpanBoundary(leadWithTool, 1) === 1);
  check("and it compacts the orphan away", !leadWithTool.slice(safeSpanBoundary(leadWithTool, 1)).some((m) => m.role === "tool"));
  check("a cut ON a leading orphan still walks to 0", safeSpanBoundary(leadWithTool, 0) === 0);
  check("span beyond the end is clamped", safeSpanBoundary(history, 999) === history.length);
  check("an empty history is handled", safeSpanBoundary([], 0) === 0);
  check("a negative span is handled", safeSpanBoundary(history, -1) === -1);
}

console.log("\nTest 6: the real scenario — the cut compaction would have made");
{
  // A coding session: several tool groups, then the live prompt. This is the
  // shape that produced the reported 400.
  const history: ChatMessage[] = [
    u("read the auth module"),
    ...group("c1", 2),
    u("now fix the bug"),
    ...group("c2", 3),
    u("run the tests"),
    ...group("c3", 1),
    u("what failed?"),
    u("and why?"),
  ];
  for (let span = 0; span <= history.length; span++) {
    const snapped = safeSpanBoundary(history, span);
    const survivor = history.slice(snapped);
    const toolIds = new Set(survivor.filter((m) => m.role === "tool").map((m) => m.tool_call_id));
    const assistantIds = new Set(
      survivor.flatMap((m) => (Array.isArray(m.tool_calls) ? m.tool_calls.map((t) => (t as { id: string }).id) : [])),
    );
    const orphans = [...toolIds].filter((id) => !assistantIds.has(id as string));
    check(`span ${span}: no orphaned tool reply`, orphans.length === 0, `orphans ${orphans.join(",")}`);
  }
  // And the final pair is never compacted away by the caller's own guard.
  check("history is non-trivial enough to compact", messagesTokens(history) > 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
