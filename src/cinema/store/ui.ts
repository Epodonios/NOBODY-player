// ── NOBODY · ui store: navigation, overlays, toasts, player mirror ───────────
// Coarse state only. Per-frame things (progress, analyser) never live here —
// they flow through refs/rAF in the components that need them.

import { create } from "zustand";
import type { RepeatMode, Track, ViewId } from "../types";

export interface Toast {
  id: number;
  msg: string;
  sub?: string;
  kind: "info" | "success" | "error" | "progress";
  progress?: number; // 0..1 for kind=progress
  sticky?: boolean;
}

interface UiStore {
  view: ViewId;
  setView: (v: ViewId) => void;

  // player coarse mirror (updated by engine events, not per-tick)
  currentId: string | null;
  isPlaying: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  queueLength: number;
  queueIndex: number;
  queueIds: string[];
  hasAudio: boolean;
  mirror: (p: Partial<Pick<UiStore, "currentId" | "isPlaying" | "repeat" | "shuffle" | "queueLength" | "queueIndex" | "queueIds" | "hasAudio">>) => void;

  // overlays
  showNowPlaying: boolean;
  setShowNowPlaying: (v: boolean) => void;
  npTab: "play" | "lyrics";
  setNpTab: (v: "play" | "lyrics") => void;
  showQueue: boolean;
  setShowQueue: (v: boolean) => void;
  showSmartFetch: boolean;
  setShowSmartFetch: (v: boolean) => void;
  ambient: boolean;
  ambientManual: boolean; // true when the user explicitly enabled ambient (NowPlaying moon / palette) — mouse motion must not exit
  setAmbient: (v: boolean, manual?: boolean) => void;
  draggingFiles: boolean;
  setDraggingFiles: (v: boolean) => void;

  // rêve+ advanced panels
  showFx: boolean; // equalizer / speed / sleep sheet
  setShowFx: (v: boolean) => void;
  showPalette: boolean; // Ctrl+K command palette
  setShowPalette: (v: boolean) => void;
  showShortcuts: boolean; // "?" shortcuts help
  setShowShortcuts: (v: boolean) => void;

  // toasts
  toasts: Toast[];
  toast: (msg: string, kind?: Toast["kind"], opt?: Partial<Toast>) => number;
  updateToast: (id: number, patch: Partial<Toast>) => void;
  dismissToast: (id: number) => void;

  // context for "now playing" variety + batch filter
  batchFilter: string | null;
  setBatchFilter: (id: string | null) => void;
}

let toastSeq = 1;

export const useUi = create<UiStore>((set, get) => ({
  view: "library",
  setView: (view) => set({ view }),

  currentId: null,
  isPlaying: false,
  repeat: "off",
  shuffle: false,
  queueLength: 0,
  queueIndex: 0,
  queueIds: [],
  hasAudio: false,
  mirror: (p) => set(p),

  showNowPlaying: false,
  setShowNowPlaying: (showNowPlaying) => set({ showNowPlaying }),
  npTab: "play",
  setNpTab: (npTab) => set({ npTab }),
  showQueue: false,
  setShowQueue: (showQueue) => set({ showQueue }),
  showSmartFetch: false,
  setShowSmartFetch: (showSmartFetch) => set({ showSmartFetch }),
  ambient: false,
  ambientManual: false,
  setAmbient: (ambient, manual) => set({ ambient, ambientManual: manual ?? false }),
  draggingFiles: false,
  setDraggingFiles: (draggingFiles) => set({ draggingFiles }),

  showFx: false,
  setShowFx: (showFx) => set({ showFx }),
  showPalette: false,
  setShowPalette: (showPalette) => set({ showPalette }),
  showShortcuts: false,
  setShowShortcuts: (showShortcuts) => set({ showShortcuts }),

  toasts: [],
  toast: (msg, kind = "info", opt) => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-3), { id, msg, kind, ...opt }] });
    if (!opt?.sticky) setTimeout(() => get().dismissToast(id), opt?.kind === "progress" ? 600000 : 4200);
    return id;
  },
  updateToast: (id, patch) =>
    set({ toasts: get().toasts.map((t) => (t.id === id ? { ...t, ...patch } : t)) }),
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  batchFilter: null,
  setBatchFilter: (batchFilter) => set({ batchFilter }),
}));

// quick access for non-react modules
export const uiApi = {
  toast: (msg: string, kind?: Toast["kind"], opt?: Partial<Toast>) => useUi.getState().toast(msg, kind, opt),
  updateToast: (id: number, patch: Partial<Toast>) => useUi.getState().updateToast(id, patch),
  dismissToast: (id: number) => useUi.getState().dismissToast(id),
};

/** Deterministic "visual variety" seed per track — stable across renders. */
export function trackMotif(track?: Track | null): number {
  if (!track) return 0;
  let h = 0;
  for (const c of track.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 3;
}
