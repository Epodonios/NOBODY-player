// ── NOBODY · library store (in-memory mirror of IndexedDB) ───────────────────

import { create } from "zustand";
import { db } from "../lib/db";
import { invalidateCover } from "../lib/covers";
import type { Batch, Playlist, RecentEntry, Track } from "../types";
import { uuid } from "../lib/utils";

export const LIKED_ID = "liked";

/* V1.2.0: localStorage key for play counts (see playCounts above). */
const PLAY_COUNTS_KEY = "nobody-play-counts";

function loadPlayCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(PLAY_COUNTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePlayCounts(counts: Record<string, number>) {
  try {
    localStorage.setItem(PLAY_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    /* storage full — counts are best-effort */
  }
}

interface LibraryStore {
  hydrated: boolean;
  tracks: Record<string, Track>;
  order: string[]; // ids sorted by importedAt asc
  batches: Batch[];
  playlists: Playlist[];
  recents: RecentEntry[];
  /* V1.2.0: per-track play counters for the "Most Played" library category.
   * Kept OUTSIDE the Track records (bridge-mode tracks are a mirror of the
   * classic library and would drop the field on every rehydrate); persisted
   * to localStorage keyed by stable track id so counts survive restarts and
   * work identically in bridge and IndexedDB modes. */
  playCounts: Record<string, number>;
  recordPlay: (id: string) => void;

  hydrate: () => Promise<void>;
  rehydrateTracks: () => Promise<void>;
  addImported: (tracks: Track[], batch: Batch) => void;
  patchTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;
  toggleLike: (id: string) => void;
  isLiked: (id: string) => boolean;

  createPlaylist: (name: string) => string;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (pid: string, tid: string) => void;
  removeFromPlaylist: (pid: string, tid: string) => void;
  moveInPlaylist: (pid: string, from: number, to: number) => void;

  pushRecent: (tid: string) => void;
  clearRecents: () => void;
}

function savePlaylist(p: Playlist) {
  db.putPlaylist(p).catch(() => void 0);
}

export const useLibrary = create<LibraryStore>((set, get) => ({
  hydrated: false,
  tracks: {},
  order: [],
  batches: [],
  playlists: [{ id: LIKED_ID, name: "Liked Songs", trackIds: [], createdAt: 0, system: true }],
  recents: [],
  playCounts: loadPlayCounts(),

  recordPlay: (id) => {
    if (!id) return;
    const counts = { ...get().playCounts, [id]: (get().playCounts[id] || 0) + 1 };
    set({ playCounts: counts });
    savePlayCounts(counts);
  },

  hydrate: async () => {
    const [tracks, batches, playlists, recents] = await Promise.all([
      db.getAllTracks().catch(() => [] as Track[]),
      db.getBatches().catch(() => [] as Batch[]),
      db.getAllPlaylists().catch(() => [] as Playlist[]),
      db.getRecents().catch(() => [] as RecentEntry[]),
    ]);
    const map: Record<string, Track> = {};
    tracks.forEach((t) => (map[t.id] = t));
    const order = tracks.sort((a, b) => a.importedAt - b.importedAt).map((t) => t.id);
    const liked = playlists.find((p) => p.id === LIKED_ID);
    const rest = playlists.filter((p) => p.id !== LIKED_ID);
    set({
      hydrated: true,
      tracks: map,
      order,
      batches: batches.sort((a, b) => b.importedAt - a.importedAt),
      playlists: [
        liked ?? { id: LIKED_ID, name: "Liked Songs", trackIds: [], createdAt: 0, system: true },
        ...rest.sort((a, b) => a.createdAt - b.createdAt),
      ],
      recents: recents
        .filter((r) => map[r.trackId])
        .sort((a, b) => b.at - a.at)
        .slice(0, 60),
    });
  },

  /** Re-read tracks (bridge mode: classic library changed underneath us).
   *  Preserves playlists/recents — merges the fresh track map in place. */
  rehydrateTracks: async () => {
    const tracks = await db.getAllTracks().catch(() => [] as Track[]);
    const map: Record<string, Track> = {};
    tracks.forEach((t) => (map[t.id] = t));
    const order = tracks.sort((a, b) => a.importedAt - b.importedAt).map((t) => t.id);
    set({ tracks: map, order, hydrated: true });
  },

  addImported: (newTracks, batch) => {
    const { tracks, order, batches } = get();
    const map = { ...tracks };
    const ids: string[] = [];
    for (const t of newTracks) {
      if (!map[t.id]) { map[t.id] = t; ids.push(t.id); }
    }
    const existingBatch = batches.find((b) => b.id === batch.id);
    set({
      tracks: map,
      order: [...order, ...ids],
      batches: existingBatch
        ? batches.map((b) => (b.id === batch.id ? { ...b, count: b.count + ids.length } : b))
        : [batch, ...batches],
    });
    db.putTracks(newTracks).catch(() => void 0);
    db.putBatch(existingBatch ? { ...existingBatch, count: existingBatch.count + ids.length } : batch).catch(() => void 0);
  },

  patchTrack: (id, patch) => {
    const cur = get().tracks[id];
    if (!cur) return;
    const next = { ...cur, ...patch };
    set({ tracks: { ...get().tracks, [id]: next } });
    db.putTrack(next).catch(() => void 0);
  },

  removeTrack: (id) => {
    const { tracks, order, batches, playlists, recents } = get();
    const t = tracks[id];
    if (!t) return;
    const map = { ...tracks };
    delete map[id];
    invalidateCover(id);
    set({
      tracks: map,
      order: order.filter((x) => x !== id),
      batches: batches
        .map((b) => (b.id === t.batchId ? { ...b, count: b.count - 1 } : b))
        .filter((b) => b.count > 0),
      playlists: playlists.map((p) => ({ ...p, trackIds: p.trackIds.filter((x) => x !== id) })),
      recents: recents.filter((r) => r.trackId !== id),
    });
    db.deleteTrack(id).catch(() => void 0);
    db.deleteFile(id).catch(() => void 0);
    db.deleteCover(id).catch(() => void 0);
    get().playlists.forEach((p) => savePlaylist(p));
    const bad = batches.find((b) => b.id === t.batchId && b.count - 1 <= 0);
    if (bad) db.deleteBatch(bad.id).catch(() => void 0);
  },

  toggleLike: (id) => {
    const playlists = get().playlists.map((p) => {
      if (p.id !== LIKED_ID) return p;
      const has = p.trackIds.includes(id);
      const next = { ...p, trackIds: has ? p.trackIds.filter((x) => x !== id) : [id, ...p.trackIds] };
      savePlaylist(next);
      return next;
    });
    set({ playlists });
  },

  isLiked: (id) => get().playlists.find((p) => p.id === LIKED_ID)?.trackIds.includes(id) ?? false,

  createPlaylist: (name) => {
    const p: Playlist = { id: uuid(), name, trackIds: [], createdAt: Date.now() };
    set({ playlists: [...get().playlists, p] });
    savePlaylist(p);
    return p.id;
  },

  renamePlaylist: (id, name) => {
    set({ playlists: get().playlists.map((p) => (p.id === id ? { ...p, name } : p)) });
    const p = get().playlists.find((x) => x.id === id);
    if (p) savePlaylist(p);
  },

  deletePlaylist: (id) => {
    set({ playlists: get().playlists.filter((p) => p.id !== id) });
    db.deletePlaylist(id).catch(() => void 0);
  },

  addToPlaylist: (pid, tid) => {
    set({
      playlists: get().playlists.map((p) =>
        p.id === pid && !p.trackIds.includes(tid) ? { ...p, trackIds: [...p.trackIds, tid] } : p
      ),
    });
    const p = get().playlists.find((x) => x.id === pid);
    if (p) savePlaylist(p);
  },

  removeFromPlaylist: (pid, tid) => {
    set({ playlists: get().playlists.map((p) => (p.id === pid ? { ...p, trackIds: p.trackIds.filter((x) => x !== tid) } : p)) });
    const p = get().playlists.find((x) => x.id === pid);
    if (p) savePlaylist(p);
  },

  moveInPlaylist: (pid, from, to) => {
    set({
      playlists: get().playlists.map((p) => {
        if (p.id !== pid) return p;
        const arr = [...p.trackIds];
        const [x] = arr.splice(from, 1);
        arr.splice(to, 0, x);
        const next = { ...p, trackIds: arr };
        savePlaylist(next);
        return next;
      }),
    });
  },

  pushRecent: (tid) => {
    const entry = { trackId: tid, at: Date.now() };
    set({ recents: [entry, ...get().recents.filter((r) => r.trackId !== tid)].slice(0, 60) });
    db.addRecent(entry).catch(() => void 0);
  },

  clearRecents: () => {
    set({ recents: [] });
    db.clearRecents().catch(() => void 0);
  },
}));
