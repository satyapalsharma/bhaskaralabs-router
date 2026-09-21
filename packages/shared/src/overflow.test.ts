// Overflow allowlist tests — this file is the published quality bar, so the
// tests exist to make it impossible to route to a model we cannot cite.

import {
  OVERFLOW_ALLOWLIST,
  OVERFLOW_BAR,
  OVERFLOW_STALENESS_DAYS,
  findEligibleOverflow,
  isEligible,
  isFresh,
  meetsOverflowBar,
  type OverflowModel,
} from "./overflow-models";
import { TEAMOROUTER, UPSTREAM_RATES } from "./pricing";

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

const mk = (over: Partial<OverflowModel>): OverflowModel => ({
  modelId: "test-model",
  provider: "teamorouter",
  terminalBench21: 80,
  aaIntelligenceIndex: null,
  source: "https://example.com",
  verifiedAt: "2026-09-12",
  ...over,
});

console.log("Test 1: the bar");
{
  check("terminal-bench bar is 70", OVERFLOW_BAR.terminalBench21 === 70);
  check("aa index bar is 50", OVERFLOW_BAR.aaIntelligenceIndex === 50);
  check("staleness window is positive", OVERFLOW_STALENESS_DAYS > 0);
}

console.log("\nTest 2: bar admission");
{
  check("exactly at the TB bar passes", meetsOverflowBar(mk({ terminalBench21: 70, aaIntelligenceIndex: null })));
  check("one below the TB bar fails", !meetsOverflowBar(mk({ terminalBench21: 69.9, aaIntelligenceIndex: null })));
  check("exactly at the AA bar passes", meetsOverflowBar(mk({ terminalBench21: null, aaIntelligenceIndex: 50 })));
  check("one below the AA bar fails", !meetsOverflowBar(mk({ terminalBench21: null, aaIntelligenceIndex: 49.9 })));
  check("either bar is sufficient", meetsOverflowBar(mk({ terminalBench21: null, aaIntelligenceIndex: 90 })));
  check("both below fails", !meetsOverflowBar(mk({ terminalBench21: 10, aaIntelligenceIndex: 10 })));
  check("no scores at all fails", !meetsOverflowBar(mk({ terminalBench21: null, aaIntelligenceIndex: null })));
}

console.log("\nTest 3: freshness");
{
  const now = new Date("2026-09-12T00:00:00Z");
  check("today is fresh", isFresh(mk({ verifiedAt: "2026-09-12" }), now));
  check(
    "one day inside the window is fresh",
    isFresh(mk({ verifiedAt: "2026-03-17" }), now) ===
      (now.getTime() - new Date("2026-03-17").getTime() <= OVERFLOW_STALENESS_DAYS * 86400000),
  );
  check("a year old is stale", !isFresh(mk({ verifiedAt: "2025-09-12" }), now));
  check("a malformed date is stale", !isFresh(mk({ verifiedAt: "not a date" }), now));
}

console.log("\nTest 4: eligibility requires BOTH bar and freshness");
{
  const now = new Date("2026-09-12T00:00:00Z");
  check("passes bar + fresh", isEligible(mk({}), now));
  check("passes bar but stale", !isEligible(mk({ verifiedAt: "2025-01-01" }), now));
  check("fresh but below bar", !isEligible(mk({ terminalBench21: 10 }), now));
}

console.log("\nTest 5: lookup refuses anything not eligible");
{
  const now = new Date("2026-09-12T00:00:00Z");
  check("unknown model returns null", findEligibleOverflow("no-such-model", now) === null);
  for (const m of OVERFLOW_ALLOWLIST) {
    check(
      `allowlisted ${m.modelId} resolves and is eligible`,
      findEligibleOverflow(m.modelId, now)?.modelId === m.modelId,
    );
  }
}

console.log("\nTest 6: every allowlist entry is citable and priced");
{
  for (const m of OVERFLOW_ALLOWLIST) {
    check(`${m.modelId}: has a source URL`, /^https?:\/\//.test(m.source));
    check(`${m.modelId}: has a parseable verifiedAt`, !Number.isNaN(new Date(m.verifiedAt).getTime()));
    check(
      `${m.modelId}: clears the bar`,
      meetsOverflowBar(m),
      `tb=${m.terminalBench21} aa=${m.aaIntelligenceIndex}`,
    );
    check(
      `${m.modelId}: has an upstream rate card`,
      UPSTREAM_RATES[m.provider]?.[m.modelId] !== undefined,
      `missing ${m.provider}:${m.modelId}`,
    );
  }
}

console.log("\nTest 7: an unverified model cannot be reached");
{
  // The safety property that matters: a model that clears the bar on paper but
  // is absent from the allowlist is still unreachable. TeamoRouter carries
  // models we have not measured; none of them may resolve as overflow.
  const measured = new Set(OVERFLOW_ALLOWLIST.map((m) => m.modelId));
  const unmeasured = Object.keys(TEAMOROUTER).filter((id) => !measured.has(id));
  check("teamo catalogue has unmeasured models", unmeasured.length > 0);
  check(
    "none of them are reachable as overflow",
    unmeasured.every((id) => findEligibleOverflow(id) === null),
    unmeasured.join(", "),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
