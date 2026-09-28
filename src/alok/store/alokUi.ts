// ── NOBODY ALOK · ui store (dock view + overlays) ────────────────────────────
// ALOK is an independent face over the shared NOBODY core: the library,
// settings and the audio engine are the cinema module singletons, so only
// navigation/overlay state lives here. `view === null` means the pure hub
// (core + docks only); a non-null view opens the bottom PANEL.

import { create } from "zustand";

/** Cover-derived accent color, mirrored out of React effect-land so the app
 *  shell can update it from effects without cascading renders. */
interface AlokAccentStore {
  accent: string;
  setAccent: (v: string) => void;
}

export const useAlokAccent = create<AlokAccentStore>((set) => ({
  accent: "",
  setAccent: (accent) => set({ accent }),
}));

export type AlokView = "library" | "liked" | "recents" | "playlists" | "settings" | "downloads";

interface AlokUiStore {
  view: AlokView | null; // null = pure hub, otherwise the PANEL is open
  toggleView: (v: AlokView) => void; // open panel (or close if already open)
  closePanel: () => void;

  // orbit overlays
  showLyrics: boolean;
  setShowLyrics: (v: boolean) => void;
  showQueue: boolean;
  setShowQueue: (v: boolean) => void;
  showFx: boolean;
  setShowFx: (v: boolean) => void;
  showMood: boolean;
  setShowMood: (v: boolean) => void;
  showAura: boolean;
  setShowAura: (v: boolean) => void;
  showCmd: boolean; // command palette (topmost overlay)
  setShowCmd: (v: boolean) => void;
  showInfo: boolean; // current-track details card
  setShowInfo: (v: boolean) => void;

  dragging: boolean;
  setDragging: (v: boolean) => void;

  /** Close the topmost overlay — Esc semantics. Returns true if it closed something. */
  closeTop: () => boolean;
}

export const useAlokUi = create<AlokUiStore>((set, get) => ({
  view: null,
  toggleView: (v) => set({ view: get().view === v ? null : v }),
  closePanel: () => set({ view: null }),

  showLyrics: false,
  setShowLyrics: (showLyrics) => set({ showLyrics }),
  showQueue: false,
  setShowQueue: (showQueue) => set({ showQueue }),
  showFx: false,
  setShowFx: (showFx) => set({ showFx }),
  showMood: false,
  setShowMood: (showMood) => set({ showMood }),
  showAura: false,
  setShowAura: (showAura) => set({ showAura }),
  showCmd: false,
  setShowCmd: (showCmd) => set({ showCmd }),
  showInfo: false,
  setShowInfo: (showInfo) => set({ showInfo }),

  dragging: false,
  setDragging: (dragging) => set({ dragging }),

  closeTop: () => {
    const s = get();
    if (s.showCmd) { s.setShowCmd(false); return true; }
    if (s.showAura) { s.setShowAura(false); return true; }
    if (s.showFx) { s.setShowFx(false); return true; }
    if (s.showMood) { s.setShowMood(false); return true; }
    if (s.showLyrics) { s.setShowLyrics(false); return true; }
    if (s.showQueue) { s.setShowQueue(false); return true; }
    if (s.showInfo) { s.setShowInfo(false); return true; }
    if (s.view !== null) { s.closePanel(); return true; }
    return false;
  },
}));
