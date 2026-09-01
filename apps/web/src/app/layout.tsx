import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bhaskara Labs — Frontier intelligence, honestly priced",
  description:
    "From the land that gave zero to the world — an attempt at solving the price-per-intelligence metric. Smart-routed GLM-5.3 and Qwen-3.8 APIs for coding agents.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased bg-zinc-950 text-zinc-100">
        <nav className="border-b border-zinc-800">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <a href="/" className="text-lg font-semibold tracking-tight">
              Bhaskara<span className="text-amber-500"> Labs</span>
            </a>
            <div className="hidden sm:flex items-center gap-6 text-sm text-zinc-400">
              <a href="/plans" className="hover:text-zinc-100 transition-colors">Plans</a>
              <a href="/academics" className="hover:text-zinc-100 transition-colors">Academics</a>
              <a
                href="/plans"
                className="rounded-md bg-amber-500 px-3 py-1.5 text-zinc-950 font-medium hover:bg-amber-400 transition-colors"
              >
                Get API Key
              </a>
            </div>
          </div>
        </nav>
        {children}
        <footer className="border-t border-zinc-800 mt-24">
          <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-zinc-500 flex flex-col sm:flex-row justify-between gap-2">
            <span>© {new Date().getFullYear()} Bhaskara Labs — building toward domain-specific small models for sensitive data.</span>
            <span>Named for Bhāskara II · theta after Ramanujan&apos;s mock theta functions</span>
          </div>
        </footer>
      </body>
    </html>
  );
}