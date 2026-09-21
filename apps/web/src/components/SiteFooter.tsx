import Link from "next/link";
import Wordmark from "./Wordmark";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/plans", label: "Plans & pricing" },
      { href: "/plans#calculator", label: "Savings calculator" },
      { href: "/docs", label: "API documentation" },
      { href: "/docs#integrations", label: "Agent integrations" },
    ],
  },
  {
    heading: "Learn",
    links: [
      { href: "/academics", label: "Academics series" },
      { href: "/academics/tokens-tokenization", label: "Start with tokenization" },
      { href: "/docs#caching", label: "Caching rules" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    heading: "Disclosure",
    links: [
      { href: "/legal/training", label: "Training on traffic" },
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/refunds", label: "Refunds" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark />
            <p className="mt-4 max-w-xs text-[0.8125rem] leading-relaxed text-ink-mute">
              Frontier coding models behind two endpoint names, with the
              routing, the cache accounting and the cost ledger all in the open.
            </p>
            <p className="label mt-5 text-ink-faint">Hosted in India</p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h2 className="label text-ink-faint">{col.heading}</h2>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="text-[0.875rem] text-ink-soft transition-colors hover:text-accent-deep"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-rule-faint pt-6 text-[0.75rem] text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono">
            © {new Date().getFullYear()} Bhaskara Labs · built toward
            domain-specific small models for sensitive data
          </p>
          <p className="font-mono">
            Named for Bhāskara II · theta after Ramanujan&apos;s mock theta
            functions
          </p>
        </div>
      </div>
    </footer>
  );
}
