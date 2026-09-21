import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getArticle, isKnownSlug, listArticles } from "../_content/articles";
import { H1, Lead, Prose } from "@/components/academics/mdx-components";

export async function generateStaticParams() {
  const articles = await listArticles();
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Lesson not found" };
  return {
    title: article.meta.title,
    description: article.meta.abstract,
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isKnownSlug(slug)) notFound();
  const article = await getArticle(slug);
  if (!article) notFound();

  const Body = article.default;
  const all = await listArticles();
  const index = all.findIndex((a) => a.slug === slug);
  const next = index >= 0 ? all[index + 1] : undefined;

  return (
    <main className="mx-auto max-w-5xl px-5 sm:px-6">
      <div className="grid gap-12 py-14 sm:py-20 lg:grid-cols-[11rem_1fr] lg:gap-16">
        {/* Lesson rail */}
        <nav aria-label="Lesson" className="hidden lg:block">
          <div className="sticky top-24">
            <Link
              href="/academics"
              className="label text-ink-faint transition-colors hover:text-accent-deep"
            >
              ← All lessons
            </Link>
            <ol className="mt-5 space-y-3 border-l border-rule">
              {all.map((a, i) => {
                const current = a.slug === slug;
                return (
                  <li key={a.slug}>
                    <Link
                      href={`/academics/${a.slug}`}
                      aria-current={current ? "page" : undefined}
                      className={`flex gap-2 border-l-2 pl-3 text-[0.8125rem] leading-snug transition-colors ${
                        current
                          ? "border-accent text-ink"
                          : "border-transparent text-ink-faint hover:border-rule-strong hover:text-ink-soft"
                      }`}
                    >
                      <span className="num font-mono text-[0.6875rem]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span>{a.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>

        {/* Article */}
        <article className="min-w-0 max-w-[46rem]">
          <Link
            href="/academics"
            className="label text-ink-faint transition-colors hover:text-accent-deep lg:hidden"
          >
            ← All lessons
          </Link>

          <header className="mt-6 lg:mt-0">
            <p className="label text-accent-deep">
              Lesson {String(index + 1).padStart(2, "0")} ·{" "}
              {article.meta.readingMinutes} min
            </p>
            <div className="mt-6">
              <H1>{article.meta.title}</H1>
            </div>
            <Lead>{article.meta.abstract}</Lead>
          </header>

          <Prose>
            <Body />
          </Prose>

          {/* Continuation */}
          <nav
            aria-label="Lesson navigation"
            className="mt-16 border-t-2 border-ink pt-6"
          >
            {next ? (
              <Link
                href={`/academics/${next.slug}`}
                className="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2"
              >
                <span>
                  <span className="label block text-ink-faint">Next lesson</span>
                  <span className="subhead mt-3 block transition-colors group-hover:text-accent-deep">
                    {next.title}
                  </span>
                </span>
                <span className="num font-mono text-[0.75rem] text-ink-faint">
                  {next.readingMinutes} min →
                </span>
              </Link>
            ) : (
              <Link
                href="/academics"
                className="group flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2"
              >
                <span>
                  <span className="label block text-ink-faint">
                    End of the published series
                  </span>
                  <span className="subhead mt-3 block transition-colors group-hover:text-accent-deep">
                    Back to all lessons
                  </span>
                </span>
                <span className="font-mono text-[0.75rem] text-ink-faint">→</span>
              </Link>
            )}
          </nav>
        </article>
      </div>
    </main>
  );
}
