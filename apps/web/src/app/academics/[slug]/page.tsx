import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
  if (!article) return { title: "Not found — Academics — Bhaskara Labs" };
  return {
    title: `${article.meta.title} — Academics — Bhaskara Labs`,
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

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <a href="/academics" className="text-sm text-zinc-500 hover:text-zinc-300">
        ← All lessons
      </a>
      <div className="mt-4">
        <H1>{article.meta.title}</H1>
        <Lead>
          <span className="mt-2 block">
            ~{article.meta.readingMinutes} min read
          </span>
        </Lead>
      </div>
      <Prose>
        <Body />
      </Prose>
    </main>
  );
}
