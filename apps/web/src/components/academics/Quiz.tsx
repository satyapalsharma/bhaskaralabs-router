"use client";

import { useEffect, useState } from "react";
import { getQuizBest, recordQuizResult } from "./progress";

export type QuizQuestion = {
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation?: string;
};

export default function Quiz({
  id,
  title = "Check your understanding",
  questions,
}: {
  // Stable per-article quiz id, e.g. "tokenization-101". Used as the
  // localStorage key for progress; renaming it resets saved scores.
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
    setBest(getQuizBest(id));
  }, [id]);

  if (questions.length === 0) return null;

  const answered = selected.filter((s) => s !== null).length;
  const score = questions.filter((q, i) => selected[i] === q.answerIndex).length;

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
      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-zinc-100">{title}</h3>
        <p className="text-xs text-zinc-600">
          {best ? `Best on this device: ${best.best}/${best.total} · ` : null}
          Progress saves on this device only
        </p>
      </div>

      <ol className="mt-5 space-y-6">
        {questions.map((q, qi) => {
          const pick = selected[qi];
          return (
            <li key={qi}>
              <p className="text-sm font-medium text-zinc-200">
                <span className="mr-2 text-zinc-600">{qi + 1}.</span>
                {q.prompt}
              </p>
              <div className="mt-2.5 space-y-2" role="radiogroup" aria-label={q.prompt}>
                {q.choices.map((choice, ci) => {
                  const isPick = pick === ci;
                  const isAnswer = ci === q.answerIndex;
                  let cls =
                    "border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-600";
                  if (submitted && isAnswer)
                    cls = "border-emerald-500/60 bg-emerald-500/10 text-zinc-100";
                  else if (submitted && isPick && !isAnswer)
                    cls = "border-red-500/60 bg-red-500/10 text-zinc-100";
                  else if (isPick) cls = "border-amber-500/70 bg-amber-500/10 text-zinc-100";
                  return (
                    <button
                      key={ci}
                      type="button"
                      role="radio"
                      aria-checked={isPick}
                      disabled={submitted}
                      onClick={() => choose(qi, ci)}
                      className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${cls}`}
                    >
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px]">
                        {isPick ? "●" : ""}
                      </span>
                      <span>{choice}</span>
                    </button>
                  );
                })}
              </div>
              {submitted && q.explanation ? (
                <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
                  {q.explanation}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={submit}
            disabled={answered < questions.length}
            className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Check answers
            {answered < questions.length
              ? ` (${answered}/${questions.length} answered)`
              : ""}
          </button>
        ) : (
          <>
            <p className="text-sm text-zinc-200" role="status">
              Score: <strong>{score}/{questions.length}</strong>
              {score === questions.length ? " — clean sweep." : ""}
            </p>
            <button
              type="button"
              onClick={retry}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
            >
              Retry
            </button>
          </>
        )}
      </div>
    </section>
  );
}
