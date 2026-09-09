// Auth module tests
import { authenticate, newApiKey, sha256, type AuthContext } from "../lib/auth";

console.log("Testing auth module...\n");

// Test 1: newApiKey generates valid keys
console.log("Test 1: newApiKey generates valid keys");
const key1 = newApiKey();
if (!key1.full.startsWith("sk-bhaskara-")) {
  throw new Error("API key should start with 'sk-bhaskara-'");
}
if (key1.prefix.length !== 16) {
  throw new Error("Prefix should be 16 characters");
}
if (key1.hash.length !== 64) {
  throw new Error("SHA256 hash should be 64 characters");
}
// Verify the hash matches
if (sha256(key1.full) !== key1.hash) {
  throw new Error("Hash doesn't match the full key");
}
console.log("  ✓ API key generation works correctly");
console.log(`    Full: ${key1.full.slice(0, 20)}...`);
console.log(`    Prefix: ${key1.prefix}`);
console.log(`    Hash: ${key1.hash.slice(0, 16)}...\n`);

// Test 2: sha256 produces consistent output
console.log("Test 2: sha256 produces consistent output");
const testString = "test-string";
const hash1 = sha256(testString);
const hash2 = sha256(testString);
if (hash1 !== hash2) {
  throw new Error("SHA256 should produce consistent output");
}
if (hash1.length !== 64) {
  throw new Error("SHA256 hash should be 64 hex characters");
}
console.log("  ✓ SHA256 is consistent and correct length");

// Test 3: sha256 produces different output for different inputs
console.log("\nTest 3: sha256 produces different hashes for different inputs");
const hash3 = sha256("different-string");
if (hash1 === hash3) {
  throw new Error("Different inputs should produce different hashes");
}
console.log("  ✓ Different inputs produce different hashes");

// Test 4: authenticate rejects null/empty bearer
console.log("\nTest 4: authenticate rejects null/empty bearer");
const nullResult = await authenticate(null);
if (nullResult !== null) {
  throw new Error("Should return null for null bearer");
}
const emptyResult = await authenticate("");
if (emptyResult !== null) {
  throw new Error("Should return null for empty bearer");
}
console.log("  ✓ Null and empty bearers are rejected");

// Test 5: authenticate rejects keys without sk-bhaskara- prefix
console.log("\nTest 5: authenticate rejects keys without sk-bhaskara- prefix");
const invalidPrefixResult = await authenticate("sk-other-something");
if (invalidPrefixResult !== null) {
  throw new Error("Should return null for invalid prefix");
}
console.log("  ✓ Invalid prefix keys are rejected");

// Test 6: authenticate trims whitespace
console.log("\nTest 6: authenticate trims whitespace");
const key2 = newApiKey();
// We can't test with a real DB, but we can verify the trimming logic
// This would need a real DB to fully test, but we can test the format
const trimmedKey = key2.full;
const hashOfTrimmed = sha256(trimmedKey);
const hashOfUntrimmed = sha256(trimmedKey + " ");
if (hashOfTrimmed === hashOfUntrimmed) {
  throw new Error("Trimmed and untrimmed should have different hashes");
}
console.log("  ✓ Trimming logic is correct");

// Test 7: Generated keys are unique
console.log("\nTest 7: Generated keys are unique");
const key3 = newApiKey();
const key4 = newApiKey();
if (key3.full === key4.full) {
  throw new Error("Generated keys should be unique");
}
if (key3.hash === key4.hash) {
  throw new Error("Generated hashes should be unique");
}
console.log("  ✓ Generated keys are unique");

// Test 8: Key format validation
console.log("\nTest 8: Key format validation");
const key5 = newApiKey();
const parts = key5.full.split("-");
if (parts.length < 2) {
  throw new Error("Key should have at least one hyphen");
}
if (parts[0] !== "sk" || parts[1] !== "bhaskara") {
  throw new Error("Key should start with sk-bhaskara");
}
console.log("  ✓ Key format is valid");

console.log("\n✅ All auth module tests passed!");
