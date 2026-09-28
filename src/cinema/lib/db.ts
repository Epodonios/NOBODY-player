// ── NOBODY · persistence layer ───────────────────────────────────────────────
// Two backends behind ONE api:
//   • Classic-bridge mode (running inside the NOBODY desktop shell) — tracks,
//     audio sources and covers live in the classic app's state; playlists,
//     recents and batches stay here in IndexedDB (cinema-only features).
//   • Standalone mode — everything lives in IndexedDB as before.
// stores: tracks (metadata), files (audio blobs), covers (cover blobs),
//         artist-covers (artist name → cover blob, v2), playlists, recents,
//         batches

import type { Batch, Playlist, RecentEntry, Track } from "../types";
import { bridgeGetCoverBlob, bridgeListTracks, bridgePatchTrack, bridgePutCover, getBridge } from "./desktopBridge";

const DB_NAME = "nobody-db";
// v2 adds "artist-covers" (out-of-line keys: artist name → Blob) for the
// ARTISTS board fetch button — v1 clients upgrade in place, no data loss.
const DB_VER = 2;

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("tracks")) db.createObjectStore("tracks", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      if (!db.objectStoreNames.contains("covers")) db.createObjectStore("covers");
      if (!db.objectStoreNames.contains("artist-covers")) db.createObjectStore("artist-covers");
      if (!db.objectStoreNames.contains("playlists")) db.createObjectStore("playlists", { keyPath: "id" });
      if (!db.objectStoreNames.contains("recents")) db.createObjectStore("recents", { keyPath: "at" });
      if (!db.objectStoreNames.contains("batches")) db.createObjectStore("batches", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// ── IndexedDB primitives (always available fallback) ─────────────────────────

const idb = {
  getAllTracks: () => tx("tracks", "readonly", (s) => s.getAll() as IDBRequest<Track[]>),
  putTrack: (t: Track) => tx("tracks", "readwrite", (s) => s.put(t)),
  deleteTrack: (id: string) => tx("tracks", "readwrite", (s) => s.delete(id)),
  getFile: (id: string) => tx("files", "readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>),
  putFile: (id: string, blob: Blob) => tx("files", "readwrite", (s) => s.put(blob, id)),
  deleteFile: (id: string) => tx("files", "readwrite", (s) => s.delete(id)),
  getCover: (id: string) => tx("covers", "readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>),
  putCover: (id: string, blob: Blob) => tx("covers", "readwrite", (s) => s.put(blob, id)),
  deleteCover: (id: string) => tx("covers", "readwrite", (s) => s.delete(id)),
  getArtistCover: (artist: string) =>
    tx("artist-covers", "readonly", (s) => s.get(artist) as IDBRequest<Blob | undefined>),
  putArtistCover: (artist: string, blob: Blob) =>
    tx("artist-covers", "readwrite", (s) => s.put(blob, artist)),
};

export const db = {
  // tracks — bridged classic library first, plus any cinema-only (demo) tracks
  async getAllTracks(): Promise<Track[]> {
    if (getBridge()) {
      const bridged = bridgeListTracks();
      const local = await idb.getAllTracks().catch(() => [] as Track[]);
      const seen = new Set(bridged.map((t) => t.id));
      return [...bridged, ...local.filter((t) => !seen.has(t.id))];
    }
    return idb.getAllTracks();
  },
  putTracks: (list: Track[]) =>
    open().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const t = db.transaction("tracks", "readwrite");
          const s = t.objectStore("tracks");
          list.forEach((tr) => s.put(tr));
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
        })
    ),
  async putTrack(t: Track) {
    if (bridgePatchTrack(t)) return; // classic owns this track
    return idb.putTrack(t);
  },
  async deleteTrack(id: string) {
    if (getBridge()?.hasTrack(id)) return; // classic tracks can't be deleted from cinema
    return idb.deleteTrack(id);
  },

  // audio blobs — classic sources stream via the bridge; demo/standalone via IDB
  putFile: (id: string, blob: Blob) => idb.putFile(id, blob),
  getFile: (id: string) => idb.getFile(id),
  deleteFile: (id: string) => idb.deleteFile(id),

  // cover blobs — routed to the classic app when the track is theirs
  async putCover(id: string, blob: Blob) {
    if (bridgePutCover(id, blob)) return;
    return idb.putCover(id, blob);
  },
  async getCover(id: string): Promise<Blob | undefined> {
    // QA fix (V1.4.0): when the classic bridge is registered (it ALWAYS is —
    // all four faces share one document), a cinema-only track (demo pack /
    // standalone import) used to return undefined here and never reach the
    // IDB mirror, silently breaking every IDB-cover consumer (karaoke cover
    // palette, ambient backdrop, export paths). Fall through to IDB whenever
    // the bridge has no cover for this id.
    if (getBridge()) {
      const blob = await bridgeGetCoverBlob(id);
      if (blob) return blob;
    }
    return idb.getCover(id);
  },
  deleteCover: (id: string) => idb.deleteCover(id),

  // artist covers — cinema-only (never bridged), keyed by artist name for
  // the ARTISTS board tiles
  async getArtistCover(artist: string): Promise<Blob | null> {
    const blob = await idb.getArtistCover(artist);
    return blob ?? null;
  },
  async putArtistCover(artist: string, blob: Blob) {
    await idb.putArtistCover(artist, blob);
  },

  // playlists
  putPlaylist: (p: Playlist) => tx("playlists", "readwrite", (s) => s.put(p)),
  getAllPlaylists: () => tx("playlists", "readonly", (s) => s.getAll() as IDBRequest<Playlist[]>),
  deletePlaylist: (id: string) => tx("playlists", "readwrite", (s) => s.delete(id)),

  // recents
  addRecent: (r: RecentEntry) => tx("recents", "readwrite", (s) => s.put(r)),
  getRecents: () => tx("recents", "readonly", (s) => s.getAll() as IDBRequest<RecentEntry[]>),
  clearRecents: () => tx("recents", "readwrite", (s) => s.clear()),

  // batches
  putBatch: (b: Batch) => tx("batches", "readwrite", (s) => s.put(b)),
  getBatches: () => tx("batches", "readonly", (s) => s.getAll() as IDBRequest<Batch[]>),
  deleteBatch: (id: string) => tx("batches", "readwrite", (s) => s.delete(id)),

  async clearAll() {
    const d = await open();
    await Promise.all(
      ["tracks", "files", "covers", "artist-covers", "playlists", "recents", "batches"].map(
        (st) =>
          new Promise<void>((res, rej) => {
            const t = d.transaction(st, "readwrite");
            t.objectStore(st).clear();
            t.oncomplete = () => res();
            t.onerror = () => rej(t.error);
          })
      )
    );
  },
};
