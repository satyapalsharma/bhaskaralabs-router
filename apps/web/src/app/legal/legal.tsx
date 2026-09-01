import type { ReactNode } from "react";

export function LegalPage({
  title,
  effective,
  children,
}: {
  title: string;
  effective: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-zinc-500">Effective {effective} · Questions: legal@bhaskaralabs.com</p>
      <div className="legal-body mt-10 space-y-8">{children}</div>
    </main>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-zinc-100">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}