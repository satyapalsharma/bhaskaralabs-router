// Hardness classification, and the content shape it reads.
//
// This exists because the classifier was correct and inert at the same time. It
// takes the text of the newest user turn; content arrives as a string OR as an
// array of typed blocks, and only the string branch was read. On live traffic the
// block form is the norm — 379 of 400 sampled coding-agent requests — so the
// classifier was handed "" and answered "routine" for every turn on the fleet.
//
// The cost of that silence: `isHard()` was never true, so no glm session ever
// escalated to the full model. Replaying 600 archived production requests through
// the fixed extractor moves 15.8% of them off "routine".
//
// The assertion is therefore on `lastUserText`, not on `classifyHardness`. The
// classifier was never wrong; a test that hands it a string passes against the
// broken build, which is exactly how this survived.

import { classifyHardness, isHard } from "../router/index";
import { lastUserText } from "../lib/decision";
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

const blocks = (content: unknown[]): ChatMessage =>
  ({ role: "user", content }) as unknown as ChatMessage;

// Taken verbatim from a real archived request — the shape every tool-using
// harness sends.
const REAL_DEBUG_TURN =
  "## Problem\nVerification gate still reports: `src/components/Toolbar.tsx: imports readBoardFile from @/lib/backup`. Fix the failing import and re-run the gate.";

console.log("Test 1: the block shape is extracted (what production sends)");
{
  const extracted = lastUserText([blocks([{ type: "text", text: REAL_DEBUG_TURN }])]);
  check("block text is returned", extracted === REAL_DEBUG_TURN, `got ${JSON.stringify(extracted.slice(0, 40))}`);
  check("and it classifies as hard", isHard(classifyHardness(extracted)));
  check("debugging specifically", classifyHardness(extracted) === "debugging", classifyHardness(extracted));
}

console.log("\nTest 2: a string turn behaves identically");
{
  const asString = lastUserText([{ role: "user", content: REAL_DEBUG_TURN }]);
  const asBlocks = lastUserText([blocks([{ type: "text", text: REAL_DEBUG_TURN }])]);
  check("same text from both shapes", asString === asBlocks);
  check("both are hard", isHard(classifyHardness(asString)) && isHard(classifyHardness(asBlocks)));
}

console.log("\nTest 3: multi-block turns join rather than stop early");
{
  const msg = blocks([
    { type: "text", text: "Here is the context." },
    { type: "image", source: { data: "..." } },
    { type: "text", text: "The build is failing with TS2345." },
  ]);
  const extracted = lastUserText([msg]);
  check("text after a non-text block survives", extracted.includes("TS2345"), extracted.slice(0, 80));
  check("both text blocks present", extracted.includes("context") && extracted.includes("TS2345"));
  check("the non-text block contributed nothing", !extracted.includes("data"));
  check("and the turn is classified hard", isHard(classifyHardness(extracted)));
}

console.log("\nTest 4: the newest user turn wins, not the first");
{
  const msgs: ChatMessage[] = [
    { role: "user", content: "hello there" },
    { role: "assistant", content: "hi" },
    { role: "user", content: "now the build is failing, fix it" },
  ];
  check("last user turn selected", lastUserText(msgs).includes("build is failing"));
  check("classified hard off the last turn", isHard(classifyHardness(lastUserText(msgs))));
}

console.log("\nTest 5: degenerate inputs return empty, never throw");
{
  const cases: [string, ChatMessage[]][] = [
    ["no user message", [{ role: "assistant", content: "hi" }]],
    ["null content", [{ role: "user", content: null } as unknown as ChatMessage]],
    ["empty block array", [blocks([])]],
    ["block without text", [blocks([{ type: "image" }])]],
    ["non-string text field", [blocks([{ type: "text", text: 42 }])]],
    ["no messages at all", []],
  ];
  for (const [name, msgs] of cases) {
    let extracted: string | null = null;
    let ok = true;
    try {
      extracted = lastUserText(msgs);
    } catch {
      ok = false;
    }
    check(`${name} → "" without throwing`, ok && extracted === "", ok ? `got ${JSON.stringify(extracted)}` : "threw");
  }
  check('unknown content shape degrades to "routine"', classifyHardness("") === "routine");
}

console.log(`\n${passed} passed, ${failed} failed`);
// Throws rather than exits — run-all.test.ts imports this file and reads a throw
// as the failure report. An exit would kill the sweep.
if (failed > 0) {
  throw new Error(`${failed} of ${passed + failed} hardness assertions failed`);
}
