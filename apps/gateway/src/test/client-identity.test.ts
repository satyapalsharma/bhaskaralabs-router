// Client identity: classification, shape detection, and the serve/refuse rule.
//
// This gate decides whether money is spent on a request, so the tests are
// written around the two failure modes rather than around the happy path:
//
//   - refusing a real customer (the expensive mistake)
//   - serving a script with no identity and no agent shape (the cheap mistake
//     we are actually guarding against)
//
// The asymmetry is the design: every assertion below should read as "a false
// refusal is worse than a false accept".

import {
  classifyClient,
  isAgentShaped,
  isServable,
  describeClient,
  uaGateMode,
  UNIDENTIFIED_CLIENT_MESSAGE,
} from "../lib/client-identity";

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

// ── Shapes ──
const agentBody = {
  messages: [
    { role: "system", content: "You are a coding agent." },
    { role: "user", content: "read the file" },
    { role: "assistant", content: "ok" },
    { role: "user", content: "now edit it" },
  ],
  tools: [{ type: "function", function: { name: "readFile" } }],
};
const toolResultBody = {
  messages: [
    { role: "user", content: "edit it" },
    { role: "assistant", content: [{ type: "tool_use", name: "readFile" }] },
    { role: "user", content: [{ type: "tool_result", content: "file contents" }] },
  ],
};
const plainChat = { messages: [{ role: "user", content: "what is 2+2" }] };
const emptyBody = {};
const anonHistory = {
  messages: [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "c" },
  ],
};

console.log("Test 1: request shape detection");
{
  check("tool schemas alone are agent-shaped", isAgentShaped(agentBody));
  check("a tool_result in history is agent-shaped", isAgentShaped(toolResultBody));
  check("a single prompt is not agent-shaped", !isAgentShaped(plainChat));
  check("an empty body is not agent-shaped", !isAgentShaped(emptyBody));
  check("null is not agent-shaped", !isAgentShaped(null));
  check("a string body is not agent-shaped", !isAgentShaped("nope"));
  check("history without a system prompt is not enough", !isAgentShaped(anonHistory));
  check("empty tools array does not count", !isAgentShaped({ messages: [], tools: [] }));
}

console.log("\nTest 2: User-Agent classification");
{
  const cases: Array<[string, string, string | null]> = [
    ["claude-cli/2.1.0 (external, cli)", "coding-agent", "claude-code"],
    ["Claude-Code/1.0", "coding-agent", "claude-code"],
    ["Cursor/0.42.0", "coding-agent", "cursor"],
    ["opencode/0.5.1", "coding-agent", "opencode"],
    ["crush/v0.8.0", "coding-agent", "crush"],
    ["aider/0.60.0", "coding-agent", "aider"],
    ["cline/3.0", "coding-agent", "cline"],
    ["OpenAI/Python 1.40.0", "sdk", "openai-sdk"],
    ["anthropic-sdk-python/0.40.0", "sdk", "anthropic-sdk"],
    ["curl/8.7.1", "sdk", "curl"],
    ["node-fetch/1.0 (+https://github.com/bitinn/node-fetch)", "sdk", "node-fetch"],
  ];
  for (const [ua, kind, name] of cases) {
    const id = classifyClient(ua, null);
    check(`${ua.slice(0, 34)} → ${kind}${name ? ` (${name})` : ""}`, id.kind === kind && id.name === name, `got ${id.kind}/${id.name}`);
  }

  const browser = classifyClient("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", null);
  check("a browser UA is classified as a browser", browser.kind === "browser", browser.kind);

  check("no UA is 'absent'", classifyClient(null, null).kind === "absent");
  check("an empty UA is 'absent'", classifyClient("   ", null).kind === "absent");
  check("an unrecognised UA is 'unknown'", classifyClient("SomethingElse/1.0", null).kind === "unknown");
  check("the raw header is preserved for the report", classifyClient("Cursor/0.42.0", null).raw === "Cursor/0.42.0");
}

console.log("\nTest 3: version extraction");
{
  check("a version is parsed when present", classifyClient("Cursor/0.42.1", null).version === "0.42.1");
  check("a two-part version is parsed", classifyClient("crush/v0.8", null).version === "0.8");
  check("a versionless UA yields null", classifyClient("opencode", null).version === null);
}

console.log("\nTest 4: the serve/refuse rule");
{
  // Refuse: no identity AND no shape. This is the script.
  check(
    "no UA + plain prompt is refused",
    !isServable(classifyClient(null, plainChat)),
  );
  check(
    "unknown UA + plain prompt is refused",
    !isServable(classifyClient("WeirdBot/9", plainChat)),
  );

  // Serve: a recognised client, whatever the body.
  check("a known agent is served even with no shape", isServable(classifyClient("Cursor/0.42.0", plainChat)));
  check("an SDK is served even with no shape", isServable(classifyClient("OpenAI/Python 1.0", plainChat)));

  // Serve: an agent-shaped body, whatever the UA. This is the deliberate
  // generosity — a new client we have never seen is a customer.
  check("no UA + agent shape is served", isServable(classifyClient(null, agentBody)));
  check("unknown UA + agent shape is served", isServable(classifyClient("NewClient/0.1", agentBody)));
  check("unknown UA + tool_result shape is served", isServable(classifyClient("NewClient/0.1", toolResultBody)));

  // Browsers have an identity, so they are served. That is intentional: a
  // browser is a person, and a person with a key is a customer.
  const br = classifyClient("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36", plainChat);
  check("a browser is served, not refused", isServable(br));
}

console.log("\nTest 5: gate mode is opt-in to enforcement");
{
  const saved = process.env.BHASKARA_UA_GATE;
  delete process.env.BHASKARA_UA_GATE;
  check("defaults to observe, never enforce", uaGateMode() === "observe", uaGateMode());
  process.env.BHASKARA_UA_GATE = "off";
  check("'off' is honoured", uaGateMode() === "off");
  process.env.BHASKARA_UA_GATE = "ENFORCE";
  check("'enforce' is recognised case-insensitively", uaGateMode() === "enforce");
  process.env.BHASKARA_UA_GATE = "nonsense";
  check("an unknown value falls back to observe", uaGateMode() === "observe");
  if (saved === undefined) delete process.env.BHASKARA_UA_GATE;
  else process.env.BHASKARA_UA_GATE = saved;
}

console.log("\nTest 6: logs and refusal copy");
{
  check("a named client describes by name", describeClient(classifyClient("Cursor/0.42.0", null)) === "cursor/0.42.0");
  check("shape is visible in the description", describeClient(classifyClient("Cursor/0.42.0", agentBody)).includes("shaped"));
  check("an anonymous caller still describes", describeClient(classifyClient(null, null)) === "absent");
  // The message must tell the caller how to fix it — the common case is a real
  // user on a client we have not seen, not an attacker.
  check("the refusal is actionable", UNIDENTIFIED_CLIENT_MESSAGE.includes("User-Agent") && UNIDENTIFIED_CLIENT_MESSAGE.includes("tool definitions"));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
