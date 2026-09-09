// Test runner - runs all tests and reports results
import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function runTest(filePath: string): Promise<TestResult> {
  const start = Date.now();
  const name = filePath.replace(__dirname, "").replace(/^\/|\.ts$|\.js$/g, "");
  
  try {
    // Dynamically import and run the test file
    const module = await import(filePath);
    // The test file should throw on failure, or we assume it passed
    return {
      name,
      passed: true,
      durationMs: Date.now() - start
    };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start
    };
  }
}

async function findTestFiles(): Promise<string[]> {
  const files = await readdir(__dirname);
  return files
    .filter(f => f.endsWith(".test.ts") && f !== "run-all.test.ts")
    .map(f => join(__dirname, f));
}

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Bhaskara Labs - Gateway Test Suite");
  console.log("═══════════════════════════════════════════════\n");
  
  const testFiles = await findTestFiles();
  
  if (testFiles.length === 0) {
    console.log("❌ No test files found in", __dirname);
    process.exit(1);
  }
  
  console.log(`Found ${testFiles.length} test file(s)\n`);
  
  let passed = 0;
  let failed = 0;
  let totalDuration = 0;
  
  for (const file of testFiles) {
    const result = await runTest(file);
    results.push(result);
    totalDuration += result.durationMs;
    
    if (result.passed) {
      passed++;
      console.log(`✅ PASS: ${result.name}`);
      console.log(`   Duration: ${result.durationMs}ms`);
    } else {
      failed++;
      console.log(`❌ FAIL: ${result.name}`);
      console.log(`   Error: ${result.error}`);
      console.log(`   Duration: ${result.durationMs}ms`);
    }
    console.log();
  }
  
  // Summary
  console.log("═══════════════════════════════════════════════");
  console.log("  Test Summary");
  console.log("═══════════════════════════════════════════════\n");
  
  console.log(`Total:  ${testFiles.length} tests`);
  console.log(`Passed: ${passed} ✅`);
  console.log(`Failed: ${failed} ❌`);
  console.log(`Time:   ${totalDuration}ms total, ${Math.round(totalDuration / testFiles.length)}ms avg`);
  
  if (failed > 0) {
    console.log("\n❌ Some tests failed!");
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  }
}

main().catch(error => {
  console.error("Test runner error:", error);
  process.exit(1);
});
