// Secret redaction for tool-result content (LeanCTX-governance analog).
//
// Runs on the live zone before forwarding upstream: values that match known
// secret shapes are replaced with typed markers. Key names are preserved so
// the model still understands WHICH credential failed/was used.
//
// SCOPE: live zone only (enforced by caller). Secrets already in settled
// history were already sent upstream — rewriting history would bust the
// provider cache for zero new protection. This stops the per-turn re-send
// of secrets that appear in FRESH tool output (test logs echoing env, etc).
//
// INVARIANTS: pure regex replace — deterministic, idempotent, stable across
// turns. Conservative minimum lengths avoid false positives on short words.
//
// A NAME IS NOT A VALUE. The key=value rule used to redact whatever followed a
// credential-ish key, which in source code is usually another name:
//
//   apiKeyId: auth.apiKeyId,              →  apiKeyId: [REDACTED],
//   const apiKey = process.env.API_KEY    →  const apiKey = [REDACTED]
//   password = self.password.encode(...)  →  password = [REDACTED](...)
//
// Nothing secret was in those lines, and the agent reading them then edits
// against text that is not in the file — or writes "[REDACTED]" into it. An
// unquoted value is now left alone when it is a reference rather than a
// literal (see isReference). Quoted values, token shapes, PEM blocks and
// Bearer tokens are redacted exactly as before.

const PEM_BLOCK_RE =
  /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY(?: BLOCK)?-----/g;

const TOKEN_RES: Array<{ re: RegExp; label: string }> = [
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: "aws-key" },
  { re: /\b(ABIA|ACCA|ASIA)[0-9A-Z]{16}\b/g, label: "aws-key" },
  { re: /\bghp_[A-Za-z0-9]{20,}\b/g, label: "github-token" },
  { re: /\b(?:gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g, label: "github-token" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, label: "github-token" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, label: "slack-token" },
  { re: /\bsk-ant-[A-Za-z0-9-_]{10,}\b/g, label: "anthropic-key" },
  { re: /\bsk-live-[A-Za-z0-9]{10,}\b/g, label: "stripe-key" },
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, label: "api-key" },
  { re: /\bAIza[0-9A-Za-z-_]{30,}\b/g, label: "gcp-key" },
  { re: /\b ya29\.[0-9A-Za-z-_]{20,}/g, label: "gcp-token" },
];

// key = value assignments (keeps the key name, redacts only the value).
// Minimum 12 chars on the value skips already-masked "***" and short words.
// The value may sit on the next line only if it is quoted (a formatter breaks
// `const secret =\n  "…";` that way). Unquoted, a token on the next line is
// that line's own statement: "if passwd:\n    stream.write(...)" used to read
// as passwd = stream.write.
const ASSIGN_RE =
  /([A-Za-z0-9_.-]*(?:api[_-]?key|api[_-]?secret|client[_-]?secret|auth[_-]?token|access[_-]?token|refresh[_-]?token|private[_-]?token|secret|passwd|password|pwd)[A-Za-z0-9_.-]*[ \t]*[:=])(\s*)(['"]?)([A-Za-z0-9._~+/=-]{12,})/gi;

// `auth.apiKeyId`, `tls_key_password`, `AdminPasswordChangeForm`: letters,
// underscores and dots, and shaped like a name — a separator or a camelCase
// hump. Generated secrets all but always carry a digit or base64/URL
// punctuation; twelve letters in one case with nothing between them
// (`correcthorsebattery`) is a word or a passphrase, not an identifier.
const NAME_PATH_RE = /^[A-Za-z_]+(?:\.[A-Za-z_]+)*$/;
const NAME_SHAPE_RE = /[_.]|[a-z][A-Z]/;
// `DB_PASSWORD=value` with nothing around the `=`: shell and .env syntax,
// where the right-hand side is a literal whatever it looks like.
const ENV_KEY_RE = /^[A-Z][A-Z0-9_]*=$/;

/** An unquoted value that names a value instead of being one. Errs toward
 *  redacting: a name with a digit in it (`oauth2Config.clientSecret`) still
 *  goes. What is no longer caught is an unquoted, letters-only secret that is
 *  itself shaped like an identifier (`password: correct_horse_battery`)
 *  outside env syntax. */
function isReference(key: string, value: string, next: string | undefined): boolean {
  if (ENV_KEY_RE.test(key)) return false;
  if (next === "(" || next === "[") return true; // a call or an index
  const name = value.replace(/\.+$/, ""); // "…is self.password." ends a sentence, not a path
  return NAME_PATH_RE.test(name) && NAME_SHAPE_RE.test(name);
}

const BEARER_RE = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{20,})/g;

export function redactSecrets(text: string): { text: string; redacted: number } {
  let redacted = 0;
  let out = text.replace(PEM_BLOCK_RE, () => {
    redacted++;
    return "[REDACTED:private-key]";
  });
  for (const { re, label } of TOKEN_RES) {
    out = out.replace(re, () => {
      redacted++;
      return `[REDACTED:${label}]`;
    });
  }
  out = out.replace(ASSIGN_RE, (m, key: string, gap: string, quote: string, value: string, offset: number, whole: string) => {
    // Skip values that are already redaction markers or template placeholders.
    if (/REDACTED|\*+|\$\{|\{\{|<.+>/.test(value)) return m;
    if (quote === "" && (gap.includes("\n") || isReference(key + gap, value, whole[offset + m.length]))) return m;
    redacted++;
    // The closing quote is not part of the match, so it stays where it was
    // (it used to be consumed: `"hunter2…"` came out as `"[REDACTED]`).
    return `${key}${gap}${quote}[REDACTED]`;
  });
  out = out.replace(BEARER_RE, (_m, prefix: string, _tok: string) => {
    redacted++;
    return `${prefix}[REDACTED]`;
  });
  return { text: out, redacted };
}
