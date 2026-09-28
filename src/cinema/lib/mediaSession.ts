// ── NOBODY Cinema · Media Session (OS media keys / lockscreen) ───────────────
// Best-effort integration: exposes track metadata + transport handlers to the
// operating system. In the Tauri desktop runtime (WebView2) this powers the
// keyboard media keys; in browsers it powers OS media controls. Fully guarded
// — environments without the API simply no-op.

import { engine } from "./engine";
import { getBridge } from "./desktopBridge";
import { useUi } from "../store/ui";
import { useLibrary } from "../store/library";

let bound = false;

/** A tiny silent placeholder — keeps artwork slot deterministic when no cover exists. */
const FALLBACK_ART =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#0a0a0d"/><text x="128" y="148" font-family="Georgia,serif" font-size="96" font-style="italic" fill="#e3b162" text-anchor="middle">N</text></svg>`
  );

function artworkFor(trackId: string): MediaImage[] {
  try {
    const url = getBridge()?.getCoverUrl(trackId) ?? null;
    return [{ src: url || FALLBACK_ART, sizes: "512x512", type: url ? "image/jpeg" : "image/svg+xml" }];
  } catch {
    return [{ src: FALLBACK_ART, sizes: "512x512", type: "image/svg+xml" }];
  }
}

function syncMetadata() {
  if (!("mediaSession" in navigator)) return;
  try {
    const id = useUi.getState().currentId;
    const track = id ? useLibrary.getState().tracks[id] : undefined;
    if (!track || !("MediaMetadata" in window)) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album,
      artwork: artworkFor(track.id),
    });
  } catch { /* ignore */ }
}

function syncPlaybackState() {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.playbackState = useUi.getState().isPlaying ? "playing" : "paused";
  } catch { /* ignore */ }
}

/** Wire the session once; reacts to engine state via the ui mirror store. */
export function initMediaSession(): () => void {
  if (!("mediaSession" in navigator)) return () => void 0;

  const unsub = useUi.subscribe(() => {
    syncMetadata();
    syncPlaybackState();
  });

  if (!bound) {
    bound = true;
    const set = (action: MediaSessionAction, fn: () => void) => {
      try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* unsupported action */ }
    };
    set("play", () => void engine.play());
    set("pause", () => engine.pause());
    set("nexttrack", () => engine.next());
    set("previoustrack", () => engine.prev());
    set("seekbackward", () => engine.seek(engine.audio.currentTime - 10));
    set("seekforward", () => engine.seek(engine.audio.currentTime + 10));
    try {
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (typeof d.seekTime === "number" && isFinite(d.seekTime)) engine.seek(d.seekTime);
      });
    } catch { /* ignore */ }
  }
  syncMetadata();
  syncPlaybackState();
  return unsub;
}

export function isMediaSessionSupported(): boolean {
  return typeof navigator !== "undefined" && "mediaSession" in navigator;
}
