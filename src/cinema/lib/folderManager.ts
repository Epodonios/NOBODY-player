// ── NOBODY · folder manager (cinema / EELA / ALOK) ───────────────────────────
// Task 30 — the new UIs could never manage the classic app's music folders:
// there was no bridge surface for list/remove/rescan, so a wrong folder was
// forever. This module is the ONE folder boundary for every engine-driven UI:
//   • bridged   → routes to __NOBODY_BRIDGE__ (classic owns the folder state,
//                 every mutation re-notifies the mirrors automatically);
//   • standalone → operates on the IndexedDB mirror (delete tracks whose
//                 folderPath lives under the folder; rescan is a no-op because
//                 a web page has no folder watcher).
// The module itself is toast-free — callers phrase outcomes with the fm*
// i18n keys (fa / en / tr) so each face keeps its own voice.

import { useCallback, useEffect, useState } from "react";
import { db } from "./db";
import { useLibrary } from "../store/library";
import { getBridge, type NobodyBridge } from "./desktopBridge";
import { importViaFolderPicker } from "./importer";
import type { Track } from "../types";

export interface FolderInfo {
  path: string;
  name: string;
  trackCount: number;
}

/** Base folder name from an absolute path (works for / and \). */
export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

/** True when `folderPath` is the managed folder itself or lives inside it. */
function isUnderFolder(folderPath: string | undefined, root: string): boolean {
  if (!folderPath) return false;
  if (folderPath === root) return true;
  const sep = root.includes("\\") ? "\\" : "/";
  const prefix = root.endsWith(sep) ? root : root + sep;
  return folderPath.startsWith(prefix);
}

/**
 * Snapshot of the managed folders. Bridge mode asks the classic app directly
 * (its list is authoritative and includes empty folders); anything the mirror
 * knows that the bridge list lacks (e.g. tracks imported before folders were
 * managed) is unioned in so the Folders view never loses entries.
 */
export function listFolders(): FolderInfo[] {
  const byPath = new Map<string, FolderInfo>();
  try {
    const bridge = getBridge();
    const listed = bridge?.listFolders?.();
    if (Array.isArray(listed)) {
      for (const f of listed) {
        if (!f?.path) continue;
        byPath.set(f.path, { path: f.path, name: f.name || folderName(f.path), trackCount: f.trackCount ?? 0 });
      }
    }
  } catch {
    /* fall through to the mirror-derived list */
  }
  // Standalone fallback (and top-up): derive from the mirror's tracks.
  const lib = useLibrary.getState();
  const counts = new Map<string, number>();
  for (const id of lib.order) {
    const t = lib.tracks[id];
    if (!t?.folderPath || byPath.has(t.folderPath)) continue;
    counts.set(t.folderPath, (counts.get(t.folderPath) ?? 0) + 1);
  }
  for (const [path, trackCount] of counts) byPath.set(path, { path, name: folderName(path), trackCount });
  return [...byPath.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Add folders through the native folder dialog + the classic real-path
 * pipeline (importer.importViaFolderPicker). Returns the number of added
 * tracks, or null when the runtime has no usable picker at all. Toasting is
 * left to the caller (LibraryView etc. already phrase the outcome their way).
 */
export async function addFolderByPicker(label: string): Promise<{ added: number } | null> {
  const res = await importViaFolderPicker(label);
  if (!res) return null;
  return { added: res.added };
}

/**
 * Remove a managed folder. Bridge mode delegates to the classic shell (same
 * semantics as the classic UI: filter folderPaths + tracks, revoke blob URLs
 * except the playing track, keep the index safe) — the shell notifies the
 * mirrors itself. Standalone mode deletes the IDB records directly.
 */
export async function removeFolder(path: string): Promise<void> {
  const bridge = getBridge();
  if (bridge && typeof bridge.removeFolder === "function") {
    bridge.removeFolder(path);
  }
  /* V1.3.0 QA fix — always purge MIRROR leftovers under this folder. After a
   * real bridge remove this is a no-op (classic already dropped them and the
   * notify rehydrate refreshes the mirror), but tracks that classic never
   * owned (imported standalone / pre-bridge libraries) would otherwise stay
   * in the mirror forever and resurrect the folder row. */
  const lib = useLibrary.getState();
  const doomed: Track[] = lib.order
    .map((id) => lib.tracks[id])
    .filter((t) => t && isUnderFolder(t.folderPath, path));
  for (const t of doomed) {
    await db.deleteTrack(t.id).catch(() => void 0);
    await db.deleteFile(t.id).catch(() => void 0);
    await db.deleteCover(t.id).catch(() => void 0);
    lib.removeTrack(t.id);
  }
}

/**
 * Re-walk a managed folder (bridge mode → classic rescan: drops vanished
 * files, silently imports new ones). Standalone mode just rehydrates the
 * mirror — a web page cannot watch the filesystem.
 */
export async function rescanFolder(path: string): Promise<void> {
  const bridge = getBridge();
  if (bridge && typeof bridge.rescanFolder === "function") {
    await bridge.rescanFolder(path);
    return;
  }
  await useLibrary.getState().rehydrateTracks();
}

/** Delete one track from the standalone mirror (bridge tracks are owned by
 *  classic — db.deleteTrack already refuses those; kept here for parity). */
export async function removeStandaloneTrack(id: string): Promise<void> {
  await db.deleteTrack(id).catch(() => void 0);
  await db.deleteFile(id).catch(() => void 0);
  await db.deleteCover(id).catch(() => void 0);
  useLibrary.getState().removeTrack(id);
}

/**
 * React binding: `{ folders, refresh, add, remove, rescan, busy }`.
 * Auto-refreshes while a classic bridge is broadcasting library changes, and
 * after every local mutation. `busy` holds the folder path (or "__add__")
 * while that operation is in flight so buttons can show spinners.
 */
export function useFolderManager() {
  const [folders, setFolders] = useState<FolderInfo[]>(() => listFolders());
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setFolders(listFolders());
  }, []);

  useEffect(() => {
    const bridge: (NobodyBridge & { subscribe?: (cb: () => void) => () => void }) | null = getBridge();
    let off: (() => void) | undefined;
    try {
      off = bridge?.subscribe?.(() => refresh());
    } catch {
      /* bridge without subscribe — refresh() still runs after mutations */
    }
    return () => {
      try {
        off?.();
      } catch {
        /* ignore */
      }
    };
  }, [refresh]);

  /* Standalone (no bridge) the folder list is DERIVED from the library mirror,
   * so it must track the store: hydrate lands after this hook's first render
   * (and imports/removes change order later) — without this the Folders view
   * stayed stale/empty until a manual mutation. Bridge mode already refreshes
   * via the subscription above; this covers hydrate there too (order flips). */
  useEffect(() => {
    return useLibrary.subscribe((s, prev) => {
      if (s.order !== prev.order) refresh();
    });
  }, [refresh]);

  const add = useCallback(
    async (label: string) => {
      setBusy("__add__");
      try {
        return await addFolderByPicker(label);
      } finally {
        setBusy(null);
        refresh();
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (path: string) => {
      setBusy(path);
      try {
        await removeFolder(path);
      } finally {
        setBusy(null);
        refresh();
      }
    },
    [refresh],
  );

  const rescan = useCallback(
    async (path: string) => {
      setBusy(path);
      try {
        await rescanFolder(path);
      } finally {
        setBusy(null);
        refresh();
      }
    },
    [refresh],
  );

  return { folders, refresh, add, remove, rescan, busy };
}
