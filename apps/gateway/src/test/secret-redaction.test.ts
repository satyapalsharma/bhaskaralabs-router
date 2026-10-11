// Secret redaction must not rewrite code that only MENTIONS a credential.
//
// The key=value rule redacted whatever followed a credential-ish key. In
// source code that is usually another name:
//
//   apiKeyId: auth.apiKeyId,              →  apiKeyId: [REDACTED],
//   const apiKey = process.env.API_KEY    →  const apiKey = [REDACTED]
//   passwd = getpass.getpass(prompt)      →  passwd = [REDACTED](prompt)
//
// No secret was in any of those lines, and an agent that reads the rewritten
// file then edits against text the file does not contain — the same failure
// as the volatile mask (live-zone-source.test.ts), from a different stage.
// Measured on real trees before the fix: 9 of this repo's 155 TypeScript
// files, 60 of 3,000 Python files (stdlib and installed packages), 13 of
// 3,000 Go stdlib files.
//
// This file pins both halves: references are left alone, and real secrets —
// quoted values, env assignments, token shapes, keys, Bearer tokens — are
// redacted exactly as before. It also states the two known limits out loud.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compressLiveZone } from "../lib/compaction/live-zone";
import { redactSecrets } from "../lib/compaction/secrets";
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

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (path: string) => readFileSync(join(FIXTURES, path), "utf8");
const redact = (text: string) => redactSecrets(text).text;

function forwardToolResult(content: string): { text: string; via: string[] } {
  const messages: ChatMessage[] = [
    { role: "user", content: "open it" },
    { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "read", arguments: "{}" } }] },
    { role: "tool", content, tool_call_id: "call_1" },
  ];
  const result = compressLiveZone(messages);
  return { text: result.messages[2].content as string, via: result.stats.transformers };
}

console.log("Test 1: a reference is not a secret");
{
  // Every line is taken from, or shaped like, a line the old rule rewrote in
  // this repository or in the Python standard library.
  const references = [
    "    apiKeyId: auth.apiKeyId,",
    '  const apiKey = process.env.LLMGATEWAY_API_KEY ?? "";',
    '      apiKey: process.env.LLMGATEWAY_API_KEY ?? "",',
    "void archiveTurn({ userId: pending.userId, apiKeyId: pending.apiKeyId, sessionId: pending.sessionId });",
    "    client_secret: credentials.clientSecret,",
    "  const access_token = tokens.access_token;",
    "        password = self.password.encode('utf-8')",
    "        password = self.password",
    "    userid, acct, passwd = netrcobj.authenticators(host)",
    "        passwd = fallback_getpass(prompt, stream)",
    "                keyfile=tls_key, password=tls_password)",
    "            tls_password=tls_key_password,",
    "    login, account, password = auth_from_netrc",
    "    change_password_form = AdminPasswordChangeForm",
    '    password_input = self.selenium.find_element(By.NAME, "password")',
    "    secret = table[index_of_secret]",
    "// the caller passes password = self.password.",
  ];
  for (const line of references) check(line.trim().slice(0, 78), redact(line) === line, redact(line));
}

console.log("\nTest 2: key and value sit on one line");
{
  // "if passwd:" used to pair with the first token of the NEXT line.
  const python = 'if passwd:\n    stream.write("\\n")\nreturn passwd';
  check("a key at the end of a line does not reach into the next one", redact(python) === python, JSON.stringify(redact(python)));
  const yaml = "password:\n  from_secret: relay_database_password\n";
  check("nor does a YAML key with a nested block", redact(yaml) === yaml, JSON.stringify(redact(yaml)));
  // A QUOTED value on the next line is still that key's value: formatters
  // break long assignments exactly there.
  const wrapped = 'const sessionSecret =\n  "a3f9c2e1b4d5a3f9c2e1b4d5";';
  check("a quoted literal wrapped onto the next line is still redacted", redact(wrapped) === 'const sessionSecret =\n  "[REDACTED]";', JSON.stringify(redact(wrapped)));
}

console.log("\nTest 3: credential-plumbing source files are forwarded byte-identical");
{
  for (const name of ["secrets/provider-client.ts.txt", "secrets/netrc_login.py"]) {
    const text = fixture(name);
    const direct = redactSecrets(text);
    check(`${name}: ${text.split("\n").length} lines, no redaction`, direct.redacted === 0 && direct.text === text, `${direct.redacted} rewrites`);
    const numbered = text
      .split("\n")
      .map((line, i) => `${String(i + 1).padStart(6)}\t${line}`)
      .join("\n");
    for (const [label, rendered] of [
      ["raw", text],
      ["cat -n", numbered],
    ] as const) {
      const out = forwardToolResult(rendered);
      check(`${name} · ${label} · through compressLiveZone`, out.text === rendered && out.via.length === 0, out.via.join(","));
    }
  }
  // The five source fixtures of live-zone-source.test.ts hold no credential
  // plumbing at all, so that file passes with or without this change.
  for (const name of ["token_bucket.rs", "ingest.py", "scheduler.go", "scheduler_test.go", "retry-queue.ts.txt"]) {
    check(`live-zone/${name}: nothing to redact`, redactSecrets(fixture(`live-zone/${name}`)).redacted === 0);
  }
}

console.log("\nTest 4: real secrets are still redacted");
{
  const cases: Array<[string, string, string]> = [
    ["quoted value", 'password = "hunter2hunter2"', 'password = "[REDACTED]"'],
    ["single-quoted value", "api_key: 'a3f9c2e1b4d5a3f9c2e1b4d5'", "api_key: '[REDACTED]'"],
    ["quoted value in an object literal", '{ password: "hunter2hunter2abc", port: 5432 }', '{ password: "[REDACTED]", port: 5432 }'],
    [".env assignment", "DB_PASSWORD=Sup3rS3cretValue99", "DB_PASSWORD=[REDACTED]"],
    [".env assignment, letters only", "DB_PASSWORD=correcthorsebattery", "DB_PASSWORD=[REDACTED]"],
    [".env assignment that looks like a name", "SESSION_SECRET=correct_horse_battery", "SESSION_SECRET=[REDACTED]"],
    ["exported shell variable", "export API_KEY=abcdef1234567890abcdef", "export API_KEY=[REDACTED]"],
    ["unquoted hex", "api_key: a3f9c2e1b4d5a3f9c2e1b4d5", "api_key: [REDACTED]"],
    ["unquoted base64", "client_secret=Zm9vYmFyYmF6cXV4Zm9v", "client_secret=[REDACTED]"],
    ["unquoted mixed", "password: Tr0ub4dorAnd3Horses", "password: [REDACTED]"],
    ["unquoted lowercase passphrase", "password: correcthorsebattery", "password: [REDACTED]"],
    ["value with URL punctuation", "refresh_token: 1//0gAbCdEfGhIjKlMnOpQrStUv", "refresh_token: [REDACTED]"],
    ["GitHub token", "pushed with ghp_abcdefghijklmnopqrstuvwxyz0123", "pushed with [REDACTED:github-token]"],
    ["AWS access key", "AWS key AKIAIOSFODNN7EXAMPLE in use", "AWS key [REDACTED:aws-key] in use"],
    ["Bearer token", "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlc2lnbmF0dXJl", "Authorization: Bearer [REDACTED]"],
  ];
  for (const [label, input, want] of cases) check(`${label}: ${input.slice(0, 48)}`, redact(input) === want, redact(input));
  const pem = "-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIIrYSSNQFaA2Hwf1duRSxKtLYX5CB04fSeQ6tF1aY/PuoAoGCCqGSM49\n-----END EC PRIVATE KEY-----";
  check("PEM private key block", redact(`key:\n${pem}\ndone`) === "key:\n[REDACTED:private-key]\ndone");
}

console.log("\nTest 5: the closing quote survives");
{
  // It used to be swallowed: `"hunter2…"` came out as `"[REDACTED]`, one
  // quote short, which unbalances every string after it on the line.
  const line = 'const db = { user: "relay", password: "hunter2hunter2abc", host: "db.internal" };';
  const out = redact(line);
  check("quotes stay balanced", (out.match(/"/g) ?? []).length === (line.match(/"/g) ?? []).length, out);
  check("and the rest of the line is intact", out === 'const db = { user: "relay", password: "[REDACTED]", host: "db.internal" };', out);
}

console.log("\nTest 6: idempotent, and a mixed block redacts only the secrets");
{
  const block = [
    "# deploy.env",
    "RELAY_UPSTREAM_API_KEY=7f3a9c1e5b2d4f6a8c0e1b3d5f7a9c1e",
    "RELAY_REGION=eu-central",
    "",
    "// provider.ts",
    "const apiKey = process.env.RELAY_UPSTREAM_API_KEY;",
    "return { apiKeyId: auth.apiKeyId, apiKey };",
  ].join("\n");
  const once = redactSecrets(block);
  check("one redaction: the env value", once.redacted === 1 && once.text.includes("RELAY_UPSTREAM_API_KEY=[REDACTED]"), once.text);
  check("the code that reads it is untouched", once.text.includes("const apiKey = process.env.RELAY_UPSTREAM_API_KEY;") && once.text.includes("apiKeyId: auth.apiKeyId"));
  const twice = redactSecrets(once.text);
  check("a second pass changes nothing", twice.redacted === 0 && twice.text === once.text);
}

console.log("\nTest 7: known limits, stated rather than discovered");
{
  // Limit 1 — still a false positive. A name with a digit in it is not
  // told apart from a generated value, so the rule errs toward redacting.
  const digit = "    client_secret: oauth2Config.clientSecret,";
  check("a reference with a digit in its name is still redacted", redact(digit) === "    client_secret: [REDACTED],", redact(digit));
  // Limit 2 — no longer caught. An unquoted secret made only of letters and
  // shaped like an identifier reads as a name outside env syntax. Quoted, in
  // a .env line, or with a single digit in it, it is redacted (Test 4).
  const snake = "password: correct_horse_battery";
  check("an unquoted identifier-shaped secret in YAML is NOT redacted", redact(snake) === snake, redact(snake));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
