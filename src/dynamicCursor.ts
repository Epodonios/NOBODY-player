// ── NOBODY · dynamic cursor system (V1.2.0 · Task 24-c) ──────────────────────
//
// ONE vanilla-TS module that owns everything cursor-related for all four faces
// (classic / cinema / eela / alok) living inside ONE document.
//
//   (a) NEVER-HAND ENFORCEMENT — an injected stylesheet forces the app's own
//       custom cursor on every element inside every UI surface, so no OS hand
//       / text / grab cursor can ever leak back in (native `cursor: pointer`
//       declarations, Tailwind `cursor-pointer` utilities and UA form-control
//       cursors are all overridden with !important + id-level specificity).
//
//   (b) DYNAMIC PER-FACE CURSORS — while cinema, eela or alok is the active
//       face, --nb-cursor / --nb-cursor-btn / --nb-cursor-text are re-encoded
//       SVG data-URIs tinted with that face's LIVE accent (cinema/eela: the
//       cover-driven --accent on their root, alok: --na-accent). The accent is
//       re-read on UI switches, on root style/class mutations and via a 1s
//       fallback poll — never per-frame. When classic is active the overrides
//       are removed so classic keeps its own (accent-reactive) SVG cursor set.
//
// Self-contained: no React, no new dependencies, app-lifetime singleton.

import { getUiMode, UI_SWITCH_EVENT, type UiMode } from "./uiMode";

// ── public API ───────────────────────────────────────────────────────────────

/** Cursor asset kinds: arrow = free-space pointer, spot = over interactive
 *  targets, text = elegant I-beam for editable fields (dynamic faces only). */
export type CursorKind = "arrow" | "spot" | "text";

/** The three faces that get a dynamic cursor (classic keeps its own set). */
export type DynamicFace = "cinema" | "eela" | "alok";

/**
 * Build a CSS cursor value from a tiny inline SVG.
 * @param kind   "arrow" (hotspot 2,2) | "spot" (hotspot 11,11) | "text" (11,11)
 * @param color  accent as hex (#rgb/#rrggbb/#rrggbbaa) or hsl()/rgb() string
 * @param face   silhouette family (per-face identity), default "cinema"
 * @returns      `url("data:image/svg+xml,…") x y, auto`
 */
export function svgCursor(kind: CursorKind, color: string, face: DynamicFace = "cinema"): string {
  const svg =
    kind === "arrow" ? arrowSvg(face, color) :
    kind === "spot" ? spotSvg(face, color) :
    textSvg(color);
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${HOTSPOT[kind]}, auto`;
}

/**
 * Install the cursor system ONCE (idempotent — safe under StrictMode
 * double-invocation and HMR). Returns a cleanup that removes the stylesheet,
 * listeners and observers and restores the classic defaults.
 */
export function initDynamicCursor(): () => void {
  if (typeof document === "undefined") return () => undefined;
  const w = globalThis as typeof globalThis & { __NOBODY_DYNAMIC_CURSOR__?: boolean };
  if (w.__NOBODY_DYNAMIC_CURSOR__) return () => undefined; // already installed
  w.__NOBODY_DYNAMIC_CURSOR__ = true;

  // Enforcement stylesheet — appended LAST so it wins all !important ties.
  const style = document.createElement("style");
  style.id = "nb-dynamic-cursor";
  style.textContent = ENFORCEMENT_CSS;
  document.head.appendChild(style);

  let face: UiMode = getUiMode();
  let lastColor = "";
  let observed: Element | null = null;
  let mo: MutationObserver | null = null;

  const attachObserver = (root: Element) => {
    if (observed === root) return;
    mo?.disconnect();
    observed = root;
    mo = new MutationObserver(() => refresh());
    // style (inline --accent/--na-accent writes), class + data-theme (theme
    // switches retint the accent vars from the stylesheet side).
    mo.observe(root, { attributes: true, attributeFilter: ["style", "class", "data-theme", "data-ne-theme", "data-na-theme"] });
  };

  const detachObserver = () => {
    mo?.disconnect();
    mo = null;
    observed = null;
  };

  const applyFace = (mode: UiMode) => {
    face = mode;
    detachObserver();
    if (mode === "classic") {
      // Classic owns its cursor set: drop the JS overrides so the :root
      // defaults (classic's own SVGs) and classic's --cursor-* vars apply.
      lastColor = "";
      html.style.removeProperty("--nb-cursor");
      html.style.removeProperty("--nb-cursor-btn");
      html.style.removeProperty("--nb-cursor-text");
      return;
    }
    refresh();
  };

  const refresh = () => {
    if (face === "classic") return;
    const cfg = FACES[face];
    const root = document.getElementById(cfg.rootId);
    let color = cfg.fallback;
    if (root && root.isConnected) {
      attachObserver(root);
      color = normalizeColor(getComputedStyle(root).getPropertyValue(cfg.varName), cfg.fallback);
    }
    if (color === lastColor) return;
    lastColor = color;
    html.style.setProperty("--nb-cursor", svgCursor("arrow", color, face));
    html.style.setProperty("--nb-cursor-btn", svgCursor("spot", color, face));
    html.style.setProperty("--nb-cursor-text", svgCursor("text", color, face));
  };

  const onSwitch = (e: Event) => {
    const to = (e as CustomEvent).detail?.to;
    if (to === "classic" || to === "cinema" || to === "eela" || to === "alok") applyFace(to);
  };

  applyFace(face);
  window.addEventListener(UI_SWITCH_EVENT, onSwitch);
  // 1s fallback poll (task-specified): catches root mounts the observer
  // hasn't seen yet and any accent write done outside the observed root.
  // Cost per tick: one getElementById + one getComputedStyle + string compare.
  const poll = window.setInterval(refresh, 1000);

  return () => {
    window.removeEventListener(UI_SWITCH_EVENT, onSwitch);
    window.clearInterval(poll);
    detachObserver();
    html.style.removeProperty("--nb-cursor");
    html.style.removeProperty("--nb-cursor-btn");
    html.style.removeProperty("--nb-cursor-text");
    style.remove();
    w.__NOBODY_DYNAMIC_CURSOR__ = false;
  };
}

// ── internals ────────────────────────────────────────────────────────────────

const html = document.documentElement;

const HOTSPOT: Record<CursorKind, string> = { arrow: "2 2", spot: "11 11", text: "11 11" };

/** Where each dynamic face reads its accent from + what to use before the
 *  root mounts (alok falls back to its declared warm neon default). */
const FACES: Record<DynamicFace, { rootId: string; varName: string; fallback: string }> = {
  cinema: { rootId: "nc-root", varName: "--accent", fallback: "#e3b162" },
  eela: { rootId: "ne-root", varName: "--accent", fallback: "#2fadc0" },
  alok: { rootId: "na-root", varName: "--na-accent", fallback: "#ffb347" },
};

/** Keep only plain hex / hsl()/rgb() values — anything computed (color-mix,
 *  var references, gradients) falls back to the face default. */
function normalizeColor(raw: string, fallback: string): string {
  const v = (raw || "").trim().toLowerCase();
  if (!v || v.includes("var(") || v.includes("color-mix(") || v.includes("gradient")) return fallback;
  if (v.startsWith("#")) {
    const h = v.slice(1);
    if (h.length === 3 || h.length === 4) return "#" + h.replace(/./g, (c) => c + c);
    if (h.length === 6 || h.length === 8) return v;
    return fallback;
  }
  if (/^(hsl|hsla|rgb|rgba)\(/.test(v)) return v.replace(/\s+/g, " ");
  return fallback;
}

// ── SVG asset builders (each ≈0.5–1KB, vector-crisp on HiDPI) ────────────────

/** Soft dark drop shadow so every silhouette reads on light AND dark. */
const DARK_SHADOW =
  '<filter id="s" x="-40%" y="-40%" width="180%" height="180%">' +
  '<feDropShadow dx="0" dy=".6" stdDeviation=".65" flood-color="#0b0712" flood-opacity=".45"/>' +
  '</filter>';

/** Neon glow shadow (alok + accent-tinted accents). */
const glowShadow = (color: string) =>
  '<filter id="g" x="-60%" y="-60%" width="220%" height="220%">' +
  `<feDropShadow dx="0" dy="0" stdDeviation="1.15" flood-color="${color}" flood-opacity=".9"/>` +
  "</filter>";

function arrowSvg(face: DynamicFace, color: string): string {
  if (face === "eela") {
    // EELA — fountain-pen NIB: dark ink body, white halo, accent slit+vent.
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">${DARK_SHADOW}` +
      `<g filter="url(#s)">` +
      `<path d="M2 2C7.6 4.1 12.7 7.5 15.9 12.1L19.6 20.3C15.1 19.1 10 16.3 6.7 12 4.3 8.7 2.7 5.3 2 2Z" ` +
      `fill="#26221b" stroke="#ffffff" stroke-opacity=".92" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M4.2 4.4 10.2 9.9" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>` +
      `<circle cx="12" cy="11.6" r="1.8" fill="${color}" stroke="#ffffff" stroke-opacity=".9" stroke-width=".7"/>` +
      `</g></svg>`
    );
  }
  if (face === "alok") {
    // ALOK — neon RING-dart: hollow accent outline + bright head dot.
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">${glowShadow(color)}` +
      `<path d="M2 2 25.4 13.7 15.7 15.8 10.9 25.2Z" fill="none" stroke="${color}" stroke-width="1.8" ` +
      `stroke-linejoin="round" filter="url(#g)"/>` +
      `<circle cx="4.9" cy="4.9" r="2.4" fill="#ffffff" stroke="${color}" stroke-width="1.1" filter="url(#g)"/>` +
      `</svg>`
    );
  }
  // CINEMA — sleek dart: near-white body, dark edge, faceted accent core.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">${DARK_SHADOW}` +
    `<g filter="url(#s)">` +
    `<path d="M2 2 26 13.4 15.6 15.8 10.6 25.4Z" fill="#fbfaf6" stroke="#241c2b" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<path d="M9.1 9.5 18.3 12.9 14.3 16.8 12.4 18.4Z" fill="${color}"/>` +
    `</g></svg>`
  );
}

function spotSvg(face: DynamicFace, color: string): string {
  if (face === "eela") {
    // EELA — ink-dot target: white halo + ink ring + accent ink dot.
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">${DARK_SHADOW}` +
      `<g filter="url(#s)">` +
      `<circle cx="11" cy="11" r="7.6" fill="${color}" fill-opacity=".14"/>` +
      `<circle cx="11" cy="11" r="7.6" fill="none" stroke="#ffffff" stroke-opacity=".9" stroke-width="2.4"/>` +
      `<circle cx="11" cy="11" r="7.6" fill="none" stroke="#26221b" stroke-width="1.2"/>` +
      `<circle cx="11" cy="11" r="2.9" fill="${color}" stroke="#ffffff" stroke-width="1"/>` +
      `</g></svg>`
    );
  }
  if (face === "alok") {
    // ALOK — glowing pulse dot: accent halo ring + white-hot core.
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">${glowShadow(color)}` +
      `<circle cx="11" cy="11" r="7.4" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="1.7" filter="url(#g)"/>` +
      `<circle cx="11" cy="11" r="2.8" fill="#ffffff" filter="url(#g)"/>` +
      `</svg>`
    );
  }
  // CINEMA — ring-with-dot target (white under-ring for dark surfaces).
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">${DARK_SHADOW}` +
    `<g filter="url(#s)">` +
    `<circle cx="11" cy="11" r="7.6" fill="${color}" fill-opacity=".16"/>` +
    `<circle cx="11" cy="11" r="7.6" fill="none" stroke="#ffffff" stroke-opacity=".9" stroke-width="2.6"/>` +
    `<circle cx="11" cy="11" r="7.6" fill="none" stroke="${color}" stroke-width="1.5"/>` +
    `<circle cx="11" cy="11" r="2.5" fill="${color}" stroke="#ffffff" stroke-width="1"/>` +
    `</g></svg>`
  );
}

/** Elegant serif I-beam, white-underlayed and tinted with the accent. */
function textSvg(color: string): string {
  const strokes = "M6.6 4.1C9 5.5 13 5.5 15.4 4.1M6.6 17.9C9 16.5 13 16.5 15.4 17.9M11 4.9V17.1";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">${DARK_SHADOW}` +
    `<g filter="url(#s)" fill="none" stroke-linecap="round">` +
    `<path d="${strokes}" stroke="#ffffff" stroke-opacity=".9" stroke-width="3.4"/>` +
    `<path d="${strokes}" stroke="${color}" stroke-width="1.6"/>` +
    `</g></svg>`
  );
}

// ── enforcement stylesheet ───────────────────────────────────────────────────

// Classic's OWN SVG cursor set — copied verbatim from src/index.css (REQ 8
// rules). These are the :root defaults; classic's React theme also defines
// --cursor-default/--cursor-pointer per accent, and the classic binding below
// prefers those so classic stays byte-identical to V1.1.0.
const CLASSIC_ARROW =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='%231a1622' stroke='%23ef4c78' stroke-width='1.8' d='M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z'/%3E%3C/svg%3E") 4 3, default`;
const CLASSIC_BTN =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='8' fill='%23ef4c78' fill-opacity='0.25' stroke='%23ef4c78' stroke-width='2'/%3E%3Ccircle cx='12' cy='12' r='3' fill='%23ffffff'/%3E%3C/svg%3E") 12 12, pointer`;

// Interactive elements inside the classic surfaces keep the accent circle.
const CLASSIC_SPOT_SEL = [
  '[data-ui-pane="classic"] button', '[data-ui-pane="classic"] [role="button"]',
  '[data-ui-pane="classic"] a', '[data-ui-pane="classic"] select',
  '[data-ui-pane="classic"] label', '[data-ui-pane="classic"] summary',
  '[data-ui-pane="classic"] input[type="range"]',
  '[data-ui-pane="classic"] .lyric-line', '[data-ui-pane="classic"] .compact-line',
  '[data-ui-pane="classic"] .playlist-card', '[data-ui-pane="classic"] .dt-btn',
  '[data-ui-pane="classic"] .copy-btn', '[data-ui-pane="classic"] .row-icon-btn',
  '[data-ui-pane="classic"] .ur-queue-btn',
  ".app-shell button", '.app-shell [role="button"]', ".app-shell a", ".app-shell select",
  ".app-shell label", ".app-shell summary", '.app-shell input[type="range"]',
  ".app-shell .lyric-line", ".app-shell .compact-line", ".app-shell .playlist-card",
  ".app-shell .dt-btn", ".app-shell .copy-btn", ".app-shell .row-icon-btn",
  ".app-shell .ur-queue-btn",
  ".compact-shell button", ".compact-shell a", '.compact-shell input[type="range"]',
  '.app-shell input[type="range"]::-webkit-slider-thumb',
  '.app-shell input[type="range"]::-moz-range-thumb',
].join(",\n");

// Tag-level interactive elements inside the three dynamic faces → spot cursor.
const dynTagSel = (root: string) =>
  ["button", '[role="button"]', "a", "select", "label", "summary", 'input[type="range"]']
    .map((s) => `${root} ${s}`)
    .concat(`${root} [class*="cursor-pointer"]`) // Tailwind utility rows → spot
    .join(",\n");

// Div-level interactive pieces the three faces style themselves.
const DYN_SPOT_SEL = [
  dynTagSel("#nc-root"),
  "#nc-root .slider-hit", "#nc-root .nc-row", "#nc-root .lyric-line",
  "#nc-root .nc-group-play", "#nc-root .nobody-range",
  "#nc-root .nobody-range::-webkit-slider-thumb", "#nc-root .nobody-range::-moz-range-thumb",
  dynTagSel("#ne-root"),
  "#ne-root .ne-chip", "#ne-root .ne-btn", "#ne-root .ne-icon-btn", "#ne-root .ne-play-btn",
  "#ne-root .ne-seg-btn", "#ne-root .ne-switch", "#ne-root .ne-range", "#ne-root .ne-slider",
  "#ne-root .ne-nav-btn", "#ne-root .ne-track-row", "#ne-root .ne-lyr-line",
  "#ne-root .ne-ambient-close", "#ne-root .ne-now-track", "#ne-root .ne-group-play",
  dynTagSel("#na-root"),
  "#na-root .na-chip", "#na-root .na-btn", "#na-root .na-icon-btn", "#na-root .na-seg-btn",
  "#na-root .na-switch", "#na-root .na-range", "#na-root .na-vert", "#na-root .na-lang-btn",
  "#na-root .na-win-btn", "#na-root .na-ring-hit", "#na-root .na-core", "#na-root .na-t-btn",
  "#na-root .na-play", "#na-root .na-dock-btn", "#na-root .na-import-folder",
  "#na-root .na-import-main", "#na-root .na-orbit-btn", "#na-root .na-panel-x",
  "#na-root .na-row", "#na-root .na-lyr-line", "#na-root .na-swatch",
  "#na-root .na-aura-close", "#na-root .na-face-card", "#na-root .na-vol-btn",
  "#na-root .na-meta-like", "#na-root .na-meta-title-btn", "#na-root .na-state-chip",
  "#na-root .na-pop-btn", "#na-root .na-cmd-item", "#na-root .na-q-mv button",
].join(",\n");

// Editable fields in the dynamic faces keep selection UX via the accent
// I-beam (--nb-cursor-text). Classic fields use the classic arrow instead —
// its surfaces are user-select:none and the user asked for "never text".
const TEXT_SEL = ["#nc-root", "#ne-root", "#na-root"]
  .flatMap((r) => [
    `${r} input:not([type="range"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"])`,
    `${r} textarea`,
    `${r} [contenteditable="true"]`,
  ])
  .join(",\n");

const ENFORCEMENT_CSS = /* css */ `
/* ═══ NOBODY dynamic cursor (src/dynamicCursor.ts · V1.2.0) ═══════════════
   (a) The app's custom cursor EVERYWHERE — no OS hand/text/grab may leak in.
   (b) Dynamic faces re-tint --nb-cursor* from their live accent (JS). */

/* Token defaults = classic's own SVG set (verbatim from src/index.css). */
:root {
  --nb-cursor: ${CLASSIC_ARROW};
  --nb-cursor-btn: ${CLASSIC_BTN};
  --nb-cursor-text: var(--nb-cursor);
}

/* Classic binding: prefer classic's own accent-reactive vars when present. */
.app-shell,
.compact-shell {
  --nb-cursor: var(--cursor-default, ${CLASSIC_ARROW});
  --nb-cursor-btn: var(--cursor-pointer, ${CLASSIC_BTN});
  --nb-cursor-text: var(--nb-cursor);
}

/* (a) ENFORCEMENT — every element of every UI surface + all body-level
   overlays (switch veils, portals via inheritance from body). */
[data-ui-pane="classic"], [data-ui-pane="classic"] *,
.app-shell, .app-shell *, .compact-shell, .compact-shell *,
#nc-root, #nc-root *, #ne-root, #ne-root *, #na-root, #na-root *,
.nc-veil, .nc-veil *, .ne-veil, .ne-veil *, .na-veil, .na-veil *,
html, body, #root {
  cursor: var(--nb-cursor) !important;
}

/* Interactive targets → spot cursor (doc level; classic overrides below). */
body button, body [role="button"], body a, body select, body label, body summary,
body input[type="range"] {
  cursor: var(--nb-cursor-btn) !important;
}

/* Classic interactive keeps its accent circle (classic set, --cursor-*). */
${CLASSIC_SPOT_SEL} {
  cursor: var(--cursor-pointer, var(--nb-cursor-btn)) !important;
}

/* Dynamic faces: interactive → spot (buttons, sliders, rows, Tailwind
   cursor-pointer utilities and each face's own interactive classes). */
${DYN_SPOT_SEL} {
  cursor: var(--nb-cursor-btn) !important;
}

/* Editable fields in the dynamic faces → accent I-beam (selection UX). */
${TEXT_SEL} {
  cursor: var(--nb-cursor-text) !important;
}

/* Carve-outs: the intentional idle "hide the cursor" features of classic
   (idle cinema) and ALOK (idle dim) survive the enforcement. */
.app-shell[data-idle="true"], .app-shell[data-idle="true"] *,
#na-root[data-idle="true"], #na-root[data-idle="true"] * {
  cursor: none !important;
}

/* V1.4.0 (cursor leak #5): Chromium paints SCROLLBARS at the OS layer and
   falls back to the SYSTEM arrow whenever the hover lands on the scrollbar
   track/thumb/corner itself — the element-level rules above never reach the
   pseudo-elements. Give every scrollbar part of every shell an explicit
   cursor so the custom pointer survives the "خط اسکرول" hover. */
#nc-root::-webkit-scrollbar, #nc-root ::-webkit-scrollbar,
#ne-root::-webkit-scrollbar, #ne-root ::-webkit-scrollbar,
#na-root::-webkit-scrollbar, #na-root ::-webkit-scrollbar,
.app-shell ::-webkit-scrollbar, .compact-shell ::-webkit-scrollbar,
[data-ui-pane="classic"] ::-webkit-scrollbar,
html::-webkit-scrollbar, body::-webkit-scrollbar {
  cursor: var(--nb-cursor) !important;
}
#nc-root ::-webkit-scrollbar-thumb, #nc-root::-webkit-scrollbar-thumb,
#ne-root ::-webkit-scrollbar-thumb, #ne-root::-webkit-scrollbar-thumb,
#na-root ::-webkit-scrollbar-thumb, #na-root::-webkit-scrollbar-thumb,
.app-shell ::-webkit-scrollbar-thumb, .compact-shell ::-webkit-scrollbar-thumb,
[data-ui-pane="classic"] ::-webkit-scrollbar-thumb {
  cursor: var(--nb-cursor-btn) !important;
}
#nc-root ::-webkit-scrollbar-track, #nc-root ::-webkit-scrollbar-track-piece,
#nc-root ::-webkit-scrollbar-corner,
#ne-root ::-webkit-scrollbar-track, #ne-root ::-webkit-scrollbar-track-piece,
#ne-root ::-webkit-scrollbar-corner,
#na-root ::-webkit-scrollbar-track, #na-root ::-webkit-scrollbar-track-piece,
#na-root ::-webkit-scrollbar-corner,
.app-shell ::-webkit-scrollbar-track, .app-shell ::-webkit-scrollbar-track-piece,
.app-shell ::-webkit-scrollbar-corner,
.compact-shell ::-webkit-scrollbar-track, .compact-shell ::-webkit-scrollbar-track-piece,
.compact-shell ::-webkit-scrollbar-corner,
[data-ui-pane="classic"] ::-webkit-scrollbar-track,
[data-ui-pane="classic"] ::-webkit-scrollbar-track-piece,
[data-ui-pane="classic"] ::-webkit-scrollbar-corner {
  cursor: var(--nb-cursor) !important;
}
`;
