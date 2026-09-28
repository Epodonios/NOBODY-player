// ── NOBODY · library index (V1.2.0) ──────────────────────────────────────────
// Shared selectors for the 11 Library categories used by BOTH redesigned
// libraries (Cinematic tiles + EELA index). Pure functions over the library
// store — no React, so either UI can call them inside useMemo.
//
// Categories: All Songs · Folders · Subfolders · Albums · Album Artists ·
//             Artists · Years · Queue · Most Played · Longest · Favorites

import type { LibraryCategoryId, Track } from "../types";
import { LIKED_ID, useLibrary } from "../store/library";
import { useUi } from "../store/ui";

export const LIBRARY_CATEGORIES: LibraryCategoryId[] = [
  "songs",
  "folders",
  "subfolders",
  "albums",
  "albumArtists",
  "artists",
  "years",
  "queue",
  "mostPlayed",
  "longest",
  "favorites",
];

/** A named group of tracks (album / artist / folder / year …). */
export interface TrackGroup {
  key: string; // stable key
  label: string;
  /** Absolute folder path (folders/subfolders views) — lets UIs show a
   *  "/Music/…" style subtitle like the reference design. */
  path?: string;
  tracks: Track[];
}

export function allTracks(): Track[] {
  const lib = useLibrary.getState();
  return lib.order.map((id) => lib.tracks[id]).filter(Boolean);
}

// ── folders / subfolders ─────────────────────────────────────────────────────

function dirOf(tr: Track): string | null {
  const p = tr.filePath || tr.folderPath || "";
  if (!p) return null;
  const dir = p.replace(/[\\/][^\\/]+$/, "");
  return dir || null;
}

function normalizeSep(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Direct child folders of `root` (root "" = the drive roots). */
function childDirs(dirs: string[], root: string): string[] {
  const normRoot = root ? normalizeSep(root).replace(/\/$/, "") + "/" : "";
  const kids = new Set<string>();
  for (const d of dirs) {
    const nd = normalizeSep(d);
    if (normRoot && !nd.toLowerCase().startsWith(normRoot.toLowerCase())) continue;
    const rest = normRoot ? nd.slice(normRoot.length) : nd;
    if (!rest) continue;
    const first = rest.split("/")[0];
    if (first) kids.add(normRoot ? normRoot + first : first);
  }
  return [...kids];
}

/** Groups for the Folders category: the imported root folders (folderPath
 *  when present, else the batch a track came from). */
export function folderGroups(tracks: Track[]): TrackGroup[] {
  const byFolder = new Map<string, Track[]>();
  for (const tr of tracks) {
    const key = tr.folderPath || tr.batchId || "library";
    const arr = byFolder.get(key) || [];
    arr.push(tr);
    byFolder.set(key, arr);
  }
  return [...byFolder.entries()]
    .map(([key, list]) => ({
      key,
      label: key === "library" ? list[0]?.album || "Library" : key.split(/[\\/]/).pop() || key,
      path: key === "library" ? undefined : key,
      tracks: sortByTitle(list),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Groups for the Subfolders category: every directory that directly holds
 *  audio, EXCLUDING the import roots themselves. */
export function subfolderGroups(tracks: Track[]): TrackGroup[] {
  const dirs = new Map<string, Track[]>();
  for (const tr of tracks) {
    const d = dirOf(tr);
    if (!d) continue;
    const arr = dirs.get(d) || [];
    arr.push(tr);
    dirs.set(d, arr);
  }
  const roots = new Set(tracks.map((tr) => normalizeSep(tr.folderPath || "")).filter(Boolean));
  return [...dirs.entries()]
    .filter(([d]) => !roots.has(normalizeSep(d)))
    .map(([d, list]) => ({
      key: d,
      label: d.split(/[\\/]/).pop() || d,
      path: d,
      tracks: sortByTitle(list),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Subfolders that live directly under `root` (for folder drill-down). */
export function subfoldersUnder(tracks: Track[], root: string): TrackGroup[] {
  const dirs = new Map<string, Track[]>();
  for (const tr of tracks) {
    const d = dirOf(tr);
    if (!d) continue;
    const arr = dirs.get(d) || [];
    arr.push(tr);
    dirs.set(d, arr);
  }
  return childDirs([...dirs.keys()], root)
    .map((d) => {
      const prefix = normalizeSep(d).toLowerCase() + "/";
      const list = tracks.filter((tr) => {
        const td = dirOf(tr);
        return td && (normalizeSep(td).toLowerCase() + "/").startsWith(prefix);
      });
      return { key: d, label: d.split(/[\\/]/).pop() || d, path: d, tracks: sortByTitle(list) };
    })
    .filter((g) => g.tracks.length);
}

/** Tracks whose file lives directly in `dir` (no recursion). */
export function tracksInDir(tracks: Track[], dir: string): Track[] {
  const nd = normalizeSep(dir).toLowerCase();
  return sortByTitle(tracks.filter((tr) => {
    const d = dirOf(tr);
    return d && normalizeSep(d).toLowerCase() === nd;
  }));
}

// ── albums / album artists / artists / years ─────────────────────────────────

export function albumGroups(tracks: Track[], unknownLabel = "Unknown Album"): TrackGroup[] {
  return groupBy(tracks, (tr) => tr.album || unknownLabel);
}

export function artistGroups(tracks: Track[], unknownLabel = "Unknown Artist"): TrackGroup[] {
  return groupBy(tracks, (tr) => tr.artist || unknownLabel);
}

/** Album Artists: the primary (most frequent) artist of each album. */
export function albumArtistGroups(tracks: Track[], unknownLabel = "Unknown Artist"): TrackGroup[] {
  const byAlbum = new Map<string, Track[]>();
  for (const tr of tracks) {
    const a = tr.album || unknownLabel;
    const arr = byAlbum.get(a) || [];
    arr.push(tr);
    byAlbum.set(a, arr);
  }
  const artists = new Map<string, Track[]>();
  for (const list of byAlbum.values()) {
    const freq = new Map<string, number>();
    for (const tr of list) {
      const a = tr.artist || unknownLabel;
      freq.set(a, (freq.get(a) || 0) + 1);
    }
    let best = unknownLabel;
    let bestN = -1;
    for (const [a, n] of freq) {
      if (n > bestN) { best = a; bestN = n; }
    }
    const arr = artists.get(best) || [];
    arr.push(...list);
    artists.set(best, arr);
  }
  return [...artists.entries()]
    .map(([label, list]) => ({
      key: "aa:" + label,
      label,
      tracks: sortByTitle(list),
      path: [...new Set(list.map((tr) => tr.album).filter(Boolean))].slice(0, 3).join(" · ") || undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function yearGroups(tracks: Track[], unknownLabel = "—"): TrackGroup[] {
  const groups = groupBy(tracks, (tr) => (tr.year && String(tr.year).trim()) || unknownLabel);
  // newest first (numeric years), unknown last
  return groups.sort((a, b) => {
    const na = parseInt(a.label, 10);
    const nb = parseInt(b.label, 10);
    if (!isNaN(na) && !isNaN(nb)) return nb - na;
    if (!isNaN(na)) return -1;
    if (!isNaN(nb)) return 1;
    return b.label.localeCompare(a.label);
  });
}

function groupBy(tracks: Track[], keyOf: (tr: Track) => string): TrackGroup[] {
  const map = new Map<string, Track[]>();
  for (const tr of tracks) {
    const k = keyOf(tr);
    const arr = map.get(k) || [];
    arr.push(tr);
    map.set(k, arr);
  }
  return [...map.entries()]
    .map(([label, list]) => ({
      key: label,
      label,
      tracks: sortByTitle(list),
      path: list.length ? `${list.length}` : undefined,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── queue / most played / longest / favorites ────────────────────────────────

/** The LIVE queue in its true listen order (mirrored by the engine). */
export function queueTracks(): Track[] {
  const ui = useUi.getState();
  const lib = useLibrary.getState();
  const ids = ui.queueIds?.length ? ui.queueIds : [];
  return ids.map((id) => lib.tracks[id]).filter(Boolean);
}

export function mostPlayedTracks(tracks: Track[], minPlays = 1): Track[] {
  const counts = useLibrary.getState().playCounts;
  return tracks
    .filter((tr) => (counts[tr.id] || 0) >= minPlays)
    .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || a.title.localeCompare(b.title));
}

export function playCountOf(id: string): number {
  return useLibrary.getState().playCounts[id] || 0;
}

export function longestTracks(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => (b.duration || 0) - (a.duration || 0));
}

export function favoriteTracks(tracks: Track[]): Track[] {
  const lib = useLibrary.getState();
  const liked = new Set(lib.playlists.find((p) => p.id === LIKED_ID)?.trackIds ?? []);
  return tracks.filter((tr) => liked.has(tr.id));
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function sortByTitle(tracks: Track[]): Track[] {
  return [...tracks].sort((a, b) => a.title.localeCompare(b.title));
}

export function totalDuration(tracks: Track[]): number {
  return tracks.reduce((a, tr) => a + (tr.duration || 0), 0);
}
