"use client";

import { useState } from "react";

export default function CopyCode({ lang, children }: { lang: string; children: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="group relative mt-3">
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-zinc-800 bg-zinc-900/80 px-3 py-1.5">
        <span className="text-[10px] uppercase tracking-widest text-zinc-500">{lang}</span>
        <button onClick={copy} className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors">
          {copied ? "copied ✓" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-b-lg border border-zinc-800 bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-200">
        <code>{children}</code>
      </pre>
    </div>
  );
}