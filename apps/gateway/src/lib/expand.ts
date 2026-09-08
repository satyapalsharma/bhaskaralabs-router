// Expander pass (v2 frontier-minimal concept, flash-backed plumbing).
// When x-bhaskara-expand is on: pass 1 runs with MINIMAL-FORM discipline
// (frontier writes pseudocode, not full code), pass 2 expands via cheap
// qwen3.8-flash. Wins iff frontier output savings exceed expansion cost —
// ledger-tagged per turn (expand:{pass2out}) for the readout. Non-stream
// only; streams ignore the flag. Fail-open everywhere: any failure returns
// the original completion untouched. A trained small model replaces the
// flash expander later without touching callers.

import { hyperChat } from "../providers/hyper";

export const EXPAND_MIN_BLOCK = `
Minimal-form discipline (active): answer as compact pseudocode plus terse bullets — signatures, key logic, file paths. No full code bodies, no prose explanations, no restating the question. A second pass will expand this into working code, so preserve every name, type, and edge case exactly.`.trim();

function hyperKey(): string | null {
  const k = (process.env.HYPER_API_KEYS ?? process.env.HYPER_API_KEY ?? "").split(",")[0]?.trim();
  return k || null;
}

/** Overwrite the completion text in an OpenAI-compat JSON body. False when shape unknown. */
export function setExpandedContent(json: unknown, text: string): boolean {
  try {
    const c = (json as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message;
    if (!c || typeof c.content !== "string") return false;
    c.content = text;
    return true;
  } catch {
    return false;
  }
}

export function firstContent(json: unknown): string | null {
  try {
    const c = (json as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    return typeof c === "string" && c.length > 0 ? c : null;
  } catch {
    return null;
  }
}

export async function expandCompletion(
  minimal: string,
  clientMaxTokens?: number,
): Promise<{ text: string; usage: { promptTokens: number; completionTokens: number } } | null> {
  const key = hyperKey();
  if (!key) return null;
  const res = await hyperChat({
    model: "qwen3.8-flash",
    body: {
      model: "qwen3.8-flash",
      messages: [
        { role: "system", content: "Expand the following minimal pseudocode draft into complete, working code. Output ONLY the expanded code, no explanations." },
        { role: "user", content: minimal.slice(0, 32_000) },
      ],
      max_tokens: Math.min(clientMaxTokens ?? 4000, 8000),
      temperature: 0,
    },
    apiKey: key,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = firstContent(j);
  if (!text) return null;
  return {
    text,
    usage: {
      promptTokens: typeof j.usage?.prompt_tokens === "number" ? j.usage.prompt_tokens : 0,
      completionTokens: typeof j.usage?.completion_tokens === "number" ? j.usage.completion_tokens : 0,
    },
  };
}
