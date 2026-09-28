// ── NOBODY EELA · ambient backdrop (V1.2.0 quality fix) ──────────────────────
// The old NP/ambient backgrounds stretched the raw cover and asked the GPU
// for a 90–110px CSS blur. On real Windows machines that rasterizes the
// blur in coarse tiles: the wash comes out blocky and banded — the
// "everything looks like a low-quality thumbnail" report.
//
// Fix: paint the cover ONCE into a tiny (48px) canvas with high-quality
// smoothing and ship it as a lossless PNG. Upscaling a 48px PNG with
// bilinear filtering is perfectly smooth by construction, costs the GPU
// ~nothing, and never bands. A whisper of CSS blur on top just melts the
// last resampling hints away.

import { coverUrl } from "../../cinema/lib/covers";

const cache = new Map<string, string>();

function coverToSmoothPng(img: HTMLImageElement): string | null {
  try {
    const S = 48;
    const cv = document.createElement("canvas");
    cv.width = S;
    cv.height = S;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // cover-fit the square
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
    return cv.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function urlToSmoothPng(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(coverToSmoothPng(img));
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Silky ambient backdrop for a track cover (cached per cover URL). */
export async function smoothBackdrop(trackId: string): Promise<string | null> {
  try {
    const raw = await coverUrl(trackId);
    if (!raw) return null;
    if (raw.startsWith("data:image/png") && raw.length < 8000) return raw; // already tiny
    const hit = cache.get(raw);
    if (hit) return hit;
    const png = await urlToSmoothPng(raw);
    if (png) cache.set(raw, png);
    return png;
  } catch {
    return null;
  }
}
