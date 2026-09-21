import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Typography for academics articles. The series is the reading surface
 * of the site, so it gets the most generous rhythm: serif headings,
 * measured prose, hairlines only where a pause is earned.
 *
 * Articles are authored as TSX modules under app/academics/_content using
 * these components. The keys in `mdxComponents` match MDX tag names, so if
 * @next/mdx is adopted later the same map can be passed straight through.
 */

type P = { children?: ReactNode; className?: string };

export function H1({ children }: P) {
  return <h1 className="display">{children}</h1>;
}

export function H2({ children }: P) {
  return (
    <h2 className="claim mt-14 border-t border-rule pt-8 first:mt-0 first:border-t-0 first:pt-0">
      {children}
    </h2>
  );
}

export function H3({ children }: P) {
  return <h3 className="subhead mt-9">{children}</h3>;
}

export function Para({ children }: P) {
  return (
    <p className="measure mt-5 text-[1.0625rem] leading-[1.75] text-ink-soft">
      {children}
    </p>
  );
}

export function Lead({ children }: P) {
  return (
    <p className="lede measure mt-6 text-[1.125rem]">{children}</p>
  );
}

export function UL({ children }: P) {
  return (
    <ul className="measure mt-5 space-y-3 pl-0 text-[1.0625rem] leading-[1.7] text-ink-soft">
      {children}
    </ul>
  );
}

export function OL({ children }: P) {
  return (
    <ol className="measure mt-5 list-decimal space-y-3 pl-5 text-[1.0625rem] leading-[1.7] text-ink-soft">
      {children}
    </ol>
  );
}

export function LI({ children }: ComponentPropsWithoutRef<"li">) {
  return (
    <li className="relative pl-5">
      {/* Hairline marker for unordered items. Ordered lists get the
          browser's own numerals, so the dash is hidden inside an ol. */}
      <span
        aria-hidden
        className="absolute left-0 top-[0.7em] h-px w-3 bg-accent [ol_&]:hidden"
      />
      {children}
    </li>
  );
}

export function BodyLink({ children, ...rest }: ComponentPropsWithoutRef<"a">) {
  return (
    <a className="prose-link" {...rest}>
      {children}
    </a>
  );
}

export function InlineCode({ children }: P) {
  return (
    <code className="whitespace-nowrap rounded-xs border border-rule bg-sunken px-1.5 py-0.5 font-mono text-[0.85em] text-ink">
      {children}
    </code>
  );
}

export function CodeBlock({ children }: P) {
  return (
    <div className="machine my-6 overflow-hidden">
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[0.8125rem] leading-relaxed text-machine-soft">
        {children}
      </pre>
    </div>
  );
}

export function Quote({ children }: P) {
  return (
    <blockquote className="measure my-6 border-l-2 border-accent pl-5">
      <div className="subhead text-ink">{children}</div>
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
    <aside className="my-8 border border-rule bg-panel p-5">
      {title && <p className="label text-accent-deep">{title}</p>}
      <div className="measure mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
        {children}
      </div>
    </aside>
  );
}

/**
 * A key figure worth isolating: one number or fact the reader should
 * carry away. Rendered as a filed fact rather than a shout.
 */
export function Fact({ children }: P) {
  return (
    <div className="my-7 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-y border-rule py-4">
      <span className="label text-ink-faint">Key fact</span>
      <span className="font-mono text-[0.9375rem] text-ink">{children}</span>
    </div>
  );
}

/** Wraps an article body with a consistent vertical rhythm. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="mt-12">{children}</div>;
}

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
