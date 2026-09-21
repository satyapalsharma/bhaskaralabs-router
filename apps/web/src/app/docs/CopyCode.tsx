"use client";

import { useState } from "react";

/**
 * Code on the machine face. The label and the copy control sit in
 * the readout header, the code itself is the panel body.
 */
export default function CopyCode({
  lang,
  label,
  children,
}: {
  lang: string;
  label?: string;
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked (insecure origin, permissions). The text
      // stays selectable, so this is not worth an error state.
    }
  };

  return (
    <div className="machine my-4 overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-machine-rule px-4 py-2">
        <span className="label text-machine-mute">
          {label ?? lang}
        </span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[0.6875rem] text-machine-mute transition-colors hover:text-machine-ink"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-mono text-[0.75rem] leading-relaxed text-machine-soft">
        <code>{children}</code>
      </pre>
    </div>
  );
}
