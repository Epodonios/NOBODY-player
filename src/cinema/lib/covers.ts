// ── NOBODY · cover art system ────────────────────────────────────────────────
// Deterministic placeholder covers (gradient + monogram, seeded by title/artist),
// accent color extraction, pre-rendered blurred backdrops (blur is painted ONCE
// into a canvas — never an always-animating CSS filter), and an object-URL cache
// with strict revocation to avoid memory leaks.

import { db } from "./db";
import { prng, clamp } from "./utils";
import { desktopFetch } from "../../desktopHttp";

const urlCache = new Map<string, string>();
const blurCache = new Map<string, string>();

/** HSL palette derived deterministically from a seed string. */
export function paletteFor(seed: string): { h1: number; h2: number; deep: string } {
  const r = prng("pal:" + seed);
  const h1 = Math.floor(r() * 360);
  const h2 = (h1 + 40 + Math.floor(r() * 120)) % 360;
  return { h1, h2, deep: `hsl(${h1} 45% 10%)` };
}

export function cssGradientFor(seed: string): string {
  const { h1, h2 } = paletteFor(seed);
  return `linear-gradient(135deg, hsl(${h1} 62% 42%), hsl(${h2} 70% 24%) 70%)`;
}

function monogram(title: string, artist: string): string {
  const pick = (s: string) => {
    const w = s.trim().split(/\s+/).filter(Boolean);
    return w.length ? [...w[0]][0]!.toUpperCase() : "";
  };
  return (pick(title) + pick(artist !== "Unknown Artist" ? artist : title.split(/\s+/)[1] || title)) .slice(0, 2);
}

/** Generate an abstract placeholder cover as a Blob (deterministic per track). */
export async function makePlaceholderCover(title: string, artist: string): Promise<Blob> {
  const S = 640;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const ctx = cv.getContext("2d")!;
  const seed = `${title}|${artist}`;
  const r = prng("cover:" + seed);
  const { h1, h2 } = paletteFor(seed);

  const bg = ctx.createLinearGradient(0, 0, S, S);
  bg.addColorStop(0, `hsl(${h1} 48% 16%)`);
  bg.addColorStop(1, `hsl(${h2} 55% 8%)`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, S, S);

  // soft light blobs
  for (let i = 0; i < 5; i++) {
    const x = r() * S, y = r() * S, rad = 90 + r() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const hue = r() > 0.5 ? h1 : h2;
    g.addColorStop(0, `hsla(${hue} 80% ${55 + r() * 20}% / ${0.35 + r() * 0.3})`);
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }

  // orbital rings
  ctx.strokeStyle = "hsla(0 0% 100% / 0.14)";
  for (let i = 0; i < 3; i++) {
    ctx.lineWidth = 1 + r() * 2;
    ctx.beginPath();
    ctx.arc(S * (0.25 + r() * 0.5), S * (0.25 + r() * 0.5), 60 + r() * 220, r() * 6.28, r() * 6.28 + 2 + r() * 3);
    ctx.stroke();
  }

  // grain
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = `hsla(0 0% 100% / ${r() * 0.05})`;
    ctx.fillRect(r() * S, r() * S, 1.4, 1.4);
  }

  // monogram
  const mono = monogram(title, artist);
  try { await document.fonts.load(`italic 600 300px "Fraunces Variable"`); } catch { /* fallback below */ }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `italic 600 ${mono.length > 1 ? 235 : 300}px "Fraunces Variable", Georgia, serif`;
  ctx.fillStyle = "hsla(0 0% 100% / 0.92)";
  ctx.shadowColor = "hsla(0 0% 0% / 0.45)";
  ctx.shadowBlur = 40;
  ctx.fillText(mono, S / 2, S / 2 + S * 0.02);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "hsla(0 0% 100% / 0.25)";
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, S - 48, S - 48);

  return await new Promise<Blob>((res) => cv.toBlob((b) => res(b!), "image/jpeg", 0.86));
}

/** Extract a vibrant accent color (hsl string) from a cover blob — cached per track. */
export async function extractAccent(blob: Blob, seed: string): Promise<string> {
  const cached = accentCache.get(seed);
  if (cached) return cached;
  try {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("img"));
      img.src = url;
    });
    const cv = document.createElement("canvas");
    cv.width = cv.height = 24;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0, 24, 24);
    URL.revokeObjectURL(url);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0, n = 0;
    // favor saturated pixels
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      const sat = mx - mn;
      const w = 1 + sat / 80;
      r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
    }
    r /= n; g /= n; b /= n;
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
    const l = (mx + mn) / 2;
    let h = 0;
    const dl = mx - mn;
    if (dl > 0.02) {
      const rr = r / 255, gg = g / 255, bb = b / 255;
      if (mx === rr) h = ((gg - bb) / dl) % 6;
      else if (mx === gg) h = (bb - rr) / dl + 2;
      else h = (rr - gg) / dl + 4;
      h *= 60; if (h < 0) h += 360;
    } else {
      const p = paletteFor(seed); h = p.h1;
    }
    let s = dl === 0 ? 55 : Math.round((dl / (1 - Math.abs(2 * l - 1) || 1)) * 100);
    s = Math.max(45, Math.min(85, s + 15));
    const li = Math.max(48, Math.min(68, Math.round(l * 100) + 14));
    const accent = `hsl(${Math.round(h)} ${s}% ${li}%)`;
    accentCache.set(seed, accent);
    return accent;
  } catch {
    const p = paletteFor(seed);
    return `hsl(${p.h1} 70% 60%)`;
  }
}
const accentCache = new Map<string, string>();

// ── cover palette extraction (karaoke lyric fill) ────────────────────────────

/** Two dominant cover colors as hsl() strings — pours the track's OWN cover
 *  art through the karaoke fill gradient (`--lyr-c1` / `--lyr-c2`). */
export interface TrackPalette { c1: string; c2: string }

const paletteCache = new Map<string, TrackPalette>();

/** Extract the two most dominant DISTINCT hues from a cover blob.
 *  Pixels are downsampled to 24×24 and bucketed by hue; near-black, near-white
 *  and washed-out (low-saturation) pixels are ignored. The two heaviest buckets
 *  ≥25° apart win; a monochrome cover falls back to a deeper shade of its one
 *  dominant hue. S/L are clamped to the same pleasant band extractAccent uses.
 *  Cached per seed (the caller passes track.id). Returns null on any failure so
 *  CSS can fall back to the accent color. */
export async function extractPaletteFromBlob(blob: Blob, seed: string): Promise<TrackPalette | null> {
  const hit = paletteCache.get(seed);
  if (hit) return hit;
  try {
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement("canvas");
    cv.width = cv.height = 24;
    const ctx = cv.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, 24, 24);
    bmp.close();
    const d = ctx.getImageData(0, 0, 24, 24).data;

    // 12 hue buckets of 30° with circular-weighted hue + mean S/L per bucket
    const B = 12;
    const w = new Array<number>(B).fill(0);
    const sinSum = new Array<number>(B).fill(0);
    const cosSum = new Array<number>(B).fill(0);
    const sSum = new Array<number>(B).fill(0);
    const lSum = new Array<number>(B).fill(0);
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const l = (mx + mn) / 2;
      const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1) || 1);
      if (l < 0.1 || l > 0.92 || sat < 0.18) continue; // ignore black/white/washed pixels
      let h = 0;
      const dl = mx - mn;
      if (dl > 0) {
        if (mx === r) h = ((g - b) / dl) % 6;
        else if (mx === g) h = (b - r) / dl + 2;
        else h = (r - g) / dl + 4;
        h *= 60; if (h < 0) h += 360;
      }
      const wt = 1 + sat; // saturated pixels speak louder
      const k = Math.min(B - 1, Math.floor(h / 30));
      const rad = (h * Math.PI) / 180;
      w[k] += wt;
      sinSum[k] += Math.sin(rad) * wt;
      cosSum[k] += Math.cos(rad) * wt;
      sSum[k] += sat * 100;
      lSum[k] += l * 100;
    }

    const order = w.map((v, i) => [v, i] as const).filter(([v]) => v > 0).sort((a, b) => b[0] - a[0]);
    if (!order.length) return null; // fully desaturated cover → accent fallback
    const hueOf = (k: number) => {
      let h = (Math.atan2(sinSum[k], cosSum[k]) * 180) / Math.PI;
      if (h < 0) h += 360;
      return h;
    };
    const hueDist = (a: number, b: number) => {
      const x = Math.abs(a - b) % 360;
      return x > 180 ? 360 - x : x;
    };
    const meanS = (k: number) => sSum[k] / w[k];
    const meanL = (k: number) => lSum[k] / w[k];

    const k1 = order[0][1];
    const h1 = hueOf(k1);
    // second hue: heaviest remaining bucket ≥25° from the first, else none
    let h2 = h1;
    let k2: number | undefined;
    for (const [, k] of order.slice(1)) {
      const hk = hueOf(k);
      if (hueDist(hk, h1) >= 25) { h2 = hk; k2 = k; break; }
    }

    // pleasant tuning (mirrors extractAccent): c1 bright & vivid, c2 deeper
    const c1 = `hsl(${Math.round(h1)} ${Math.round(clamp(meanS(k1), 55, 75))}% ${Math.round(clamp(meanL(k1), 52, 62))}%)`;
    const c2 = `hsl(${Math.round(h2)} ${Math.round(clamp(meanS(k2 ?? k1), 50, 72))}% ${Math.round(clamp(k2 !== undefined ? meanL(k2) : meanL(k1) - 10, 40, 50))}%)`;
    const pal: TrackPalette = { c1, c2 };
    paletteCache.set(seed, pal);
    return pal;
  } catch {
    return null;
  }
}

/** Pre-render a blurred version of a cover ONCE (small canvas) → data URL.
 *  Used for the ambient backdrop so no live CSS blur ever animates. */
export async function blurredBackdrop(trackId: string, blob: Blob): Promise<string> {
  const hit = blurCache.get(trackId);
  if (hit) return hit;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("x")); img.src = url; });
    const cv = document.createElement("canvas");
    cv.width = 288; cv.height = 288;
    const ctx = cv.getContext("2d")!;
    ctx.filter = "blur(26px) saturate(1.35) brightness(0.72)";
    // overscan so blur edges don't show transparency
    ctx.drawImage(img, -40, -40, 368, 368);
    const out = cv.toDataURL("image/jpeg", 0.7);
    blurCache.set(trackId, out);
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── cover URL cache (with revocation discipline) ─────────────────────────────

export async function coverUrl(trackId: string): Promise<string | null> {
  const hit = urlCache.get(trackId);
  if (hit) return hit;
  const blob = await db.getCover(trackId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(trackId, url);
  return url;
}

export function coverUrlSync(trackId: string): string | null {
  return urlCache.get(trackId) ?? null;
}

export function invalidateCover(trackId: string) {
  const url = urlCache.get(trackId);
  if (url) { URL.revokeObjectURL(url); urlCache.delete(trackId); }
  blurCache.delete(trackId);
  paletteCache.delete(trackId); // cover replaced → karaoke palette must re-extract
}

export function revokeAllCovers() {
  urlCache.forEach((u) => URL.revokeObjectURL(u));
  urlCache.clear();
}

// ── artist cover fetch (ARTISTS board — iTunes album search) ───────────────

const ARTIST_TIMEOUT_MS = 10000;

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => window.clearTimeout(timer) };
}

/** Same hard-timeout contract as the classic cover client (src/coverart.ts):
 *  Electron/Tauri ride the CORS-free desktop transport, plain web falls back
 *  to window.fetch — one helper, one timeout race. */
async function artistResilientFetch(url: string): Promise<Response> {
  const { signal, cancel } = withTimeout(ARTIST_TIMEOUT_MS);
  try {
    return await desktopFetch(url, { signal, timeoutMs: ARTIST_TIMEOUT_MS });
  } finally {
    cancel();
  }
}

/** Fetch a square artist image for the ARTISTS board: iTunes album search
 *  (keyless, no auth) → prefer the first result whose artistName loosely
 *  matches the query (case-insensitive containment) → artworkUrl100 upscaled
 *  to 600x600 (Apple's CDN serves any requested size up to the source — the
 *  same trick as the classic cover client) → bytes via the SAME http
 *  pathway. Returns null on ANY failure so the caller just skips the artist. */
export async function fetchArtistCover(artist: string): Promise<Blob | null> {
  const name = artist.trim();
  if (!name) return null;
  try {
    const term = encodeURIComponent(name);
    const res = await artistResilientFetch(
      `https://itunes.apple.com/search?term=${term}&entity=album&limit=6`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows: Array<Record<string, unknown>> = Array.isArray(data?.results) ? data.results : [];
    const withArt = rows.filter((r) => typeof r.artworkUrl100 === "string" && r.artworkUrl100);
    if (!withArt.length) return null;
    // loose match first ("Radiohead" matches "Radiohead" but also
    // "Radiohead & Friends"), then fall back to the very first hit
    const q = name.toLowerCase();
    const pick =
      withArt.find((r) => typeof r.artistName === "string" && (r.artistName as string).toLowerCase().includes(q)) ??
      withArt[0];
    const artwork = (pick.artworkUrl100 as string).replace("100x100", "600x600");
    const art = await artistResilientFetch(artwork);
    if (!art.ok) return null;
    const buf = await art.arrayBuffer();
    if (buf.byteLength <= 1000) return null; // blob-size sanity guard, classic parity
    const type = art.headers.get("content-type") || "";
    const mime = type.includes("png") ? "image/png" : type.includes("webp") ? "image/webp" : "image/jpeg";
    return new Blob([buf], { type: mime });
  } catch {
    return null;
  }
}
