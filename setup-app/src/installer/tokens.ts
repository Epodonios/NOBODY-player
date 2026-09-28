/**
 * Design tokens for the installer surface — V2 (modern pass).
 * Hand-copied from build/installer-assets/tokens.json — that file is generated
 * by sampling build/icon.png, so if the icon changes, regenerate and keep these
 * two in sync. The NSIS script reads the same values through !define.
 *
 * V2 changes: three accents (a warm pink→coral gradient is now the primary
 * signal), layered surface colours instead of one flat background, a real
 * radius scale, and a taller title bar to hold the app tile.
 */
export const TOKENS = {
  version: "1.5.1",
  build: "1.5.1.260115",
  bg: "#08070B",
  bg2: "#0E0C13",
  surface: "#14111B",
  surface2: "#1A1624",
  ink: "#F6F4F8",
  muted: "#A9A3B4",
  dim: "#6C6578",
  hair: "#1E1A26",
  accent1: "#FF2D78",
  accent2: "#FF9EC4",
  accent3: "#FF7A4D",
  /** the one gradient the whole surface is allowed to use */
  gradient: "linear-gradient(135deg, #FF2D78 0%, #FF7A4D 100%)",
  window: { w: 980, h: 640, titlebar: 52, radius: 16 },
  radius: { win: 16, card: 14, ctl: 10, pill: 999 },
  motion: { page: 240, finish: 280, eqBars: 12, eqTick: 16 },
  install: { sizeMb: 214.6, files: 241, freeNeededMb: 215 },
} as const;

export const ACCENT1 = TOKENS.accent1;
export const ACCENT2 = TOKENS.accent2;
export const ACCENT3 = TOKENS.accent3;

/** RRGGBB → 0x00BBGGRR. GDI is BGR-ordered; forgetting this turns pink purple. */
export function colorref(hex: string): number {
  const h = hex.replace("#", "");
  return parseInt(`${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`, 16);
}
