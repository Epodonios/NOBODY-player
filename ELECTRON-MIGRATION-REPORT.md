# NOBODY — Tauri 2 → Electron Migration Report

Date: 2025-09-10 · Scope: `/home/z/my-project/nobody-work/`
Status: **code-complete, smoke-verified in a real Electron boot on Linux (xvfb); Windows-specific rendering NOT verified** (see §3 of this report).

---

## 0. What was migrated (one paragraph)

Every Tauri-only capability of the renderer now has a complete, working Electron
implementation behind the **same exported function signatures**, so `App.tsx` and
all four UIs (Classic / Cinema / EELA / ALOK) required near-zero changes. The
Tauri runtime is still supported in parallel: every function branches
`isElectron() → isTauri() → web`, and the Tauri branches are byte-equivalent to
their previous behavior (including native `convertFileSrc` and `plugin-http`).

---

## 1. Per-issue status

### Issue 1 — CORS / lyrics + cover-art fetching — ✅ DONE (verified live)
- New shared transport `src/desktopHttp.ts` (`desktopFetch()`) is the single
  choke point for all remote http(s) calls:
  - **Electron** → `window.electronAPI.httpFetch` IPC → `net.fetch` in the main
    process (no CORS) → returns `{ ok, status, headers, bodyBase64 }` → rehydrated
    into a **real `Response`** so `res.json() / res.arrayBuffer() / res.headers.get()`
    keep working unchanged. A hard `Promise.race` timeout replaces the
    non-abortable AbortSignal; the main process enforces its own 20s timeout too.
  - **Tauri** → `@tauri-apps/plugin-http` (unchanged).
  - **Web** → `window.fetch` (unchanged).
- Allow-list in `electron/main.cjs` mirrors `src-tauri/capabilities/default.json`
  exactly: `lrclib.net`, `itunes.apple.com`, `api.deezer.com`, `*.mzstatic.com`,
  `*.dzcdn.net`, https/http only, 30MB body cap. Anything else is rejected
  (`Blocked by NOBODY allow-list`).
- **Wired into all three previously-missed call sites**, not just the two files
  the brief named:
  - `src/lrclib.ts` (`rawFetch`) — timeout + retry-with-backoff logic preserved verbatim.
  - `src/coverart.ts` (`resilientFetch`, incl. Download Center candidate search) — preserved.
  - `src/cinema/lib/utils.ts` `fetchWithTimeout()` — this is what the Cinema/EELA/ALOK
    **Smart Fetch** engine (`smartFetch.ts`) uses for LRCLIB + iTunes + Deezer +
    CDN image bytes. Without this the three modern UIs would have silently lost
    all online enrichment under Electron. Local `blob:`/`data:` URLs stay on
    plain fetch.
- **Verified in the smoke run**: `httpFetch('https://lrclib.net/api/search?track_name=test')`
  → `ok=true status=200 array=true` through the real proxy; `example.com` → blocked.

### Issue 2 — Window dragging — ✅ DONE
- New CSS in `src/index.css` (appended at the end):
  - `[data-tauri-drag-region] { -webkit-app-region: drag; }` — covers every marked
    surface across all four UIs: classic titlebar + compact topbar/brand
    (`App.tsx`), cinema `TopBar.tsx`, eela `TopNav.tsx`, alok `Header.tsx`.
  - Explicit no-drag opt-outs for interactive descendants: `button, a, input,
    select, textarea, [role="button"], [role="slider"], canvas`.
  - Hard no-drag on `.window-controls` and `.compact-controls-footer` clusters.
  - Pre-existing `.titlebar` / `.compact-topbar` drag rules were already in the
    file and remain; `.window-controls` previously had **no** no-drag rule — added.
- Note: in a plain browser `-webkit-app-region` is inert, so the web preview is
  unaffected; the semantics differ slightly from Tauri (Electron drags the whole
  region minus opt-out holes, Tauri dragged only elements carrying the
  attribute) — interactive controls are all opted out, so behavior is correct.

### Issue 3 — Rounded corners / window shadow — ✅ DONE (code) / ⚠️ NOT VERIFIED ON WINDOWS
- `electron/main.cjs` creates the window with `transparent: true, frame: false,
  backgroundColor: '#00000000'` and **no reliance on a native shadow**.
- The app draws its own chrome, gated behind `html.electron` (class set in
  `src/main.tsx` only when running under Electron — Tauri/web builds untouched):
  - `html.electron .app-shell` → `border-radius: 14px` + `box-shadow: 0 24px 70px
    rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.07)` (CSS-drawn shadow per brief).
  - `html.electron, html.electron body { background: transparent }` so the
    corners are really transparent.
  - `.compact-shell` keeps its own 22px radius + CSS shadow (it already drew
    them; the transparent window now lets the outer shadow actually render).
- Maximized/fullscreen state is pushed from main → renderer
  (`win:state` events → `documentElement[data-electron-win="maximized"|"fullscreen"]`,
  seeded from `win:get-state` on boot) and the CSS collapses the radius/shadow
  for those states.
- ⚠️ **This is the #1 thing to verify on real Windows hardware** — transparent
  frameless windows are GPU-driver sensitive, and the compact mini-player's
  corners (the historically buggy area) must be eyeballed. The smoke test could
  not cover visual rendering.

### Issue 4 — Local file loading without whole-file buffering — ✅ DONE (verified live)
- Chose the **custom protocol** approach: privileged `app://` scheme
  (`standard:false, secure:true, stream:true, supportFetchAPI:true, corsEnabled:true`,
  registered before app-ready).
- `protocol.handle('app')` in `electron/main.cjs`:
  - URL form: `app://` + `encodeURIComponent(absolutePath)`; decoded +
    `path.normalize`d; non-absolute paths and NUL bytes rejected.
  - **True streaming**: `fs.createReadStream` → `Readable.toWeb` → `Response`.
    A 60MB FLAC never enters JS memory.
  - **Range support**: parses `bytes=start-end | start- | -suffix`, answers
    `206` + `Content-Range` + `Accept-Ranges: bytes`, `416` for out-of-range.
    This is what keeps `<audio>` seeking cheap.
  - Proper MIME per extension (audio/image/lrc); HEAD → 200 + Content-Length;
    404/400/405 paths; `Access-Control-Allow-Origin: *` (so `fetch()` from the
    `file://` renderer origin works for probes/decoding — media elements never
    needed CORS but fetch does).
- Renderer: `src/desktopLibrary.ts` builds `app://` sources via
  `electronFileSrc()`; the classic pipeline, the `__NOBODY_BRIDGE__`
  (`resolveSource`), the cinema engine and every cover `<img>` consume the URL
  unchanged. Tauri still uses native `convertFileSrc` (asset://) — untouched.
- Metadata reads stay bounded: new main-process `fs:read-slice` IPC (≤8MB cap)
  feeds the existing 3MB-head + MP4/Ogg-tail logic (`readAudioHeadElectron`);
  `fs:read-file` is capped at 32MB and used only for sidecar `.lrc/.txt/.jpg`.
- **Object-URL audit (brief §2.4 + §5)** — every `createObjectURL` site checked:
  - classic import flow → `blobRegistry.ts` managed URLs, revoked on
    remove/rescan (`App.tsx` already did this). ✔
  - `audioParser.ts` → slice reads only, no object URLs. ✔
  - cinema `engine.ts` → revoked on source replace; **FIXED a real leak found by
    this audit**: `stopAndClear()` used to drop the owned blob URL without
    revoking it (every `clearQueue()` pinned the last local file's bytes until
    reload). ✔ fixed
  - cinema `covers.ts` (urlCache + revokeAll), `metadata.ts` (revoke in
    finally), `DownloadCenter.tsx` (8s revoke). ✔
- **Verified in the smoke run**: `fetch('app://…icon.png')` → `200` with the
  exact 666,891 bytes; `Range: bytes=0-99` → `206` + `Content-Range:
  bytes 0-99/666891`; a synthesized real WAV loaded through a genuine
  `<audio>` element → `loadedmetadata, duration=0.5` (the full
  protocol→range→decoder pipeline works).

### Issue 5 — Runtime detection — ✅ DONE
- `isDesktopRuntime` (desktopLibrary) is now `isTauri() || isElectron()` — this
  gates import flows, folder restore, rescan, and the desktop HTTP transport,
  all of which now work under Electron.
- Every function in `desktopWindow.ts` and `desktopLibrary.ts` has a complete
  Electron branch (not partial): minimize/maximize/close, **fullscreen
  (round-trip returns the real resulting state, like Tauri's setFullscreen)**,
  compact enter/exit (bounds saved/restored in the MAIN process via
  `getNormalBounds` — survives renderer reloads, unlike the old renderer-side
  variable; bottom-right workArea placement + always-on-top + resizable(false),
  mirroring the Tauri logic exactly), dialogs, walk, stat/slice/read/write,
  saveLrcFile/saveCoverImage.
- `App.tsx` now tags `html.desktop-runtime` for all desktop runtimes and
  `html.tauri-runtime` only under real Tauri.

---

## 2. Every file modified / created

| File | Change |
|---|---|
| `electron/main.cjs` | **Rewritten** (was: 4 window controls only). Adds: privileged `app://` streaming protocol with Range/206; allow-listed `http:fetch` proxy; compact enter/exit with saved bounds + workArea placement; native dialogs (folder / audio+lyrics files); bounded fs IPC (`stat`, `read-slice`, `read-file`, `write-text-file`, `write-binary-file`, recursive `walk` w/ extension filter + entry/depth caps); `shell:open-external` (https? only); fullscreen invoke returning real state; `win:state` push events; single-instance lock; menu removed; permission requests denied; `setWindowOpenHandler` deny; autoplay-policy switch; dev-server URL support (`VITE_DEV_SERVER_URL`); security baseline (`contextIsolation`, `sandbox:true`, `nodeIntegration:false`). |
| `electron/preload.cjs` | **Rewritten**. One explicit contextBridge surface: 18 methods (window chrome, fullscreen w/ real state, `onWindowState`, compact, dialogs, bounded fs, `httpFetch`, `openExternal`). |
| `src/desktopWindow.ts` | Full Electron branches for all window functions; real-state fullscreen; `onElectronWindowState()` subscriber + `data-electron-win` CSS hook; expanded `ElectronApi` type. Tauri branches untouched. |
| `src/desktopLibrary.ts` | `isDesktopRuntime = Tauri ∪ Electron`; `electronFileSrc()` (`app://`); Electron branches: `readAudioHeadElectron` (stat + bounded head/tail slices), `walkFolder` (main-process walk), `chooseMusicFolders/Files` (native dialogs), `saveLrcFile`/`saveCoverImage` (writes), `desktopReadFile` (sidecars). Tauri `convertFileSrc` preserved via async `fileSourceUrl()`. |
| `src/desktopHttp.ts` | **NEW** — shared CORS-free transport (see Issue 1). |
| `src/lrclib.ts` | Transport swapped to `desktopFetch` (UA header, timeout, retry loop preserved). |
| `src/coverart.ts` | Transport swapped to `desktopFetch` (timeout preserved). |
| `src/cinema/lib/utils.ts` | `fetchWithTimeout` routes remote URLs through `desktopFetch` (Smart Fetch for all modern UIs). |
| `src/cinema/lib/engine.ts` | `stopAndClear()` now revokes the owned object URL (leak fix). |
| `src/index.css` | Appended "ELECTRON MIGRATION — WINDOW CHROME" block: drag-region CSS + no-drag opt-outs; `html.electron` transparent bg + rounded shell + CSS-drawn shadow; maximized/fullscreen collapse via `[data-electron-win]`. |
| `src/main.tsx` | Adds `html.electron` class + seeds window-state dataset before React mounts. |
| `src/App.tsx` | Runtime class effect: `desktop-runtime` for all, `tauri-runtime` only under Tauri; imports `isTauri`. |
| `package.json` | `main: electron/main.cjs`; version 1.0.0 + description/author; scripts `electron:dev`, `electron:start`, `electron:dist`; electron-builder config (`win` nsis+msi x64, `linux` AppImage, NSIS assisted install, `release/` output). |
| `build/icon.png` | **NEW** — copy of `public/icon.png` (1408×1408) used by electron-builder (auto-converts to .ico ≥256px PNG rule). |
| `src-tauri/**`, `@tauri-apps/*` deps | **Deliberately untouched** — the Tauri build remains a working fallback (see §6). |

## 3. Not verifiable here (needs real Windows hardware / GPU)

1. **Issue 3 visuals** — transparent frameless window + CSS-drawn shadow + rounded
   corners (main + compact mini-player corner clipping). This is the classic
   "looks right in theory" area; verify on real Windows 10/11 with both Intel
   and NVIDIA/AMD machines, and specifically re-test compact mode's 22px corners.
2. **Issue 4 streaming under load** — seek behavior on huge FLAC files over
   `app://` with real disk latency (the Range/206 logic is verified
   functionally; smoothness is not).
3. **NSIS/MSI installers** — `electron-builder --dir` (unpacked) ran clean; the
   actual installer targets require Windows (WiX/NSIS) and were not built here.
4. **Display scaling** — compact reposition math uses DIPs (like Tauri logical
   px), but multi-monitor/HiDPI placement should be sanity-checked once.

## 4. Deviations from the brief

1. **`transparent: true` + CSS shadow** — followed the brief. Note the actual
   `tauri.conf.json` had `transparent:false, shadow:true` (not
   transparent:true as the brief stated), so under Tauri the main window had
   square corners; the Electron build now genuinely rounds + shadows it via
   CSS. No Tauri behavior was changed.
2. **HTTP proxy returns base64** rather than streaming — per the brief's own
   snippet, with a 30MB cap; cover art is ~1MB so this is fine, and it lets
   the renderer rebuild a real `Response`.
3. **`corsEnabled: true` + `Access-Control-Allow-Origin: *` on app://** — not in
   the brief, but required: `fetch()` from the `file://` origin to the custom
   scheme is CORS-checked even with `supportFetchAPI` (media elements were fine
   without it). Discovered during the live smoke test.
4. **`sandbox: true`** added (brief only required contextIsolation +
   nodeIntegration:false) — the preload uses only `contextBridge`/`ipcRenderer`,
   which are sandbox-safe.
5. **Fullscreen state is reported, not assumed** — brief's snippet used
   fire-and-forget IPC; the renderer's `toggleDesktopFullscreen()` contract
   requires the resulting state, so `win:toggle-fullscreen` is an `invoke`
   returning the real post-toggle value (matches Tauri's round-trip).
6. **`fs:walk` runs in the main process** (one IPC, extension-filtered there)
   instead of per-entry readDir IPC — faster and keeps the payload bounded.
7. **Windows executable name** — electron-builder uses the package `name`
   (`react-vite-tailwind`) for the unpacked Linux exe; the NSIS installer uses
   `productName: NOBODY`. If the bare exe name matters, rename package `name`
   to `nobody` before shipping.

## 5. New issues discovered (not anticipated in the brief)

1. **`smartFetch.ts` bypassed `lrclib.ts` entirely** — the Cinema/EELA/ALOK
   Smart Fetch used plain `fetch()` via `cinema/lib/utils.ts`; under Electron
   it would have lost ALL lyrics/covers to CORS. Fixed via `desktopFetch`.
2. **`engine.stopAndClear()` object-URL leak** (see Issue 4 audit).
3. **`fetch()`-vs-media-element CORS asymmetry on custom schemes** (see
   deviation 3) — anyone adding `supportFetchAPI` without `corsEnabled` will
   hit "Failed to fetch" from the renderer.
4. **`example.com`-style allow-list rejections surface as generic IPC errors**
   in the renderer (`Error invoking remote method 'http:fetch'`). Callers
   already treat any rejection as "fetch failed" (graceful), but the UI could
   distinguish "offline" vs "blocked" if that ever matters.

## 6. What still uses Tauri APIs, and why

- `package.json` keeps `@tauri-apps/*` deps; `src-tauri/` is untouched — the
  Tauri build remains a deliberate, working fallback (one `bun run build`
  serves both runtimes; runtime detection picks the transport).
- `src/desktopHttp.ts` (Tauri branch), `src/desktopLibrary.ts` (plugin-fs /
  plugin-dialog / convertFileSrc branches), `src/desktopWindow.ts`
  (`window.__TAURI__` global branch) — all deliberate parity branches, none
  reachable under Electron.
- Nothing in the Electron path imports Tauri modules at runtime: under
  Electron every dynamic `import("@tauri-apps/...")` site is behind an
  `isTauri()` / non-Electron guard.

## 7. How this was verified (and how to re-verify)

- `bunx tsc --noEmit` → **0 errors**; eslint on all touched files → **0 errors**;
  `bun run build` (Vite) → OK; deployed `dist/` → preview host; browser E2E
  (agent-browser): classic boots, 4 UI panes mounted, `html.electron` correctly
  absent in the browser, drag-region CSS applied, drop-import of 2 WAVs →
  library rows render, track title loads, **0 console/page errors**.
- **Real Electron boot smoke** (xvfb, `--no-sandbox --no-zygote`, running the
  actual `main.cjs` + `preload.cjs` + built renderer): renderer
  `readyState=complete` + React mounted all 4 UIs; all 18 `electronAPI` methods
  present; `app://` full fetch exact bytes; Range 206 + Content-Range; real WAV
  `<audio>` `loadedmetadata duration=0.5`; LRCLIB through the proxy `ok=true
  status=200`; `example.com` blocked; fullscreen toggle state round-trip
  correct; compact enter/exit OK; `fs:stat`/`fs:read-slice` correct (PNG
  signature). The temporary smoke entry was deleted after the run.
- **Packaging**: `electron-builder --dir` → `release/linux-unpacked` built
  clean (config loaded from package.json); the packaged binary boots from the
  asar with no errors. Installers themselves are Windows-only (§3).
- Re-verify anytime: `bun run electron:start` (build + launch) or
  `bun run electron:dist` on Windows for installers.

---

## 8. QA ADDENDUM (post-migration fix session) — UI-switch playback bug

User symptom: classic folder import plays fine → switching UI cuts the music permanently; restarting never helps.

Root causes found (all fixed, all verified in a real Electron boot via CDP):

1. **WebAudio CORS taint (the big one).** The shared engine routes ALL audio through
   `createMediaElementSource` (EQ/analyser graph). `app://` is a different origin from the
   `file://` renderer → Chromium silences the graph ("MediaElementAudioSource outputs zeroes")
   → the element *plays* while producing ZERO output. Fix: engine sets `crossOrigin="anonymous"`
   for `app://` sources (the protocol already answers `Access-Control-Allow-Origin: *`); blob:
   and Tauri `asset://` behavior unchanged. `main.cjs` now also answers CORS preflights
   (OPTIONS → 204) before its GET-only gate. Probe after fix: peak 47/127 through the graph
   (was 0). This bug was invisible to plain media-element smoke tests and to the web E2E
   (web imports are same-origin blobs).
2. **Single-track handoff queue** — `setQueue([id])` meant the next track never came.
   Handoff now carries `queueIds` (full listen order) in all three consume sites.
3. **Ungated classic keyboard handler** — classic was the only UI answering global keys while
   another UI was active; Space toggled both transports and the two "single-source" guards
   paused each other (app restart → silence no matter what). Classic's handler is now gated on
   `getUiMode() === "classic"`.
4. **Restart resume loss** — `restoreResume()` ran before classic's async boot folder re-scan
   filled the mirror; the resume is now deferred and retried once the library arrives.

Also fixed: bridge `importFiles` always reported `added: 0` (count read before React flushed).

Verification: real Electron (Xvfb + CDP): import→play→switch→audible-probe→restart→resume→
auto-next-track, all green; web E2E both switch directions + keyboard ownership, 0 console
errors; `tsc` 0 errors. Known pre-existing: one benign eslint react-compiler error in the
lyric-line component (ref-registry mutation pattern, untouched by this session).
