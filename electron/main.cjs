/* ─────────────────────────────────────────────────────────────────────────
 * NOBODY — Electron main process (Tauri 2 → Electron migration)
 *
 * Mirrors every capability the Tauri build exposed through
 * src-tauri/capabilities/default.json, scoped the same way:
 *
 *   1. Frameless, transparent window (rounded corners + CSS-drawn shadow —
 *      the native OS shadow is NOT relied on, see Issue 3 of the brief).
 *   2. Window controls: minimize / toggle-maximize / close / fullscreen.
 *   3. Compact mini-player: resize + reposition + always-on-top + restore
 *      (parity with desktopWindow.ts's Tauri compact functions).
 *   4. Native folder/file dialogs (plugin-dialog parity).
 *   5. Bounded file I/O: stat / readSlice (metadata head + tail reads — the
 *      PHASE-3 memory fix depends on these staying bounded) / readFile /
 *      writeTextFile / writeBinaryFile / recursive folder walk (plugin-fs).
 *   6. app:// custom protocol — STREAMS local audio/covers off disk
 *      (convertFileSrc parity). Range requests are honored so <audio>
 *      seeking never buffers a whole FLAC into memory (Issue 4).
 *   7. Allow-listed HTTP proxy (plugin-http parity, Issue 1): only the
 *      domains the Tauri capability file scoped — LRCLIB, iTunes Search +
 *      its artwork CDN, Deezer API + its image CDN.
 *
 * Security baseline (§3 of the brief):
 *   contextIsolation: true · nodeIntegration: false · sandbox: true
 *   one narrow contextBridge surface in preload.cjs · permission requests
 *   denied · window.open denied (openExternal allow-listed instead).
 * ───────────────────────────────────────────────────────────────────────── */

const {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  protocol,
  net,
  screen,
  shell,
  nativeImage,
  globalShortcut,
} = require('electron');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

/* ── Uninstaller boot (--nobody-uninstall) — MEMENTO lineage ─────────────
 * The installed app's own exe IS the uninstaller; Add/Remove Programs
 * registers: "…\NOBODY.exe" --nobody-uninstall. The check runs BEFORE
 * requestSingleInstanceLock so the headless uninstaller never fights a
 * running player for the lock, and the CommonJS module wrapper's
 * top-level return skips the whole player lifecycle below. */
const { isUninstallInvocation } = require('./uninstall.cjs');
if (isUninstallInvocation(process.argv)) {
  require('./uninstall.cjs').startUninstallMode();
  return;
}

/* ── Constants shared with the renderer implementation (desktopWindow.ts) ── */
const DEFAULT_W = 1360;
const DEFAULT_H = 860;
const MIN_W = 720;
const MIN_H = 520;
const COMPACT_W = 440;
const COMPACT_H = 260;
const COMPACT_MARGIN = 30;

/* HTTP proxy limits (keeps the IPC surface from becoming a memory hole) */
const HTTP_TIMEOUT_MS = 20000;
const HTTP_MAX_BYTES = 30 * 1024 * 1024; // cover art is ~1MB; be generous but bounded
const READ_SLICE_MAX = 8 * 1024 * 1024; // metadata head is 3MB, tails ≤ 1MB
const READ_FILE_MAX = 32 * 1024 * 1024; // lrc/txt/jpg sidecars are small
const WALK_MAX_ENTRIES = 100000;
const WALK_MAX_DEPTH = 16;
/* Task 30 — dialog:save-copy bound (a full album FLAC is ~60MB; an
 * hour-long mix can reach ~600MB — reject anything past 1GB). */
const COPY_MAX_BYTES = 1024 * 1024 * 1024;

/* §3 — the ONLY remote hosts the app may reach through the proxy.
 * Mirrors src-tauri/capabilities/default.json's http:scope exactly. */
const HTTP_ALLOWED_HOSTS = new Set(['lrclib.net', 'itunes.apple.com', 'api.deezer.com']);
const HTTP_ALLOWED_SUFFIXES = ['.mzstatic.com', '.dzcdn.net'];

function isAllowedRemoteUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    const host = url.hostname.toLowerCase();
    if (HTTP_ALLOWED_HOSTS.has(host)) return true;
    return HTTP_ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
  } catch {
    return false;
  }
}

/* ── Single instance (a second launch focuses the existing window) ──────── */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

/* Desktop music players must be allowed to resume playback on boot without
 * a user gesture (the Tauri build had no autoplay restrictions either). */
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

/* ── Issue 4: privileged app:// scheme for STREAMING local files ──────────
 * standard:false keeps the URL opaque (no host lowercasing / path mangling
 * of Windows drive letters), stream:true lets <audio>/<video> range-read,
 * supportFetchAPI lets fetch()/decode work against it. Registered BEFORE
 * app ready, as Electron requires. */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: false,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      // Lets fetch() from the file:// renderer origin read app:// responses
      // (media elements never needed CORS; fetch() does). The handler also
      // answers with Access-Control-Allow-Origin below.
      corsEnabled: true,
      bypassCSP: false,
    },
  },
]);

/* ── Content types for the protocol handler ─────────────────────────────── */
const MIME = new Map([
  ['mp3', 'audio/mpeg'], ['wav', 'audio/wav'], ['flac', 'audio/flac'],
  ['ogg', 'audio/ogg'], ['oga', 'audio/ogg'], ['opus', 'audio/ogg'],
  ['m4a', 'audio/mp4'], ['m4b', 'audio/mp4'], ['aac', 'audio/aac'],
  ['alac', 'audio/mp4'], ['aif', 'audio/aiff'], ['aiff', 'audio/aiff'],
  ['caf', 'audio/x-caf'], ['webm', 'audio/webm'], ['mp4', 'video/mp4'],
  ['wma', 'audio/x-ms-wma'], ['ape', 'audio/x-ape'], ['amr', 'audio/amr'],
  ['3gp', 'audio/3gpp'], ['dsf', 'audio/dsf'], ['mpc', 'audio/musepack'],
  ['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'],
  ['webp', 'image/webp'], ['lrc', 'text/plain; charset=utf-8'],
  ['txt', 'text/plain; charset=utf-8'],
]);

/** Resolves the real absolute path from an app:// URL.
 *  The renderer builds URLs as `app://` + encodeURIComponent(absolutePath),
 *  which survives Chromium URL normalization for non-special schemes. */
function pathFromAppUrl(requestUrl) {
  if (!requestUrl.startsWith('app://')) return null;
  let raw = requestUrl.slice('app://'.length);
  const hash = raw.indexOf('#');
  if (hash >= 0) raw = raw.slice(0, hash);
  const query = raw.indexOf('?');
  if (query >= 0) raw = raw.slice(0, query);
  try {
    const decoded = decodeURIComponent(raw);
    // Reject relative paths / traversal games — only real absolute paths.
    const normalized = path.normalize(decoded);
    if (!path.isAbsolute(normalized)) return null;
    if (normalized.includes('\0')) return null;
    return normalized;
  } catch {
    return null;
  }
}

/** Parses a Range header ("bytes=start-end" | "bytes=start-" | "bytes=-N"). */
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startRaw, endRaw] = match;
  if (startRaw === '' && endRaw === '') return null;
  let start;
  let end;
  if (startRaw === '') {
    // suffix range: last N bytes
    const n = Number(endRaw);
    if (!Number.isFinite(n) || n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === '' ? size - 1 : Number(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start >= size) return { start: 0, end: 0, invalid: true };
    end = Math.min(end, size - 1);
  }
  if (end < start) return null;
  return { start, end };
}

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const filePath = pathFromAppUrl(request.url);
    if (!filePath) return new Response(null, { status: 400 });

    let stat;
    try {
      stat = await fsp.stat(filePath);
    } catch {
      return new Response(null, { status: 404 });
    }
    if (!stat.isFile()) return new Response(null, { status: 404 });

    const size = stat.size;
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const contentType = MIME.get(ext) || 'application/octet-stream';
    const baseHeaders = {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      // corsEnabled scheme: the file:// renderer origin may fetch() these
      // responses (probe helpers, cover decoding, etc.).
      'Access-Control-Allow-Origin': '*',
    };

    // HEAD — metadata probe without a body.
    if (request.method === 'HEAD') {
      return new Response(null, { status: 200, headers: { ...baseHeaders, 'Content-Length': String(size) } });
    }
    /* CORS preflight — the engine's media element now requests app:// sources
     * with crossOrigin="anonymous" (QA fix for the WebAudio "outputs zeroes"
     * silence taint). CORS-mode requests carrying a Range header can be
     * preflighted; answer before the GET-only gate or the load would fail. */
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Type, If-Range',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    if (request.method !== 'GET') return new Response(null, { status: 405 });

    const range = parseRange(request.headers.get('range'), size);

    // 416 — the renderer asked for bytes past EOF (stale seek position).
    if (range && range.invalid) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      });
    }

    /* STREAMED READ — fs.createReadStream + Readable.toWeb keeps memory
     * flat no matter how large the FLAC is (Issue 4's whole point: the
     * file is never buffered into a JS Blob). */
    const start = range ? range.start : 0;
    const end = range ? range.end : size - 1;
    const headers = { ...baseHeaders, 'Content-Length': String(end - start + 1) };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;

    const nodeStream = fs.createReadStream(filePath, { start, end });
    nodeStream.on('error', () => { /* the web stream surfaces the abort */ });
    const webStream = require('stream').Readable.toWeb(nodeStream);

    return new Response(webStream, { status: range ? 206 : 200, headers });
  });
}

/* ── Window creation ────────────────────────────────────────────────────── */
let mainWindow = null;

/* V1.4.0 (#6) — close-veil flow state. `closeConfirmed` flips true only
 * when the renderer has played its per-face close animation and asked for
 * the REAL close (win:close-confirmed) or the failsafe fired; until then
 * the `close` event below is intercepted and the veil is requested.
 * `closeFailsafe` guarantees the app can never get stuck un-closable if
 * the renderer crashes or is suspended mid-veil. */
let closeConfirmed = false;
let closeFailsafe = null;

/* V1.4.0 (#5) — manual window drag state. While the renderer runs a
 * pointer-capture drag over IPC, this holds the window bounds at drag
 * start so win:drag-by can reposition absolutely from accumulated deltas. */
let drag = null;

function createWindow() {
  // A (re)created window starts with a clean close-flow slate (macOS
  // activate-after-close recreates; a previous window's confirmation must
  // not leak into the new one).
  closeConfirmed = false;
  if (closeFailsafe) {
    clearTimeout(closeFailsafe);
    closeFailsafe = null;
  }

  const win = new BrowserWindow({
    width: DEFAULT_W,
    height: DEFAULT_H,
    minWidth: MIN_W,
    minHeight: MIN_H,
    title: 'NOBODY',
    center: true,
    /* Issue 3 — transparent + frameless; the soft shadow and the rounded
     * corners are DRAWN BY THE APP's CSS (html.electron .app-shell /
     * .compact-shell box-shadow), never delegated to the OS. */
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    icon: nativeImage.createFromPath(path.join(__dirname, '../public/icon.png')),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow = win;

  win.once('ready-to-show', () => win.show());

  // Opening new windows is not part of the product; external links go
  // through the allow-listed shell:openExternal IPC instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-finish-load', () => pushWindowState());

  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) {
    win.on(event, pushWindowState);
  }

  // A user escaping fullscreen via the OS (F11/Win+Down) must also flush the
  // saved pre-fullscreen bounds so a later toggle starts from a clean slate.
  win.on('leave-full-screen', () => {
    preFullscreenBounds = null;
    preFullscreenMaximized = false;
  });

  // BUG FIX (user report: stuck in fullscreen) — F11 now ALWAYS toggles the
  // window fullscreen, handled in the MAIN process so it works in every UI
  // (classic / cinema / EELA / ALOK) even when no renderer button or keyboard
  // handler is reachable. The same verified round-trip as the win:toggle-
  // fullscreen IPC is used, so exiting always restores the saved geometry.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F11' || input.control || input.meta) return;
    event.preventDefault();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isFullScreen()) {
      try {
        preFullscreenBounds = mainWindow.getNormalBounds();
        preFullscreenMaximized = mainWindow.isMaximized();
      } catch {
        preFullscreenBounds = null;
        preFullscreenMaximized = false;
      }
      mainWindow.setFullScreen(true);
    } else {
      mainWindow.setFullScreen(false);
      restoreAfterFullscreen();
    }
    pushWindowState();
  });

  /* V1.4.0 (#6) — EVERY close path lands here: the ✕ buttons route through
   * win:close → app:close-requested, and Alt+F4 / taskbar close hit this
   * event directly. Until the renderer confirms, the close is held while
   * the per-face veil animation plays; a 3.5s failsafe force-closes if the
   * renderer never answers (crashed / suspended). */
  win.on('close', (e) => {
    if (closeConfirmed) return;
    e.preventDefault();
    try {
      win.webContents.send('app:close-requested');
    } catch {
      closeConfirmed = true;
      win.close();
      return;
    }
    if (closeFailsafe) clearTimeout(closeFailsafe);
    closeFailsafe = setTimeout(() => {
      if (!win.isDestroyed()) {
        closeConfirmed = true;
        win.close();
      }
    }, 3500);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  return win;
}

function pushWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('win:state', {
    maximized: mainWindow.isMaximized(),
    fullscreen: mainWindow.isFullScreen(),
  });
}

/* ── Window control IPC ─────────────────────────────────────────────────── */
/* BUG FIX (user report: clicking the fullscreen button again never returned
 * to the small window): on Windows, a frameless TRANSPARENT window can fail
 * to restore its pre-fullscreen geometry — the OS reports fullscreen=false
 * while the window stays screen-sized. We now snapshot getNormalBounds()
 * before entering fullscreen and, after the exit transition settles, verify
 * the state and force-restore the saved bounds (re-maximizing when the
 * window was maximized before). */
let preFullscreenBounds = null; // { x?, y?, width, height } in DIPs
let preFullscreenMaximized = false;

function registerWindowIpc() {
  ipcMain.on('win:minimize', () => mainWindow?.minimize());

  ipcMain.on('win:maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });

  /* V1.4.0 (#6) — 'win:close' now REQUESTS the close flow instead of
   * closing directly: the renderer plays its per-face veil, then confirms
   * through win:close-confirmed. The real close always funnels through the
   * createWindow 'close' guard (or its 3.5s failsafe). Renderer-side
   * idempotency in src/appClose.ts keeps the veil to exactly one play. */
  ipcMain.on('win:close', () => mainWindow?.webContents.send('app:close-requested'));

  ipcMain.on('win:close-confirmed', () => {
    closeConfirmed = true;
    if (closeFailsafe) {
      clearTimeout(closeFailsafe);
      closeFailsafe = null;
    }
    mainWindow?.close();
  });

  /* V1.4.0 (#5) — manual window drag over IPC (replaces the OS drag
   * regions, which are resolved at the OS hit-test level where CSS cursors
   * are ignored). The renderer pointer-captures the gesture on its
   * [data-tauri-drag-region] surfaces and streams accumulated deltas; main
   * turns them into absolute setPosition() calls from the drag-start
   * bounds. Disabled while maximized/fullscreen — native snapping wins. */
  ipcMain.on('win:drag-start', () => {
    const win = mainWindow;
    if (!win || win.isDestroyed() || win.isMaximized() || win.isFullScreen()) {
      drag = null;
      return;
    }
    const b = win.getBounds();
    const c = screen.getCursorScreenPoint();
    drag = { x: b.x, y: b.y, cx: c.x, cy: c.y };
  });

  ipcMain.on('win:drag-by', (_event, ax, ay) => {
    if (!drag || !mainWindow || mainWindow.isDestroyed()) return;
    const dx = Number(ax);
    const dy = Number(ay);
    const nx = Math.round(drag.x + (Number.isFinite(dx) ? dx : 0));
    const ny = Math.round(drag.y + (Number.isFinite(dy) ? dy : 0));
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
    try {
      mainWindow.setPosition(nx, ny);
    } catch {
      drag = null; // the OS refused the move — abandon the drag
    }
  });

  ipcMain.on('win:drag-end', () => {
    drag = null;
  });

  // invoke (not send) so the renderer gets the REAL resulting fullscreen
  // state back, exactly like Tauri's setFullscreen(next) round-trip.
  ipcMain.handle('win:toggle-fullscreen', () => {
    if (!mainWindow) return false;
    if (!mainWindow.isFullScreen()) {
      try {
        preFullscreenBounds = mainWindow.getNormalBounds();
        preFullscreenMaximized = mainWindow.isMaximized();
      } catch {
        preFullscreenBounds = null;
        preFullscreenMaximized = false;
      }
      mainWindow.setFullScreen(true);
      return true;
    }
    mainWindow.setFullScreen(false);
    restoreAfterFullscreen();
    return false;
  });

  ipcMain.handle('win:get-state', () => ({
    maximized: !!mainWindow?.isMaximized(),
    fullscreen: !!mainWindow?.isFullScreen(),
  }));
}

/** Verifies the exit-fullscreen transition actually restored the geometry
 *  and force-restores it when the transparent-window quirk swallows it. */
function restoreAfterFullscreen() {
  const win = mainWindow;
  if (!win) return;
  const saved = preFullscreenBounds;
  const wasMax = preFullscreenMaximized;
  preFullscreenBounds = null;
  preFullscreenMaximized = false;
  setTimeout(() => {
    if (win.isDestroyed()) return;
    if (win.isFullScreen()) {
      try { win.setFullScreen(false); } catch { /* best effort */ }
    }
    if (saved) {
      try {
        const b = win.getBounds();
        const stillHuge = b.width >= saved.width * 1.6 && b.height >= saved.height * 1.6;
        if (stillHuge || win.isFullScreen()) win.setBounds(saved);
      } catch { /* best effort */ }
      if (wasMax) {
        try { win.maximize(); } catch { /* best effort */ }
      }
    }
    pushWindowState();
  }, 220);
}

/* ── Compact mini-player IPC (Issue 2 of desktopWindow parity) ──────────── */
let savedWindowState = null; // { x, y, width, height } in DIPs (logical px)

function registerCompactIpc() {
  ipcMain.handle('win:enter-compact', () => {
    if (!mainWindow) return false;
    try {
      // getNormalBounds() returns pre-maximize geometry and works while
      // maximized, so a compact round-trip from a maximized window restores.
      savedWindowState = mainWindow.getNormalBounds();
      if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.setResizable(false);

      const { workArea } = screen.getPrimaryDisplay();
      const x = workArea.x + workArea.width - COMPACT_W - COMPACT_MARGIN;
      const y = workArea.y + workArea.height - COMPACT_H - COMPACT_MARGIN;
      mainWindow.setBounds({
        x: Math.max(workArea.x, x),
        y: Math.max(workArea.y, y),
        width: COMPACT_W,
        height: COMPACT_H,
      });
      return true;
    } catch {
      // CSS mini-player still works even if the OS resize failed.
      return false;
    }
  });

  ipcMain.handle('win:exit-compact', () => {
    if (!mainWindow) return false;
    try {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setResizable(true);
      if (savedWindowState) {
        mainWindow.setBounds(savedWindowState);
      } else {
        mainWindow.setBounds({ width: DEFAULT_W, height: DEFAULT_H });
        mainWindow.center();
      }
      savedWindowState = null;
      return true;
    } catch {
      return false;
    }
  });
}

/* ── Dialog IPC (plugin-dialog parity) ──────────────────────────────────── */
const AUDIO_LYRIC_FILTER = {
  name: 'Audio & Lyrics',
  extensions: ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'alac', 'aif', 'aiff', 'caf', 'webm', 'mp4', 'wma', 'ape', 'amr', '3gp', 'dsf', 'mpc', 'lrc', 'txt'],
};

function registerDialogIpc() {
  ipcMain.handle('dialog:pick-folders', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add music folders to Nobody',
      properties: ['openDirectory', 'multiSelections'],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  ipcMain.handle('dialog:pick-files', async () => {
    const { dialog } = require('electron');
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Add music to Nobody',
      properties: ['openFile', 'multiSelections'],
      filters: [AUDIO_LYRIC_FILTER],
    });
    if (result.canceled) return [];
    return result.filePaths;
  });

  /* Task 30 — "Save audio file" (Download Center / new-UI exports):
   * native Save-As dialog defaulting to the user's Downloads folder, then a
   * plain, progress-free fs.copyFile in the MAIN process (the renderer never
   * touches the bytes). Resolves with the saved absolute path, or null when
   * the user cancelled the dialog. */
  ipcMain.handle('dialog:save-copy', async (_event, srcPath, defaultName) => {
    const src = assertAbsolutePath(srcPath);
    const info = await fsp.stat(src);
    if (!info.isFile()) throw new Error('Not a file');
    if (Number(info.size) > COPY_MAX_BYTES) throw new Error('File too large to copy');

    const { dialog } = require('electron');
    const safe = sanitizeFilename(defaultName);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save audio file',
      defaultPath: path.join(app.getPath('downloads'), safe),
    });
    if (result.canceled || !result.filePath) return null;

    const dest = assertAbsolutePath(result.filePath);
    await fsp.copyFile(src, dest);
    return dest;
  });
}

/* ── File-system IPC (plugin-fs parity, bounded) ────────────────────────── */
function assertAbsolutePath(p) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || p.includes('\0')) {
    throw new Error('Invalid path');
  }
  return path.normalize(p);
}

/** Task 30 — strips path separators / control characters from a dialog
 *  default filename (the renderer only ever supplies a display name). */
function sanitizeFilename(name) {
  const clean = String(name ?? 'nobody')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return clean || 'nobody';
}

async function walkFolder(root, extSet) {
  const out = [];
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length > 0 && out.length < WALK_MAX_ENTRIES) {
    const { dir, depth } = stack.pop();
    if (depth > WALK_MAX_DEPTH) continue;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // unreadable folder → skip, like the Tauri walk did
    }
    for (const entry of entries) {
      if (out.length >= WALK_MAX_ENTRIES) break;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push({ dir: full, depth: depth + 1 });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extSet.size === 0 || extSet.has(ext)) out.push(full);
      }
    }
  }
  return out;
}

function registerFsIpc() {
  ipcMain.handle('fs:stat', async (_event, target) => {
    const p = assertAbsolutePath(target);
    const info = await fsp.stat(p);
    return { size: Number(info.size), isFile: info.isFile(), mtimeMs: Number(info.mtimeMs) };
  });

  /** Bounded slice read — the metadata head (first N bytes) and the
   *  MP4/Ogg tail reads depend on this; NEVER expose an unbounded read. */
  ipcMain.handle('fs:read-slice', async (_event, target, start, length) => {
    const p = assertAbsolutePath(target);
    const from = Math.max(0, Number(start) || 0);
    const len = Math.min(READ_SLICE_MAX, Math.max(0, Number(length) || 0));
    if (len === 0) return new Uint8Array(0);
    const handle = await fsp.open(p, 'r');
    try {
      const buffer = new Uint8Array(len);
      const { bytesRead } = await handle.read(buffer, 0, len, from);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close().catch(() => undefined);
    }
  });

  ipcMain.handle('fs:read-file', async (_event, target) => {
    const p = assertAbsolutePath(target);
    const info = await fsp.stat(p);
    if (!info.isFile()) throw new Error('Not a file');
    if (Number(info.size) > READ_FILE_MAX) throw new Error('File too large');
    const buffer = await fsp.readFile(p);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  });

  ipcMain.handle('fs:write-text-file', async (_event, target, content) => {
    const p = assertAbsolutePath(target);
    await fsp.writeFile(p, String(content ?? ''), 'utf-8');
    return true;
  });

  // Uint8Array survives IPC structured clone — no base64 round-trip needed.
  ipcMain.handle('fs:write-binary-file', async (_event, target, bytes) => {
    const p = assertAbsolutePath(target);
    if (!(bytes instanceof Uint8Array)) throw new Error('Expected binary payload');
    await fsp.writeFile(p, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return true;
  });

  ipcMain.handle('fs:walk', async (_event, root, extensions) => {
    const base = assertAbsolutePath(root);
    const extSet = new Set(
      (Array.isArray(extensions) ? extensions : [])
        .filter((e) => typeof e === 'string')
        .map((e) => (e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`)),
    );
    return walkFolder(base, extSet);
  });
}

/* ── Issue 1: allow-listed HTTP proxy (plugin-http parity) ──────────────── */
function registerHttpIpc() {
  ipcMain.handle('http:fetch', async (_event, rawUrl, options = {}) => {
    if (typeof rawUrl !== 'string' || !isAllowedRemoteUrl(rawUrl)) {
      throw new Error('Blocked by NOBODY allow-list: ' + String(rawUrl).slice(0, 120));
    }
    const init = {
      method: typeof options.method === 'string' ? options.method : 'GET',
      headers: options.headers && typeof options.headers === 'object' ? options.headers : undefined,
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      // net.fetch runs in the main process — no browser CORS applies.
    };
    if (typeof options.body === 'string' && options.body.length > 0 && init.method !== 'GET' && init.method !== 'HEAD') {
      init.body = options.body;
    }

    const response = await net.fetch(rawUrl, init);

    const headers = {};
    for (const [key, value] of response.headers.entries()) headers[key.toLowerCase()] = value;
    const contentLength = Number(headers['content-length'] || 0);
    if (contentLength > HTTP_MAX_BYTES) throw new Error('Response too large');

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > HTTP_MAX_BYTES) throw new Error('Response too large');

    return {
      ok: response.ok,
      status: response.status,
      headers,
      bodyBase64: Buffer.from(buffer).toString('base64'),
    };
  });
}

/* ── V1.4.0 (#9): hardware media keys (globalShortcut) ────────────────────
 * Like every Windows player, the keyboard's Fn-media keys must control
 * playback even when the window is minimized or unfocused — globalShortcut
 * is the only Electron channel that fires in those states (input events
 * die without focus). Each press is forwarded to the renderer on
 * 'media:key' (src/mediaKeys.ts re-broadcasts it to the active face).
 * Registration is best-effort: another application may already own a key,
 * in which case that one shortcut is skipped silently. */
const MEDIA_KEY_SHORTCUTS = [
  ['MediaPlayPause', 'play-pause'],
  ['MediaNextTrack', 'next'],
  ['MediaPreviousTrack', 'prev'],
  ['MediaStop', 'stop'],
];
const registeredMediaShortcuts = [];

function registerMediaKeyShortcuts() {
  for (const [accelerator, action] of MEDIA_KEY_SHORTCUTS) {
    try {
      const ok = globalShortcut.register(accelerator, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('media:key', action);
        }
      });
      if (ok) registeredMediaShortcuts.push(accelerator);
    } catch {
      /* another app may own the key — skip silently */
    }
  }
}

/* ── shell.openExternal with a scheme allow-list ────────────────────────── */
function registerShellIpc() {
  ipcMain.handle('shell:open-external', async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) throw new Error('Blocked URL');
    await shell.openExternal(url);
    return true;
  });
}

/* ── App lifecycle ──────────────────────────────────────────────────────── */
app.whenReady().then(() => {
  // No application menu — the app draws its own titlebar chrome.
  Menu.setApplicationMenu(null);

  // Deny every web permission request (mic/cam/notifications… not needed).
  app.on('web-contents-created', (_event, contents) => {
    contents.session.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(false);
      void permission;
    });
  });

  registerAppProtocol();
  registerWindowIpc();
  registerCompactIpc();
  registerDialogIpc();
  registerFsIpc();
  registerHttpIpc();
  registerShellIpc();

  createWindow();

  // #9 — registered AFTER window creation so the webContents target for
  // 'media:key' already exists.
  registerMediaKeyShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

/* #9 — never leak OS-global media keys past our lifetime (registered once,
 * outside whenReady, exactly like window-all-closed). */
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
