// Client identity — who is calling.
//
// The gateway is an API for coding agents. That is the product: a plan priced
// per request only works if the requests come from an agent doing work, because
// an agent's traffic is bursty, cache-friendly and self-limiting. A scraper
// pointed at the same endpoint produces the opposite: steady, uncacheable, and
// indifferent to the request cap.
//
// So we classify callers, and we do it from two independent signals:
//
//   1. User-Agent — explicit, cheap, and trivially forged. Useful, but on its
//      own it is a claim rather than evidence.
//   2. Request shape — does this turn look like a coding agent? Tool schemas,
//      multi-turn history, a system prompt. Much harder to fake by accident,
//      and impossible to fake while also being cheap to serve, which is the
//      actual property we care about.
//
// Neither signal is sufficient. A new client we have never seen may send an
// unknown User-Agent and be entirely legitimate; a forged User-Agent with no
// agent shape is not. The gate therefore asks for *either* signal, and refuses
// only when both are absent — the narrow case that is almost always a script.
//
// This module is pure: it reads headers and a parsed body, and returns a
// verdict. Nothing here decides what to do about the verdict.

/** UA substrings for clients we expect. Matching is case-insensitive.
 *
 *  This list is a starting point, not a specification. `pnpm ua:report` reads
 *  the observed values from the ledger and should be used to correct it —
 *  an allowlist built from guesses rejects real users. */
const AGENT_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "claude-code", re: /\bclaude[-_]?cli\b|\bclaude[-_]?code\b/i },
  { name: "cursor", re: /\bcursor\b/i },
  { name: "opencode", re: /\bopencode\b/i },
  { name: "crush", re: /\bcrush\b/i },
  { name: "aider", re: /\baider\b/i },
  { name: "cline", re: /\bcline\b/i },
  { name: "roo", re: /\broo[-_]?code\b/i },
  { name: "continue", re: /\bcontinue(?:-dev)?\b/i },
  { name: "codex", re: /\bcodex\b/i },
  { name: "gemini-cli", re: /\bgemini[-_]?cli\b/i },
  { name: "windsurf", re: /\bwindsurf\b|\bcodeium\b/i },
  { name: "copilot", re: /\bcopilot\b/i },
  { name: "zed", re: /\bzed\b/i },
  { name: "jetbrains", re: /\bjetbrains\b|\bintellij\b/i },
  { name: "amp", re: /\bamp\b/i },
  { name: "kilo", re: /\bkilo\b/i },
];

/** Official SDKs. Legitimate programmatic use — the user wrote code against
 *  our API, which is exactly what the API is for. */
const SDK_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "anthropic-sdk", re: /\banthropic[-_/]?(sdk|python|typescript|js|node)?/i },
  { name: "openai-sdk", re: /\bopenai[-_/]?(sdk|python|typescript|js|node|nodejs)?/i },
  { name: "langchain", re: /\blangchain\b|\bllamaindex\b/i },
  { name: "vercel-ai", re: /\bai[-_/]?sdk\b|\bvercel\b/i },
  { name: "python-requests", re: /\bpython-requests\b|\bhttpx\b|\baiohttp\b/i },
  { name: "go-http", re: /\bgo-http-client\b/i },
  { name: "okhttp", re: /\bokhttp\b|\bjava\b/i },
  { name: "curl", re: /^curl\//i },
  { name: "wget", re: /^wget\//i },
  { name: "node-fetch", re: /\bnode-fetch\b|\bundici\b|\baxios\b|\bgot\b|\bfetch\b/i },
];

/** Browsers. A browser is not a coding agent, and a key pasted into a console
 *  is more often a curious onlooker than a customer. */
const BROWSER_RE =
  /mozilla\/5\.0.*(firefox|chrome|safari|edg|opr)\b/i;

export type ClientKind =
  | "coding-agent"
  | "sdk"
  | "browser"
  | "unknown"
  | "absent";

export interface ClientIdentity {
  kind: ClientKind;
  /** Matched client name, when one matched. */
  name: string | null;
  version: string | null;
  /** True when the body itself has the shape of a coding agent's turn. */
  shaped: boolean;
  /** Truncated raw header, for the report. Never used for decisions. */
  raw: string | null;
}

const VERSION_RE = /[ /]v?(\d+\.\d+(?:\.\d+)?)/;

function match(patterns: Array<{ name: string; re: RegExp }>, ua: string): { name: string; version: string | null } | null {
  for (const p of patterns) {
    if (p.re.test(ua)) {
      const v = VERSION_RE.exec(ua);
      return { name: p.name, version: v?.[1] ?? null };
    }
  }
  return null;
}

/**
 * Does this request body look like a coding agent's turn?
 *
 * Deliberately generous. The gate exists to catch scripts, and a script that
 * sends tool schemas and a real conversation is not the thing we are guarding
 * against — it is a customer whose User-Agent we have not seen yet.
 *
 * Any one of these is enough:
 *   - tool schemas present (an agent's defining request)
 *   - a system prompt alongside multi-turn history
 *   - a tool result in the history (only an agent produces those)
 */
export function isAgentShaped(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const b = body as { messages?: unknown; tools?: unknown; system?: unknown };

  if (Array.isArray(b.tools) && b.tools.length > 0) return true;

  const messages = Array.isArray(b.messages) ? b.messages : [];
  if (messages.length === 0) return false;

  // Tool results only appear in an agent's history. This is the strongest
  // shape signal available without inspecting content.
  for (const m of messages) {
    const role = (m as { role?: unknown } | null)?.role;
    if (role === "tool" || (role === "user" && Array.isArray((m as { content?: unknown }).content))) {
      const parts = (m as { content: unknown[] }).content;
      if (parts.some((p) => (p as { type?: unknown } | null)?.type === "tool_result")) return true;
    }
  }

  // A system prompt plus real history. A single-message call with no system is
  // a person at a terminal, which is fine but is not this signal.
  const hasSystem = typeof b.system === "string" || messages.some((m) => (m as { role?: unknown })?.role === "system");
  if (hasSystem && messages.length >= 3) return true;

  return false;
}

export function classifyClient(userAgent: string | null, body: unknown): ClientIdentity {
  const raw = userAgent ? userAgent.slice(0, 200) : null;
  const shaped = isAgentShaped(body);

  if (!userAgent || userAgent.trim() === "") {
    return { kind: "absent", name: null, version: null, shaped, raw };
  }

  const agent = match(AGENT_PATTERNS, userAgent);
  if (agent) return { kind: "coding-agent", ...agent, shaped, raw };

  // SDKs are checked before browsers: some SDKs inherit a Mozilla-shaped UA.
  const sdk = match(SDK_PATTERNS, userAgent);
  if (sdk) return { kind: "sdk", ...sdk, shaped, raw };

  if (BROWSER_RE.test(userAgent)) return { kind: "browser", name: "browser", version: null, shaped, raw };

  return { kind: "unknown", name: null, version: null, shaped, raw };
}

/**
 * Should this turn be served by an upstream call?
 *
 * The rule: refuse only when the caller gives us neither an identity we
 * recognise nor a body that is shaped like an agent's. Everything else is
 * served — a false rejection costs a customer, and the thing we are protecting
 * against (a script with no UA and no agent shape) is the cheapest possible
 * case to refuse.
 */
export function isServable(identity: ClientIdentity): boolean {
  // A body with agent shape is evidence enough on its own. This is the branch
  // that keeps a new client — one we have never seen, sending a User-Agent we
  // do not know — from being refused for the crime of being new.
  if (identity.shaped) return true;
  // Without shape, we need an identity we recognise.
  return (
    identity.kind === "coding-agent" ||
    identity.kind === "sdk" ||
    identity.kind === "browser"
  );
}

/** One-line form for logs. */
export function describeClient(identity: ClientIdentity): string {
  const who = identity.name ?? identity.kind;
  const v = identity.version ? `/${identity.version}` : "";
  return `${who}${v}${identity.shaped ? " shaped" : ""}`;
}

/** The refusal message. It has to be actionable: the most likely caller is a
 *  real user whose client we do not recognise, not an attacker. */
export const UNIDENTIFIED_CLIENT_MESSAGE =
  "Unrecognised client. This endpoint is for coding agents and API clients — send an identifying User-Agent, or include tool definitions and conversation history in the request. If you are building something new, contact support and we will add you to the list.";

export type UaGateMode = "off" | "observe" | "enforce";

/**
 * Gate mode, from BHASKARA_UA_GATE.
 *
 * Defaults to `observe`, and that default is deliberate. A User-Agent allowlist
 * written from guesses rejects real users — the failure is silent, it hits
 * exactly the customers who adopted us early, and it is invisible in the
 * aggregate because the scoreboard counts served requests, not refused ones.
 * Observe for a few days, read the report, then enforce.
 */
export function uaGateMode(): UaGateMode {
  const v = (process.env.BHASKARA_UA_GATE ?? "observe").toLowerCase();
  return v === "off" || v === "enforce" ? v : "observe";
}
