// ── small utilities ───────────────────────────────────────────────────────────

import { desktopFetch } from "../../desktopHttp";

/* Task 30 — full parity with the classic walker's AUDIO_RE
 * (src/desktopLibrary.ts): the new-UI importers used to reject whole classes
 * of files (oga/alac/ape/caf/dsf/mpc/3gp/amr/mp4) the classic app accepts. */
export const AUDIO_EXT = /\.(mp3|flac|ogg|oga|opus|m4a|aac|wav|webm|wma|aif|aiff|alac|ape|caf|dsf|mpc|3gp|amr|mp4|mka)$/i;
export const AUDIO_MIME = /^(audio\/|application\/(ogg|x-flac))/i;

export function isAudioFile(name: string, type?: string) {
  return AUDIO_EXT.test(name) || (!!type && AUDIO_MIME.test(type));
}

/** FNV-1a hash → base36 — stable track ids from file identity. */
export function hashId(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function trackIdFromFile(f: { name: string; size: number; lastModified: number }) {
  return hashId(`${f.name}:${f.size}:${f.lastModified}`);
}

/** Deterministic PRNG from a string seed. */
export function prng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** binary search: index of last line with t <= time */
export function activeLineIndex(lines: { t: number }[], time: number): number {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= time) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return Math.max(0, ans);
}

/** tiny pub/sub */
export class Emitter<E extends string = string> {
  private map = new Map<E, Set<(p?: any) => void>>();
  on(ev: E, fn: (p?: any) => void) {
    if (!this.map.has(ev)) this.map.set(ev, new Set());
    this.map.get(ev)!.add(fn);
    return () => this.off(ev, fn);
  }
  off(ev: E, fn: (p?: any) => void) {
    this.map.get(ev)?.delete(fn);
  }
  emit(ev: E, p?: any) {
    this.map.get(ev)?.forEach((fn) => { try { fn(p); } catch { /* noop */ } });
  }
}

/** Run async tasks with bounded concurrency (2–4 as per spec). */
export async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const cur = i++;
      await fn(items[cur], cur);
    }
  });
  await Promise.all(workers);
}

/** Transport-aware fetch with a hard timeout. Remote http(s) URLs go through
 *  the desktop transport (src/desktopHttp.ts): Electron → allow-listed
 *  main-process proxy (no CORS), Tauri → plugin-http — so Smart Fetch lyrics
 *  (LRCLIB) and covers (iTunes/Deezer + their CDNs) keep working after the
 *  Electron migration. Local blob:/data: URLs stay on plain fetch. */
export function fetchWithTimeout(url: string, ms = 9000, init?: RequestInit) {
  if (!/^https?:/i.test(url)) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(to));
  }
  return desktopFetch(url, {
    method: init?.method,
    headers: init?.headers as Record<string, string> | undefined,
    body: typeof init?.body === "string" ? init.body : undefined,
    timeoutMs: ms,
  });
}

export function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function pluralize(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}
