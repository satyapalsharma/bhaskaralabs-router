"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Wordmark from "./Wordmark";

const LINKS = [
  { href: "/plans", label: "Plans" },
  { href: "/docs", label: "Docs" },
  { href: "/academics", label: "Academics" },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  // The menu belongs to the route it was opened on: navigating anywhere
  // (link, back button) derives it closed without an effect.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPath(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const ctaHref = signedIn ? "/dashboard" : "/login";
  const ctaLabel = signedIn ? "Dashboard" : "Get a key";

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-5 sm:px-6">
        <Link
          href="/"
          className="rounded-xs"
          aria-label="Bhaskara Labs — home"
        >
          <Wordmark />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden items-center gap-7 sm:flex"
        >
          {LINKS.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative py-1 text-[0.875rem] transition-colors ${
                  active
                    ? "text-ink"
                    : "text-ink-mute hover:text-ink"
                }`}
              >
                {l.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-[calc(0.25rem+1px)] h-[2px] bg-accent"
                  />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link href={ctaHref} className="btn btn-primary btn-sm">
            {ctaLabel}
          </Link>
          <button
            type="button"
            onClick={() => setOpenPath(open ? null : pathname)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="btn btn-outline btn-sm sm:hidden"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden
            >
              {open ? (
                <path d="M4 4l8 8M12 4l-8 8" />
              ) : (
                <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Primary"
          className="border-t border-rule sm:hidden"
        >
          <div className="mx-auto flex max-w-6xl flex-col px-5 py-1">
            {LINKS.map((l) => {
              const active = isActive(pathname, l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-between border-b border-rule-faint py-3.5 text-[0.9375rem] last:border-b-0 ${
                    active ? "text-ink" : "text-ink-soft"
                  }`}
                >
                  {l.label}
                  {active && <span className="dot text-accent" />}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
