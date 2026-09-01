// Canonical prefix assembler + prefix lint.
// Cache commandments enforced here (see IMPLEMENTATION_PLAN §6):
//   1. Prefix order fixed: system → tools → session → tail
//   2. Append-only history (enforced by caller/compactor, not here)
//   3. Deterministic serialization; no timestamps/random-ids/dates in prefix
//   4. Session→key affinity (hyper.ts pickKeyForSession)
//   5. Model stickiness per session (router/index.ts)
//   6. Never re-compress a cached region (compactor's job)
//   7. Every request logs cached_tokens

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: unknown; // string or structured (tool calls etc.) — passed through untouched
}

export interface AssembledRequest {
  messages: ChatMessage[];
  warnings: string[];
  rejected?: string; // hard violation → reject before upstream
}

// Things that must NEVER appear in the stable prefix (breaks prefix cache).
const VOLATILE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "iso-timestamp", re: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/ },
  { name: "current-date", re: /\b(today'?s date is|current date is)\b/i },
  { name: "uuid", re: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i },
  { name: "unix-ms", re: /\b1[7-9]\d{12}\b/ },
];

/** Lint a single message for volatile content (name + snippet). */
function msgViolations(msg: ChatMessage): Array<{ name: string; snippet: string }> {
  if (typeof msg.content !== "string") return [];
  const out: Array<{ name: string; snippet: string }> = [];
  for (const { name, re } of VOLATILE_PATTERNS) {
    const m = re.exec(msg.content);
    if (m) {
      const idx = m.index ?? 0;
      out.push({ name, snippet: msg.content.slice(Math.max(0, idx - 20), idx + 60).replace(/\s+/g, " ") });
    }
  }
  return out;
}

export function prefixLint(messages: ChatMessage[]): { warnings: string[]; reject?: string } {
  const warnings: string[] = [];
  // Only the stable prefix region matters: everything except the LAST user message.
  for (let i = 0; i < messages.length - 1; i++) {
    const msg = messages[i];
    if (msg.role === "system" || msg.role === "tool" || (msg.role === "user" && i < messages.length - 1)) {
      if (typeof msg.content !== "string") continue;
      for (const { name, re } of VOLATILE_PATTERNS) {
        const m = re.exec(msg.content);
        if (m) {
          const idx = m.index ?? 0;
          warnings.push(`volatile:${name} in ${msg.role}[${i}]: "…${msg.content.slice(Math.max(0, idx - 20), idx + 40).replace(/\s+/g, " ")}…"`);
        }
      }
    }
  }
  return { warnings };
}

/** Rough token estimate (chars/4) — precise counts come from provider usage. v0 heuristic for router. */
export function estimateTokens(messages: ChatMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") chars += m.content.length;
    else chars += JSON.stringify(m.content).length;
  }
  return Math.ceil(chars / 4);
}

/**
 * Assemble the canonical request. v0 = passthrough with lint.
 * Later phases hook in: docs-pack injection after tools, identity line in system, compression on tail.
 */
export function assemble(
  incoming: { messages?: unknown },
): AssembledRequest {
  const msgs = Array.isArray(incoming.messages) ? incoming.messages : [];
  const messages: ChatMessage[] = msgs.map((m) => {
    if (m && typeof m === "object" && "role" in m) {
      const role = (m as { role: unknown }).role;
      if (role === "system" || role === "user" || role === "assistant" || role === "tool") {
        return { role, content: (m as { content: unknown }).content };
      }
    }
    return { role: "user", content: m };
  });
  const { warnings } = prefixLint(messages);
  return { messages, warnings };
}

/** Session-sticky model choice key. Sessions derive from api-key + stable client header if present. */
export function deriveSessionId(apiKeyId: string, headers: Headers): string {
  const clientSession = headers.get("x-bhaskara-session");
  return clientSession ?? apiKeyId;
}