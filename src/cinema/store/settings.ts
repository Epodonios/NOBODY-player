// ── NOBODY · settings store (localStorage) ───────────────────────────────────

import { create } from "zustand";
import type { Settings } from "../types";
import { publishUiLang, readUiPrefs, onUiLang } from "../../uiMode";

const KEY = "nobody-settings";

const DEFAULTS: Settings = {
  lang: "en",
  theme: "dark",
  accentFromCover: true,
  lyricsSize: 1,
  lyricsStyle: "classic",
  eelaLyricsStyle: "karaoke",
  eelaTheme: "light",
  eqStyle: "random",
  ambientDelay: 14,
  customCursor: true,
  miniLyrics: true,
  eqEnabled: false,
  eqGains: [0, 0, 0, 0, 0, 0],
  speed: 1,
};

function load(): Settings {
  const base: Settings = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(base, JSON.parse(raw));
  } catch { /* corrupted storage → defaults */ }
  // dual-UI sync: the shared channel holds the last explicit language choice
  // (made in EITHER UI) and wins over this UI's own persisted value at boot.
  const shared = readUiPrefs();
  if (
    shared?.lang === "fa" ||
    shared?.lang === "en" ||
    shared?.lang === "tr" ||
    shared?.lang === "ru"
  ) {
    base.lang = shared.lang;
  }
  return base;
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  set: (k, v) => {
    set({ [k]: v } as any);
    const { set: _omit, ...rest } = get() as any;
    void _omit;
    try { localStorage.setItem(KEY, JSON.stringify(rest)); } catch { /* full */ }
    // broadcast language changes so the classic UI follows along (its echo
    // comes back with the same value and no-ops, so the loop terminates)
    if (k === "lang") publishUiLang(v as string, "cinema");
  },
}));

// ── dual-UI language sync (classic ⇄ cinema) ─────────────────────────────
// Seed the shared channel once if it has never been written, then follow any
// language chosen in the other UI for as long as both apps stay mounted.
(() => {
  if (!readUiPrefs()?.lang) publishUiLang(useSettings.getState().lang, "cinema");
  onUiLang((lang) => {
    const cur = useSettings.getState().lang;
    if ((lang === "fa" || lang === "en" || lang === "tr" || lang === "ru") && lang !== cur) {
      useSettings.getState().set("lang", lang);
    }
  });
})();

/** Apply theme/lang/dir to the Cinema root element (#nc-root) — the classic
 *  shell owns <html>, so cinema keeps its variables scoped to its own root. */
export function applyDocumentSettings(s: Settings) {
  const root = document.getElementById("nc-root");
  if (!root) return;
  root.dataset.theme = s.theme;
  root.lang = s.lang;
  root.dir = s.lang === "fa" ? "rtl" : "ltr";
}

export function applyAccent(accent: string | null) {
  const root = document.getElementById("nc-root");
  if (!root) return;
  if (accent) root.style.setProperty("--accent", accent);
  else root.style.removeProperty("--accent");
}
