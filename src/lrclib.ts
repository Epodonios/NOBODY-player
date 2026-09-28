/* ————————————————— LRCLIB.NET INTEGRATION —————————————————
   Thin client for the free, open, keyless LRCLIB API (https://lrclib.net).
   Docs / source: https://github.com/tranxuanthang/lrclib

   Endpoints used:
     GET https://lrclib.net/api/get?track_name=&artist_name=&album_name=&duration=
         Exact lookup. Best accuracy when duration (seconds) is supplied —
         LRCLIB matches within a small tolerance window.
     GET https://lrclib.net/api/search?track_name=&artist_name=
         Fuzzy search, returns an array of candidates. Used as a fallback
         when the exact lookup misses (e.g. slightly different album title).

   LRCLIB has no API key and (per their docs) no rate limiting, but recommends
   sending a descriptive User-Agent. On desktop we route requests through the
   CORS-free desktop transport (src/desktopHttp.ts): Electron → the
   allow-listed main-process proxy (net.fetch), Tauri → plugin-http — either
   way the request never touches browser CORS. On a plain web build we fall
   back to the normal fetch API. */

import { desktopFetch } from "./desktopHttp";

export type LrclibResult = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
};

const LRCLIB_USER_AGENT = "NobodyPlayer/1.0.0 (https://github.com/Epodonios/NOBODY-player)";
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => window.clearTimeout(timer) };
}

async function rawFetch(url: string, signal: AbortSignal): Promise<Response> {
  // The desktop proxy cannot honor an AbortSignal, so desktopFetch enforces
  // the SAME hard timeout with an internal race — a stuck request still
  // rejects (and the retry-with-backoff loop below still kicks in).
  return desktopFetch(url, {
    headers: { "User-Agent": LRCLIB_USER_AGENT },
    signal,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
}

/** Fetches with a hard timeout (so one stuck request can't hang the whole
 *  sync batch) and a couple of retries with backoff for transient failures
 *  (network hiccups, 502/503/504 from an overloaded/rate-limiting server).
 *  A real 404 (not found) is NOT retried — that's a normal, final answer. */
async function lrclibFetch(url: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
    try {
      const res = await rawFetch(url, signal);
      cancel();
      if (res.status === 404) return res;
      if (res.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
        continue;
      }
      return res;
    } catch (error) {
      cancel();
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => window.setTimeout(resolve, 700 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError ?? new Error("LRCLIB request failed");
}

/** Quick connectivity/health check against the LRCLIB API. */
export async function checkLrclibConnection(): Promise<boolean> {
  try {
    const { signal, cancel } = withTimeout(8000);
    const res = await rawFetch("https://lrclib.net/api/search?track_name=test", signal);
    cancel();
    return res.ok;
  } catch {
    return false;
  }
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/** Exact lookup by track/artist/album/duration. Returns null if not found. */
export async function getLrclibLyrics(query: {
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
}): Promise<LrclibResult | null> {
  const qs = buildQuery({
    track_name: query.trackName,
    artist_name: query.artistName,
    album_name: query.albumName,
    duration: query.duration ? Math.round(query.duration) : undefined,
  });
  try {
    const res = await lrclibFetch(`https://lrclib.net/api/get?${qs}`);
    if (!res.ok) return null;
    return (await res.json()) as LrclibResult;
  } catch {
    return null;
  }
}

/** Fuzzy search — used when the exact lookup misses. Returns an array. */
export async function searchLrclibLyrics(query: {
  trackName: string;
  artistName?: string;
}): Promise<LrclibResult[]> {
  const qs = buildQuery({ track_name: query.trackName, artist_name: query.artistName });
  try {
    const res = await lrclibFetch(`https://lrclib.net/api/search?${qs}`);
    if (!res.ok) return [];
    const data = (await res.json()) as LrclibResult[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Exact lookup first, falls back to the best fuzzy search match. */
export async function fetchLrclibLyrics(query: {
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
}): Promise<LrclibResult | null> {
  const exact = await getLrclibLyrics(query);
  if (exact && (exact.syncedLyrics || exact.plainLyrics || exact.instrumental)) return exact;

  const results = await searchLrclibLyrics({ trackName: query.trackName, artistName: query.artistName });
  const bestSynced = results.find((r) => r.syncedLyrics);
  if (bestSynced) return bestSynced;
  return results[0] ?? null;
}
