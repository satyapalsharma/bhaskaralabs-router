import type { ComponentType } from "react";

// Article loader for the academics series. Published articles live in this
// directory as TSX modules exporting `meta` plus a default component:
//
//   // my-slug.tsx
//   export const meta = { slug: "my-slug", title: "…", abstract: "…",
//     readingMinutes: 8, quizIds: ["my-slug-quiz"] };
//   export default function MySlug() { … }
//
// Then register the slug in `loaders` below. The [slug] route and the index
// page both read through this module — never import _content files directly.

export type ArticleMeta = {
  slug: string;
  title: string;
  abstract: string;
  readingMinutes: number;
  quizIds: string[];
};

export type ArticleModule = {
  meta: ArticleMeta;
  default: ComponentType;
};

// No lessons published yet — slugs register here as articles land.
const loaders: Record<string, () => Promise<ArticleModule>> = {};

export function isKnownSlug(slug: string): boolean {
  return slug in loaders;
}

export async function getArticle(slug: string): Promise<ArticleModule | null> {
  const load = loaders[slug];
  if (!load) return null;
  return load();
}

export async function listArticles(): Promise<ArticleMeta[]> {
  const entries = await Promise.all(
    Object.entries(loaders).map(async ([, load]) => (await load()).meta),
  );
  return entries.sort((a, b) => a.slug.localeCompare(b.slug));
}

// Modules planned for the series. Titles + one-line abstracts only —
// no article stubs, no research claims. A module moves from here to
// `loaders` (above) when its article is actually written.
export type RoadmapModule = {
  title: string;
  abstract: string;
};

export const ROADMAP: RoadmapModule[] = [
  {
    title: "Tokens & tokenization",
    abstract: "How raw text becomes token IDs, and why that shapes context limits and cost.",
  },
  {
    title: "How transformers read",
    abstract: "Embeddings, attention, and the forward pass, explained without assuming an ML background.",
  },
  {
    title: "Training at a glance",
    abstract: "What pre-training and fine-tuning do — and what they can't fix.",
  },
  {
    title: "Inference & the KV cache",
    abstract: "What happens per token at serving time, and why session shape matters.",
  },
  {
    title: "Prompt caching in practice",
    abstract: "Stable prefixes, append-only sessions, and reading hit-rate headers on our API.",
  },
  {
    title: "Evals, safety & limits",
    abstract: "How models are measured, where they fail, and how to use them responsibly.",
  },
];
