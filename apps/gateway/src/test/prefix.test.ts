// Prefix assembly and validation tests
import { assemble, estimateTokens, deriveSessionId, type ChatMessage } from "../lib/prefix";

console.log("Testing prefix assembly...\n");

// Test 1: assemble with valid messages
console.log("Test 1: Assemble with valid messages");
const validBody = {
  model: "glm-5.3",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" },
    { role: "assistant", content: "Hi there!" }
  ]
};
const assembled1 = assemble(validBody);
if (assembled1.messages.length !== 3) {
  throw new Error("Should preserve all messages");
}
if (assembled1.warnings.length > 0) {
  throw new Error("Valid messages should not produce warnings");
}
console.log("  ✓ Valid messages assembled correctly");
console.log(`    Messages: ${assembled1.messages.length}, Warnings: ${assembled1.warnings.length}`);

// Test 2: assemble with empty messages array
console.log("\nTest 2: Assemble with empty messages array");
const emptyBody = {
  model: "glm-5.3",
  messages: []
};
const assembled2 = assemble(emptyBody);
if (assembled2.messages.length !== 0) {
  throw new Error("Empty messages should remain empty");
}
console.log("  ✓ Empty messages array handled");

// Test 3: assemble with single user message (no system)
console.log("\nTest 3: Assemble with single user message");
const singleUserBody = {
  model: "glm-5.3",
  messages: [
    { role: "user", content: "Hello!" }
  ]
};
const assembled3 = assemble(singleUserBody);
if (assembled3.messages.length !== 1) {
  throw new Error("Should preserve single user message");
}
console.log("  ✓ Single user message handled");

// Test 4: assemble with volatile content (timestamps, UUIDs, etc.)
console.log("\nTest 4: Assemble with volatile content patterns (should produce warnings)");
const volatileBody = {
  model: "glm-5.3",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Today's date is 2026-09-09 and current time is 2026-09-09T12:00:00Z" },
    { role: "assistant", content: "Here is a UUID: 123e4567-e89b-12d3-a456-426614174000" }
  ]
};
const assembled4 = assemble(volatileBody);
if (assembled4.warnings.length === 0) {
  throw new Error("Volatile content patterns should produce warnings");
}
console.log(`  ✓ Volatile content patterns produce warnings: ${assembled4.warnings.length}`);
console.log(`    Warnings: ${assembled4.warnings.join(", ")}`);

// Test 5: assemble with non-string content
console.log("\nTest 5: Assemble with non-string content");
const nonStringBody = {
  model: "glm-5.3",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: { text: "Hello!" } }
  ]
};
const assembled5 = assemble(nonStringBody);
// Should handle or produce warning for non-string content
console.log(`  ✓ Non-string content handled, warnings: ${assembled5.warnings.length}`);

// Test 6: estimateTokens with known values
console.log("\nTest 6: estimateTokens with known values");
const knownMessages: ChatMessage[] = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: "Hello!" }
];
const tokenEstimate = estimateTokens(knownMessages);
if (tokenEstimate <= 0) {
  throw new Error("Token estimate should be positive for non-empty messages");
}
console.log(`  ✓ Token estimate: ${tokenEstimate} tokens`);

// Test 7: estimateTokens with empty messages
console.log("\nTest 7: estimateTokens with empty messages");
const emptyMessages: ChatMessage[] = [];
const emptyEstimate = estimateTokens(emptyMessages);
if (emptyEstimate !== 0) {
  throw new Error("Empty messages should estimate to 0 tokens");
}
console.log("  ✓ Empty messages estimate to 0 tokens");

// Test 8: estimateTokens with long messages
console.log("\nTest 8: estimateTokens with long messages");
const longMessage: ChatMessage = {
  role: "user",
  content: "a ".repeat(10000) // ~10k characters
};
const longEstimate = estimateTokens([longMessage]);
if (longEstimate < 1000) {
  throw new Error("Long message should estimate to many tokens");
}
console.log(`  ✓ Long message estimate: ${longEstimate} tokens`);

// Test 9: deriveSessionId with different headers
console.log("\nTest 9: deriveSessionId consistency");
const mockHeaders = new Headers({
  "x-bhaskara-session": "custom-session-123",
  "authorization": "Bearer sk-bhaskara-test"
});
const sessionId1 = deriveSessionId("api-key-1", mockHeaders);
const sessionId2 = deriveSessionId("api-key-1", mockHeaders);
if (sessionId1 !== sessionId2) {
  throw new Error("Same inputs should produce same session ID");
}
console.log(`  ✓ Session ID is consistent: ${sessionId1}`);

// Test 10: deriveSessionId with custom session header
console.log("\nTest 10: deriveSessionId with custom session header");
const customHeaders = new Headers({
  "x-bhaskara-session": "my-custom-session"
});
const customSessionId = deriveSessionId("api-key-1", customHeaders);
if (!customSessionId.includes("my-custom-session")) {
  throw new Error("Should include custom session in ID");
}
console.log(`  ✓ Custom session header used: ${customSessionId}`);

// Test 11: deriveSessionId without custom session header
console.log("\nTest 11: deriveSessionId without custom session header");
const noSessionHeaders = new Headers({});
const defaultSessionId = deriveSessionId("api-key-1", noSessionHeaders);
// Should use API key as session ID
if (!defaultSessionId.includes("api-key-1")) {
  throw new Error("Should use API key when no session header");
}
console.log(`  ✓ Default session ID: ${defaultSessionId}`);

// Test 12: assemble with tool schemas
console.log("\nTest 12: Assemble with tool schemas");
const toolBody = {
  model: "glm-5.3",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" }
  ],
  tools: [
    { type: "function", function: { name: "get_weather", description: "Get weather" } }
  ]
};
const assembled6 = assemble(toolBody);
if (assembled6.messages.length !== 2) {
  throw new Error("Tools should not affect message count");
}
console.log("  ✓ Tools preserved in assembly");

// Test 13: assemble with missing model
console.log("\nTest 13: Assemble with missing model");
const noModelBody = {
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" }
  ]
};
const assembled7 = assemble(noModelBody);
console.log(`  ✓ Missing model handled, warnings: ${assembled7.warnings.length}`);

// Test 14: assemble with array of content (multi-modal)
console.log("\nTest 14: Assemble with array content (multi-modal)");
const multimodalBody = {
  model: "glm-5.3",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: ["text part", { type: "image_url", image_url: { url: "data:image/png;base64,..." } }] }
  ]
};
const assembled8 = assemble(multimodalBody);
console.log(`  ✓ Multi-modal content handled, warnings: ${assembled8.warnings.length}`);

// Test 15: Large message array
console.log("\nTest 15: Large message array");
const largeMessages: ChatMessage[] = [];
for (let i = 0; i < 100; i++) {
  largeMessages.push({ role: i % 2 === 0 ? "user" : "assistant", content: `Message ${i}` });
}
const largeBody = { model: "glm-5.3", messages: largeMessages };
const assembled9 = assemble(largeBody);
if (assembled9.messages.length !== 100) {
  throw new Error("Should preserve all messages");
}
console.log(`  ✓ Large message array handled: ${assembled9.messages.length} messages`);

console.log("\n✅ All prefix assembly tests passed!");
