// ── NOBODY Cinema · desktop bridge ───────────────────────────────────────────
// When running inside the classic NOBODY shell, the classic app registers
// `window.__NOBODY_BRIDGE__`. Every Cinema data boundary (db.ts, engine.ts,
// importer.ts) routes through this adapter so BOTH UIs share ONE library,
// ONE set of audio sources and ONE set of covers. Without the bridge (pure
// standalone web build) everything falls back to IndexedDB as before.

import type { LrcLine, Track } from "../types";

export interface BridgeTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  year?: string;
  duration: number;
  format?: string;
  bitrate?: number;
  fileSize?: number;
  fileName?: string;
  hasCover: boolean;
  isPlaceholderCover?: boolean;
  hasLyrics?: boolean;
  syncedLyrics?: LrcLine[];
  accent?: string;
  batchId?: string;
  order: number;
  coverUrl: string | null;
  sourceUrl: string | null;
  /* V1.2.0: real paths so the new-UI Libraries can build Folders /
   * Subfolders views exactly like the classic one. */
  folderPath?: string;
  filePath?: string;
}

export interface NobodyBridge {
  version: number;
  hasTrack(id: string): boolean;
  listTracks(): BridgeTrack[];
  resolveSource(id: string): string | null;
  getCoverUrl(id: string): string | null;
  importFiles(files: FileList | File[]): Promise<{ added: number }>;
  /* V1.2.0 (installer import fix): real-path import — the exact pipeline the
   * classic UI uses (native dialog paths → head/tail reads → app:// streams).
   * Renderer File objects in Electron ≥32 carry no .path, so bridge imports
   * of FSA/input/dropped files could not stream or survive reloads. */
  importPaths?(paths: string[]): Promise<{ added: number }>;
  patchLyrics(id: string, lines: { t: number; text: string }[], sourceLabel?: string): void;
  patchCover(id: string, blob: Blob): void;
  patchAccent(id: string, accent: string): void;
  /* Task 30 — folder management. The new UIs (cinema / EELA / ALOK) could
   * never add/list/remove/rescan managed folders: only the classic shell had
   * those operations. All three are optional so an older classic build (or a
   * pure-web preview shim) still satisfies the interface; folderManager.ts
   * falls back to deriving folder info from the mirrored tracks. */
  listFolders?(): { path: string; name: string; trackCount: number }[];
  removeFolder?(path: string): void;
  rescanFolder?(path: string): Promise<void>;
  /* Task 30 — raw pass-through to the classic importer (used by the handoff
   * auto-import path and by folderManager side doors). */
  handleBatchImport?(
    input: FileList | unknown[],
    options?: { silent?: boolean },
  ): Promise<unknown[] | void>;
  captureHandoff(): { trackId: string | null; position: number; isPlaying: boolean; volume: number; queueIds?: string[] };
  pause(): void;
  subscribe(cb: () => void): () => void;
  notify(): void;
}

export function getBridge(): NobodyBridge | null {
  return ((globalThis as any).__NOBODY_BRIDGE__ as NobodyBridge | undefined) ?? null;
}

export function hasBridge(): boolean {
  return getBridge() !== null;
}

// ── bridge Track[] → Cinema Track[] ──────────────────────────────────────────

export function bridgeTrackToTrack(b: BridgeTrack): Track {
  const t: Track = {
    id: b.id,
    title: b.title,
    artist: b.artist || "Unknown Artist",
    album: b.album || "Unknown Album",
    year: b.year || undefined,
    duration: b.duration || 0,
    format: b.format || "?",
    bitrate: b.bitrate,
    hasCover: !!b.coverUrl,
    isPlaceholderCover: !!b.isPlaceholderCover || !b.coverUrl,
    hasEmbeddedLyrics: !!b.hasLyrics,
    batchId: b.batchId || "library",
    importedAt: 1e12 + b.order, // stable ordering that still sorts after real timestamps
    fileName: b.fileName || `${b.title}.${b.format || "mp3"}`,
    fileSize: b.fileSize || 0,
    accent: b.accent,
    folderPath: b.folderPath || undefined,
    filePath: b.filePath || undefined,
  };
  if (b.syncedLyrics && b.syncedLyrics.length) t.syncedLyrics = b.syncedLyrics;
  return t;
}

export function bridgeListTracks(): Track[] {
  const bridge = getBridge();
  if (!bridge) return [];
  try {
    return bridge.listTracks().map(bridgeTrackToTrack);
  } catch {
    return [];
  }
}

// ── cover blob access (fetch the classic app's cover URL → Blob, cached) ────

const coverBlobCache = new Map<string, { url: string; blobPromise: Promise<Blob | null> }>();

export function bridgeGetCoverBlob(id: string): Promise<Blob | null> {
  const bridge = getBridge();
  if (!bridge) return Promise.resolve(null);
  const url = bridge.getCoverUrl(id);
  if (!url) return Promise.resolve(null);
  const hit = coverBlobCache.get(id);
  if (hit && hit.url === url) return hit.blobPromise;
  const blobPromise = fetch(url)
    .then((r) => (r.ok ? r.blob() : null))
    .catch(() => null);
  coverBlobCache.set(id, { url, blobPromise });
  return blobPromise;
}

export function invalidateBridgeCover(id: string) {
  coverBlobCache.delete(id);
}

// ── write-backs ──────────────────────────────────────────────────────────────

/** Patch a bridged classic track. Returns true when the track belongs to the classic library. */
export function bridgePatchTrack(t: Track): boolean {
  const bridge = getBridge();
  if (!bridge || !bridge.hasTrack(t.id)) return false;
  if (t.syncedLyrics) bridge.patchLyrics(t.id, t.syncedLyrics, "Cinema Sync");
  if (t.accent) bridge.patchAccent(t.id, t.accent);
  return true;
}

/** Store a cover for a track. Returns true when routed through the classic library. */
export function bridgePutCover(id: string, blob: Blob): boolean {
  const bridge = getBridge();
  if (!bridge || !bridge.hasTrack(id)) return false;
  bridge.patchCover(id, blob);
  invalidateBridgeCover(id);
  return true;
}

/** Import files through the classic pipeline (keeps IDs/parse behavior unified). */
export async function bridgeImportFiles(files: File[]): Promise<{ added: number; skipped: number } | null> {
  const bridge = getBridge();
  if (!bridge) return null;
  const before = bridge.listTracks().length;
  const res = await bridge.importFiles(files);
  const added = Math.max(0, (res?.added ?? 0) || Math.max(0, bridge.listTracks().length - before));
  return { added, skipped: Math.max(0, files.length - added) };
}

/** V1.2.0: path-based import through the classic pipeline. Returns null when
 *  the bridge (or its importPaths method) is unavailable. */
export async function bridgeImportPaths(paths: string[]): Promise<{ added: number; skipped: number } | null> {
  const bridge = getBridge();
  if (!bridge || typeof bridge.importPaths !== "function" || !paths.length) return null;
  const before = bridge.listTracks().length;
  const res = await bridge.importPaths(paths);
  const added = Math.max(0, (res?.added ?? 0) || Math.max(0, bridge.listTracks().length - before));
  return { added, skipped: Math.max(0, paths.length - added) };
}

/** Decode the absolute path hidden in an app:// source URL (Electron).
 *  Returns null for blob:/asset:/data: or malformed URLs. */
export function sourcePathFromSourceUrl(url: string | null | undefined): string | null {
  if (!url || !url.startsWith("app://")) return null;
  try {
    const raw = url.slice("app://".length);
    const clean = raw.startsWith("//") ? raw.slice(2) : raw;
    const decoded = decodeURIComponent(clean);
    return decoded || null;
  } catch {
    return null;
  }
}
