import {
  H2,
  Para,
  UL,
  LI,
  InlineCode,
  CodeBlock,
  Callout,
} from "@/components/academics/mdx-components";
import Quiz from "@/components/academics/Quiz";

export const meta = {
  slug: "prompt-caching-practice",
  title: "Prompt caching in practice",
  abstract:
    "Stable prefixes, append-only sessions, and reading hit-rate headers on our API.",
  readingMinutes: 7,
  quizIds: ["prompt-caching-practice-quiz"],
};

export default function PromptCachingPractice() {
  return (
    <>
      <Para>
        Previous lesson: reused exact prefixes skip prefill at ~90% off. This
        one is the field manual — how to actually get those hits, and how to
        verify them on the Bhaskara API.
      </Para>

      <H2>The three rules</H2>
      <UL>
        <LI>
          <strong>Stable system prompt, always first.</strong> Same bytes
          every turn. Per-session toggles (terse mode, doc packs) are fine —
          they change once and stay. Per-request fiddling is cache poison.
        </LI>
        <LI>
          <strong>Append-only history.</strong> New turns go at the end, old
          ones are never edited, reordered, or regenerated mid-stream.
          Compaction (ours fires past 200K tokens) is the deliberate
          exception: one budgeted re-warm, then stable again.
        </LI>
        <LI>
          <strong>Volatile content goes last.</strong> Timestamps, request
          IDs, progress counters — anything that changes every turn belongs
          at the tail, never in the middle of settled context.
        </LI>
      </UL>

      <H2>Reading the proof on our API</H2>
      <Para>
        Every response&apos;s <InlineCode>usage</InlineCode> carries{" "}
        <InlineCode>prompt_tokens_details.cached_tokens</InlineCode> — the
        tokens served from cache this turn. Our theta display rates make the
        value visceral:
      </Para>
      <CodeBlock>{`theta display rates (per 1M tokens):
  input      $0.20
  cache hit  $0.04     ← 5× cheaper
  output     $0.40`}</CodeBlock>
      <Para>
        A healthy agentic session shows 70–90% of prompt tokens arriving as
        cache hits. If yours doesn&apos;t, the cause is almost always one of
        the three rules above — usually volatile content smuggled into the
        middle of history (timestamps in tool output are the classic
        offender; our context engine masks them before forwarding).
      </Para>
      <Callout title="Cache hits are a property of your session, not our mood">
        Same bytes → hit, deterministically. If hit rate collapses on a
        session, diff what changed at the turn it dropped: a reordered tool
        schema, a regenerated message, a new system toggle. Fix the bytes,
        the hits return.
      </Callout>

      <Quiz
        id="prompt-caching-practice-quiz"
        questions={[
          {
            prompt: "Where should a per-request timestamp live in your context?",
            choices: [
              "At the very start, so the model sees it first",
              "At the tail, after all stable content",
              "It doesn't matter",
            ],
            answerIndex: 1,
            explanation:
              "Anything volatile in the middle invalidates the cache from that point on; the tail costs only itself.",
          },
          {
            prompt: "Your session's cached_tokens suddenly drops to ~0. First suspect?",
            choices: [
              "The provider raised prices",
              "Something mutated the settled prefix (reorder, regen, new toggle)",
              "The model got smarter",
            ],
            answerIndex: 1,
            explanation:
              "Hits are deterministic on bytes — a cliff means the prefix changed. Diff the turn where it dropped.",
          },
          {
            prompt: "Why do per-session (sticky) settings preserve cache while per-request ones destroy it?",
            choices: [
              "Sticky settings are shorter",
              "Sticky settings change the prefix once, then it stays byte-identical across turns",
              "Providers whitelist them",
            ],
            answerIndex: 1,
            explanation:
              "One wipe + re-warm, then every later turn matches. Per-request changes re-wipe every single turn.",
          },
        ]}
      />
    </>
  );
}
