// LLM Judge — Switchyard-inspired fallback classifier (NVIDIA NeMo Switchyard
// blog, 2026-08). When heuristic signals are INCONCLUSIVE (text looks routine,
// stage unknown — but the turn could still be subtle: "handle the edge cases",
// "make it robust"), a fast cheap LLM call classifies the turn before routing.
//
// Design constraints:
//   - ONLY fires on inconclusive signals (adds one cheap call; never in the
//     hot path for clearly-routine or clearly-hard turns).
//   - Uses yolo (free, 4 slots, ~6s with reasoning off) — feihoa measured
//     16-19s for a 1-word classify, too slow to hold a request.
//   - Memoized by prompt hash — identical re-classifications are free.
//   - STRICT output contract: model must reply exactly "hard" or "routine".
//     Anything else → null (fail-open to the heuristic, no retry loop).
import { yoloSlotFree } from "../providers/yolo";
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

  // Yolo judge (fast, free, 4 slots); never blocks routing — failure returns
  // null → caller keeps the heuristic classification.
  const verdict = await yoloJudgeClassify(prompt).catch(() => null);
  if (verdict === null) return null; // fail-open: no memo on failure

  if (JUDGE_MEMO.size > JUDGE_MEMO_MAX) JUDGE_MEMO.clear();
  JUDGE_MEMO.set(h, verdict);
  return verdict;
}

/** Yolo judge — reasoning off, strict one-word contract. */
async function yoloJudgeClassify(prompt: string): Promise<boolean | null> {
  const key = (process.env.YOLO_AUTO_API_KEY ?? "").trim();
  if (!key || !yoloSlotFree()) return null;
  const res = await fetch(`${process.env.YOLO_BASE_URL ?? "https://yolo-auto.com/v1"}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.YOLO_MODEL ?? "qwen3.8-27b",
      messages: [{ role: "user", content: JUDGE_PROMPT + prompt.slice(0, 2000) }],
      max_tokens: 8,
      temperature: 0,
      reasoning_effort: "none", // qwen reasoning eats max_tokens → null content
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
