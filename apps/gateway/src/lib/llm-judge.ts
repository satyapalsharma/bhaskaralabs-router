// LLM Judge — Switchyard-inspired fallback classifier (NVIDIA NeMo Switchyard
// blog, 2026-08). When heuristic signals are INCONCLUSIVE (text looks routine,
// stage unknown — but the turn could still be subtle: "handle the edge cases",
// "make it robust"), a fast cheap LLM call classifies the turn before routing.
//
// Design constraints:
//   - ONLY fires on inconclusive signals (adds one cheap call; never in the
//     hot path for clearly-routine or clearly-hard turns).
//   - Uses the Agnes flat lane: fastest lane we have (0.3-1.1s serves) and
//     prepaid, so a classification costs no marginal spend. Runs on the same
//     semaphore as real traffic, so a judge call can never starve a turn.
//   - Memoized by prompt hash — identical re-classifications are free.
//   - STRICT output contract: model must reply exactly "hard" or "routine".
//     Anything else → null (fail-open to the heuristic, no retry loop).
import { agnesEnabled, agnesSlotFree, AGNES_BASE } from "../providers/agnes";
import { createHash } from "node:crypto";


const JUDGE_MEMO = new Map<string, boolean>(); // promptHash -> isHard
const JUDGE_MEMO_MAX = 500;

const JUDGE_PROMPT = `You are a routing classifier for a coding agent. Decide whether the NEXT turn needs a frontier reasoning model or a fast cheap model.

Reply with EXACTLY one word:
- "hard" — needs deep reasoning: algorithm design, tricky debugging, architecture decisions, subtle type errors, security review, multi-step refactors, ambiguous "make it work/robust" requests
- "routine" — simple/safe: writing straightforward code, calling APIs, formatting, simple edits, following an existing pattern, asking to run/build/commit
Turn request:
`;

export async function judgeClassify(prompt: string): Promise<boolean | null> {
  const h = createHash("sha256").update(prompt).digest("hex").slice(0, 24);
  const memo = JUDGE_MEMO.get(h);
  if (memo !== undefined) return memo;

  // Judge on the fast flat lane; never blocks routing — failure returns null
  // and the caller keeps the heuristic classification.
  const verdict = await judgeClassifyUpstream(prompt).catch(() => null);
  if (verdict === null) return null; // fail-open: no memo on failure

  if (JUDGE_MEMO.size > JUDGE_MEMO_MAX) JUDGE_MEMO.clear();
  JUDGE_MEMO.set(h, verdict);
  return verdict;
}

/** Judge dispatch — strict one-word contract, hard 12s deadline. */
async function judgeClassifyUpstream(prompt: string): Promise<boolean | null> {
  const key = (process.env.AGNES_API_KEY ?? "").trim();
  if (!key || !agnesEnabled() || !agnesSlotFree()) return null;
  const res = await fetch(`${AGNES_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.AGNES_MODEL ?? "agnes-2.5-flash",
      messages: [{ role: "user", content: JUDGE_PROMPT + prompt.slice(0, 2000) }],
      max_tokens: 8,
      temperature: 0,
      reasoning_effort: "none", // reasoning eats max_tokens → null content
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const out = j.choices?.[0]?.message?.content?.trim().toLowerCase() ?? "";
  if (out.startsWith("hard")) return true;
  if (out.startsWith("routine")) return false;
  return null;
}
/** Prompts that look routine to regex but are worth a judge look. */
const JUDGE_CANDIDATE_PATTERNS: RegExp[] = [
  /\b(handle|cover|think\s+about|deal\s+with)\b.{0,30}\b(edge\s+case|corner\s+case|failure)\b/i,
  /\bedge\s+cases?\b/i,
  /\b(make|get|keep|ensure)\b.{0,30}\b(robust|solid|resilient|production[- ]ready)\b/i,
  /\b(what'?s\s+wrong|what\s+am\s+i\s+missing)\b/i,
  /\b(improve|optimize|clean\s+up)\b/i,
  /\b(is\s+this\s+(right|correct|safe))\b/i,
];
export function judgeCandidate(text: string): boolean {
  return JUDGE_CANDIDATE_PATTERNS.some((re) => re.test(text));
}
