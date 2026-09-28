// ── NOBODY EELA · ui store (navigation & overlays) ───────────────────────────
// EELA is an independent face over the shared NOBODY core: the library,
// settings and the audio engine are the cinema module singletons, so only
// navigation/overlay state lives here.

import { create } from "zustand";
import type { ViewId } from "../../cinema/types";

interface EelaUiStore {
  view: ViewId;
  setView: (v: ViewId) => void;

  showNp: boolean;
  setShowNp: (v: boolean) => void;
  showAmbient: boolean;
  setShowAmbient: (v: boolean) => void;
  showQueue: boolean;
  setShowQueue: (v: boolean) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
}

export const useEelaUi = create<EelaUiStore>((set) => ({
  view: "library",
  setView: (view) => set({ view }),

  showNp: false,
  setShowNp: (showNp) => set({ showNp }),
  showAmbient: false,
  setShowAmbient: (showAmbient) => set({ showAmbient }),
  showQueue: false,
  setShowQueue: (showQueue) => set({ showQueue }),
  dragging: false,
  setDragging: (dragging) => set({ dragging }),
}));
