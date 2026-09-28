// ── NOBODY · Smart Fetch ─────────────────────────────────────────────────────
// Automatic enrichment against free, keyless public APIs — for EVERY UI
// (cinema / EELA / ALOK) with EXACTLY the classic app's semantics:
//   lyrics  → src/lrclib.ts (same UA header, same /api/get + /api/search
//             flow, same selection rule: exact → first synced → first result;
//             plain lyrics are saved but NEVER auto-applied as synced;
//             instrumental answers surface as their own status)
//   covers  → src/coverart.ts (iTunes media=music + artwork upscale, Deezer
//             fallback, blob-size sanity guard)
// Pool of 3 (lyrics) / 2 (covers) concurrent requests like the classic sync
// modals. Job state lives in a module-level store so it survives navigation.
//
// Task 30 — unification: this engine used to re-implement the endpoints
// inline (different selection rule, no instrumental status, no sidecar
// option). It now wraps the classic fetch clients DIRECTLY and adds the
// classic Download Center's persistence options:
//   { skipExisting, autoApply, saveToDisk } persisted at
//   "nobody.smartFetch.options.v1" and exposed on the store via setOptions.
// Sidecar writes (song.lrc / song.jpg next to the audio) reuse
// desktopLibrary.saveLrcFile / saveCoverImage; in pure-web builds they fall
// back to anchor downloads with sanitized filenames.

import { create } from "zustand";
import { db } from "./db";
import { parseLrc } from "./lyrics";
import { invalidateCover } from "./covers";
import { useLibrary } from "../store/library";
import { pool } from "./utils";
import {
  bridgePatchTrack,
  bridgePutCover,
  getBridge,
  sourcePathFromSourceUrl,
} from "./desktopBridge";
import { saveCoverImage, saveLrcFile } from "../../desktopLibrary";
import {
  checkLrclibConnection,
  getLrclibLyrics,
  searchLrclibLyrics,
  fetchLrclibLyrics,
  type LrclibResult,
} from "../../lrclib";
import {
  downloadCoverArt,
  findCoverArtUrl,
  searchCoverArtCandidates,
  type CoverCandidate,
} from "../../coverart";
import type { FetchItem, FetchStatus, Track } from "../types";

export type FetchMode = "lyrics" | "covers";

/* ── options ──────────────────────────────────────────────────────────────── */

export interface SmartFetchOptions {
  /** Don't re-fetch tracks that already have real data. */
  skipExisting: boolean;
  /** Write fetched lyrics/covers into the library (classic mirror + IDB).
   *  When false, fetched data is only persisted to disk sidecars. */
  autoApply: boolean;
  /** Save sidecar files (.lrc / .jpg) next to the audio when its real path
   *  is known; anchor-download when it isn't (pure-web). */
  saveToDisk: boolean;
}

const OPTIONS_KEY = "nobody.smartFetch.options.v1";
const DEFAULT_OPTIONS: SmartFetchOptions = { skipExisting: true, autoApply: true, saveToDisk: false };

function loadOptions(): SmartFetchOptions {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return { ...DEFAULT_OPTIONS };
    const parsed = JSON.parse(raw) as Partial<SmartFetchOptions>;
    return {
      skipExisting: typeof parsed.skipExisting === "boolean" ? parsed.skipExisting : DEFAULT_OPTIONS.skipExisting,
      autoApply: typeof parsed.autoApply === "boolean" ? parsed.autoApply : DEFAULT_OPTIONS.autoApply,
      saveToDisk: typeof parsed.saveToDisk === "boolean" ? parsed.saveToDisk : DEFAULT_OPTIONS.saveToDisk,
    };
  } catch {
    return { ...DEFAULT_OPTIONS };
  }
}

function persistOptions(options: SmartFetchOptions) {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
  } catch {
    /* storage full — the in-memory copy still rules this session */
  }
}

/** Scope spec: the legacy string ("all" | batchId | folderPath) or an object
 *  form. Object scopes are PER CALL — nothing is written back to the store,
 *  which is what fixes the ALOK "fetch clobbers my scope" behavior. */
export type SmartFetchScopeSpec =
  | string
  | { folderPath?: string; batchId?: string; trackIds?: string[] };

export interface SmartFetchRunOpts {
  mode?: FetchMode;
  scope?: SmartFetchScopeSpec;
  options?: Partial<SmartFetchOptions>;
}

interface SmartFetchStore {
  open: boolean;
  minimized: boolean;
  mode: FetchMode;
  scope: string; // "all" | batchId | folderPath
  /* skipExisting kept as its own field for the older panels that toggle it
   * directly; autoApply/saveToDisk round out the classic Download Center
   * option set. All three persist to localStorage via setOptions. */
  skipExisting: boolean;
  autoApply: boolean;
  saveToDisk: boolean;
  items: FetchItem[];
  running: boolean;
  done: number;
  summaryShown: boolean;

  setOpen: (v: boolean) => void;
  setMinimized: (v: boolean) => void;
  setMode: (m: FetchMode) => void;
  setScope: (s: string) => void;
  setSkipExisting: (v: boolean) => void;
  setOptions: (patch: Partial<SmartFetchOptions>) => void;
}

const bootOptions = loadOptions();

export const useSmartFetch = create<SmartFetchStore>((set, get) => ({
  open: false,
  minimized: false,
  mode: "lyrics",
  scope: "all",
  skipExisting: bootOptions.skipExisting,
  autoApply: bootOptions.autoApply,
  saveToDisk: bootOptions.saveToDisk,
  items: [],
  running: false,
  done: 0,
  summaryShown: false,
  setOpen: (open) => set({ open, minimized: false }),
  setMinimized: (minimized) => set({ minimized }),
  setMode: (mode) => set({ mode }),
  setScope: (scope) => set({ scope }),
  setSkipExisting: (skipExisting) => {
    set({ skipExisting });
    persistOptions({ skipExisting, autoApply: get().autoApply, saveToDisk: get().saveToDisk });
  },
  setOptions: (patch) => {
    const next: SmartFetchOptions = {
      skipExisting: patch.skipExisting ?? get().skipExisting,
      autoApply: patch.autoApply ?? get().autoApply,
      saveToDisk: patch.saveToDisk ?? get().saveToDisk,
    };
    persistOptions(next);
    set(next);
  },
}));

let cancelled = false;

function setItems(updater: (items: FetchItem[]) => FetchItem[]) {
  useSmartFetch.setState((s) => ({ items: updater(s.items) }));
}

function setStatus(trackId: string, status: FetchStatus, detail?: string) {
  setItems((items) => items.map((it) => (it.trackId === trackId ? { ...it, status, detail, gen: it.gen + 1 } : it)));
  if (status === "saved" || status === "notfound" || status === "error" || status === "instrumental") {
    useSmartFetch.setState((s) => ({ done: s.done + 1 }));
  }
}

/* ── persistence primitives ───────────────────────────────────────────────── */

function sanitizeFilename(name: string): string {
  const clean = (name || "nobody")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return clean || "nobody";
}

/** Pure-web fallback for "save to disk": blob + anchor download. */
function anchorDownload(data: Blob | string, filename: string, mime = "application/octet-stream") {
  try {
    const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFilename(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch {
    /* best-effort — the library mirror still holds the data */
  }
}

/** Resolve the audio's real absolute path from the classic bridge (decodes
 *  app:// source URLs). Null in pure-web / blob-source situations. */
function audioPathFor(trackId: string): string | null {
  return sourcePathFromSourceUrl(getBridge()?.resolveSource(trackId) ?? null);
}

/** Write a fetched lyric payload through the SAME path as the classic app:
 *  classic-library patch → IDB mirror → optional sidecar .lrc. Plain lyrics
 *  are saved to the library but NEVER auto-applied as synced lyrics (classic
 *  parity — a .lrc without timestamps is useless to the karaoke view). */
async function persistFetchedLyrics(
  track: Track,
  patch: Partial<Track>,
  rawLrc: string | null,
  options: SmartFetchOptions,
): Promise<void> {
  const srcPath = audioPathFor(track.id);

  // 1) sidecar .lrc next to the audio (opt-in via saveToDisk) — classic parity
  if (options.saveToDisk && srcPath && rawLrc) {
    try {
      await saveLrcFile(srcPath, rawLrc);
    } catch {
      /* read-only folder etc. — the in-library patch below still holds */
    }
  } else if (options.saveToDisk && !srcPath && rawLrc) {
    // pure-web fallback: anchor-download the .lrc with a sanitized name
    anchorDownload(rawLrc, `${sanitizeFilename(track.artist)} - ${sanitizeFilename(track.title)}.lrc`, "text/plain; charset=utf-8");
  }

  // 2) library write-back (autoApply): classic owns bridged tracks, the IDB
  //    mirror keeps the standalone view alive until the next rehydrate
  if (options.autoApply) {
    bridgePatchTrack({ ...track, ...patch } as Track);
    useLibrary.getState().patchTrack(track.id, patch);
  }
}

/** Write fetched cover bytes through the same persistence chain. */
async function persistFetchedCover(
  track: Track,
  bytes: Uint8Array,
  ext: string,
  options: SmartFetchOptions,
): Promise<void> {
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  // The cast only bridges TS 5.9's stricter ArrayBufferLike variance.
  const blob = new Blob([bytes as unknown as BlobPart], { type });

  if (options.autoApply) {
    // 1) classic-library write-back (persists across restarts in bridge mode)
    bridgePutCover(track.id, blob);
    // 2) local mirror (also the standalone path when not bridged)
    await db.putCover(track.id, blob).catch(() => void 0);
    invalidateCover(track.id);
    useLibrary.getState().patchTrack(track.id, { hasCover: true, isPlaceholderCover: false });
  }

  // 3) sidecar image next to the audio (opt-in via saveToDisk)
  if (options.saveToDisk) {
    const srcPath = audioPathFor(track.id);
    if (srcPath) {
      try {
        await saveCoverImage(srcPath, bytes, ext);
      } catch {
        /* read-only folder etc. */
      }
    } else {
      anchorDownload(blob, `${sanitizeFilename(track.artist)} - ${sanitizeFilename(track.title)}.${ext}`);
    }
  }
}

/* ── fetchers (classic parity) ────────────────────────────────────────────── */

type FetchOutcome = "saved" | "plain" | "instrumental" | "notfound";

async function fetchLyricsFor(track: Track, options: SmartFetchOptions): Promise<FetchOutcome> {
  // Same client, same selection rule as the classic app: exact lookup →
  // first synced search hit → first search result. NO "any synced from a
  // fuzzy match" looseness.
  const result: LrclibResult | null = await fetchLrclibLyrics({
    trackName: track.title,
    artistName: track.artist,
    albumName: track.album && track.album !== "Unknown Album" ? track.album : undefined,
    duration: track.duration || undefined,
  });
  if (!result) return "notfound";
  if (result.instrumental && !result.syncedLyrics && !result.plainLyrics) return "instrumental";

  const patch: Partial<Track> = {};
  let rawLrc: string | null = null;
  if (result.syncedLyrics) {
    const lines = parseLrc(result.syncedLyrics);
    if (lines.length) {
      patch.syncedLyrics = lines;
      patch.hasEmbeddedLyrics = true;
      rawLrc = result.syncedLyrics;
    }
  }
  if (!patch.syncedLyrics && result.plainLyrics) {
    // saved (as plain) but never auto-applied as synced
    patch.plainLyrics = result.plainLyrics;
    patch.hasEmbeddedLyrics = true;
  }
  if (!patch.syncedLyrics && !patch.plainLyrics) return "notfound";
  await persistFetchedLyrics(track, patch, rawLrc, options);
  return patch.syncedLyrics ? "saved" : "plain";
}

async function fetchCoverFor(track: Track, options: SmartFetchOptions): Promise<FetchOutcome> {
  // Classic flow: iTunes (media=music, artwork upscaled to 1200x1200) →
  // Deezer cover_xl fallback → size sanity guard (reject tiny/error blobs).
  const url = await findCoverArtUrl(track.artist, track.title);
  if (!url) return "notfound";
  const art = await downloadCoverArt(url);
  if (!art || art.bytes.byteLength <= 1000) return "notfound";
  await persistFetchedCover(track, art.bytes, art.ext, options);
  return "saved";
}

function eligible(track: Track, mode: FetchMode, skip: boolean): boolean {
  if (!skip) return true;
  if (mode === "lyrics") return !(track.syncedLyrics?.length || track.plainLyrics);
  /* V1.2.0: in bridge mode the placeholder flag comes from the classic
   * library — trust it exactly like the classic fetch did (the old check
   * re-fetched covers the classic library already had when the mirror lagged). */
  return track.isPlaceholderCover || !track.hasCover;
}

/** Resolve the run's targets from a scope spec without touching the store. */
function resolveTargets(scope: SmartFetchScopeSpec, mode: FetchMode, skip: boolean): Track[] {
  const lib = useLibrary.getState();
  let list: Track[] = lib.order.map((id) => lib.tracks[id]).filter((tr): tr is Track => Boolean(tr));
  if (typeof scope === "string") {
    list = scope === "all" ? list : list.filter((tr) => tr.batchId === scope || (tr.folderPath && tr.folderPath === scope));
  } else if (scope && typeof scope === "object") {
    if (scope.trackIds) {
      const wanted = new Set(scope.trackIds);
      list = list.filter((tr) => wanted.has(tr.id));
    } else if (scope.folderPath) {
      list = list.filter((tr) => tr.folderPath === scope.folderPath);
    } else if (scope.batchId) {
      list = list.filter((tr) => tr.batchId === scope.batchId);
    }
  }
  return list.filter((tr) => eligible(tr, mode, skip));
}

/** Run a batch job. Keeps going while minimized; cancellable.
 *  Back-compat: `t` stays optional; the second arg is the per-call run spec
 *  { mode, scope, options } — when provided it is used AS GIVEN (no forced
 *  scope/mode writes into the store, so concurrent callers never clobber
 *  each other — the ALOK fix). */
export async function startSmartFetch(t?: (k: string) => string, opts?: SmartFetchRunOpts) {
  const s = useSmartFetch.getState();
  if (s.running) return;
  const mode = opts?.mode ?? s.mode;
  const scope = opts?.scope ?? s.scope;
  const options: SmartFetchOptions = {
    skipExisting: opts?.options?.skipExisting ?? s.skipExisting,
    autoApply: opts?.options?.autoApply ?? s.autoApply,
    saveToDisk: opts?.options?.saveToDisk ?? s.saveToDisk,
  };
  const targets = resolveTargets(scope, mode, options.skipExisting);
  cancelled = false;
  void t; // status labels live in the items; translator kept for signature parity

  if (!targets.length) {
    useSmartFetch.setState({ items: [], running: false, done: 0 });
    return "empty" as const;
  }

  useSmartFetch.setState({
    items: targets.map((tr) => ({ trackId: tr.id, title: tr.title, artist: tr.artist, status: "waiting", gen: 0 })),
    running: true,
    done: 0,
  });

  // per-item worker with one transient retry
  const work = async (track: Track) => {
    if (cancelled) {
      setStatus(track.id, "waiting");
      return;
    }
    setStatus(track.id, "searching");
    const attempt = async (): Promise<FetchOutcome> =>
      mode === "lyrics" ? fetchLyricsFor(track, options) : fetchCoverFor(track, options);
    try {
      let outcome: FetchOutcome;
      try {
        outcome = await attempt();
      } catch (e: any) {
        // graceful retry on transient failures (5xx / timeouts / network hiccups)
        if (e?.status === 404) {
          outcome = "notfound";
        } else {
          await new Promise((r) => window.setTimeout(r, 1200 + Math.random() * 800));
          if (cancelled) {
            setStatus(track.id, "waiting");
            return;
          }
          outcome = await attempt();
        }
      }
      if (cancelled) {
        setStatus(track.id, "waiting");
        return;
      }
      setStatus(track.id, outcome === "plain" ? "saved" : outcome, outcome === "plain" ? "plain" : undefined);
    } catch (e: any) {
      if (cancelled) {
        setStatus(track.id, "waiting");
        return;
      }
      setStatus(track.id, "error", e?.message || "error");
    }
  };

  // classic parity: 3 concurrent lyric lookups, 2 concurrent cover jobs
  await pool(targets, mode === "lyrics" ? 3 : 2, async (track) => {
    await work(track);
  });
  useSmartFetch.setState({ running: false });
}

export function cancelSmartFetch() {
  cancelled = true;
  useSmartFetch.setState({ running: false });
  setItems((items) => items.map((it) => (it.status === "waiting" || it.status === "searching" ? { ...it, status: "waiting" } : it)));
}

/** Manual per-item retry (a fresh library lookup in case data changed). */
export async function retryItem(trackId: string) {
  const s = useSmartFetch.getState();
  const track = useLibrary.getState().tracks[trackId];
  if (!track || s.running) return;
  useSmartFetch.setState({ running: true });
  setStatus(trackId, "searching");
  useSmartFetch.setState((st) => ({ done: Math.max(0, st.done - 1) }));
  const options: SmartFetchOptions = {
    skipExisting: s.skipExisting,
    autoApply: s.autoApply,
    saveToDisk: s.saveToDisk,
  };
  try {
    const outcome =
      s.mode === "lyrics" ? await fetchLyricsFor(track, options) : await fetchCoverFor(track, options);
    setStatus(trackId, outcome === "plain" ? "saved" : outcome, outcome === "plain" ? "plain" : undefined);
  } catch {
    setStatus(trackId, "error");
  }
  useSmartFetch.setState({ running: false });
}

/** Convenience: fetch lyrics for a single track (Now Playing quick action). */
export async function fetchOneLyrics(trackId: string): Promise<boolean> {
  const track = useLibrary.getState().tracks[trackId];
  if (!track) return false;
  const options = useSmartFetch.getState();
  try {
    const outcome = await fetchLyricsFor(
      track,
      { skipExisting: options.skipExisting, autoApply: options.autoApply, saveToDisk: options.saveToDisk },
    );
    return outcome === "saved" || outcome === "plain";
  } catch {
    return false;
  }
}

/** Convenience: fetch cover for a single track. */
export async function fetchOneCover(trackId: string): Promise<boolean> {
  const track = useLibrary.getState().tracks[trackId];
  if (!track) return false;
  const options = useSmartFetch.getState();
  try {
    const outcome = await fetchCoverFor(
      track,
      { skipExisting: options.skipExisting, autoApply: options.autoApply, saveToDisk: options.saveToDisk },
    );
    return outcome === "saved";
  } catch {
    return false;
  }
}

/* ── Task 30 — manual pickers + health + audio export ─────────────────────── */

/** Candidate grid for the manual lyric picker (exact hit first, then the
 *  fuzzy list — de-duplicated by LRCLIB id). */
export async function searchLyricsCandidates(query: {
  track_name: string;
  artist_name: string;
  album_name?: string;
  duration?: number;
}): Promise<LrclibResult[]> {
  const [exact, fuzzy] = await Promise.all([
    getLrclibLyrics({
      trackName: query.track_name,
      artistName: query.artist_name,
      albumName: query.album_name,
      duration: query.duration,
    }),
    searchLrclibLyrics({ trackName: query.track_name, artistName: query.artist_name }),
  ]);
  const out: LrclibResult[] = [];
  const seen = new Set<number>();
  for (const r of [exact, ...fuzzy]) {
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** Candidate grid for the manual cover picker (iTunes + Deezer, deduped). */
export async function searchCoverCandidates(artist: string, title: string): Promise<CoverCandidate[]> {
  try {
    return await searchCoverArtCandidates(artist, title);
  } catch {
    return [];
  }
}

/** Apply a manually chosen lyric candidate through the SAME write path as
 *  the auto fetch (classic patch → IDB mirror → optional sidecar). */
export async function applyLyricsCandidate(trackId: string, cand: LrclibResult): Promise<boolean> {
  const track = useLibrary.getState().tracks[trackId];
  if (!track || !cand) return false;
  const patch: Partial<Track> = {};
  let rawLrc: string | null = null;
  if (cand.syncedLyrics) {
    const lines = parseLrc(cand.syncedLyrics);
    if (lines.length) {
      patch.syncedLyrics = lines;
      patch.hasEmbeddedLyrics = true;
      rawLrc = cand.syncedLyrics;
    }
  }
  if (!patch.syncedLyrics && cand.plainLyrics) {
    patch.plainLyrics = cand.plainLyrics;
    patch.hasEmbeddedLyrics = true;
  }
  if (!patch.syncedLyrics && !patch.plainLyrics) return false;
  const store = useSmartFetch.getState();
  try {
    await persistFetchedLyrics(
      track,
      patch,
      rawLrc,
      { skipExisting: store.skipExisting, autoApply: true, saveToDisk: store.saveToDisk },
    );
    return true;
  } catch {
    return false;
  }
}

/** Apply a manually chosen cover candidate (downloads the bytes first). */
export async function applyCoverCandidate(trackId: string, cand: CoverCandidate): Promise<boolean> {
  const track = useLibrary.getState().tracks[trackId];
  if (!track || !cand?.url) return false;
  const art = await downloadCoverArt(cand.url);
  if (!art || art.bytes.byteLength <= 1000) return false;
  const store = useSmartFetch.getState();
  try {
    await persistFetchedCover(
      track,
      art.bytes,
      art.ext,
      { skipExisting: store.skipExisting, autoApply: true, saveToDisk: store.saveToDisk },
    );
    return true;
  } catch {
    return false;
  }
}

/** Quick connectivity probe against LRCLIB (wraps the classic checker). */
export async function lrclibHealthCheck(): Promise<boolean> {
  return checkLrclibConnection();
}

/** Export the track's audio file:
 *  • Electron  → native "Save as" dialog defaulting to Downloads, then a
 *                bounded fs.copyFile in the main process (dialog:save-copy);
 *  • elsewhere → fetch the source URL (or the IDB blob for standalone
 *                imports) and anchor-download it with a sanitized name. */
export async function saveAudioFileFor(trackId: string): Promise<boolean> {
  const track = useLibrary.getState().tracks[trackId];
  if (!track) return false;
  const baseName = sanitizeFilename(track.artist && track.artist !== "Unknown Artist" ? `${track.artist} - ${track.title}` : track.title);
  const ext = track.format && track.format !== "?" ? track.format.replace(/[^a-z0-9]/gi, "").toLowerCase() : "mp3";
  const defaultName = `${baseName}.${ext}`;

  // 1) Electron with the real path → native save dialog + main-process copy
  const srcPath = audioPathFor(trackId);
  const api = (globalThis as any).window?.electronAPI;
  if (srcPath && api && typeof api.saveAudioCopy === "function") {
    try {
      const saved: string | null = await api.saveAudioCopy(srcPath, defaultName);
      return typeof saved === "string" && saved.length > 0;
    } catch {
      return false;
    }
  }

  // 2) bridged web / Tauri → fetch the streaming source URL
  const srcUrl = getBridge()?.resolveSource(trackId) ?? null;
  if (srcUrl) {
    try {
      const res = await fetch(srcUrl);
      if (!res.ok) return false;
      anchorDownload(await res.blob(), defaultName);
      return true;
    } catch {
      return false;
    }
  }

  // 3) standalone → the IndexedDB blob store
  const blob = await db.getFile(trackId).catch(() => undefined);
  if (!blob) return false;
  anchorDownload(blob, defaultName);
  return true;
}
