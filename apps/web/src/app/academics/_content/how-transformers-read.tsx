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
  slug: "how-transformers-read",
  title: "How transformers read",
  abstract:
    "Embeddings, attention, and the forward pass, explained without assuming an ML background.",
  readingMinutes: 9,
  quizIds: ["how-transformers-read-quiz"],
};

export default function HowTransformersRead() {
  return (
    <>
      <Para>
        A transformer reads left to right, one token at a time, through a
        stack of identical layers (tens of them). Each layer refines every
        token&apos;s representation using the tokens around it. Three ideas
        carry almost all the intuition: embeddings, attention, and the forward
        pass.
      </Para>

      <H2>1. Embeddings — words as coordinates</H2>
      <Para>
        Each token ID maps to a <strong>vector</strong>: a list of a few
        thousand numbers learned during training. Tokens with similar meaning
        end up near each other in this space —{" "}
        <InlineCode>king − man + woman ≈ queen</InlineCode> is the famous
        (slightly mythologized) demo. The embedding is the model&apos;s only
        starting view of a token; everything else is computed from it.
      </Para>
      <Para>
        Order is not free: transformers see sets, not sequences, so a
        positional signal is added to each embedding marking <em>where</em> it
        sits. Without it, &quot;dog bites man&quot; and &quot;man bites
        dog&quot; would look identical.
      </Para>

      <H2>2. Attention — deciding what matters</H2>
      <Para>
        For each token, attention asks: <em>which earlier tokens should I
        listen to right now?</em> It scores every pair with three roles:
      </Para>
      <UL>
        <LI>
          <strong>Query</strong> — what this token is looking for.
        </LI>
        <LI>
          <strong>Key</strong> — what each other token offers.
        </LI>
        <LI>
          <strong>Value</strong> — what actually flows over once matched.
        </LI>
      </UL>
      <Para>
        In &quot;the animal didn&apos;t cross the street because{" "}
        <em>it</em> was too tired,&quot; the head resolving <em>it</em> puts
        most weight on <em>animal</em>. Nothing magical — just learned
        match-scores, computed for all pairs at once (which is also why long
        contexts are quadratically expensive without tricks like the KV
        cache).
      </Para>
      <Callout title="Multi-head = parallel viewpoints">
        Each layer runs many attention heads at once. One head may track
        grammar, another coreference, another list structure. The model
        learns the division of labor itself — nobody assigns roles.
      </Callout>

      <H2>3. The forward pass — refine, refine, predict</H2>
      <Para>
        One layer = attention (mix information across positions) followed by a
        feed-forward network (process each position independently, where most
        of the model&apos;s stored &quot;knowledge&quot; lives). Repeat 30–100
        times. The final layer outputs a score for every vocabulary entry;
        normalized, that is the next-token probability distribution:
      </Para>
      <CodeBlock>{`tokens in  → [embed] → layer₁ → layer₂ → … → layerₙ → scores
"the capital of France is"  →  Paris (92%), Lyon (3%), …`}</CodeBlock>
      <Para>
        Sampling picks from that distribution (more in the lesson on
        generation), appends the token, and the whole stack runs again for the
        next one. That loop — one full forward pass per token — is what you
        pay for at serving time.
      </Para>

      <Quiz
        id="how-transformers-read-quiz"
        questions={[
          {
            prompt: "What problem do positional signals solve?",
            choices: [
              "They compress the model to fewer parameters",
              "Without them the model can't tell word order apart",
              "They translate between languages",
            ],
            answerIndex: 1,
            explanation:
              "Attention over bare embeddings is order-blind; position info makes 'dog bites man' differ from 'man bites dog'.",
          },
          {
            prompt: "In attention, what flows from one token to another?",
            choices: [
              "The Key vectors directly",
              "The Value vectors, weighted by Query–Key match scores",
              "The raw token IDs",
            ],
            answerIndex: 1,
            explanation:
              "Queries match against keys to get weights; those weights mix the values. Keys never travel themselves.",
          },
          {
            prompt: "Where does most of a model's stored 'knowledge' live?",
            choices: [
              "In the embedding table",
              "In the feed-forward networks inside each layer",
              "In the attention scores",
            ],
            answerIndex: 1,
            explanation:
              "Feed-forward blocks hold most parameters and act as learned key–value memories; attention routes, FFNs recall.",
          },
        ]}
      />
    </>
  );
}
