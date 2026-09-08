// Live-zone compression dispatcher (headroom-inspired, our port).
//
// THE RULE: compress only the LIVE ZONE — everything after the last assistant
// message (fresh tool results + the current user prompt). Everything before it
// (system, tools, settled history) is the frozen prefix — byte-identical across
// turns so the provider cache survives. Compression never touches it.
//
// Content routing: JSON arrays → SmartCrusher (unmasked, value-aware);
// everything else → volatile-mask first, then git → GitCrusher,
// grep rows → SearchCrusher, logs → LogCrusher, large prose → DensityCrusher
// (last resort). Secrets redacted on any touched block. Below byte
// thresholds → untouched. Self-checks inside each crusher guarantee
// original text on no-benefit.
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
    const result = routeAndCompress(msg.content);
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

function routeAndCompress(text: string): { text: string; transformer: string } {
  const trimmed = text.trim();
  const applied: string[] = [];
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
    // Volatile-token mask (CacheAligner analog): canonicalize timestamps,
    // UUIDs, full SHAs and progress spam BEFORE type routing, so grouping
    // crushers see stable bytes and collapse harder. Pure + deterministic.
    working = trimmed;
    if (trimmed.length >= MIN_VOLATILE_BYTES) {
      const m = maskVolatile(trimmed);
      if (m.text !== trimmed) {
        working = m.text;
        applied.push(`volatile(${m.masked})`);
      }
    }
    const w = working;
    if (looksLikeGitOutput(w) && w.length >= MIN_GIT_BYTES) {
      const r = gitCrush(w);
      if (r.kept >= 0) {
        working = r.text;
        applied.push(`gitcrusher(${r.total}→${r.kept})`);
      }
    } else if (looksLikeGrepOutput(w) && w.length >= MIN_GREP_BYTES) {
      const r = searchCrush(w);
      if (r.kept >= 0) {
        working = r.text;
        applied.push(`searchcrusher(${r.total}→${r.kept})`);
      }
    } else if (looksLikeLogOutput(w) && w.length >= MIN_LOG_BYTES) {
      const r = logCrush(w);
      if (r.kept >= 0) {
        working = r.text;
        applied.push(`logcrusher(${r.total}→${r.kept})`);
      }
    } else if (w.length >= MIN_DENSITY_BYTES) {
      const r = densityCrush(w);
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

  if (working === text) return { text, transformer: "none" };
  return { text: working, transformer: applied.join("+") || "none" };
}