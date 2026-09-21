// Fault watcher for a live test run.
//
// Prints one line per NEW fault event in the gateway log, deduped and with a
// repeat counter, so a lane that starts failing reads as "×40" instead of forty
// identical lines. Informational events (routing choices, dud rescues) are
// deliberately not faults and stay out of the stream.
//
//   bun apps/gateway/scripts/tail-faults.ts <log-path>

import { openSync, readSync, statSync, closeSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: tail-faults.ts <log-path>");
  process.exit(2);
}

// Anything matching this is a fault the operator should see. Kept as a named
// list rather than an inline regex so "what counts as broken" is reviewable.
const FAULT_EVENTS = [
  "lane-error",
  "lane-failover",
  "dud-escalation",
  "de-escalation",
  "upstream-error",
  "compaction-failed",
  "compaction-seam",
  "orphan",
  "quota-reject",
  "trial-velocity",
  "unidentified-client",
  "skill-error",
];

const seen = new Map<string, number>();

function poll(): void {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }
  if (size <= offset) {
    // Truncated or rotated — restart from the top rather than silently stalling.
    if (size < offset) offset = 0;
    return;
  }
  const fd = openSync(path, "r");
  const buf = Buffer.alloc(size - offset);
  readSync(fd, buf, 0, buf.length, offset);
  closeSync(fd);
  offset = size;

  for (const raw of buf.toString("utf8").split("\n")) {
    if (!raw.trim()) continue;
    let line = raw;
    // The gateway writes JSON lines; stderr lines are prefixed by the runner.
    const jsonStart = line.indexOf("{");
    if (jsonStart > 0) line = line.slice(jsonStart);

    let ev = "";
    let status = "";
    let cause = "";
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      ev = typeof parsed.ev === "string" ? parsed.ev : "";
      status = typeof parsed.status === "number" ? String(parsed.status) : "";
      cause = typeof parsed.cause === "string" ? parsed.cause : typeof parsed.detail === "string" ? parsed.detail : "";
    } catch {
      if (!/error|fail|orphan|exception/i.test(raw)) continue;
      ev = "stderr";
      cause = raw.trim().slice(0, 160);
    }

    if (!ev || !FAULT_EVENTS.some((f) => ev.toLowerCase().includes(f))) continue;

    const key = `${ev}|${status}|${cause.slice(0, 80)}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) {
      process.stdout.write(`  [${ev}${status ? " " + status : ""}] ×${n}\n`);
    } else {
      process.stdout.write(`  [${ev}${status ? " " + status : ""}] ${cause.slice(0, 140) || "(no cause field)"}\n`);
    }
  }
}

let offset = 0;
try {
  offset = statSync(path).size;
  console.log(`watching ${path} from offset ${offset}`);
} catch {
  console.log(`watching ${path} (not created yet)`);
}

setInterval(poll, 3000);
