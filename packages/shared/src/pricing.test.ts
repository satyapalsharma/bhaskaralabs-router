// Pricing configuration tests - verify all rate cards are valid
import { 
  FRONTIER_DISPLAY, 
  THETA_DISPLAY, 
  HYPER, 
  FEIHOA, 
  DEVPASS, 
  GENERALCOMPUTE,
  STEPFUN,
  AGNES,
  PLANS,
  ROUTER,
  PROVIDER_CLASS,
  type RateCard,
  type Plan
} from "./pricing";

// Helper to check rate card validity
function isValidRateCard(card: RateCard): boolean {
  return typeof card.input === "number" && 
         typeof card.output === "number" &&
         card.input >= 0 && 
         card.output >= 0;
}

// Test 1: All frontier display rates are valid
console.log("Testing FRONTIER_DISPLAY rates...");
for (const [model, card] of Object.entries(FRONTIER_DISPLAY)) {
  if (!isValidRateCard(card)) {
    throw new Error(`Invalid rate card for ${model}: ${JSON.stringify(card)}`);
  }
  if (card.cacheHit !== undefined && card.cacheHit < 0) {
    throw new Error(`Negative cacheHit rate for ${model}`);
  }
  console.log(`  ✓ ${model}: $${card.input}/M in, $${card.output}/M out`);
}

// Test 2: THETA_DISPLAY is valid
console.log("\nTesting THETA_DISPLAY rate...");
if (!isValidRateCard(THETA_DISPLAY)) {
  throw new Error("Invalid THETA_DISPLAY rate card");
}
if (THETA_DISPLAY.cacheHit !== undefined && THETA_DISPLAY.cacheHit < 0) {
  throw new Error("Negative cacheHit rate for THETA_DISPLAY");
}
console.log(`  ✓ Theta: $${THETA_DISPLAY.input}/M in, $${THETA_DISPLAY.output}/M out, cacheHit: $${THETA_DISPLAY.cacheHit}`);

// Test 3: All HYPER rates are valid
console.log("\nTesting HYPER rates...");
for (const [model, card] of Object.entries(HYPER)) {
  if (!isValidRateCard(card)) {
    throw new Error(`Invalid HYPER rate card for ${model}`);
  }
  if (card.cacheHit !== undefined && card.cacheHit < 0) {
    throw new Error(`Negative cacheHit rate for HYPER ${model}`);
  }
  console.log(`  ✓ ${model}: $${card.input}/M in, $${card.output}/M out`);
}

// Test 4: FEIHOA rates (should be 0 for backchannel)
console.log("\nTesting FEIHOA rates...");
for (const [model, card] of Object.entries(FEIHOA)) {
  if (card.input !== 0 || card.output !== 0) {
    throw new Error(`FEIHOA rates should be 0, got ${JSON.stringify(card)} for ${model}`);
  }
  console.log(`  ✓ ${model}: $0/M (backchannel)`);
}

// Test 5: DEVPASS rates
console.log("\nTesting DEVPASS rates...");
for (const [model, card] of Object.entries(DEVPASS)) {
  if (!isValidRateCard(card)) {
    throw new Error(`Invalid DEVPASS rate card for ${model}`);
  }
  console.log(`  ✓ ${model}: $${card.input}/M in, $${card.output}/M out`);
}

// Test 6: GENERALCOMPUTE rates
console.log("\nTesting GENERALCOMPUTE rates...");
for (const [model, card] of Object.entries(GENERALCOMPUTE)) {
  if (!isValidRateCard(card)) {
    throw new Error(`Invalid GENERALCOMPUTE rate card for ${model}`);
  }
  console.log(`  ✓ ${model}: $${card.input}/M in, $${card.output}/M out`);
}

// Test 7: PLANS configuration
console.log("\nTesting PLANS configuration...");
const expectedPlans: Plan["id"][] = ["free", "basic", "advanced"];
for (const id of expectedPlans) {
  const plan = PLANS[id];
  if (!plan) {
    throw new Error(`Missing plan: ${id}`);
  }
  if (plan.priceUsd < 0 || plan.priceInr < 0) {
    throw new Error(`Negative price for plan ${id}`);
  }
  if (plan.frontierInputM < 0 || plan.frontierOutputM < 0) {
    throw new Error(`Negative token limit for plan ${id}`);
  }
  console.log(`  ✓ ${id}: $${plan.priceUsd}/mo, ${plan.frontierInputM}M in, ${plan.frontierOutputM}M out`);
}

// Test 8: ROUTER configuration
console.log("\nTesting ROUTER configuration...");
if (ROUTER.fullShareCapPerUserPerWeek <= 0 || ROUTER.fullShareCapPerUserPerWeek > 1) {
  throw new Error("Invalid fullShareCapPerUserPerWeek");
}
if (ROUTER.fullShareAlertAt >= ROUTER.fullShareCapPerUserPerWeek) {
  throw new Error("Alert threshold should be less than cap");
}
if (ROUTER.cacheHitAssumption <= 0 || ROUTER.cacheHitAssumption > 1) {
  throw new Error("Invalid cacheHitAssumption");
}
if (ROUTER.reeval.enabled !== true && ROUTER.reeval.enabled !== false) {
  throw new Error("Invalid reeval.enabled");
}
console.log(`  ✓ Full share cap: ${ROUTER.fullShareCapPerUserPerWeek * 100}%`);
console.log(`  ✓ Alert at: ${ROUTER.fullShareAlertAt * 100}%`);
console.log(`  ✓ Cache hit assumption: ${ROUTER.cacheHitAssumption * 100}%`);
console.log(`  ✓ Reeval: ${ROUTER.reeval.enabled ? "enabled" : "disabled"}`);

// Test 9: PROVIDER_CLASS has all expected providers
console.log("\nTesting PROVIDER_CLASS...");
const expectedProviders = ["hyper", "devpass", "agnes", "stepfun", "feihoa", "yolo"];
for (const provider of expectedProviders) {
  if (!(provider in PROVIDER_CLASS)) {
    throw new Error(`Missing provider classification: ${provider}`);
  }
  const className = PROVIDER_CLASS[provider as keyof typeof PROVIDER_CLASS];
  if (!["core", "bootstrap", "backchannel"].includes(className)) {
    throw new Error(`Invalid class for ${provider}: ${className}`);
  }
  console.log(`  ✓ ${provider}: ${className}`);
}

console.log("\n✅ All pricing configuration tests passed!");
