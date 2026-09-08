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
  slug: "evals-safety-limits",
  title: "Evals, safety & limits",
  abstract:
    "How models are measured, where they fail, and how to use them responsibly.",
  readingMinutes: 7,
  quizIds: ["evals-safety-limits-quiz"],
};

export default function EvalsSafetyLimits() {
  return (
    <>
      <Para>
        Final lesson of module one: how the field keeps score, what the
        guardrails do and don&apos;t do, and the failure modes you must design
        around.
      </Para>

      <H2>How models are measured</H2>
      <UL>
        <LI>
          <strong>Knowledge & reasoning benchmarks</strong> (MMLU, GPQA) —
          multiple-choice exams. Cheap, saturated, and gameable: training on
          near-duplicates of test items (contamination) inflates scores
          without improving ability.
        </LI>
        <LI>
          <strong>Agentic benchmarks</strong> (SWE-bench) — can the model fix
          real issues in real repos, judged by tests? Far more informative
          for coding tools — and far more expensive to run.
        </LI>
        <LI>
          <strong>Human preference arenas</strong> — blind A/B votes on open
          prompts. Capture taste and usefulness, inherit human biases
          (verbosity wins more often than it should).
        </LI>
      </UL>
      <Para>
        Read any single number with the recipe in mind: <em>what task, what
        judge, what contamination controls?</em> A 5-point gap means nothing
        without that context.
      </Para>

      <H2>Safety: what guardrails are</H2>
      <Para>
        Refusals, content filters, and safety fine-tuning shape <em>which</em>{" "}
        behaviors surface — they don&apos;t remove the underlying
        capabilities (recall the training lesson: manners, not brain
        surgery). Jailbreaks — prompts engineered to bypass refusals — work
        often enough that you should treat any safety property as
        probabilistic, never as a guarantee your system can rely on.
      </Para>
      <Quote>
        Never build a control that fails open on model obedience. If harm
        follows from the model complying, the control belongs outside the
        model — in code, permissions, and human review.
      </Quote>

      <H2>Limits to design around</H2>
      <UL>
        <LI>
          <strong>Hallucination is structural.</strong> Fluency ≠ truth.
          Anything load-bearing (prices, doses, commands that delete) gets
          verified against a source of truth, not a second sampling.
        </LI>
        <LI>
          <strong>Long context degrades judgment.</strong> Retrieval survives
          scale better than reasoning does — models find the needle and still
          fumble the synthesis. Keep the working set small; summarize or
          retrieve rather than dumping.
        </LI>
        <LI>
          <strong>Tool use needs supervision.</strong> Agents that can act
          (shell, payments, merges) need the same controls as junior
          engineers with production access: scopes, dry-runs, and review
          gates on irreversible actions.
        </LI>
      </UL>
      <Callout title="Our position (plainly stated)">
        Bhaskara Labs trains on customer data only with visible opt-out, and
        our docs say so on the plans page. Sensitive-data customers should
        assume any vendor-hosted model sees what you send — route accordingly,
        and ask us (or anyone) for the no-training enterprise tier when it
        matters.
      </Callout>

      <Quiz
        id="evals-safety-limits-quiz"
        questions={[
          {
            prompt: "A model leads a benchmark by 3 points. Before updating your priors, you ask…",
            choices: [
              "What task, what judge, what contamination controls?",
              "What font the report used?",
              "How many parameters it has?",
            ],
            answerIndex: 0,
            explanation:
              "Benchmark numbers are meaningless without task, judge, and contamination context.",
          },
          {
            prompt: "Why can't refusal training be your only safety control for an agent with shell access?",
            choices: [
              "Refusals are too slow",
              "Jailbreaks bypass refusals often enough that safety must live outside the model too",
              "Shells don't understand refusals",
            ],
            answerIndex: 1,
            explanation:
              "Safety tuning shapes surfaced behavior probabilistically — irreversible actions need code-level controls.",
          },
          {
            prompt: "Which scales worse with context length: finding a fact, or synthesizing an answer from many facts?",
            choices: [
              "Finding a fact",
              "Synthesizing across many facts",
              "Both scale identically",
            ],
            answerIndex: 1,
            explanation:
              "Retrieval holds up; multi-step synthesis over long contexts degrades — keep working sets small.",
          },
        ]}
      />
    </>
  );
}
