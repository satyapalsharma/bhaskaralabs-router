/**
 * The mark is a ring: a drawn zero. The company is named for the
 * mathematician whose treatise first treated zero as a number with
 * rules, and the product's whole promise is a cost that approaches
 * it. Everything else on the site is notation and evidence.
 */
export default function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        viewBox="0 0 24 24"
        width="17"
        height="17"
        aria-hidden
        className="shrink-0 text-accent"
      >
        <circle
          cx="12"
          cy="12"
          r="8.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.6"
        />
      </svg>
      <span className="font-serif text-[1.0625rem] font-semibold leading-none tracking-[-0.012em] text-ink">
        Bhaskara
        {!compact && <span className="text-accent"> Labs</span>}
      </span>
    </span>
  );
}
