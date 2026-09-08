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

// Module 1 published 2026-09-08 (foundations). Slugs register here as
// articles land; generateStaticParams + index read through this table.
const loaders: Record<string, () => Promise<ArticleModule>> = {
  "tokens-tokenization": () => import("./tokens-tokenization"),
  "how-transformers-read": () => import("./how-transformers-read"),
  "training-at-a-glance": () => import("./training-at-a-glance"),
  "inference-kv-cache": () => import("./inference-kv-cache"),
  "prompt-caching-practice": () => import("./prompt-caching-practice"),
  "evals-safety-limits": () => import("./evals-safety-limits"),
};

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

export type RoadmapModule = {
  title: string;
  abstract: string;
};

export const ROADMAP: RoadmapModule[] = [
  {
    title: "Prefill, decode & serving economics",
    abstract: "Quantization, batching, and speculative decoding — where serving cost really goes.",
  },
  {
    title: "Agents that act",
    abstract: "Tool calling, RAG, and multi-agent patterns — plus supervising agents with real permissions.",
  },
  {
    title: "Reasoning models & distillation",
    abstract: "What test-time reasoning buys, and how small models inherit big ones' skills.",
  },
  {
    title: "Fine-tuning for your domain",
    abstract: "When prompting stops being enough: SFT data, evals, and honest expectations.",
  },
];
