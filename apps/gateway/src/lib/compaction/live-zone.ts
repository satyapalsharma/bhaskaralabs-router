// Live-zone compression dispatcher (headroom-inspired, our port).
//
// THE RULE: compress only the LIVE ZONE — everything after the last assistant
// message (fresh tool results + the current user prompt). Everything before it
// (system, tools, settled history) is the frozen prefix — byte-identical across
// turns so the provider cache survives. Compression never touches it.
//
// Content routing: JSON arrays → SmartCrusher; git → GitCrusher; grep rows →
// SearchCrusher; logs → LogCrusher; large prose in a user turn →
// DensityCrusher (last resort). Secrets redacted on any block of 1 KiB or
// more. Below byte thresholds → untouched. Self-checks inside each crusher
// guarantee original text on no-benefit.
//
// THE OTHER RULE: a block no crusher accepts is forwarded BYTE-IDENTICAL —
// same bytes, same leading and trailing whitespace. Source files, configs and
// prompts are what an agent quotes back in an `edit`/`apply_patch`; one
// rewritten character there is a failed edit or a corrupted file. Concretely:
//   • The volatile mask is a routing VIEW (so a timestamp-led log is not
//     mistaken for grep rows) and is consumed by the LogCrusher only. Git and
//     grep output are crushed from the original text: status paths, diff
//     bodies and grep rows are code. A masked block is never forwarded on its
//     own — `<ts>` in place of a fixture's timestamp is not a saving.
//   • DensityCrusher never runs on role "tool". A tool result may be a file
//     read of anything — source, config, README — and neither its content nor
//     the tool's name (`read`, `view`, `bash` running `cat`) can rule that
//     out. On role "user" it runs only on text density.ts recognises as
//     prose, which keeps pasted code, conflict prompts and harness-embedded
//     files out (see looksLikeProse).
//
// CACHE STABILITY: crushers are pure functions → when the live zone later
// becomes prefix (client re-sends it next turn), identical input bytes produce
// identical compressed bytes → the forwarded prefix never mutates → cache hits hold.

import type { ChatMessage } from "../prefix";
import { smartCrush, looksLikeJsonArray } from "./smart-crusher";
import { logCrush, searchCrush, looksLikeGrepOutput, looksLikeLogOutput } from "./crushers";
import { gitCrush, looksLikeGitOutput } from "./git-crusher";
import { densityCrush } from "./density";
import { maskVolatile } from "./volatile";
import { redactSecrets } from "./secrets";

const MIN_JSON_BYTES = 1024; // 1 KiB — below this, savings don't justify bytes change
const MIN_LOG_BYTES = 2048; // 2 KiB
const MIN_GREP_BYTES = 1024;
const MIN_GIT_BYTES = 1024;
const MIN_DENSITY_BYTES = 4096; // last resort only — prose drops are lossy
const MIN_VOLATILE_BYTES = 1024;

export interface LiveZoneStats {
  enabled: boolean;
  blocksCompressed: number;
  bytesBefore: number;
  bytesAfter: number;
  transformers: string[];
}

export interface CrushedPair { index: number; transformer: string; original: string; crushed: string }

export function compressLiveZone(
  messages: ChatMessage[],
  opts?: { dryRun?: boolean },
): { messages: ChatMessage[]; stats: LiveZoneStats; pairs?: CrushedPair[] } {
  const stats: LiveZoneStats = { enabled: true, blocksCompressed: 0, bytesBefore: 0, bytesAfter: 0, transformers: [] };
  const pairs: CrushedPair[] = [];
  if (messages.length === 0) return { messages, stats, pairs: opts?.dryRun ? pairs : undefined };

  // live zone floor: everything strictly after the last assistant message
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  const out = messages.slice();
  for (let i = lastAssistantIdx + 1; i < out.length; i++) {
    const msg = out[i];
    if (msg.role !== "user" && msg.role !== "tool") continue;
    if (typeof msg.content !== "string") continue;
    if (msg.content.length < MIN_JSON_BYTES) continue;
    const result = routeAndCompress(msg.content, msg.role);
    if (result.text === msg.content) continue;
    stats.blocksCompressed++;
    stats.bytesBefore += msg.content.length;
    stats.bytesAfter += result.text.length;
    stats.transformers.push(result.transformer);
    if (opts?.dryRun) {
      // Measure-only: record the pair for keep-audit, forward bytes untouched.
      pairs.push({ index: i, transformer: result.transformer, original: msg.content, crushed: result.text });
      continue;
    }
    out[i] = { ...msg, content: result.text };
  }
  return { messages: opts?.dryRun ? messages : out, stats, pairs: opts?.dryRun ? pairs : undefined };
}

function routeAndCompress(text: string, role: "user" | "tool"): { text: string; transformer: string } {
  const trimmed = text.trim();
  const applied: string[] = [];
  // Stays the caller's exact bytes until a crusher accepts the block.
  let working = text;

  // JSON first (most structured, safest wins) — deliberately UNMASKED:
  // smartCrush is value-aware and exact values may matter downstream.
  if (looksLikeJsonArray(trimmed) && trimmed.length >= MIN_JSON_BYTES) {
    const r = smartCrush(trimmed);
    if (r.kept >= 0) {
      working = r.text;
      applied.push(`smartcrusher(${r.total}→${r.kept})`);
    }
  } else {
    // Volatile-token mask (CacheAligner analog): timestamps, UUIDs, full SHAs
    // and progress spam canonicalized. Type routing reads this view; only the
    // LogCrusher forwards it (see THE OTHER RULE). Pure + deterministic.
    const m = trimmed.length >= MIN_VOLATILE_BYTES ? maskVolatile(trimmed) : { text: trimmed, masked: 0 };
    const view = m.text;
    if (looksLikeGitOutput(view) && view.length >= MIN_GIT_BYTES) {
      // Not `trimmed`: the leading blank of a first " M path" row is a status column.
      const r = gitCrush(text.replace(/^(?:[ \t]*\r?\n)+/, "").trimEnd());
      if (r.kept >= 0) {
        working = r.text;
        applied.push(`gitcrusher(${r.total}→${r.kept})`);
      }
    } else if (looksLikeGrepOutput(view) && view.length >= MIN_GREP_BYTES) {
      const r = searchCrush(trimmed);
      if (r.kept >= 0) {
        working = r.text;
        applied.push(`searchcrusher(${r.total}→${r.kept})`);
      }
    } else if (looksLikeLogOutput(view) && view.length >= MIN_LOG_BYTES) {
      const r = logCrush(view);
      if (r.kept >= 0) {
        working = r.text;
        if (view !== trimmed) applied.push(`volatile(${m.masked})`);
        applied.push(`logcrusher(${r.total}→${r.kept})`);
      }
    } else if (role === "user" && trimmed.length >= MIN_DENSITY_BYTES) {
      const r = densityCrush(trimmed);
      if (r.kept >= 0) {
        working = r.text;
        applied.push(`density(${r.total}→${r.kept})`);
      }
    }
  }

  // Secrets redacted on any block we forward (privacy, not compression).
  const s = redactSecrets(working);
  if (s.redacted > 0) {
    working = s.text;
    applied.push(`redact(${s.redacted})`);
  }

  if (applied.length === 0) return { text, transformer: "none" };
  return { text: working, transformer: applied.join("+") };
}
