// ── NOBODY · UI mode switch engine ───────────────────────────────────────────

import { useEffect, useState } from "react";

// Real, root-level UI switching between the classic shell, the "Cinema"
// companion UI, the "EELA" paper-light UI and the "ALOK" neon-core UI. All
// apps stay mounted; exactly one is visible at a time. Playback state is
// handed over through a localStorage handoff blob so the user continues
// exactly where they were, whichever direction they switch. NOTE: cinema,
// eela & alok share ONE audio engine (the cinema module singleton), so
// switching between them needs no handoff — playback simply continues; only
// classic ⇄ (cinema|eela|alok) hand off.

export type UiMode = "classic" | "cinema" | "eela" | "alok";

export const UI_MODE_KEY = "nobody-ui-mode";
export const UI_HANDOFF_KEY = "nobody-ui-handoff";
export const UI_SWITCH_EVENT = "nobody-ui-switch";

export interface UiHandoff {
  from: UiMode;
  trackId: string | null;
  position: number;
  isPlaying: boolean;
  volume: number; // 0..1
  /** Full listen order of the outgoing UI (library ids). QA fix: without it
   *  the incoming engine received a single-track queue and playback died at
   *  the end of the current song instead of continuing. */
  queueIds?: string[];
}

export function getUiMode(): UiMode {
  try {
    const v = localStorage.getItem(UI_MODE_KEY);
    return v === "cinema" || v === "eela" || v === "alok" ? v : "classic";
  } catch {
    return "classic";
  }
}

/** Reactive ui-mode for components (settings switchers, veils, guards). */
export function useUiMode(): UiMode {
  const [mode, setMode] = useState<UiMode>(getUiMode);
  useEffect(() => {
    const on = (e: Event) => {
      const to = (e as CustomEvent).detail?.to;
      if (to === "classic" || to === "cinema" || to === "eela" || to === "alok") setMode(to);
    };
    window.addEventListener(UI_SWITCH_EVENT, on);
    return () => window.removeEventListener(UI_SWITCH_EVENT, on);
  }, []);
  return mode;
}

/** Read a pending handoff that originated from `from`. */
export function readUiHandoff(from: UiMode): UiHandoff | null {
  try {
    const raw = localStorage.getItem(UI_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UiHandoff;
    if (parsed?.from !== from) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearUiHandoff() {
  try {
    localStorage.removeItem(UI_HANDOFF_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Switch UI mode. Cinema ⇄ EELA share one engine: the swap is instantaneous
 * under the veil and playback never stops. Classic ⇄ (cinema|eela) captures
 * playback state from the outgoing app (each registers `captureHandoff`/
 * `pause` on window), stores it, pauses the outgoing audio element and
 * notifies the shell to swap visibility.
 */
export function switchUiMode(target: UiMode) {
  const current = getUiMode();
  if (current === target) return;
  const w = globalThis as any;
  const engineDriven = (m: UiMode) => m === "cinema" || m === "eela" || m === "alok";

  // cinema ⇄ eela drive the SAME audio element — nothing to hand over and
  // nothing to pause: the song simply keeps playing while the stage changes.
  if (engineDriven(current) && engineDriven(target)) {
    try { localStorage.setItem(UI_MODE_KEY, target); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent(UI_SWITCH_EVENT, { detail: { to: target, from: current } }));
    return;
  }

  // cinema & eela both answer for the shared engine…
  const outgoing = current === "classic" ? w.__NOBODY_BRIDGE__ : w.__NOBODY_CINEMA__;

  let handoff: Omit<UiHandoff, "from"> | null = null;
  try {
    handoff = typeof outgoing?.captureHandoff === "function" ? outgoing.captureHandoff() : null;
  } catch {
    handoff = null;
  }

  try {
    if (handoff && handoff.trackId) {
      localStorage.setItem(UI_HANDOFF_KEY, JSON.stringify({ ...handoff, from: current }));
    } else {
      localStorage.removeItem(UI_HANDOFF_KEY);
    }
  } catch {
    /* storage full — switch still proceeds, playback continuity is best-effort */
  }

  try {
    if (typeof outgoing?.pause === "function") outgoing.pause();
  } catch {
    /* ignore */
  }

  try {
    localStorage.setItem(UI_MODE_KEY, target);
  } catch {
    /* ignore */
  }

  window.dispatchEvent(new CustomEvent(UI_SWITCH_EVENT, { detail: { to: target, from: current } }));
}

// ── shared preferences channel (language sync between the two UIs) ──────────
// Both UIs live in one document, so a window CustomEvent is a reliable bus.
// localStorage keeps the last explicit choice so whichever UI boots first
// (or the only one that boots) adopts it. Loop safety: publishers always
// write the same value the receiver already has, so the echo no-ops.

export const UI_PREFS_KEY = "nobody-ui-prefs";
export const UI_PREFS_EVENT = "nobody-ui-prefs";

export interface UiSharedPrefs {
  lang?: string; // "fa" | "en" | "tr" | "ru"
  by?: UiMode; // which UI made the last change (informational)
}

export function readUiPrefs(): UiSharedPrefs | null {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UiSharedPrefs;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function publishUiLang(lang: string, by: UiMode) {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ lang, by }));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(UI_PREFS_EVENT, { detail: { lang, by } }));
}

/** Subscribe to language changes coming from either UI. Returns unsubscribe. */
export function onUiLang(fn: (lang: string, by?: UiMode) => void): () => void {
  const handler = (e: Event) => {
    const d = (e as CustomEvent).detail;
    if (d && typeof d.lang === "string") fn(d.lang, d.by);
  };
  window.addEventListener(UI_PREFS_EVENT, handler);
  return () => window.removeEventListener(UI_PREFS_EVENT, handler);
}
