import {
  H2,
  H3,
  Para,
  UL,
  LI,
  InlineCode,
  CodeBlock,
  Callout,
} from "@/components/academics/mdx-components";
import Quiz from "@/components/academics/Quiz";

export const meta = {
  slug: "tokens-tokenization",
  title: "Tokens & tokenization",
  abstract:
    "How raw text becomes token IDs, and why that shapes context limits and cost.",
  readingMinutes: 7,
  quizIds: ["tokens-tokenization-quiz"],
};

export default function TokensTokenization() {
  return (
    <>
      <Para>
        Models never see words. Before anything else happens, your text is cut
        into pieces called <strong>tokens</strong>, and each piece is replaced
        by its ID number from a fixed list (the vocabulary). Everything
        downstream — context limits, attention, pricing — counts in tokens,
        not words or characters.
      </Para>

      <H2>Why pieces, not words?</H2>
      <Para>Three options were on the table, and pieces won on tradeoffs:</Para>
      <UL>
        <LI>
          <strong>Whole words</strong> — vocab explodes (every name, typo, and
          plural needs an entry), and unknown words are unrepresentable.
        </LI>
        <LI>
          <strong>Characters</strong> — tiny vocab, but sequences get ~4×
          longer, and the model must re-learn spelling before meaning.
        </LI>
        <LI>
          <strong>Subwords</strong> — common words stay whole (
          <InlineCode>the</InlineCode>), rare words split into reusable parts.
          Vocabularies land around 30K–200K entries. Best of both.
        </LI>
      </UL>
      <Para>
        The dominant algorithm is a Byte-Pair Encoding (BPE) variant: start
        from bytes, repeatedly merge the most frequent adjacent pair, stop at
        the target vocab size. The result is deterministic — the same string
        always tokenizes the same way for a given tokenizer.
      </Para>

      <H2>What it looks like</H2>
      <Para>
        Illustrative split (exact boundaries differ per tokenizer):
      </Para>
      <CodeBlock>{`unbelievable  →  [un] [believ] [able]     (3 tokens)
hello        →  [hello]                 (1 token)
संभव         →  [सं] [भव]                (2 tokens, often more)`}</CodeBlock>
      <Para>
        Notice the last row: scripts the tokenizer saw rarely during training
        split into many small pieces. Same meaning, more tokens — which is why
        some languages cost noticeably more per sentence than English.
      </Para>

      <H3>Fertility</H3>
      <Para>
        <strong>Fertility</strong> = tokens per word. English prose sits near
        1.3; code and non-Latin scripts run higher. When someone says a model
        has a "200K context window," that is ~150K English words but far fewer
        characters of dense code or Hindi text.
      </Para>

      <H2>Why you should care</H2>
      <UL>
        <LI>
          <strong>Limits are token limits.</strong> A 200K window fits fewer
          real words than the number suggests.
        </LI>
        <LI>
          <strong>Bills are token bills.</strong> Every API prices input and
          output per million tokens — output tokens usually cost 3–5× input.
        </LI>
        <LI>
          <strong>Tokenizers differ per model.</strong> The same prompt is a
          different token count (and a different bill) on each provider.
        </LI>
      </UL>
      <Callout title="The one number to remember">
        Rough estimate: <strong>1 token ≈ 4 characters</strong> of English
        text. Good for back-of-envelope math; never for billing disputes —
        always count with the real tokenizer.
      </Callout>

      <Quiz
        id="tokens-tokenization-quiz"
        questions={[
          {
            prompt: "Why do most models use subword tokens instead of whole words?",
            choices: [
              "Subwords are faster to type",
              "Whole-word vocabularies explode and can't represent unknown words",
              "Models cannot process numbers otherwise",
            ],
            answerIndex: 1,
            explanation:
              "Every name, typo, and plural would need its own entry; subwords compose rare words from frequent parts.",
          },
          {
            prompt: "A 200K-token window holds roughly how many English words?",
            choices: ["~200K words", "~150K words", "~50K words"],
            answerIndex: 1,
            explanation:
              "English fertility is ~1.3 tokens/word, so 200K tokens ≈ 150K words — fewer for code or non-Latin scripts.",
          },
          {
            prompt: "The same sentence in Hindi often costs more tokens than in English. Why?",
            choices: [
              "Hindi characters are encrypted",
              "The tokenizer saw those scripts less often, so it splits them into smaller pieces",
              "Models translate Hindi to English first",
            ],
            answerIndex: 1,
            explanation:
              "Rare byte sequences never merged during BPE training, so they stay fragmented — more tokens per meaning.",
          },
        ]}
      />
    </>
  );
}
