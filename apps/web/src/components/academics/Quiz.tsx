"use client";

import { useEffect, useState } from "react";
import { getQuizBest, recordQuizResult } from "./progress";

export type QuizQuestion = {
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
};

/**
 * Quiz. Reads as part of the article rather than as a widget: the
 * questions are a numbered list, the choices are ruled rows, and the
 * result is stated in a line of text. State is carried by an icon and
 * a label as well as colour.
 */
export default function Quiz({
  id,
  title = "Check your understanding",
  questions,
}: {
  // Stable per-article quiz id. Used as the localStorage key; renaming it
  // resets saved scores for this quiz.
  id: string;
  title?: string;
  questions: QuizQuestion[];
}) {
  const [selected, setSelected] = useState<Array<number | null>>(() =>
    questions.map(() => null),
  );
  const [submitted, setSubmitted] = useState(false);
  const [best, setBest] = useState<{ best: number; total: number } | null>(null);

  useEffect(() => {
    // Post-mount read: localStorage is unavailable during SSR, so the first
    // render is always "no saved score" and hydration stays consistent.
    const hydrate = async () => {
      setBest(getQuizBest(id));
    };
    void hydrate();
  }, [id]);

  if (questions.length === 0) return null;

  const answered = selected.filter((s) => s !== null).length;
  const score = questions.filter((q, i) => selected[i] === q.answerIndex).length;
  const complete = score === questions.length;

  function choose(qi: number, ci: number) {
    if (submitted) return;
    setSelected((prev) => prev.map((s, i) => (i === qi ? ci : s)));
  }

  function submit() {
    if (answered < questions.length) return;
    setSubmitted(true);
    const result = recordQuizResult(id, score, questions.length);
    setBest(result.quizzes[id] ?? null);
  }

  function retry() {
    setSelected(questions.map(() => null));
    setSubmitted(false);
  }

  return (
    <section
      aria-label={title}
      className="mt-14 border-t-2 border-ink pt-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 className="subhead">{title}</h2>
        <p className="font-mono text-[0.6875rem] text-ink-faint">
          {best ? `best ${best.best}/${best.total} · ` : ""}
          saved on this device
        </p>
      </div>

      <ol className="mt-8 space-y-9">
        {questions.map((q, qi) => {
          const pick = selected[qi];
          return (
            <li key={qi}>
              <p className="measure text-[0.9375rem] font-medium text-ink">
                <span className="mr-3 font-mono text-[0.8125rem] text-ink-faint">
                  {String(qi + 1).padStart(2, "0")}
                </span>
                {q.prompt}
              </p>

              <div
                className="mt-4 space-y-px border-y border-rule"
                role="radiogroup"
                aria-label={q.prompt}
              >
                {q.choices.map((choice, ci) => {
                  const isPick = pick === ci;
                  const isAnswer = ci === q.answerIndex;
                  const state = submitted
                    ? isAnswer
                      ? "ok"
                      : isPick
                        ? "wrong"
                        : "idle"
                    : "idle";

                  return (
                    <button
                      key={ci}
                      type="button"
                      role="radio"
                      aria-checked={isPick}
                      disabled={submitted}
                      onClick={() => choose(qi, ci)}
                      className={`flex w-full items-start gap-4 border-b border-rule-faint px-4 py-3 text-left text-[0.9375rem] transition-colors last:border-b-0 disabled:cursor-default ${
                        state === "ok"
                          ? "bg-ok-soft text-ink"
                          : state === "wrong"
                            ? "bg-danger-soft text-ink"
                            : isPick
                              ? "bg-accent-soft text-ink"
                              : "text-ink-soft enabled:hover:bg-sunken"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`mt-[0.3rem] flex h-4 w-4 shrink-0 items-center justify-center border font-mono text-[0.625rem] leading-none ${
                          state === "ok"
                            ? "border-ok text-ok"
                            : state === "wrong"
                              ? "border-danger text-danger"
                              : isPick
                                ? "border-accent bg-accent text-accent-ink"
                                : "border-rule-strong text-transparent"
                        }`}
                      >
                        {state === "ok" ? "✓" : state === "wrong" ? "×" : "•"}
                      </span>
                      <span>{choice}</span>
                      {submitted && isAnswer && (
                        <span className="label ml-auto self-center text-ok">
                          Correct
                        </span>
                      )}
                      {submitted && isPick && !isAnswer && (
                        <span className="label ml-auto self-center text-danger">
                          Your answer
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {submitted && q.explanation && (
                <p className="measure mt-3 text-[0.875rem] leading-relaxed text-ink-mute">
                  {q.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-9 flex flex-wrap items-center gap-4">
        {!submitted ? (
          <>
            <button
              type="button"
              onClick={submit}
              disabled={answered < questions.length}
              className="btn btn-primary"
            >
              Check answers
            </button>
            <span className="font-mono text-[0.75rem] text-ink-faint">
              {answered} of {questions.length} answered
            </span>
          </>
        ) : (
          <>
            <p role="status" className="text-[0.9375rem] text-ink">
              {score} of {questions.length} correct
              {complete && (
                <span className="ml-3 tag tag-ok">
                  <span className="dot" />
                  Clean sweep
                </span>
              )}
            </p>
            <button type="button" onClick={retry} className="btn btn-outline">
              Try again
            </button>
          </>
        )}
      </div>
    </section>
  );
}
