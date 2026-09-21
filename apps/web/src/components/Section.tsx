import type { ReactNode } from "react";

/**
 * A numbered section: a rule drawn across the page, a mono marker,
 * then the claim. Structure is carried by the rule and the space,
 * never by a box around the content.
 */
export default function Section({
  index,
  eyebrow,
  title,
  note,
  id,
  children,
  className = "",
}: {
  index?: string;
  eyebrow: string;
  title?: ReactNode;
  note?: ReactNode;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 ${className}`}>
      <div className="border-t border-ink pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <p className="label text-accent-deep">
            {index && <span className="text-ink-faint">{index} </span>}
            {eyebrow}
          </p>
          {note && (
            <p className="font-mono text-[0.6875rem] text-ink-faint">{note}</p>
          )}
        </div>
        {title && <h2 className="claim mt-5 max-w-3xl">{title}</h2>}
        <div className="mt-9">{children}</div>
      </div>
    </section>
  );
}
