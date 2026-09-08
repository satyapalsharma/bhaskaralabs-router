import type { Metadata } from "next";
import { listArticles, ROADMAP } from "./_content/articles";

export const metadata: Metadata = {
  title: "Academics — Bhaskara Labs",
  description:
    "A free, interactive series on how LLMs actually work. Lessons and quizzes as they are written — roadmap below.",
};

export default async function AcademicsPage() {
  const published = await listArticles();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs font-medium uppercase tracking-widest text-amber-500/90">
        Academics
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        How LLMs actually work
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
        A free, interactive series for students — from tokenization to KV-cache
        economics. Each lesson ends with a short quiz. Quiz progress saves in
        your browser (localStorage) on this device only; there is no account
        sync yet.
      </p>

      {/* Published lessons */}
      <section className="mt-12" aria-label="Published lessons">
        <h2 className="text-xl font-semibold">Lessons</h2>
        {published.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-800 p-6 text-sm leading-relaxed text-zinc-500">
            No lessons published yet — the first module is being written now.
            The planned series is below; each item becomes a lesson with a quiz
            as it lands.
          </div>
        ) : (
          <ol className="mt-4 space-y-3">
            {published.map((a, i) => (
              <li key={a.slug}>
                <a
                  href={`/academics/${a.slug}`}
                  className="block rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 transition-colors hover:border-zinc-600"
                >
                  <p className="text-xs text-zinc-600">
                    Lesson {i + 1} · ~{a.readingMinutes} min read
                    {a.quizIds.length > 0 ? " · quiz included" : ""}
                  </p>
                  <h3 className="mt-1 font-semibold text-zinc-100">{a.title}</h3>
                  <p className="mt-1 text-sm text-zinc-400">{a.abstract}</p>
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Roadmap — honest coming-soon list, no article stubs */}
      <section className="mt-14" aria-label="Coming soon">
        <h2 className="text-xl font-semibold">Coming soon</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Planned modules, in rough order. Titles and one-line scope only —
          nothing here is written yet.
        </p>
        <ol className="mt-4 space-y-3">
          {ROADMAP.map((m, i) => (
            <li
              key={m.title}
              className="flex gap-4 rounded-xl border border-zinc-800/70 p-5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-zinc-700 text-sm font-semibold text-zinc-500">
                {published.length + i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-zinc-200">
                  {m.title}{" "}
                  <span className="ml-1 rounded-full border border-zinc-700 px-2 py-0.5 align-middle text-[11px] font-normal text-zinc-500">
                    Coming soon
                  </span>
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                  {m.abstract}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-12 text-sm text-zinc-500">
        Here to ship? The{" "}
        <a href="/docs" className="text-amber-400 underline hover:text-amber-300">
          API docs
        </a>{" "}
        cover the fastest path to a working request.
      </p>
    </main>
  );
}
