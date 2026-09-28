/* ─────────────────────────────────────────────────────────────────────────
 * NOBODY — Electron preload (contextBridge surface)
 *
 * ONE narrow, explicit API exposed as window.electronAPI — the renderer's
 * only door to the OS (contextIsolation: true, sandbox: true). Every IPC
 * handler validates/scopes its inputs in main.cjs:
 *   - http:fetch is allow-listed to the LRCLIB / iTunes / Deezer domains
 *   - fs handlers are absolute-path, size-bounded
 *   - shell:openExternal is https? only
 * ───────────────────────────────────────────────────────────────────────── */

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /* ── window chrome ── */
  minimize: () => ipcRenderer.send('win:minimize'),
  maximize: () => ipcRenderer.send('win:maximize'),
  close: () => ipcRenderer.send('win:close'),
  /** Toggles fullscreen and resolves with the REAL resulting state. */
  toggleFullscreen: () => ipcRenderer.invoke('win:toggle-fullscreen'),
  getState: () => ipcRenderer.invoke('win:get-state'),
  /** Subscribe to maximize/fullscreen changes (drives the CSS that hides
   *  the app-drawn rounded corners + shadow when not a floating window). */
  onWindowState: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('win:state', listener);
    return () => ipcRenderer.removeListener('win:state', listener);
  },

  /* ── close-veil flow (V1.4.0 #6) ──
   * main intercepts EVERY close path (✕ / Alt+F4 / taskbar), asks the
   * renderer to play its per-face veil via onCloseRequested, and only
   * really closes once confirmClose() fires (a 3.5s main-side failsafe
   * covers a crashed renderer). */
  onCloseRequested: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = () => callback();
    ipcRenderer.on('app:close-requested', listener);
    return () => ipcRenderer.removeListener('app:close-requested', listener);
  },
  confirmClose: () => ipcRenderer.send('win:close-confirmed'),

  /* ── hardware media keys (V1.4.0 #9) ──
   * globalShortcut in main → 'media:key' with "play-pause" | "next" |
   * "prev" | "stop". Fires even when the window is minimized/unfocused. */
  onMediaKey: (callback) => {
    if (typeof callback !== 'function') return () => undefined;
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('media:key', listener);
    return () => ipcRenderer.removeListener('media:key', listener);
  },

  /* ── manual window drag (V1.4.0 #5) ──
   * Replaces the OS drag regions (resolved at the OS hit-test level, where
   * CSS cursors are ignored). The renderer pointer-captures the gesture on
   * [data-tauri-drag-region] surfaces and streams accumulated deltas;
   * main turns them into absolute window moves (disabled while
   * maximized/fullscreen). */
  dragStart: () => ipcRenderer.send('win:drag-start'),
  dragBy: (ax, ay) => ipcRenderer.send('win:drag-by', ax, ay),
  dragEnd: () => ipcRenderer.send('win:drag-end'),

  /* ── file identity ──
   * Electron 32+ removed File.path. webUtils.getPathForFile(file) is the
   * sanctioned replacement and works on files from pickers, <input> and
   * drag-and-drop — the new UIs use it to route imports through the same
   * real-path pipeline as the classic UI (V1.2.0 installer import fix). */
  getPathForFile: (file) => {
    try {
      return typeof webUtils?.getPathForFile === 'function' ? webUtils.getPathForFile(file) : '';
    } catch {
      return '';
    }
  },

  /* ── compact mini-player ── */
  enterCompact: () => ipcRenderer.invoke('win:enter-compact'),
  exitCompact: () => ipcRenderer.invoke('win:exit-compact'),

  /* ── dialogs ── */
  pickFolders: () => ipcRenderer.invoke('dialog:pick-folders'),
  pickFiles: () => ipcRenderer.invoke('dialog:pick-files'),
  /** Task 30 — native "Save audio file": showSaveDialog (defaults to
   *  Downloads) + bounded fs.copyFile in the main process. Resolves with the
   *  saved absolute path, or null when the user cancelled. */
  saveAudioCopy: (srcPath, defaultName) => ipcRenderer.invoke('dialog:save-copy', srcPath, defaultName),

  /* ── bounded file I/O ── */
  stat: (path) => ipcRenderer.invoke('fs:stat', path),
  readSlice: (path, start, length) => ipcRenderer.invoke('fs:read-slice', path, start, length),
  readFile: (path) => ipcRenderer.invoke('fs:read-file', path),
  writeTextFile: (path, content) => ipcRenderer.invoke('fs:write-text-file', path, content),
  writeBinaryFile: (path, bytes) => ipcRenderer.invoke('fs:write-binary-file', path, bytes),
  walk: (root, extensions) => ipcRenderer.invoke('fs:walk', root, extensions),

  /* ── allow-listed HTTP proxy (LRCLIB / iTunes / Deezer only) ── */
  httpFetch: (url, options) => ipcRenderer.invoke('http:fetch', url, options),

  /* ── external links ── */
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
});
