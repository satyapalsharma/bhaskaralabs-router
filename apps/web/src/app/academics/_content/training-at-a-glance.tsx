import {
  H2,
  Para,
  UL,
  LI,
  Quote,
  Callout,
} from "@/components/academics/mdx-components";
import Quiz from "@/components/academics/Quiz";

export const meta = {
  slug: "training-at-a-glance",
  title: "Training at a glance",
  abstract: "What pre-training and fine-tuning do — and what they can't fix.",
  readingMinutes: 8,
  quizIds: ["training-at-a-glance-quiz"],
};

export default function TrainingAtAGlance() {
  return (
    <>
      <Para>
        Training happens in stages, each with a different job. Confusing them
        is the source of half the wrong claims about models — so here is the
        map.
      </Para>

      <H2>Stage 1 — Pre-training: learn the world&apos;s text patterns</H2>
      <Para>
        The model reads trillions of tokens (web, books, code) with one task:{" "}
        <strong>predict the next token</strong>. No labels, no teachers — the
        text supervises itself. Out of this emerge grammar, facts, reasoning
        patterns, and also every bias and falsehood frequent enough in the
        data.
      </Para>
      <Para>
        This stage is absurdly expensive (thousands of GPUs for months) and is
        why only a handful of organizations train frontier base models. What
        it buys: broad capability. What it doesn&apos;t buy: obedience — a
        base model completes prompts, it doesn&apos;t follow instructions.
      </Para>

      <H2>Stage 2 — Instruction tuning: learn to be helpful</H2>
      <Para>
        Fine-tune on tens of thousands of instruction → response pairs
        (written or curated by humans). The model learns formats: answer the
        question, refuse politely, show steps, use tools. Capability barely
        moves; <em>behavior</em> transforms. This is cheap relative to
        pre-training — the reason small labs can ship useful assistants on
        top of open base models.
      </Para>

      <H2>Stage 3 — Preference tuning: learn taste and guardrails</H2>
      <Para>
        Humans (or stronger models) rank pairs of responses; training
        (RLHF, or simpler DPO-style objectives) pushes the model toward
        preferred ones. This shapes style, honesty-habits, and refusal
        behavior. It does not reliably implant new knowledge — mostly it
        changes <em>which</em> of the model&apos;s existing behaviors surface.
      </Para>
      <Quote>
        Alignment tuning is largely skin-deep: capabilities come from
        pre-training, manners from tuning. Pressure-test accordingly.
      </Quote>

      <H2>What training can&apos;t fix</H2>
      <UL>
        <LI>
          <strong>Knowledge cutoff.</strong> The model froze when training
          data did — it cannot know last week unless given tools or fresh
          context.
        </LI>
        <LI>
          <strong>Hallucination.</strong> Next-token prediction rewards
          plausible continuations, not verified ones. Tuning reduces it; the
          incentive structure that causes it remains.
        </LI>
        <LI>
          <strong>Reasoning ceilings.</strong> More training scales pattern
          mastery, but genuinely novel multi-step reasoning stays brittle —
          verify outputs that matter.
        </LI>
      </UL>
      <Callout title="Why this matters to you as a user">
        When a model fails, ask <em>which stage</em> failed: missing facts →
        retrieval/context problem; wrong format → instruction problem; unsafe
        style → preference problem. Different causes, different fixes — and
        only the first two are yours to fix at the prompt.
      </Callout>

      <Quiz
        id="training-at-a-glance-quiz"
        questions={[
          {
            prompt: "What is the training signal during pre-training?",
            choices: [
              "Human ratings of each response",
              "Predicting the next token on raw text",
              "Passing benchmark exams",
            ],
            answerIndex: 1,
            explanation:
              "Self-supervised next-token prediction on trillions of tokens — no human labels involved at this stage.",
          },
          {
            prompt: "A model knows facts but ignores your formatting instructions. Which stage most likely underdelivered?",
            choices: [
              "Pre-training",
              "Instruction tuning",
              "Preference tuning",
            ],
            answerIndex: 1,
            explanation:
              "Facts come from pre-training (present here); format-following is exactly what instruction tuning installs.",
          },
          {
            prompt: "Which limitation survives all current training stages?",
            choices: [
              "The model can't do arithmetic",
              "The model can state falsehoods fluently",
              "The model can't write code",
            ],
            answerIndex: 1,
            explanation:
              "Fluent confabulation follows from the next-token objective itself; tuning trims it but can't remove the incentive.",
          },
        ]}
      />
    </>
  );
}
