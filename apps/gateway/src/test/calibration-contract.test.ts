// Calibration contract.
//
// calibrate-skills.ts reads one field out of router_signals: `capability`, a
// six-element distribution. Every other signal it can recompute or ignore, but
// without that array it skips the row outright — which is exactly what happened:
// capabilityVector existed, was unit-tested, and was never called on the request
// path, so every archived turn was unlabelled and the estimator had nothing to
// read. The failure is silent by construction (a skip counter, not an error), so
// it is asserted here rather than left to a comment.
//
// These run against routingSignals directly: the contract is about what gets
// persisted, not about which lane wins.

import { CAPABILITIES } from "@bhaskara/shared/skill";
import { routingSignals } from "../lib/decision";
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

function near(a: number, b: number, tol = 1e-6): boolean {
  return Math.abs(a - b) <= tol;
}

const user = (content: string): ChatMessage => ({ role: "user", content });

console.log("Test 1: the capability vector is persisted");
{
  const signals = routingSignals([user("add a helper to parse dates")], "sess-1", "routine");
  const cap = signals.capability;
  check("capability key present", cap !== undefined, `got ${typeof cap}`);
  check("capability is an array", Array.isArray(cap));
  check(
    `capability has ${CAPABILITIES.length} dimensions`,
    Array.isArray(cap) && cap.length === CAPABILITIES.length,
    Array.isArray(cap) ? `got ${cap.length}` : "",
  );
  check(
    "capability sums to 1 (simplex)",
    Array.isArray(cap) && near((cap as number[]).reduce((s, v) => s + v, 0), 1),
    Array.isArray(cap) ? `sum=${(cap as number[]).reduce((s, v) => s + v, 0)}` : "",
  );
  check(
    "no negative or non-finite weights",
    Array.isArray(cap) && (cap as number[]).every((v) => Number.isFinite(v) && v >= 0),
  );
}

console.log("\nTest 2: the vector discriminates between turns");
{
  // If this ever flattens to uniform for everything, calibration would be
  // regressing on noise while still looking healthy.
  const bug = CAPABILITIES.indexOf("debug");
  const typeRepair = CAPABILITIES.indexOf("type_repair");
  const context = CAPABILITIES.indexOf("long_context");

  const debugging = routingSignals(
    [user("the build is failing with TS2345, stack trace points at the resolver")],
    "sess-2",
    "debugging",
  ).capability as number[];
  const codegen = routingSignals(
    [user("add a new endpoint that follows the existing pattern")],
    "sess-3",
    "routine",
  ).capability as number[];

  check(
    "a failing-build turn loads debug/type_repair above uniform",
    debugging[bug] > 1 / CAPABILITIES.length || debugging[typeRepair] > 1 / CAPABILITIES.length,
    `debug=${debugging[bug].toFixed(3)} type_repair=${debugging[typeRepair].toFixed(3)}`,
  );
  check(
    "a construction turn loads codegen above uniform",
    codegen[CAPABILITIES.indexOf("codegen")] > 1 / CAPABILITIES.length,
    `codegen=${codegen[CAPABILITIES.indexOf("codegen")].toFixed(3)}`,
  );
  check(
    "the two turns do not produce the same vector",
    debugging.some((v, i) => !near(v, codegen[i], 1e-3)),
  );

  // Long context is driven by size, not wording — an unclassifiable but huge
  // turn must still land somewhere useful. Sized well past capability.ts's
  // 40k-token threshold (estimateTokens runs ~4 chars/token).
  const huge: ChatMessage[] = [
    { role: "user", content: "continue" },
    ...Array.from({ length: 400 }, (_, i): ChatMessage => ({
      role: i % 2 === 0 ? "assistant" : "user",
      content: "x".repeat(800),
    })),
  ];
  const big = routingSignals(huge, "sess-4", "routine").capability as number[];
  check(
    "a context-heavy turn loads long_context above uniform",
    big[context] > 1 / CAPABILITIES.length,
    `long_context=${big[context].toFixed(3)}`,
  );
}

console.log("\nTest 3: the rest of the contract still holds");
{
  const signals = routingSignals([user("fix the failing test")], "sess-5", "debugging", { source: "glm" });
  check("hardness recorded", signals.hardness === "debugging");
  check("stage recorded", typeof signals.stage === "string");
  check("stageBlocks recorded", typeof signals.stageBlocks === "number");
  check("failBlocks recorded", typeof signals.failBlocks === "number");
  check("loopRepeats recorded", typeof signals.loopRepeats === "number");
  check("prefixTokens recorded", typeof signals.prefixTokens === "number");
  check("caller fields still win the spread", signals.source === "glm");
  check(
    "blob is JSON-serializable (it is stored as text)",
    (() => {
      try {
        JSON.parse(JSON.stringify(signals));
        return true;
      } catch {
        return false;
      }
    })(),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
// Throws rather than exits — run-all.test.ts imports this file and reads a throw
// as the failure report. An exit would kill the sweep.
if (failed > 0) {
  throw new Error(`${failed} of ${passed + failed} calibration-contract assertions failed`);
}
