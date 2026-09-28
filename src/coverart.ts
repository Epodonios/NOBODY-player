/* ————————————————— COVER ART FETCHING —————————————————
   For tracks with no embedded artwork, look up a high-resolution cover
   from free, keyless public catalogs — the same "just works, no signup"
   spirit as the LRCLIB integration.

   Primary:  iTunes Search API (https://itunes.apple.com/search)
             No key, no auth. Returns a 100x100 thumbnail URL that can be
             upsized simply by replacing the size segment in the URL
             (a long-standing, widely-used trick — Apple's CDN serves
             whatever resolution is requested up to the source size).
   Fallback: Deezer API (https://api.deezer.com/search)
             Also keyless for public catalog search. Returns cover_xl
             (1000x1000) directly.

   On desktop we route through the CORS-free desktop transport
   (src/desktopHttp.ts): Electron → the allow-listed main-process proxy
   (net.fetch), Tauri → plugin-http — either way the request never touches
   browser CORS (both APIs are picky about cross-origin browser fetches).
   On a plain web build we fall back to normal fetch. */

import { desktopFetch } from "./desktopHttp";

const REQUEST_TIMEOUT_MS = 10000;

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => window.clearTimeout(timer) };
}

async function resilientFetch(url: string): Promise<Response> {
  const { signal, cancel } = withTimeout(REQUEST_TIMEOUT_MS);
  try {
    // Same hard-timeout contract as before; the desktop proxy enforces it
    // via its internal race (it cannot honor the AbortSignal itself).
    return await desktopFetch(url, { signal, timeoutMs: REQUEST_TIMEOUT_MS });
  } finally {
    cancel();
  }
}

async function searchITunes(artist: string, title: string): Promise<string | null> {
  const term = encodeURIComponent(`${artist} ${title}`);
  try {
    const res = await resilientFetch(`https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const artwork: string | undefined = data?.results?.[0]?.artworkUrl100;
    if (!artwork) return null;
    // Upsize the thumbnail — Apple's artwork CDN serves any requested
    // resolution up to the source image's size.
    return artwork.replace(/\/\d+x\d+bb\.(jpg|png)$/i, "/1200x1200bb.$1");
  } catch {
    return null;
  }
}

async function searchDeezer(artist: string, title: string): Promise<string | null> {
  const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
  try {
    const res = await resilientFetch(`https://api.deezer.com/search?q=${q}`);
    if (!res.ok) return null;
    const data = await res.json();
    const cover: string | undefined = data?.data?.[0]?.album?.cover_xl || data?.data?.[0]?.album?.cover_big;
    return cover || null;
  } catch {
    return null;
  }
}

/** Resolves a high-resolution cover art URL for a track, trying iTunes
 *  first and falling back to Deezer. Returns null if neither has a match. */
export async function findCoverArtUrl(artist: string, title: string): Promise<string | null> {
  const fromItunes = await searchITunes(artist, title);
  if (fromItunes) return fromItunes;
  return searchDeezer(artist, title);
}

/** Downloads the actual image bytes for a resolved cover URL, along with
 *  its file extension (for saving to disk next to the audio file). */
export async function downloadCoverArt(url: string): Promise<{ bytes: Uint8Array; ext: string } | null> {
  try {
    const res = await resilientFetch(url);
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    return { bytes: new Uint8Array(buffer), ext };
  } catch {
    return null;
  }
}

/* ————————— COVER CANDIDATE SEARCH (Download Center) —————————
   The one-shot findCoverArtUrl() answers "give me A cover"; the Download
   Center's manual picker needs "show me EVERY plausible cover so the user
   can choose". Queries iTunes and Deezer in parallel and returns a
   deduplicated candidate grid. */

export type CoverCandidate = {
  url: string;
  thumbUrl: string;
  source: "iTunes" | "Deezer";
  albumName: string;
};

export async function searchCoverArtCandidates(
  artist: string,
  title: string,
  limitPerSource = 6,
): Promise<CoverCandidate[]> {
  const term = encodeURIComponent(`${artist} ${title}`.trim());
  const deezerQuery = encodeURIComponent(`artist:"${artist}" track:"${title}"`.trim());

  const [itunesData, deezerData] = await Promise.all([
    resilientFetch(
      `https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=${limitPerSource}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null),
    resilientFetch(`https://api.deezer.com/search?q=${deezerQuery}&limit=${limitPerSource}`)
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null),
  ]);

  const candidates: CoverCandidate[] = [];
  const seen = new Set<string>();
  const push = (candidate: CoverCandidate) => {
    if (!candidate.url || seen.has(candidate.url)) return;
    seen.add(candidate.url);
    candidates.push(candidate);
  };

  if (Array.isArray(itunesData?.results)) {
    for (const row of itunesData.results as Array<Record<string, unknown>>) {
      const artwork = typeof row.artworkUrl100 === "string" ? row.artworkUrl100 : "";
      if (!artwork) continue;
      push({
        url: artwork.replace(/\/\d+x\d+bb\.(jpg|png)$/i, "/1200x1200bb.$1"),
        thumbUrl: artwork.replace(/\/\d+x\d+bb\.(jpg|png)$/i, "/200x200bb.$1"),
        source: "iTunes",
        albumName: typeof row.collectionName === "string" ? row.collectionName : "",
      });
    }
  }

  if (Array.isArray(deezerData?.data)) {
    for (const row of deezerData.data as Array<Record<string, unknown>>) {
      const album = (row.album ?? {}) as Record<string, unknown>;
      const cover = typeof album.cover_xl === "string" ? album.cover_xl : typeof album.cover_big === "string" ? album.cover_big : "";
      if (!cover) continue;
      push({
        url: cover,
        thumbUrl:
          typeof album.cover_medium === "string" ? album.cover_medium : cover,
        source: "Deezer",
        albumName: typeof album.title === "string" ? album.title : "",
      });
    }
  }

  return candidates;
}
