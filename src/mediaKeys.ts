// ── NOBODY · hardware media-key bridge (V1.4.0, user request #9) ─────────────
// Windows music/video players answer the keyboard's Fn-media keys
// (play/pause ⏯ · next ⏭ · previous ⏮ · stop ⏹) even when minimized or
// unfocused. Electron delivers them through globalShortcut in the MAIN
// process (see electron/main.cjs), which forwards each press here as a
// `media:key` IPC. This module re-broadcasts it as a plain window
// CustomEvent so ANY face can react without importing Electron:
//
//   classic → src/App.tsx drives its own <audio> element.
//   cinema / eela / alok → src/cinema/lib/engine.ts drives the shared
//                           engine (guarded so it ignores classic).
//
// navigator.mediaSession still handles the in-focus OS media flyouts; the
// globalShortcut layer is what keeps working minimized/unfocused.

export type MediaKeyAction = "play-pause" | "next" | "prev" | "stop";

export const MEDIA_KEY_EVENT = "nobody-media-key";

/** Install once (main.tsx, UI-agnostic). Idempotent + defensive: on runtimes
 *  without the Electron bridge this is simply a no-op. */
export function installMediaKeyBridge(): () => void {
  const api = (globalThis as any).electronAPI;
  if (!api?.onMediaKey) return () => undefined;
  if ((globalThis as any).__NOBODY_MEDIA_BRIDGE__) return () => undefined;
  (globalThis as any).__NOBODY_MEDIA_BRIDGE__ = true;
  api.onMediaKey((action: MediaKeyAction) => {
    if (action !== "play-pause" && action !== "next" && action !== "prev" && action !== "stop") return;
    window.dispatchEvent(new CustomEvent(MEDIA_KEY_EVENT, { detail: { action } }));
  });
  return () => {
    (globalThis as any).__NOBODY_MEDIA_BRIDGE__ = false;
  };
}

/** Subscribe to media-key presses. Returns an unsubscribe function. */
export function onMediaKey(fn: (action: MediaKeyAction) => void): () => void {
  const handler = (e: Event) => {
    const action = (e as CustomEvent).detail?.action as MediaKeyAction | undefined;
    if (action) fn(action);
  };
  window.addEventListener(MEDIA_KEY_EVENT, handler);
  return () => window.removeEventListener(MEDIA_KEY_EVENT, handler);
}
