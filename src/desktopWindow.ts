// Native Desktop Window Controller — Tauri 2 (withGlobalTauri) + Electron + Web fallback.
//
// Electron migration: every function now has a COMPLETE Electron branch that
// mirrors the Tauri one (window chrome, fullscreen round-trip, compact-mode
// resize/reposition/always-on-top). The Electron side is implemented by
// electron/main.cjs + electron/preload.cjs; the saved window state for the
// compact round-trip lives in the MAIN process (it survives renderer
// reloads, which the old renderer-side variable did not).

interface TauriWindowApi {
  getCurrentWindow: () => {
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    close: () => Promise<void>;
    setFullscreen: (fullscreen: boolean) => Promise<void>;
    isFullscreen: () => Promise<boolean>;
    setResizable: (resizable: boolean) => Promise<void>;
    setAlwaysOnTop: (value: boolean) => Promise<void>;
    setSize: (size: any) => Promise<void>;
    setPosition: (position: any) => Promise<void>;
    innerSize: () => Promise<{ width: number; height: number }>;
    outerPosition: () => Promise<{ x: number; y: number }>;
    scaleFactor: () => Promise<number>;
    startDragging: () => Promise<void>;
  };
  LogicalSize: new (width: number, height: number) => any;
  LogicalPosition: new (x: number, y: number) => any;
}

/** Payload of the win:state events pushed by electron/main.cjs. */
export type ElectronWindowState = { maximized: boolean; fullscreen: boolean };

/** V1.4.0 (#9) — the four hardware media-key actions main.cjs forwards. */
export type ElectronMediaKeyAction = "play-pause" | "next" | "prev" | "stop";

interface ElectronApi {
  /* window chrome */
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  toggleFullscreen: () => Promise<boolean>;
  getState: () => Promise<ElectronWindowState>;
  onWindowState: (callback: (state: ElectronWindowState) => void) => () => void;
  /* compact mini-player */
  enterCompact: () => Promise<boolean>;
  exitCompact: () => Promise<boolean>;
  /* native dialogs */
  pickFolders: () => Promise<string[]>;
  pickFiles: () => Promise<string[]>;
  /* V1.4.0 extras — optional because preload.cjs is the source of truth and
   * older shells predate them. See the sections at the bottom of this file. */
  /** #9 — globalShortcut presses forwarded from main (minimized/unfocused OK). */
  onMediaKey?: (callback: (action: ElectronMediaKeyAction) => void) => () => void;
  /** #6 — main intercepted a close (✕/Alt+F4/taskbar) and asks for the veil. */
  onCloseRequested?: (callback: () => void) => () => void;
  /** #6 — renderer finished its veil; main may really close the window now. */
  confirmClose?: () => void;
  /** #5 — manual window drag over IPC (replaces the OS drag regions). */
  dragStart?: () => void;
  dragBy?: (ax: number, ay: number) => void;
  dragEnd?: () => void;
  /* V1.2.0: real absolute path of a renderer File (Electron 32+ removed
   * File.path — webUtils.getPathForFile is the sanctioned replacement). */
  getPathForFile: (file: File) => string;
  /* bounded fs (see desktopLibrary.ts) */
  stat: (path: string) => Promise<{ size: number; isFile: boolean; mtimeMs: number }>;
  readSlice: (path: string, start: number, length: number) => Promise<Uint8Array>;
  readFile: (path: string) => Promise<Uint8Array>;
  writeTextFile: (path: string, content: string) => Promise<boolean>;
  writeBinaryFile: (path: string, bytes: Uint8Array) => Promise<boolean>;
  walk: (root: string, extensions: string[]) => Promise<string[]>;
  /* allow-listed HTTP proxy (see desktopHttp.ts) */
  httpFetch: (
    url: string,
    options?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => Promise<{ ok: boolean; status: number; headers: Record<string, string>; bodyBase64: string }>;
  /* external links */
  openExternal: (url: string) => Promise<boolean>;
}

declare global {
  interface Window {
    __TAURI__?: {
      window?: TauriWindowApi;
    };
    electronAPI?: ElectronApi;
  }
}

const tauriWin = () => window.__TAURI__?.window;
export const isTauri = () => typeof window !== "undefined" && !!tauriWin()?.getCurrentWindow;
export const isElectron = () => typeof window !== "undefined" && !!window.electronAPI;

export async function minimizeDesktopWindow(): Promise<void> {
  const api = tauriWin();
  if (api) {
    await api.getCurrentWindow().minimize();
    return;
  }
  if (isElectron()) window.electronAPI!.minimize();
}

export async function maximizeDesktopWindow(): Promise<void> {
  const api = tauriWin();
  if (api) {
    await api.getCurrentWindow().toggleMaximize();
    return;
  }
  if (isElectron()) window.electronAPI!.maximize();
}

export async function closeDesktopWindow(): Promise<void> {
  const api = tauriWin();
  if (api) {
    await api.getCurrentWindow().close();
    return;
  }
  if (isElectron()) {
    window.electronAPI!.close();
    return;
  }
  window.close();
}

export async function toggleDesktopFullscreen(currentFullscreen: boolean): Promise<boolean> {
  const api = tauriWin();
  if (api) {
    const win = api.getCurrentWindow();
    const next = !currentFullscreen;
    await win.setFullscreen(next);
    return next;
  }
  if (isElectron()) {
    // The main process resolves with the REAL state after toggling, so the
    // renderer never drifts out of sync (matches Tauri's setFullscreen
    // round-trip; the old optimistic !currentFullscreen is gone).
    try {
      return await window.electronAPI!.toggleFullscreen();
    } catch {
      return !currentFullscreen;
    }
  }
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => undefined);
    return false;
  }
  await document.documentElement.requestFullscreen().catch(() => undefined);
  return true;
}

/* ───────────────────────── COMPACT / MINI PLAYER ───────────────────────── */

const COMPACT_W = 440;
const COMPACT_H = 260;
let savedWindowState: { width: number; height: number; x: number; y: number } | null = null;

export async function enterCompactWindow(): Promise<void> {
  const api = tauriWin();
  if (api) {
    try {
      const win = api.getCurrentWindow();
      const size = await win.innerSize();
      const pos = await win.outerPosition();
      const scale = await win.scaleFactor();
      savedWindowState = {
        width: Math.round(size.width / scale),
        height: Math.round(size.height / scale),
        x: Math.round(pos.x / scale),
        y: Math.round(pos.y / scale),
      };

      await win.setResizable(false);
      await win.setAlwaysOnTop(true);
      await win.setSize(new api.LogicalSize(COMPACT_W, COMPACT_H));

      const screenW = window.screen?.availWidth ?? 1920;
      const screenH = window.screen?.availHeight ?? 1080;
      await win.setPosition(new api.LogicalPosition(screenW - COMPACT_W - 30, screenH - COMPACT_H - 30));
    } catch {
      /* ignore — CSS mini player still works */
    }
    return;
  }
  if (isElectron()) {
    // Main process saves/restores the real window bounds (getNormalBounds)
    // and repositions to the bottom-right of the work area, exactly like
    // the Tauri branch above. Best-effort: the CSS mini player works even
    // when the OS resize fails.
    try {
      await window.electronAPI!.enterCompact();
    } catch {
      /* ignore */
    }
  }
}

export async function exitCompactWindow(): Promise<void> {
  const api = tauriWin();
  if (api) {
    try {
      const win = api.getCurrentWindow();
      await win.setAlwaysOnTop(false);
      await win.setResizable(true);
      if (savedWindowState) {
        await win.setSize(new api.LogicalSize(savedWindowState.width, savedWindowState.height));
        await win.setPosition(new api.LogicalPosition(savedWindowState.x, savedWindowState.y));
      } else {
        await win.setSize(new api.LogicalSize(1360, 860));
      }
    } catch {
      /* ignore */
    }
    return;
  }
  if (isElectron()) {
    try {
      await window.electronAPI!.exitCompact();
    } catch {
      /* ignore */
    }
  }
}

/* ───────────────── ELECTRON WINDOW-STATE → CSS HOOK (Issue 3) ──────────────
 * The app draws its own rounded corners + window shadow in CSS, but those
 * must disappear when the window is maximized/fullscreen. The main process
 * pushes maximize/fullscreen transitions over win:state; we mirror them into
 * documentElement[data-electron-win] so plain CSS can react:
 *   normal | maximized | fullscreen
 * Any UI (classic/cinema/eela/alok) can also subscribe directly. */

type WindowStateListener = (state: ElectronWindowState) => void;
const windowStateListeners = new Set<WindowStateListener>();
let windowStateWired = false;

function applyElectronWindowState(state: ElectronWindowState) {
  if (typeof document === "undefined") return;
  const mode = state.fullscreen ? "fullscreen" : state.maximized ? "maximized" : "normal";
  document.documentElement.dataset.electronWin = mode;
  for (const listener of windowStateListeners) {
    try {
      listener(state);
    } catch {
      /* listener errors must never break the bridge */
    }
  }
}

/** Subscribes to Electron maximize/fullscreen transitions. Returns an
 *  unsubscribe function. Safe to call in any runtime (no-op elsewhere). */
export function onElectronWindowState(listener: WindowStateListener): () => void {
  if (!isElectron()) return () => undefined;
  windowStateListeners.add(listener);
  if (!windowStateWired) {
    windowStateWired = true;
    window.electronAPI!.onWindowState(applyElectronWindowState);
    // Seed the initial state (also fixes the CSS hook after a reload).
    window.electronAPI!
      .getState()
      .then(applyElectronWindowState)
      .catch(() => undefined);
  }
  return () => windowStateListeners.delete(listener);
}

/* ─────────────────── MANUAL WINDOW DRAG (V1.4.0, #5) ──────────────────────
 * -webkit-app-region: drag is resolved at the OS hit-test level (HTCAPTION
 * on Windows) where ALL CSS cursors — including the dynamic cursor's — are
 * ignored and pointer events die. These handlers replace the OS drag
 * regions with a manual pointer-capture drag over IPC, so the custom cursor
 * survives over every header strip:
 *
 *   pointerdown on [data-tauri-drag-region]   → dragStart()
 *   pointermove (rAF-throttled deltas)        → dragBy(accX, accY)
 *   pointerup / pointercancel                 → dragEnd()
 *
 * electron/main.cjs turns the deltas into absolute setPosition() calls from
 * the drag-start bounds (disabled while maximized/fullscreen). The
 * data-tauri-drag-region attributes in the components stay exactly where
 * they are — they are now this JS hook (under Tauri the attribute keeps its
 * native meaning; under Electron the CSS declarations are gone).
 * Double-click toggles maximize like a native titlebar. */
const DRAG_INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, [role="button"], [role="slider"], canvas, .window-controls, .compact-controls-footer';

/** Install the manual drag hook ONCE (root level). Idempotent singleton —
 *  safe to call from any face; only active under Electron. Returns an
 *  uninstall function (used by none of the faces in practice). */
export function installManualWindowDrag(): () => void {
  if (typeof document === "undefined" || !isElectron()) return () => undefined;
  const g = globalThis as typeof globalThis & { __NOBODY_MANUAL_DRAG__?: boolean };
  if (g.__NOBODY_MANUAL_DRAG__) return () => undefined;
  g.__NOBODY_MANUAL_DRAG__ = true;

  // One drag at a time: a second concurrent pointer must not reset main's
  // drag origin while the first gesture is still streaming deltas.
  let dragActive = false;

  const inDragRegion = (target: EventTarget | null): Element | null => {
    const el = target as Element | null;
    return el?.closest?.("[data-tauri-drag-region]") ?? null;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (dragActive || e.button !== 0) return;
    const target = e.target as Element | null;
    if (!inDragRegion(target)) return;
    // Interactive controls embedded in a drag strip keep their clicks.
    if (target?.closest?.(DRAG_INTERACTIVE_SELECTOR)) return;

    e.preventDefault();
    dragActive = true;
    const api = window.electronAPI;
    api?.dragStart?.();

    let accX = 0;
    let accY = 0;
    let lastX = e.clientX;
    let lastY = e.clientY;
    let raf = 0;
    let done = false;
    // Drag regions are always HTML elements (divs/spans). Typed as
    // HTMLElement — not bare Element — because TS 5.9's ElementEventMap
    // carries only fullscreen events; the pointer* keys live on
    // HTMLElementEventMap (inherited from GlobalEventHandlersEventMap).
    const el = target as HTMLElement;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort — the gesture still works over the element */
    }

    const move = (ev: PointerEvent) => {
      accX += ev.clientX - lastX;
      accY += ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          api?.dragBy?.(accX, accY);
        });
      }
    };
    const end = () => {
      if (done) return;
      done = true;
      dragActive = false;
      if (raf) cancelAnimationFrame(raf);
      api?.dragEnd?.();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };

  // Native-titlebar parity: double-clicking a drag surface toggles
  // maximize (the main-process win:maximize handler already toggles).
  const onDblClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!inDragRegion(target)) return;
    if (target?.closest?.(DRAG_INTERACTIVE_SELECTOR)) return;
    window.electronAPI?.maximize();
  };

  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("dblclick", onDblClick);

  return () => {
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("dblclick", onDblClick);
    dragActive = false;
    g.__NOBODY_MANUAL_DRAG__ = false;
  };
}
