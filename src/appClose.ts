// ── NOBODY · app close veil (V1.4.0, user request #6) ────────────────────────
// ONE bespoke shutdown animation per face:
//   classic — CRT power-off: the whole shell collapses into a bright
//             horizontal line, then a dot, then darkness (the NOBODY pink).
//   cinema  — projector shutdown: letterbox bars glide in, the light dims,
//             "NOBODY" fades like the last frame of a reel.
//   eela    — ink & paper: the page dims like a closing book, a serif
//             "NOBODY" exhales once and the light goes out.
//   alok    — core collapse: the neon ring implodes into a white-hot dot
//             that blinks out of existence.
//
// Electron flow (see electron/main.cjs): every close path (custom ✕ buttons,
// Alt+F4, taskbar close) lands in the main-process `close` guard, which asks
// the renderer to play the veil (`app:close-requested`) and only really
// closes once the renderer confirms (`win:close-confirmed`). A 3.5s main-side
// failsafe guarantees the app can never get stuck un-closable.
//
// Web runtime: the veil still plays, then window.close() does its best.

import { getUiMode, type UiMode } from "./uiMode";

const VEIL_ID = "nb-close-veil";
let playing = false;

const MARKUP: Record<UiMode, string> = {
  classic:
    '<div class="ncv-classic" aria-hidden="true"><div class="ncv-crt"></div><span class="ncv-classic-logo">N</span></div>',
  cinema:
    '<div class="ncv-cinema" aria-hidden="true"><div class="ncv-proj-beam"></div><span class="ncv-cinema-word">NOBODY</span><div class="ncv-bar ncv-bar-t"></div><div class="ncv-bar ncv-bar-b"></div><div class="ncv-flicker"></div></div>',
  eela:
    '<div class="ncv-eela" aria-hidden="true"><div class="ncv-paper"><span class="ncv-serif-word">NOBODY</span><span class="ncv-rule"></span><span class="ncv-folio">· fin ·</span></div></div>',
  alok:
    '<div class="ncv-alok" aria-hidden="true"><div class="ncv-ring"></div><div class="ncv-ring ncv-ring-2"></div><div class="ncv-dot"></div><span class="ncv-mono-word">CORE OFFLINE</span></div>',
};

/** Play the active face's close animation. Resolves when the veil has fully
 *  covered the window (~1s). Idempotent: a second call while playing just
 *  waits for the same veil. */
export function playCloseVeil(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (playing) return new Promise((r) => setTimeout(r, 1000));
  playing = true;

  return new Promise((resolve) => {
    const mode = getUiMode();
    const el = document.createElement("div");
    el.id = VEIL_ID;
    el.className = `nb-close-veil mode-${mode}`;
    el.setAttribute("role", "alert");
    el.setAttribute("aria-label", "NOBODY is closing");
    el.innerHTML = MARKUP[mode] ?? MARKUP.classic;
    document.body.appendChild(el);

    // double rAF → guarantee the initial (transparent) frame paints before
    // the .run animations kick in, so every transition is visible
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.classList.add("run");
        // keep the veil up a beat after the animation so the window never
        // shows a half-faded frame while the OS tears it down
        window.setTimeout(resolve, 1050);
      });
    });
  });
}

/** The ONE entry every ✕ button should call: veil → real close. */
export async function requestAppClose(): Promise<void> {
  const api = (globalThis as any).electronAPI;
  await playCloseVeil();
  if (api?.confirmClose) api.confirmClose();
  else window.close();
}

/** Install the main-process close-request listener ONCE (root level). Under
 *  Electron every close path (✕ / Alt+F4 / taskbar) is intercepted in main
 *  and mirrored here so the veil always plays exactly once. */
export function installAppCloseHandler(): () => void {
  const api = (globalThis as any).electronAPI;
  if (!api?.onCloseRequested) return () => undefined;
  if ((globalThis as any).__NOBODY_CLOSE_HANDLER__) return () => undefined;
  (globalThis as any).__NOBODY_CLOSE_HANDLER__ = true;
  api.onCloseRequested(() => {
    void requestAppClose();
  });
  return () => {
    (globalThis as any).__NOBODY_CLOSE_HANDLER__ = false;
  };
}
