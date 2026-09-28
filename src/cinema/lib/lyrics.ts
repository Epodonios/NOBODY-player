// ── NOBODY · LRC parsing ─────────────────────────────────────────────────────

import type { LrcLine } from "../types";

const STAMP = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/** Parse LRC text → sorted, timestamped lines. Supports multiple stamps per
 *  line and the [offset:] global shift. Returns [] for plain text. */
export function parseLrc(text: string): LrcLine[] {
  const lines: LrcLine[] = [];
  let offset = 0;
  const offM = text.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (offM) offset = parseInt(offM[1], 10) / 1000;

  for (const raw of text.split(/\r?\n/)) {
    STAMP.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    while ((m = STAMP.exec(raw))) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const frac = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) / 1000 : 0;
      stamps.push(min * 60 + sec + frac);
    }
    if (!stamps.length) continue;
    const txt = raw.replace(STAMP, "").trim();
    for (const t of stamps) lines.push({ t: Math.max(0, t + offset), text: txt });
  }
  lines.sort((a, b) => a.t - b.t);
  return lines;
}

export function looksLikeLrc(text: string): boolean {
  return /\[\d{1,2}:\d{2}[.:]\d{1,3}\]/.test(text);
}
