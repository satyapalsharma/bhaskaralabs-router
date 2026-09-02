// Live-zone compression dispatcher (headroom-inspired, our port).
//
// THE RULE: compress only the LIVE ZONE — everything after the last assistant
// message (fresh tool results + the current user prompt). Everything before it
// (system, tools, settled history) is the frozen prefix — byte-identical across
// turns so the provider cache survives. Compression never touches it.
//
// Content routing: JSON arrays → SmartCrusher; grep output → SearchCrusher;
// log/build output → LogCrusher. Below byte thresholds → untouched.
// Self-checks inside each crusher guarantee original text on no-benefit.
//
// CACHE STABILITY: crushers are pure functions → when the live zone later
// becomes prefix (client re-sends it next turn), identical input bytes produce
// identical compressed bytes → the forwarded prefix never mutates → cache hits hold.

import type { ChatMessage } from "../prefix";
import { smartCrush, looksLikeJsonArray } from "./smart-crusher";
import { logCrush, searchCrush, looksLikeGrepOutput, looksLikeLogOutput } from "./crushers";

const MIN_JSON_BYTES = 1024; // 1 KiB — below this, savings don't justify bytes change
const MIN_LOG_BYTES = 2048; // 2 KiB
const MIN_GREP_BYTES = 1024;

export interface LiveZoneStats {
  enabled: boolean;
  blocksCompressed: number;
  bytesBefore: number;
  bytesAfter: number;
  transformers: string[];
}

export function compressLiveZone(messages: ChatMessage[]): { messages: ChatMessage[]; stats: LiveZoneStats } {
  const stats: LiveZoneStats = { enabled: true, blocksCompressed: 0, bytesBefore: 0, bytesAfter: 0, transformers: [] };
  if (messages.length === 0) return { messages, stats };

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
    out[i] = { ...msg, content: result.text };
  }
  return { messages: out, stats };
}

function routeAndCompress(text: string): { text: string; transformer: string } {
  const trimmed = text.trim();

  // JSON first (most structured, safest wins)
  if (looksLikeJsonArray(trimmed) && trimmed.length >= MIN_JSON_BYTES) {
    const r = smartCrush(trimmed);
    if (r.kept >= 0) return { text: r.text, transformer: `smartcrusher(${r.total}→${r.kept})` };
  }
  // grep output
  if (looksLikeGrepOutput(trimmed) && trimmed.length >= MIN_GREP_BYTES) {
    const r = searchCrush(trimmed);
    if (r.kept >= 0) return { text: r.text, transformer: `searchcrusher(${r.total}→${r.kept})` };
  }
  // logs
  if (looksLikeLogOutput(trimmed) && trimmed.length >= MIN_LOG_BYTES) {
    const r = logCrush(trimmed);
    if (r.kept >= 0) return { text: r.text, transformer: `logcrusher(${r.total}→${r.kept})` };
  }
  return { text, transformer: "none" };
}