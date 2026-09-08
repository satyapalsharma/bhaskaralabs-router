// Volatile-token masker (CacheAligner analog — our independent implementation).
//
// High-entropy volatile tokens (timestamps, UUIDs, full SHAs, PIDs in tmp
// paths, progress-bar spam) cost tokens on every turn AND defeat line-level
// dedup: two identical log lines with different timestamps never group.
// Masking them to short stable markers BEFORE the crushers run makes grouping
// dramatically more effective (same logical line → same bytes → collapses).
//
// HONEST SCOPE: this proxy is stateless — the client replays original history
// bytes next turn, so no server-side transform can extend cross-turn prefix
// cache hits. What this buys is (1) direct token savings (a 24-char timestamp
// becomes 4 chars, thousands of times per log) and (2) better crusher grouping.
// Progress-bar / spinner / counter spam lines: a line is "progress" iff it
// carries a progress SIGNAL and consists only of safe chars (no sentence
// punctuation like ,;:'"!? — so prose never matches). Collapse only affects
// runs of 4+ such lines; shorter runs pass through verbatim.
const PROGRESS_SIGNAL = /(\d{1,3}\s?%|\(\s?\d+\s?\/\s?\d+\s?\)|\bETA\b|it\/s|s\/it|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]|^\s*[│|█▓▒░#*=~.-]{4,})/;
const PROGRESS_SAFE = /^[\w\s│|█▓▒░\-=_#*~.()\[\]\/:+%⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+$/;
// INVARIANTS: pure function, deterministic, idempotent (mask(mask(x)) == mask(x)).

const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07/g;

// ISO/RFC timestamps + bare times + epoch-ms (range-checked, deterministic).
const TS_RE =
  /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?\b|\b\d{2}:\d{2}:\d{2}(\.\d{1,6})?\b|\b1[0-9]{12}\b/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// Full SHAs → 7-char short form + ellipsis (keeps git log utility, drops 33+ chars).
const SHA_RE = /\b[0-9a-f]{40}\b|\b[0-9a-f]{64}\b/gi;
// PIDs/run-ids inside volatile paths only (never bare numbers like file:123).
const VOLATILE_PATH_RE = /(\/(?:tmp|var\/folders|proc|run)(?:\/[^\s:]*)?)/g;

function maskPathDigits(p: string): string {
  return p.replace(/\d{3,}/g, "#");
}

export function maskVolatile(text: string): { text: string; masked: number } {
  let masked = 0;
  let out = text.replace(ANSI_RE, () => {
    masked++;
    return "";
  });
  out = out.replace(TS_RE, () => {
    masked++;
    return "<ts>";
  });
  out = out.replace(UUID_RE, () => {
    masked++;
    return "<uuid>";
  });
  out = out.replace(SHA_RE, (m) => {
    masked++;
    return `${m.slice(0, 7)}…`;
  });
  out = out.replace(VOLATILE_PATH_RE, (m) => {
    const maskedPath = maskPathDigits(m);
    if (maskedPath !== m) masked++;
    return maskedPath;
  });

  // Collapse runs of progress lines → first + last + count (RTK-style dedup).
  const lines = out.split("\n");
  if (lines.length >= 10) {
    const collapsed: string[] = [];
    let runStart = -1;
    const flushRun = (end: number) => {
      const runLen = end - runStart;
      if (runLen <= 3) {
        for (let i = runStart; i < end; i++) collapsed.push(lines[i]);
      } else {
        collapsed.push(lines[runStart]);
        collapsed.push(`… (${runLen - 2} progress lines collapsed)`);
        collapsed.push(lines[end - 1]);
        masked += runLen - 3;
      }
    };
    for (let i = 0; i <= lines.length; i++) {
      const isProgress = i < lines.length && lines[i].trim() !== "" && PROGRESS_SAFE.test(lines[i]) && PROGRESS_SIGNAL.test(lines[i]);
      if (isProgress && runStart < 0) runStart = i;
      if (!isProgress && runStart >= 0) {
        flushRun(i);
        runStart = -1;
      }
      if (!isProgress && i < lines.length) collapsed.push(lines[i]);
    }
    out = collapsed.join("\n");
  }
  return { text: out, masked };
}
