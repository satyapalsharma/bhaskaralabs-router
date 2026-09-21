import type { ReactNode } from "react";

/**
 * Legal / FAQ shell. A reading surface: one measured column, serif
 * headings, hairline section rules, no boxes.
 */
export function LegalPage({
  title,
  effective,
  lede,
  children,
}: {
  title: string;
  effective: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
      <header>
        <p className="label text-accent-deep">Legal</p>
        <h1 className="claim mt-6">{title}</h1>
        {lede && <p className="lede mt-5">{lede}</p>}
        <p className="mt-6 border-t border-rule pt-4 font-mono text-[0.6875rem] text-ink-faint">
          Effective {effective} · Questions: legal@bhaskaralabs.com
        </p>
      </header>
      <div className="mt-14 space-y-12">{children}</div>
    </main>
  );
}

export function Section({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="subhead border-t border-rule pt-5">{heading}</h2>
      <div className="mt-4 space-y-4 text-[0.9375rem] leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}
