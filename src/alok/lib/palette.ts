// ── NOBODY ALOK · ring palettes ──────────────────────────────────────────────
// The conic-gradient progress ring + radial visualizer share one palette
// source. "cover" derives from the current track's extracted accent (set as
// --na-accent on #na-root by the app shell); everything else is fixed neon.

import type { Settings } from "../../cinema/types";

export type AlokRing = NonNullable<Settings["alokRing"]>;

export const ALOK_RINGS: AlokRing[] = ["cover", "spectrum", "ember", "aurora", "ice", "mono"];

/** Conic gradient (starting at 12 o'clock) for the ring band. */
export function ringGradient(ring: AlokRing, accent: string): string {
  switch (ring) {
    case "spectrum":
      return "conic-gradient(from -90deg, #ffb347, #ff5c8a 28%, #a06bff 55%, #4dd8ff 80%, #ffb347)";
    case "ember":
      return "conic-gradient(from -90deg, #ffd29d, #ff8a3d 32%, #ff3d5e 66%, #ffd29d)";
    case "aurora":
      return "conic-gradient(from -90deg, #3dffb0, #4dd8ff 38%, #4d9fff 68%, #3dffb0)";
    case "ice":
      return "conic-gradient(from -90deg, #e8fbff, #7dd8ff 40%, #9db4ff 74%, #e8fbff)";
    case "mono":
      return "conic-gradient(from -90deg, #ffffff, #8b8b95 38%, #e6e6ec 68%, #ffffff)";
    case "cover":
    default: {
      const a = accent || "#ffb347";
      const lite = `color-mix(in srgb, ${a} 42%, #ffffff)`;
      const deep = `color-mix(in srgb, ${a} 62%, #101013)`;
      return `conic-gradient(from -90deg, ${a}, ${lite} 30%, ${a} 58%, ${deep} 82%, ${a})`;
    }
  }
}

/** Stroke colors for the canvas visualizer (looped across bars). */
export function vizColors(ring: AlokRing, accent: string): string[] {
  switch (ring) {
    case "spectrum":
      return ["#ffb347", "#ff5c8a", "#a06bff", "#4dd8ff"];
    case "ember":
      return ["#ffd29d", "#ff8a3d", "#ff3d5e"];
    case "aurora":
      return ["#3dffb0", "#4dd8ff", "#4d9fff"];
    case "ice":
      return ["#e8fbff", "#7dd8ff", "#9db4ff"];
    case "mono":
      return ["#ffffff", "#b9b9c2", "#8b8b95"];
    case "cover":
    default:
      return accent ? [accent, `color-mix(in srgb, ${accent} 45%, #ffffff)`] : ["#ffb347"];
  }
}

/** A representative solid color (glow dots, active states). */
export function ringSolid(ring: AlokRing, accent: string): string {
  switch (ring) {
    case "spectrum":
      return "#ff5c8a";
    case "ember":
      return "#ff8a3d";
    case "aurora":
      return "#3dffb0";
    case "ice":
      return "#7dd8ff";
    case "mono":
      return "#e6e6ec";
    case "cover":
    default:
      return accent || "#ffb347";
  }
}
