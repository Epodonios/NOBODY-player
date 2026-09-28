/* ————————————————— LRC UTILITIES —————————————————
   Shared lyric helpers. parseLrc used to live inside App.tsx; it moved here
   so the Download Center (and any future module) can parse fetched .lrc
   content without importing the app shell. Behavior is byte-for-byte
   identical to the original implementation. */

import type { LyricLine } from "./types";

export function parseLrc(source: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const timeTag = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  source.split(/\r?\n/).forEach((row) => {
    const text = row.replace(timeTag, "").trim();
    if (!text) return;
    const matches = [...row.matchAll(timeTag)];
    matches.forEach((match) => {
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, "0")}`) : 0;
      lines.push({ time: Number(match[1]) * 60 + Number(match[2]) + fraction, text });
    });
  });
  return lines.sort((a, b) => a.time - b.time);
}

/** Builds a plain-text preview from synced lyrics (for candidate lists). */
export function previewFromSynced(source: string, maxLines = 6): string[] {
  return source
    .split(/\r?\n/)
    .map((row) => row.replace(/^\[[^\]]*\]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, maxLines);
}
