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
const ASSIGN_RE =
  /([A-Za-z0-9_.-]*(?:api[_-]?key|api[_-]?secret|client[_-]?secret|auth[_-]?token|access[_-]?token|refresh[_-]?token|private[_-]?token|secret|passwd|password|pwd)[A-Za-z0-9_.-]*\s*[:=]\s*['"]?)([A-Za-z0-9._~+/=-]{12,}['"]?)/gi;
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
  out = out.replace(ASSIGN_RE, (_m, key: string, _val: string) => {
    // Skip values that are already redaction markers or template placeholders.
    if (/REDACTED|\*+|\$\{|\{\{|<.+>/.test(_val)) return _m;
    redacted++;
    return `${key}[REDACTED]`;
  });
  out = out.replace(BEARER_RE, (_m, prefix: string, _tok: string) => {
    redacted++;
    return `${prefix}[REDACTED]`;
  });
  return { text: out, redacted };
}
