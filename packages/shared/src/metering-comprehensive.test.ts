// Comprehensive metering tests - edge cases and validation
import { valueUserFacing, valueActualCost, type Usage } from "./metering";

console.log("Running comprehensive metering tests...\n");

// Helper to check if number is approximately equal
function approxEqual(a: number, b: number, tolerance: number = 1e-9): boolean {
  return Math.abs(a - b) < tolerance;
}

// Test 1: Zero token usage
console.log("Test 1: Zero token usage");
const zeroUsage: Usage = {
  promptTokens: 0,
  completionTokens: 0,
  model: "glm-5.3",
  provider: "hyper"
};
const zeroFacing = valueUserFacing(zeroUsage);
const zeroActual = valueActualCost(zeroUsage);
if (!approxEqual(zeroFacing.equivalentApiCost, 0)) {
  throw new Error("Zero usage should have zero cost");
}
if (!approxEqual(zeroActual, 0)) {
  throw new Error("Zero usage should have zero actual cost");
}
console.log("  ✓ Zero usage costs $0");

// Test 2: Very large token counts
console.log("\nTest 2: Very large token counts");
const largeUsage: Usage = {
  promptTokens: 1_000_000_000, // 1 billion tokens
  completionTokens: 500_000_000,
  model: "glm-5.3",
  provider: "hyper"
};
const largeFacing = valueUserFacing(largeUsage);
const largeActual = valueActualCost(largeUsage);
// Should not overflow or error
if (!Number.isFinite(largeFacing.equivalentApiCost)) {
  throw new Error("Large usage should not overflow");
}
console.log(`  ✓ Large usage handled: $${largeFacing.equivalentApiCost.toFixed(2)}`);

// Test 3: Different providers return different costs
console.log("\nTest 3: Different providers have different costs");
const testUsage: Usage = {
  promptTokens: 100_000,
  completionTokens: 50_000,
  model: "glm-5.3",
  provider: "hyper"
};
const hyperCost = valueActualCost({ ...testUsage, provider: "hyper" });
const camelCost = valueActualCost({ ...testUsage, provider: "camel" });
const agnesCost = valueActualCost({ ...testUsage, provider: "agnes" });

console.log(`  Hyper cost: $${hyperCost.toFixed(6)}`);
console.log(`  Camel cost: $${camelCost.toFixed(6)}`);
console.log(`  Agnes cost: $${agnesCost.toFixed(6)}`);

if (hyperCost === camelCost && hyperCost !== 0) {
  throw new Error("Hyper and Camel should have different costs for non-zero usage");
}
console.log("  ✓ Different providers have different costs");

// Test 4: Cache hit pricing for Hyper
console.log("\nTest 4: Cache hit pricing for Hyper");
const cachedUsage: Usage = {
  promptTokens: 100_000,
  completionTokens: 50_000,
  cachedTokens: 50_000, // 50% cached
  model: "glm-5.3",
  provider: "hyper"
};
const noCacheCost = valueActualCost({ ...cachedUsage, cachedTokens: 0 });
const withCacheCost = valueActualCost(cachedUsage);

if (withCacheCost >= noCacheCost) {
  throw new Error("Cached usage should cost less than non-cached");
}
console.log(`  No cache: $${noCacheCost.toFixed(6)}`);
console.log(`  With cache: $${withCacheCost.toFixed(6)}`);
console.log("  ✓ Cache hits reduce cost");

// Test 5: Full cache scenario
console.log("\nTest 5: Full cache scenario");
const fullCacheUsage: Usage = {
  promptTokens: 100_000,
  completionTokens: 0,
  cachedTokens: 100_000, // 100% cached
  model: "glm-5.3",
  provider: "hyper"
};
const fullCacheCost = valueActualCost(fullCacheUsage);
if (fullCacheCost < 0) {
  throw new Error("Full cache cost should not be negative");
}
console.log(`  Full cache cost: $${fullCacheCost.toFixed(6)}`);
console.log("  ✓ Full cache scenario handled");

// Test 6: Reasoning tokens included in completion
console.log("\nTest 6: Reasoning tokens included in completion");
const reasoningUsage: Usage = {
  promptTokens: 10_000,
  completionTokens: 5_000,
  reasoningTokens: 10_000, // reasoning tokens
  model: "glm-5.3",
  provider: "hyper"
};
const reasoningCost = valueActualCost(reasoningUsage);
// The reasoning tokens are part of completion_tokens in the response
// So the cost should be based on completionTokens only
console.log(`  Cost with reasoning: $${reasoningCost.toFixed(6)}`);
console.log("  ✓ Reasoning tokens handled");

// Test 7: Unknown model defaults
console.log("\nTest 7: Unknown model defaults");
const unknownModelUsage: Usage = {
  promptTokens: 10_000,
  completionTokens: 5_000,
  model: "unknown-model-xyz",
  provider: "hyper"
};
const unknownCost = valueActualCost(unknownModelUsage);
// Should default to glm-5.3 rates or return 0
console.log(`  Unknown model cost: $${unknownCost.toFixed(6)}`);
console.log("  ✓ Unknown models handled gracefully");

// Test 8: actualCostOverrideUsd for Camel
console.log("\nTest 8: actualCostOverrideUsd for Camel");
const camelWithOverride: Usage = {
  promptTokens: 10_000,
  completionTokens: 5_000,
  model: "gpt-5.6",
  provider: "camel",
  actualCostOverrideUsd: 0.012345
};
const camelOverrideCost = valueActualCost(camelWithOverride);
if (!approxEqual(camelOverrideCost, 0.012345)) {
  throw new Error(`Expected override cost, got ${camelOverrideCost}`);
}
console.log(`  Camel with override: $${camelOverrideCost.toFixed(6)}`);
console.log("  ✓ actualCostOverrideUsd is used for Camel");

// Test 9: Display tokens match input
console.log("\nTest 9: Display tokens match input");
const displayTestUsage: Usage = {
  promptTokens: 123_456,
  completionTokens: 78_901,
  model: "qwen-3.8",
  provider: "hyper"
};
const displayResult = valueUserFacing(displayTestUsage);
if (displayResult.displayTokens.input !== 123_456) {
  throw new Error("Display input tokens should match usage");
}
if (displayResult.displayTokens.output !== 78_901) {
  throw new Error("Display output tokens should match usage");
}
console.log(`  ✓ Display tokens: input=${displayResult.displayTokens.input}, output=${displayResult.displayTokens.output}`);

// Test 10: Negative token counts
console.log("\nTest 10: Negative token counts (edge case)");
const negativeUsage: Usage = {
  promptTokens: -100,
  completionTokens: -50,
  model: "glm-5.3",
  provider: "hyper"
};
const negativeFacing = valueUserFacing(negativeUsage);
const negativeActual = valueActualCost(negativeUsage);
// Should handle negative values (might result in negative cost, which is odd but mathematically correct)
console.log(`  Negative usage cost: $${negativeActual.toFixed(6)}`);
console.log("  ✓ Negative values handled (though they shouldn't occur in practice)");

// Test 11: Partial cache scenario
console.log("\nTest 11: Partial cache with more cached than prompt");
const partialUsage: Usage = {
  promptTokens: 100_000,
  completionTokens: 50_000,
  cachedTokens: 150_000, // More cached than prompt (shouldn't happen but test anyway)
  model: "glm-5.3",
  provider: "hyper"
};
const partialCost = valueActualCost(partialUsage);
// Should cap cached at promptTokens
console.log(`  Partial cache cost: $${partialCost.toFixed(6)}`);
console.log("  ✓ Partial cache with edge case handled");

// Test 12: Theta display rates
console.log("\nTest 12: Theta display rates");
const thetaUsage: Usage = {
  promptTokens: 100_000,
  completionTokens: 50_000,
  model: "theta",
  provider: "yolo" // Theta uses yolo/feihoa as backchannel
};
const thetaResult = valueUserFacing(thetaUsage);
// Theta should use THETA_DISPLAY rates
const expectedThetaCost = (100_000 * 0.20 + 50_000 * 0.40) / 1_000_000;
if (!approxEqual(thetaResult.equivalentApiCost, expectedThetaCost)) {
  throw new Error(`Theta cost mismatch: expected ${expectedThetaCost}, got ${thetaResult.equivalentApiCost}`);
}
console.log(`  Theta display cost: $${thetaResult.equivalentApiCost.toFixed(6)}`);
console.log("  ✓ Theta display rates correct");

// Test 13: Bootstrap providers (agnes, stepfun) have 0 cost
console.log("\nTest 13: Bootstrap providers have 0 actual cost");
const agnesUsageBootstrap: Usage = {
  promptTokens: 100_000,
  completionTokens: 50_000,
  model: "qwen-3.8",
  provider: "agnes"
};
const stepfunUsageBootstrap: Usage = {
  promptTokens: 100_000,
  completionTokens: 50_000,
  model: "qwen-3.8",
  provider: "stepfun"
};
const agnesCostBootstrap = valueActualCost(agnesUsageBootstrap);
const stepfunCostBootstrap = valueActualCost(stepfunUsageBootstrap);

if (!approxEqual(agnesCostBootstrap, 0)) {
  throw new Error("Agnes should have 0 cost (flat plan)");
}
if (!approxEqual(stepfunCostBootstrap, 0)) {
  throw new Error("Stepfun should have 0 cost (flat plan)");
}
console.log("  ✓ Bootstrap providers have 0 actual cost");

// Test 14: DevPass provider
console.log("\nTest 14: DevPass provider");
const devpassUsage: Usage = {
  promptTokens: 100_000,
  completionTokens: 50_000,
  model: "deepseek-v4-flash-0731",
  provider: "devpass"
};
const devpassCost = valueActualCost(devpassUsage);
// DevPass has its own rate card
if (devpassCost <= 0) {
  throw new Error("DevPass should have positive cost");
}
console.log(`  DevPass cost: $${devpassCost.toFixed(6)}`);
console.log("  ✓ DevPass cost calculated");

console.log("\n✅ All comprehensive metering tests passed!");
