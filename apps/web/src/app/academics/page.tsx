import type { Metadata } from "next";
import Link from "next/link";
import { listArticles, ROADMAP } from "./_content/articles";

export const metadata: Metadata = {
  title: "Academics — how LLMs actually work",
  description:
    "A free, interactive series on how LLMs actually work, from tokenization to KV-cache economics. Lessons and quizzes as they are written, with an honest roadmap for the rest.",
};

export default async function AcademicsPage() {
  const published = await listArticles();
  const totalMinutes = published.reduce((s, a) => s + a.readingMinutes, 0);

  return (
    <main className="mx-auto max-w-5xl px-5 sm:px-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="py-14 sm:py-20">
        <p className="label text-accent-deep">Academics</p>
        <h1 className="display mt-6 max-w-4xl">How LLMs actually work</h1>
        <p className="lede measure mt-6">
          A free series written for students rather than buyers: what a model
          does with your text, why context costs what it costs, and where the
          engineering decisions behind this product come from. Each lesson ends
          with a short quiz.
        </p>

        <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-4 border-t border-rule pt-5">
          {[
            ["Lessons published", `${published.length}`],
            ["Reading, all lessons", `${totalMinutes} min`],
            ["Planned", `${published.length + ROADMAP.length}`],
            ["Cost", "Free"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="label text-ink-faint">{k}</dt>
              <dd className="num mt-2 font-mono text-[0.8125rem] text-ink-soft">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      {/* ── Published ─────────────────────────────────────────── */}
      <section aria-labelledby="lessons" className="pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-t border-ink pt-5">
          <h2 id="lessons" className="claim">
            Lessons
          </h2>
          <p className="font-mono text-[0.6875rem] text-ink-faint">
            quiz progress saves on this device only
          </p>
        </div>

        {published.length === 0 ? (
          <p className="measure mt-8 text-[0.9375rem] text-ink-mute">
            No lessons published yet. The planned series is below, and each item
            becomes a lesson with a quiz as it lands.
          </p>
        ) : (
          <ol className="mt-8">
            {published.map((a, i) => (
              <li key={a.slug}>
                <Link
                  href={`/academics/${a.slug}`}
                  className="group grid gap-x-6 gap-y-2 border-t border-rule py-6 transition-colors hover:bg-sunken sm:grid-cols-[3.5rem_1fr_auto] sm:items-baseline"
                >
                  <span className="label pt-1 text-ink-faint">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="subhead block transition-colors group-hover:text-accent-deep">
                      {a.title}
                    </span>
                    <span className="measure mt-2 block text-[0.9375rem] leading-relaxed text-ink-mute">
                      {a.abstract}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 sm:justify-end">
                    <span className="num font-mono text-[0.6875rem] text-ink-faint">
                      {a.readingMinutes} min
                    </span>
                    {a.quizIds.length > 0 && (
                      <span className="tag">
                        <span className="dot text-accent" />
                        Quiz
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ── Roadmap ───────────────────────────────────────────── */}
      <section aria-labelledby="planned" className="mt-20 pb-4">
        <div className="border-t border-ink pt-5">
          <h2 id="planned" className="claim">
            Planned modules
          </h2>
          <p className="measure mt-4 text-[0.9375rem] leading-relaxed text-ink-mute">
            Titles and one-line scope only. Nothing here is written yet, and we
            would rather show you an empty shelf than a stub.
          </p>
        </div>

        <ol className="mt-8">
          {ROADMAP.map((m, i) => (
            <li
              key={m.title}
              className="grid gap-x-6 gap-y-2 border-t border-rule py-6 sm:grid-cols-[3.5rem_1fr_auto] sm:items-baseline"
            >
              <span className="label pt-1 text-ink-faint">
                {String(published.length + i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="subhead block text-ink-mute">{m.title}</span>
                <span className="measure mt-2 block text-[0.9375rem] leading-relaxed text-ink-faint">
                  {m.abstract}
                </span>
              </span>
              <span className="tag sm:justify-self-end">Not written</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Close ─────────────────────────────────────────────── */}
      <section className="mt-20 border-t-2 border-ink pb-16 pt-8">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          <div className="min-w-0 lg:col-span-7">
            <h2 className="claim">Here to ship rather than to study?</h2>
            <p className="lede measure mt-4">
              The API docs cover the fastest path to a working request. The
              caching rules in there are the same ones these lessons explain.
            </p>
          </div>
          <div className="min-w-0 flex flex-wrap gap-3 lg:col-span-5 lg:justify-end">
            <Link href="/docs" className="btn btn-primary">
              Read the API docs
            </Link>
            <Link href="/plans" className="btn btn-outline">
              See the plans
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
