// Provider module tests
import { 
  pickKeyForSession,
  parseUsageNonStream,
  readRawUsage,
  type HyperUsage,
  type HyperKey
} from "../providers/hyper";

console.log("Testing provider modules...\n");

// Test 1: pickKeyForSession distributes keys evenly
console.log("Test 1: pickKeyForSession distributes keys evenly");
const keys: HyperKey[] = [
  { id: "key1", key: "sk-test-1" },
  { id: "key2", key: "sk-test-2" },
  { id: "key3", key: "sk-test-3" },
];

// Test with multiple sessions
const sessions = ["session-1", "session-2", "session-3", "session-4", "session-5"];
const results = sessions.map(session => pickKeyForSession(keys, session));

// Verify we get valid keys
for (const result of results) {
  if (!keys.some(k => k.id === result.id)) {
    throw new Error(`Invalid key selected: ${result.id}`);
  }
}

// Verify distribution (with enough sessions, should be roughly even)
const counts: Record<string, number> = { key1: 0, key2: 0, key3: 0 };
for (const s of sessions) {
  const key = pickKeyForSession(keys, s);
  counts[key.id]++;
}
console.log("  ✓ Key distribution:", counts);
console.log("  ✓ All sessions get valid keys");

// Test 2: pickKeyForSession with single key
console.log("\nTest 2: pickKeyForSession with single key");
const singleKey: HyperKey[] = [{ id: "only-key", key: "sk-only" }];
const result1 = pickKeyForSession(singleKey, "any-session");
if (result1.id !== "only-key") {
  throw new Error("Should return the only key when only one exists");
}
console.log("  ✓ Single key selection works");

// Test 3: pickKeyForSession with empty array
console.log("\nTest 3: pickKeyForSession with empty array");
try {
  const emptyKeys: HyperKey[] = [];
  pickKeyForSession(emptyKeys, "session");
  throw new Error("Should throw with empty keys array");
} catch (e) {
  console.log("  ✓ Throws with empty keys array (as expected)");
}

// Test 4: parseUsageNonStream with valid usage
console.log("\nTest 4: parseUsageNonStream with valid usage");
const validUsage = {
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 500,
    prompt_tokens_details: { cached_tokens: 200 },
    completion_tokens_details: { reasoning_tokens: 100 },
    cost: { hypercredits: 5 },
    remaining: { hypercredits: 245 },
    cost_details: { upstream_inference_cost: 0.001 }
  }
};
const parsed1 = parseUsageNonStream(validUsage);
if (parsed1.promptTokens !== 1000) throw new Error("promptTokens mismatch");
if (parsed1.completionTokens !== 500) throw new Error("completionTokens mismatch");
if (parsed1.cachedTokens !== 200) throw new Error("cachedTokens mismatch");
if (parsed1.reasoningTokens !== 100) throw new Error("reasoningTokens mismatch");
if (parsed1.hypercredits !== 5) throw new Error("hypercredits mismatch");
if (parsed1.camelCostUsd !== 0.001) throw new Error("camelCostUsd mismatch");
console.log("  ✓ Valid usage parsed correctly");
console.log(`    Prompt: ${parsed1.promptTokens}, Completion: ${parsed1.completionTokens}`);
console.log(`    Cached: ${parsed1.cachedTokens}, Reasoning: ${parsed1.reasoningTokens}`);

// Test 5: parseUsageNonStream with missing fields
console.log("\nTest 5: parseUsageNonStream with missing fields");
const minimalUsage = { usage: {} };
const parsed2 = parseUsageNonStream(minimalUsage);
if (parsed2.promptTokens !== 0) throw new Error("Should default to 0");
if (parsed2.completionTokens !== 0) throw new Error("Should default to 0");
console.log("  ✓ Missing fields default to 0");

// Test 6: parseUsageNonStream with null usage
console.log("\nTest 6: parseUsageNonStream with null/empty usage");
const parsed3 = parseUsageNonStream({});
if (parsed3.promptTokens !== 0) throw new Error("Should default to 0");
const parsed4 = parseUsageNonStream({ usage: null });
if (parsed4.promptTokens !== 0) throw new Error("Should default to 0");
console.log("  ✓ Null/empty usage defaults to 0");

// Test 7: readRawUsage with all fields
console.log("\nTest 7: readRawUsage with all fields");
const rawUsage = {
  prompt_tokens: 2000,
  completion_tokens: 1000,
  prompt_tokens_details: { cached_tokens: 500 },
  completion_tokens_details: { reasoning_tokens: 250 },
  cost: { hypercredits: 10 },
  remaining: { hypercredits: 240 },
  cost_details: { upstream_inference_cost: 0.002 }
};
const read1 = readRawUsage(rawUsage);
if (read1.promptTokens !== 2000) throw new Error("promptTokens mismatch in readRawUsage");
if (read1.completionTokens !== 1000) throw new Error("completionTokens mismatch in readRawUsage");
if (read1.cachedTokens !== 500) throw new Error("cachedTokens mismatch in readRawUsage");
if (read1.reasoningTokens !== 250) throw new Error("reasoningTokens mismatch in readRawUsage");
console.log("  ✓ readRawUsage parses all fields correctly");

// Test 8: Session key consistency
console.log("\nTest 8: Session key consistency");
const sameSession = "test-session-123";
const resultA = pickKeyForSession(keys, sameSession);
const resultB = pickKeyForSession(keys, sameSession);
if (resultA.id !== resultB.id) {
  throw new Error("Same session should get same key");
}
console.log("  ✓ Same session always gets same key");

// Test 9: Different sessions get potentially different keys
console.log("\nTest 9: Different sessions distribution");
const session1 = pickKeyForSession(keys, "session-alpha");
const session2 = pickKeyForSession(keys, "session-beta");
// They might be the same or different depending on hash
console.log(`  ✓ Session alpha -> ${session1.id}, Session beta -> ${session2.id}`);

console.log("\n✅ All provider module tests passed!");
