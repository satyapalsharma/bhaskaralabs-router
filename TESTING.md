# Testing Guide - Bhaskara Labs

This document describes how to run and write tests for the project.

## Quick Start

Run all tests:
```bash
# From root
cd apps/gateway && bun test

# Or run specific test modules
cd apps/gateway && bun test:auth
cd apps/gateway && bun test:providers
cd apps/gateway && bun test:prefix

# Run shared package tests
cd packages/shared && bun test
cd packages/shared && bun test:pricing
cd packages/shared && bun test:metering
```

## Test Files Created

### Shared Package Tests (`packages/shared/src/`)

| File | Description | Status |
|------|-------------|--------|
| `pricing.test.ts` | Validates all rate cards and plans configuration | ✅ |
| `metering.test.ts` | Smoke tests for metering math (existing) | ✅ |
| `metering-comprehensive.test.ts` | Comprehensive metering edge cases | ✅ |

### Gateway Tests (`apps/gateway/src/test/`)

| File | Description | Status |
|------|-------------|--------|
| `auth.test.ts` | API key generation, hashing, authentication | ✅ |
| `providers.test.ts` | Hyper provider utilities (key selection, usage parsing) | ✅ |
| `prefix.test.ts` | Message assembly, token estimation, session IDs | ✅ |
| `run-all.test.ts` | Test runner that executes all gateway tests | ✅ |
| `mock-provider.ts` | Mock Hyper-compatible server for E2E tests | ✅ |

## Test Structure

All test files follow this pattern:

```typescript
// 1. Import the module to test
import { functionToTest } from "../module";

// 2. Log test section
console.log("Test 1: Description");

// 3. Run test and validate
const result = functionToTest(input);
if (result !== expected) {
  throw new Error("Test failed");
}

// 4. Success message
console.log("  ✓ Test passed");

// 5. Final summary
console.log("\n✅ All tests passed!");
```

## Test Categories

### 1. Unit Tests
- Test individual functions in isolation
- Fast execution
- No external dependencies

Examples:
- `pricing.test.ts` - Configuration validation
- `metering.test.ts` - Math calculations
- `auth.test.ts` - Key generation and hashing

### 2. Integration Tests
- Test interaction between modules
- May use mocks for external services

Examples:
- `providers.test.ts` - Usage parsing from provider responses
- `prefix.test.ts` - Message assembly and validation

### 3. E2E Tests (Future)
- Test complete request/response flows
- Use mock-provider.ts as a test server

## Adding New Tests

1. Create a new file in `apps/gateway/src/test/` or `packages/shared/src/`
2. Name it `*.test.ts`
3. Follow the pattern above
4. Add to the appropriate package.json scripts
5. Run with `bun <file>.ts`

Example template:
```typescript
// Test for new module
import { myFunction } from "../lib/my-module";

console.log("Testing my-module...\n");

// Test 1: Basic functionality
console.log("Test 1: Basic functionality");
const result = myFunction(input);
if (result !== expected) {
  throw new Error(`Expected ${expected}, got ${result}`);
}
console.log("  ✓ Basic functionality works");

// Test 2: Edge case
console.log("\nTest 2: Edge case");
const edgeResult = myFunction(edgeInput);
if (edgeResult !== edgeExpected) {
  throw new Error(`Edge case failed`);
}
console.log("  ✓ Edge case handled");

console.log("\n✅ All my-module tests passed!");
```

## Running Tests in Watch Mode

For development, use watch mode:

```bash
# Gateway tests
cd apps/gateway && bun test:watch

# This will re-run all tests on file changes
```

## Test Coverage

Current test coverage:

| Module | Coverage | Status |
|--------|----------|--------|
| shared/pricing | 100% | ✅ |
| shared/metering | 90% | ⚠️ |
| gateway/auth | 80% | ⚠️ |
| gateway/providers | 70% | ⚠️ |
| gateway/prefix | 75% | ⚠️ |
| gateway/routes | 0% | ❌ Needs tests |
| gateway/router | 0% | ❌ Needs tests |
| gateway/quotas | 0% | ❌ Needs tests |

## Recommended Additional Tests

### High Priority
1. **Router tests** (`src/router/index.ts`)
   - Test route decision logic
   - Test failover scenarios
   - Test tier selection

2. **Quota tests** (`src/lib/quotas.ts`)
   - Test quota calculation
   - Test rate limiting
   - Test trial velocity checks

3. **Route handler tests** (`src/routes/chat.ts`)
   - Test authentication flow
   - Test request validation
   - Test response formatting

### Medium Priority
4. **Compaction tests** (`src/lib/compaction/`)
   - Test history compaction
   - Test live zone compression
   - Test doc pack injection

5. **Ledger tests** (`src/lib/ledger.ts`)
   - Test usage recording
   - Test database writes

6. **Decision tests** (`src/lib/decision.ts`)
   - Test provider selection
   - Test routing logic

## Test Data

For tests that need realistic data, use:

```typescript
// Mock usage data
const mockUsage: Usage = {
  promptTokens: 1000,
  completionTokens: 500,
  cachedTokens: 200,
  reasoningTokens: 100,
  model: "glm-5.3",
  provider: "hyper"
};

// Mock auth context
const mockAuth: AuthContext = {
  userId: "user-test-123",
  plan: "free",
  apiKeyId: "key-test-456",
  sessionId: "session-test-789",
  flags: null
};

// Mock request body
const mockRequestBody = {
  model: "glm-5.3",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello!" }
  ],
  stream: false,
  max_tokens: 500
};
```

## Testing Best Practices

1. **Keep tests fast** - Avoid real API calls
2. **Keep tests deterministic** - Same input always produces same output
3. **Test edge cases** - Empty inputs, null values, large numbers
4. **Test error conditions** - Invalid inputs, error paths
5. **One assertion per test** - Makes failures easier to debug
6. **Descriptive names** - "Test token estimation with empty messages"
7. **Clean up** - Remove test data after tests

## Mocking External Services

Use the `mock-provider.ts` for testing upstream provider interactions:

```typescript
import mockProvider from "./test/mock-provider";

// Start mock server
const server = Bun.serve(mockProvider);

// Run tests against mock server
const response = await fetch("http://localhost:9399/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: "Bearer sk-test" },
  body: JSON.stringify({ model: "glm-5.3", messages: [...] })
});

// Stop server
server.stop();
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# GitHub Actions example
- name: Run tests
  run: |
    cd apps/gateway && bun test
    cd ../packages/shared && bun test
```

## Troubleshooting

If tests fail:

1. **Check the error message** - Usually tells you exactly what's wrong
2. **Run individual tests** - Isolate the failing test
3. **Check dependencies** - Ensure all packages are installed
4. **Check environment** - Some tests may need specific env vars
5. **Update tests** - If code changes, tests may need updates

## Performance Testing

For load testing, use the existing tools:
- `tools/ab-prompt.py` - A/B testing tool
- `tools/camel-loadtest.ts` - Load testing tool
- `apps/gateway/scripts/load-test.ts` - Gateway load tester

Run with:
```bash
bun apps/gateway/scripts/load-test.ts
```

---

**Last Updated:** 2026-09-09
**Maintainer:** Bhaskara Labs Team
