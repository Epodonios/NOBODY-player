// ── NOBODY · native classic-style cursors for the engine UIs ──────────────────
// The old approach (JS-drawn cursor visuals + document-wide `cursor: none`)
// made the pointer INVISIBLE in the packaged Windows build: the OS cursor was
// hidden, but the drawn visuals failed to show (transparent-window/GPU
// quirk) — and the user asked for the CLASSIC cursor everywhere anyway.
//
// Classic has always used native CSS `cursor: url(data:image/svg+xml,…)`
// cursors: an accent-stroked arrow for the default state and an accent ring
// for the pointer state. They are rendered by the compositor — always
// visible, zero lag, no rAF loop, no portals — and they work identically
// over sheets, portals, veils and drag regions.
//
// This module reuses that exact mechanism for Cinema / EELA / ALOK:
//   • `svgCursor()` builds the data-URI cursor strings (same shapes/hotspots
//     as classic).
//   • `<NativeCursor mode="cinema|eela|alok" />` activates them whenever its
//     UI is the active pane (and the user hasn't disabled custom cursors in
//     Settings), tinted with each face's own accent, re-read when the theme
//     or cover-accent changes.

import { useEffect } from "react";
import { useSettings } from "./cinema/store/settings";
import { getUiMode, UI_SWITCH_EVENT, type UiMode } from "./uiMode";

export type NativeCursorMode = Exclude<UiMode, "classic">;

const SPECS: Record<NativeCursorMode, { rootId: string; accentVar: string; themeAttrs: string[]; fallback: string }> = {
  cinema: { rootId: "nc-root", accentVar: "--accent", themeAttrs: ["data-theme"], fallback: "#e3b162" },
  eela: { rootId: "ne-root", accentVar: "--accent", themeAttrs: ["data-ne-theme"], fallback: "#2fadc0" },
  alok: { rootId: "na-root", accentVar: "--na-accent", themeAttrs: ["data-na-theme", "style"], fallback: "#ffb347" },
};

/** Accent-stroked arrow (default) / accent ring (pointer) — identical to the
 *  classic shell's cursors (shape, size and hotspots included). */
export function svgCursor(fill: string, pointer = false) {
  const svg = pointer
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="9" fill="${fill}" fill-opacity="0.25" stroke="${fill}" stroke-width="2"/><circle cx="13" cy="13" r="3" fill="#ffffff"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path fill="#0d0a12" stroke="${fill}" stroke-width="1.8" d="M6 3.5v19l5.4-5.3a.7.7 0 0 1 .5-.2h7.7a.6.6 0 0 0 .4-1L7 3a.6.6 0 0 0-1 .5Z"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${pointer ? "13 13" : "4 3"}, ${
    pointer ? "pointer" : "default"
  }`;
}

function readAccent(mode: NativeCursorMode): string {
  const spec = SPECS[mode];
  try {
    const root = document.getElementById(spec.rootId);
    if (!root) return spec.fallback;
    const v = getComputedStyle(root).getPropertyValue(spec.accentVar).trim();
    return v || spec.fallback;
  } catch {
    return spec.fallback;
  }
}

function apply(mode: NativeCursorMode) {
  const accent = readAccent(mode);
  const body = document.body;
  body.dataset.nativeCursor = mode;
  body.style.setProperty("--cursor-default", svgCursor(accent));
  body.style.setProperty("--cursor-pointer", svgCursor(accent, true));
}

function clear(mode: NativeCursorMode) {
  const body = document.body;
  if (body.dataset.nativeCursor === mode) {
    delete body.dataset.nativeCursor;
    body.style.removeProperty("--cursor-default");
    body.style.removeProperty("--cursor-pointer");
  }
}

/**
 * Mount inside each engine UI's root. Activates the shared native cursors
 * while THIS pane is the active UI; deactivates them on switch/unmount.
 */
export function NativeCursor({ mode }: { mode: NativeCursorMode }) {
  const settingOn = useSettings((s) => s.customCursor !== false);

  useEffect(() => {
    const spec = SPECS[mode];
    let observer: MutationObserver | null = null;

    const sync = () => {
      const active = settingOn && getUiMode() === mode;
      if (active) {
        apply(mode);
        // Re-tint when the face's theme/cover-accent changes (attr + inline
        // style mutations on the root — ALOK rewrites --na-accent inline).
        if (!observer) {
          observer = new MutationObserver(() => {
            if (document.body.dataset.nativeCursor === mode) apply(mode);
          });
        }
        const root = document.getElementById(spec.rootId);
        if (root) {
          observer.disconnect();
          observer.observe(root, { attributeFilter: [...spec.themeAttrs, "style"], attributes: true });
        }
      } else {
        observer?.disconnect();
        clear(mode);
      }
    };

    sync();
    window.addEventListener(UI_SWITCH_EVENT, sync);
    return () => {
      window.removeEventListener(UI_SWITCH_EVENT, sync);
      observer?.disconnect();
      clear(mode);
    };
  }, [mode, settingOn]);

  return null;
}
