import {
  H2,
  Para,
  UL,
  LI,
  CodeBlock,
  Callout,
} from "@/components/academics/mdx-components";
import Quiz from "@/components/academics/Quiz";

export const meta = {
  slug: "inference-kv-cache",
  title: "Inference & the KV cache",
  abstract:
    "What happens per token at serving time, and why session shape matters.",
  readingMinutes: 8,
  quizIds: ["inference-kv-cache-quiz"],
};

export default function InferenceKvCache() {
  return (
    <>
      <Para>
        Serving has two phases with wildly different economics. Understanding
        them explains half of LLM pricing — including ours.
      </Para>

      <H2>Prefill vs decode</H2>
      <UL>
        <LI>
          <strong>Prefill</strong> — your whole prompt is processed in one
          parallel sweep. Fast per token (GPUs love parallelism), and its
          cost scales with prompt length.
        </LI>
        <LI>
          <strong>Decode</strong> — tokens come out one by one, each needing a
          full forward pass over everything so far. Slow, sequential, and the
          reason long answers take visibly longer than long prompts.
        </LI>
      </UL>

      <H2>The KV cache — never recompute what you already read</H2>
      <Para>
        During prefill, attention computes <strong>keys and values</strong>{" "}
        for every prompt token. Decoding token N+1 needs those same keys and
        values — so the server <em>keeps</em> them in GPU memory instead of
        recomputing. That stored state is the <strong>KV cache</strong>.
      </Para>
      <Para>Two consequences run the whole industry:</Para>
      <UL>
        <LI>
          <strong>Memory grows with context.</strong> A 100K-token session
          parks gigabytes of KV state on the GPU. Long contexts are a memory
          problem before they are a quality problem.
        </LI>
        <LI>
          <strong>Reused prefixes skip prefill.</strong> If this turn&apos;s
          prompt starts exactly like a cached one, the server reuses the
          stored keys/values — no recompute. That skip is what providers sell
          as <strong>prompt caching</strong>, typically ~90% off input price.
        </LI>
      </UL>
      <CodeBlock>{`turn 1:  [system + history] → prefill 60K tokens (full price)
turn 2:  [system + history] (identical bytes → cache HIT)
         + new message      → prefill only the new tail ( ~90% off )`}</CodeBlock>

      <H2>Why session shape matters</H2>
      <Para>
        The cache matches on <strong>exact prefix bytes</strong>. Timestamps,
        reordered tool schemas, or reshuffled history in the middle invalidate
        everything after them — the server re-prefills from the first changed
        byte. Stable system prompt first, append-only history after: that
        discipline is worth more than most model upgrades.
      </Para>
      <Callout title="How our gateway plays this">
        Our proxy assembles every request canonically (fixed order,
        deterministic serialization, no volatile tokens in the prefix) for
        exactly this reason — so your repeated context keeps hitting cache
        instead of rebilling. The next lesson shows how to read the proof in
        your own usage rows.
      </Callout>

      <Quiz
        id="inference-kv-cache-quiz"
        questions={[
          {
            prompt: "Why is generating 1000 tokens slower than processing a 1000-token prompt?",
            choices: [
              "Prompts skip the model entirely",
              "Decoding is sequential (one forward pass per token); prefill is parallel",
              "Output tokens are larger",
            ],
            answerIndex: 1,
            explanation:
              "Prefill sweeps the prompt in parallel; each output token needs its own full forward pass.",
          },
          {
            prompt: "What does the KV cache store?",
            choices: [
              "The model's weights in compressed form",
              "Attention keys and values for processed tokens, so they aren't recomputed",
              "A copy of every user message",
            ],
            answerIndex: 1,
            explanation:
              "Keys/values from prefill persist in GPU memory; decoding reuses them instead of recomputing per token.",
          },
          {
            prompt: "A timestamp injected mid-conversation busts the cache from that point on. Why?",
            choices: [
              "Timestamps are too long",
              "Matching is byte-exact on the prefix — one changed byte invalidates everything after it",
              "The model dislikes dates",
            ],
            answerIndex: 1,
            explanation:
              "Prefix caches are addressed by exact bytes; any edit restarts matching (and billing) from that point.",
          },
        ]}
      />
    </>
  );
}
