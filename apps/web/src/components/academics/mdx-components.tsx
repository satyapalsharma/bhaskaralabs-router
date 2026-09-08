import type { ComponentPropsWithoutRef, ReactNode } from "react";

// Typography primitives for academics articles. Articles are authored as TSX
// modules under app/academics/_content using these components directly, so no
// markdown compiler is needed. If `@next/mdx` is adopted later, pass this map
// as `components={mdxComponents}` — the tag keys already match MDX names.

type P = { children?: ReactNode; className?: string };

export function H1({ children }: P) {
  return <h1 className="text-3xl font-bold tracking-tight text-zinc-50">{children}</h1>;
}

export function H2({ children }: P) {
  return <h2 className="pt-4 text-xl font-semibold text-zinc-100">{children}</h2>;
}

export function H3({ children }: P) {
  return <h3 className="pt-2 text-base font-semibold text-zinc-100">{children}</h3>;
}

export function Para({ children }: P) {
  return <p className="leading-relaxed text-zinc-400">{children}</p>;
}

export function Lead({ children }: P) {
  return <p className="text-base leading-relaxed text-zinc-500">{children}</p>;
}

export function UL({ children }: P) {
  return <ul className="list-disc space-y-2 pl-6 text-zinc-400">{children}</ul>;
}

export function OL({ children }: P) {
  return <ol className="list-decimal space-y-2 pl-6 text-zinc-400">{children}</ol>;
}

export function LI({ children }: ComponentPropsWithoutRef<"li">) {
  return <li className="leading-relaxed">{children}</li>;
}

export function BodyLink({ children, ...rest }: ComponentPropsWithoutRef<"a">) {
  return (
    <a className="text-amber-400 underline hover:text-amber-300" {...rest}>
      {children}
    </a>
  );
}

export function InlineCode({ children }: P) {
  return (
    <code className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-200">
      {children}
    </code>
  );
}

export function CodeBlock({ children }: P) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 font-mono text-[13px] leading-relaxed text-zinc-200">
      {children}
    </pre>
  );
}

export function Quote({ children }: P) {
  return (
    <blockquote className="border-l-2 border-amber-500/60 pl-4 italic text-zinc-400">
      {children}
    </blockquote>
  );
}

export function Callout({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 text-sm">
      {title ? <p className="font-semibold text-zinc-100">{title}</p> : null}
      <div className="mt-1 leading-relaxed text-zinc-400">{children}</div>
    </div>
  );
}

// Wraps a full article body with consistent vertical rhythm.
export function Prose({ children }: { children: ReactNode }) {
  return <div className="mt-8 space-y-5 text-[15px]">{children}</div>;
}

// Tag map for a future MDX provider (`components={mdxComponents}`).
export const mdxComponents = {
  h1: H1,
  h2: H2,
  h3: H3,
  p: Para,
  ul: UL,
  ol: OL,
  li: LI,
  a: BodyLink,
  code: InlineCode,
  pre: CodeBlock,
  blockquote: Quote,
} as const;

export type MdxComponents = typeof mdxComponents;
