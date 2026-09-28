# NOBODY — Version History

**Versioning scheme (by user request):**

| Round type | Version shape | Example |
|---|---|---|
| Bug / error fixes only | `V1.0.x` (patch) | V1.0.1, V1.0.2 |
| New features / options added | `V1.x.0` (minor) | V1.1.0, V2.0.0 |

Every round gets a **new version number** and a **uniquely named source zip**
(`nobody-v<VERSION>-src.zip`). The version is visible in-app:
Classic → Settings → footer line, and EELA → About → version chip.
The Windows installer is named `NOBODY-Setup-<version>.exe` (NSIS) /
`NOBODY-<version>.msi` (MSI).

---

## V1.5.1 — the Setup boots again (hotfix)

**Theme:** fix the packaged Setup's dead-on-arrival boot.

### Fixed
- **The black-window bug:** the shipped `NOBODY-Setup-1.5.0.exe` could open
  into an empty dark window and quit. Root cause: `tsc` compiles the
  Electron layer into `dist-electron/electron/main.js` (the `electron/`
  + `shared/` subdir layout), but `package.json` declared
  `"main": "dist-electron/main.js"` — a file that did not exist in the
  packaged asar, so Electron could not boot the wizard at all. The three
  files had been written against three different emit layouts
  (`package.json` flat, `preload.ts` subdir, `main.ts` flat); they now all
  agree on the real subdir layout: `main` → `dist-electron/electron/main.js`,
  and every runtime path in `main.ts` (renderer `dist/index.html`,
  `payload-meta.json`, `payload-manifest.json`, dev payload, icon probes)
  resolves two levels up from `__dirname`.
- The installer surface is unchanged — `INSTALLER_SPEC` stays 5.

---

## V1.5.0 — the Setup becomes the fifth face (this delivery)

**Theme:** a design-exact custom Windows installer, built the MEMENTO way.

### Added
- **NOBODY Setup** (`setup-app/`): a separate Electron wizard shipped as ONE
  portable exe (`NOBODY-Setup-1.5.0.exe`) containing the wizard UI AND the
  payload. The UI is the «ورود به تاریکی» design reproduced 1:1 — five setup
  pages (Welcome curtain → License → Destination → Installing → Finish) plus
  a three-page uninstaller, fa/en/tr/ru with a genuinely mirrored Farsi
  layout, borderless 980×640 window with its own title bar, and the full V2/V3
  motion pass (drift fields, dust motes, equalizer, pour bar, LightBurst).
- **Real install pipeline** (MEMENTO-style, runtime-reuse): the wizard clones
  its own Electron 41.7.1 runtime into the destination and hardlinks its
  running image as NOBODY.exe (AV-hygiene), drops the app payload
  (app.asar, sha256-verified + heal), creates Start-Menu/desktop shortcuts,
  registers the ARP key (HKLM for "all users", HKCU for "just me"), runs the
  app after Finish — with taskkill-on-upgrade, `.bak-<ts>` staging and full
  leave-no-trace rollback. Progress is byte-exact per file, never a timer.
- **Uninstaller-as-setup**: the same exe relaunches as the uninstall wizard
  (marker `.nobody-uninstall.json`), stages shortcuts → registry → files →
  optional user-data → final self-delete, keeping `%APPDATA%\NOBODY` by
  default. One UAC prompt at launch (MEMENTO 2.0.3 contract) so BOTH
  install scopes are honoured for real.
- **NOBODY Portable** (`NOBODY-Portable-1.5.0.exe`): the player as a single
  portable exe, added as a permanent electron-builder target.

### Changed
- Version 1.4.0 → 1.5.0 everywhere (package.json, src/version.ts, VERSIONS.md).
- `electronLanguages: en-US` trims Chromium locale paks the app never shows
  (~48 MB lighter runtime; NOBODY's own fa/en/tr/ru i18n lives in app.asar).

---

## V1.4.0 — feature + fix round

**New features (minor bump → V1.4.0):**
- **Russian language (RU)** — the app's 4th language, first-class in every
  face: classic (header pill FA→EN→TR→RU cycle + Settings pills + 74 ru
  branches incl. real RU plurals), cinema (TopBar cycler + settings card),
  EELA (settings segment), ALOK (header cycler + panel segment). Full RU
  dictionaries: classic 156 deep keys, cinema/EELA shared 425 flat keys,
  ALOK face-local 91 keys, plus all 1,000 quotes (50 base + 10 generator
  templates designed so any subject pair stays grammatical + 15 subject
  pairs + localized composer names). RU renders LTR; shared-prefs channel
  validates `ru` everywhere so one switch propagates across faces.
- **Per-UI support popups (#2)** — one shared scheduler (first nudge 4–8 min
  into the session, then every 15–25 min, donate/star 55/45, global
  singleton, suppressed while fullscreen/ambient/queue/now-playing owns the
  screen), with a bespoke popup per face: classic dark-glass card with pink
  accents + copy-to-clipboard wallet rows, cinema dreamy glass card with
  accent hairline + toasts, EELA ex-libris bookmark card (serif, ribbon
  rule), ALOK "TRANSMISSION" ruled card with corner reticles + mono copy.
  Donate shows the real wallets (USDT/TRX/BTC + Reymit direct link); Star
  links the GitHub repo. ✕ / Escape dismisses.
- **Per-UI close animations (#6)** — every close path (✕ buttons, Alt+F4,
  taskbar) now routes through `requestAppClose()`: the renderer plays a
  face-specific veil (classic CRT power-off wipe, cinema projector
  letterbox shutdown, EELA closing-book, ALOK core implosion) and only then
  really closes; the Electron main process intercepts every close path,
  shows the veil, and carries a 3.5 s force-close failsafe so a dead
  renderer can never wedge the window.
- **Hardware media keys (#9)** — MediaPlayPause / MediaNextTrack /
  MediaPreviousTrack / MediaStop are registered as Electron global
  shortcuts, work minimized and unfocused, and drive the active face
  (classic's own audio element / the shared engine for cinema+EELA+ALOK)
  via a `media:key` IPC → window CustomEvent bridge; unregistered on quit.
- **Cinema karaoke with cover-palette fill (#4)** — the active lyric line
  now pours the track's REAL cover colors (two dominant distinct hues,
  cached per track, invalidated on cover replacement) through the sung
  region up to a rAF-computed frontier with a 1px near-white playhead
  edge; accent-gradient fallback, LTR+RTL symmetric.
- **Cinema artist-cover download (#10)** — "Download artist covers" header
  action on the Artists board batch-fetches 600×600 iTunes artist images
  (sequential, per-artist failures tolerated), stores them in a new
  `artist-covers` IndexedDB store, and paints them on the artist tiles
  (album-artists board shares the renderer); loading/misses keep the old
  representative-cover fallback.
- **Support nudge → Contact / Donation alignment (#7/#11)** — single source
  of truth `supportInfo.ts`: Instagram = disabled "Coming soon" card/row in
  every face, Twitter/X removed everywhere, Email = Epodonios@gmail.com,
  Telegram = @nowheremans, GitHub = Epodonios/NOBODY-player; donation info
  (USDT/TRX/BTC wallets + reymit.ir/epodonios) ported from classic into
  cinema/EELA/ALOK support views with copy-to-clipboard parity.
- **Dedication refresh (#8)** — dedication + creator texts rewritten in a
  warm colloquial register and translated into all four languages (classic
  dict keys, cinema About "from NOBODY / from the creator" cards, ALOK
  panel dedication block); appearance untouched.

**Fixes:**
- **Focus mode (#3)** — manually enabled Focus/Ambient no longer exits on
  mouse movement (only a deliberate backdrop click, the ✕ button, or
  Escape ends it), persists across pause, and its prev/play-pause/next
  transport buttons actually receive their clicks; auto (idle) ambient
  keeps the old exit-on-anything behavior.
- **Cursor leaks (#5)** — scrollbar track/thumb/corner of every shell got
  explicit cursor rules so the Windows default arrow can't reappear over
  scrollbars; `-webkit-app-region` drag strips (whose OS hit-test layer
  overrode CSS cursors on headers) were fully replaced by a manual
  pointer-capture window drag via IPC, so the custom cursor now stays
  alive over every header region.
- **ALOK/EELA/cinema quality pass** — React-hooks lint hygiene for the new
  popup/idle-tracking and artist-art cache code (render-derived cache
  hits, no cascading setState).

---

## V1.3.0 — feature + fix round

**New features (minor bump → V1.3.0):**
- **Folder management in every new UI** (cinema / EELA / ALOK): the managed
  folder list is now surfaced where the Folders category lives — glass
  chip-cards (cinema), ledger rows (EELA), ruled panel section (ALOK) — each
  with live track counts, RESCAN and REMOVE (two-tap confirm), plus ADD.
  Powered by a new bridge surface (`listFolders` / `removeFolder` /
  `rescanFolder` / unified `importPaths`) with the EXACT classic semantics
  (filter folderPaths + tracks, revoke blobs except the playing track) and a
  shared `folderManager` module. Folders added in any UI are real classic
  folders: persisted, rescanned on boot, removable everywhere — including
  classic's own Folders tab.
- **Download Center for all three new UIs** — same engine and functionality
  as Classic, three unique faces: cinema "studio" glass workspace (upgraded
  Smart Fetch tab), EELA "acquisitions ledger" (print songbook chapter),
  ALOK "Transfer Bay" (new dock view + command-palette action). Full classic
  parity in ALL of them: Lyrics/Covers tabs, stat readouts, folder scope,
  text search, selection, status chips with live counts, persisted options
  (skipExisting / autoApply / saveToDisk), Start/Stop/Retry-failed/Clear,
  progress + summary + cancel + minimized pill (cinema), per-track fetch /
  retry / manual search, manual lyrics candidates (exact-±3s / synced /
  plain / instrumental badges, preview, apply, save file), manual cover
  candidates (iTunes+Deezer grid, apply, save), SAVE AUDIO FILE
  (native Save-As → Downloads via new `dialog:save-copy` IPC), LRCLIB
  health check, RTL + themes + keyboard access.
- **Unified fetch engine**: smartFetch now runs on the classic modules
  (src/lrclib.ts + src/coverart.ts) — same UA, endpoints, matching rule
  (exact → first synced; no looser "any synced"), instrumental handling,
  plain-never-auto-applied, cover size guard — plus sidecar `.lrc`/cover
  writes next to the audio and IndexedDB/classic mirror write-back.

**Fixes in the same round:**
- **Second folder could never be added** — root cause: the classic import
  ended with a stale-closure `setTracks([...tracks, ...newTracks])`, so the
  boot rescan and a manual/bridge import overwrote each other's tracks.
  Imports are now serialized through one promise chain and use functional
  updaters; the insert index is captured inside the updater.
- **Music no longer stops when returning to Classic** — the handoff consumer
  is hardened: the blob is cleared only after a successful apply (with a
  deferred retry on notify + timer, ~5 attempts), the seek is deferred one
  animation frame and waits for the NEW source's `loadedmetadata` (verified
  via `currentSrc`, never the old resource), the full listen order
  (`queueIds`) is restored into classic's user queue, and the auto-import
  reads the real `filePath` for bridged tracks.
- **OS cursor on the headers of the new UIs** — root cause: the whole
  headers were `-webkit-app-region: drag` regions, which Chromium resolves
  at the OS level where CSS cursors (even `cursor:none !important`) are
  ignored. Each header (and the Now-Playing overlay strips) now has ONE
  dedicated invisible 16px drag strip at the window's top edge; content is
  drag-free, so the custom cursor works over 100% of the header while the
  window stays draggable from the top edge. The drag mapping is now gated
  behind `html.electron`.
- **ALOK ring: progress arc and knob dot were 90° apart** — the arc mask
  used `conic-gradient(from -90deg …)` while the dot/dial/seek math all use
  the 12-o'clock convention; the offset is removed (arc, comet tail and dot
  now share one geometry).
- Classic's pink SVG cursors no longer leak into the new UIs when their
  custom cursor is inactive (rules scoped to classic shells); ALOK's idle
  `cursor:none` is scoped to the custom-cursor mode; the native Chromium
  context menu is suppressed in the new UIs (classic parity); cancelling a
  native picker no longer opens a second (web) dialog; "no audio files
  found" is reported instead of a silent no-op; cinema's audio-extension
  filter now accepts everything classic accepts (oga/alac/ape/caf/dsf/mpc/
  3gp/amr/mp4).

---

## V1.2.0 — feature + fix round

**New features (minor bump → V1.2.0):**
- **Cinematic (rêve) Library redesign — category tile board** (user item 1):
  inspired by the user's reference image — 11 square, rounded tiles
  (All Songs · Folders · Subfolders · Albums · Album Artists · Artists ·
  Years · Play Queue · Most Played · Longest · Favorites), each with its own
  icon, live count chip and a per-category ambient gradient driven by the
  app's DYNAMIC accent (re-tints live with cover theming). Empty library
  shows all 11 tiles; with content the Library opens straight into the last
  used view (persisted in `nobody-cinema-lib-view`), defaulting to All Songs.
  Group categories drill down into beautiful sub-tiles (representative cover
  art, name chip, "/Music"-style path chip).
- **EELA Library redesign — "The Index"** (user item 7): the same 11
  categories rendered as a printed songbook table-of-contents — serif
  chapter titles, roman-numeral ordinals, dotted leaders, live counts, drill
  down chapters. Deliberately the visual opposite of the cinematic tile
  board. Persistence: `nobody-eela-lib-view`.
- **Dynamic custom cursors** (user item 3): the three new faces (cinema /
  eela / alok) each get a bespoke accent-tinted cursor set (arrow / action /
  I-beam) that RE-TINTS LIVE with the dynamic theme color; classic keeps its
  own SVG cursor set.
- Play counts: a persisted per-track play counter (localStorage
  `nobody-play-counts`) feeds the Most-Played category in both new
  libraries; recorded after 5s of genuine playback.

**Fixes in the same round:**
- **Installer import fix** (user item 2): folder/music import in ALL new UIs
  (cinema/eela/alok) now works in the packaged Windows app — pickers route
  through the NATIVE dialogs + the classic real-path pipeline
  (webUtils.getPathForFile + bridge `importPaths`; stat-split for folder vs
  file paths; drag-and-drop files are path-resolved too, so imports stream
  from disk and survive restarts).
- **EELA download engine = classic parity** (user item 4): fetched
  lyrics/covers now PERSIST into the classic library (no more losing them on
  restart) AND are written as sidecar files (`song.lrc` / `song.jpg`) next
  to the audio — exactly like the classic fetch engine.
- **EELA quality pass** (user item 5): NP/ambient backdrops are now
  canvas-smoothed PNG washes (no more blocky/banded "thumbnail" gradients
  from giant GPU blurs), buttons/cards/active states got print-grade sheen,
  crisper borders and deeper shadows.
- **EELA synced-lyrics scroll fix** (user item 6): the active line no longer
  scrolls past the top and gets stuck invisible — offsetParent-proof
  centering with a settle re-apply.
- **EELA header overlap fix** (user item 6): the nav card now sizes to its
  content (viewport-capped) so nav buttons can never ride on top of
  "BY EPODONIOS".
- Shared engine fix: queue mirror now also drives the new Queue category.

**Package note (repack):** the first V1.2.0 source zip
(`nobody-v1.2.0-src.zip`) was built with an over-eager exclude filter and
accidentally dropped `public/` (all ~180 app font files + google-fonts.css)
and `package-lock.json`. Source code was never affected — verified
byte-by-byte. The complete package is
**`nobody-v1.2.0-src-complete.zip`** (569 files, ~8.4 MB, same content
policy as V1.1.0 and earlier: src + electron + src-tauri + public + dist +
locks + docs). Version stays **1.2.0**: packaging-only fix, zero code
changes.

---

## V1.1.0 — feature + bug-fix round

**New feature (minor bump → V1.1.0):**
- **EELA Download Center** — a dedicated, EELA-themed download center:
  - Bulk fetch: synced lyrics (LRCLIB) + cover art (iTunes/Deezer) for the
    whole library, with a live progress card.
  - Per track: fetch lyrics, fetch cover, **Save lyrics (.txt)**,
    **Save cover image**, **Save audio file** (→ Downloads folder).
  - Reachable from the EELA menu (new "Downloads" nav entry).
  - **Removed the old download buttons**: the "synced lyrics" / "cover art"
    toolbar chips in EELA Library and the "find lyrics" button inside the
    Now-Playing lyrics sheet.

**Bug fixes:**
1. **Cursor unified with Classic** — the custom dot/ring cursors (Cinema dot+ring,
   EELA ink cursor, ALOK reticle) are removed everywhere. Every UI now uses the
   normal OS arrow exactly like Classic. This also fixes the invisible cursor in
   Cinema and the "hand cursor while scrolling the library list" (that hand
   shape came from the custom cursor's hover state).
2. **Rounded window corners in every UI** — the Electron dress-code CSS
   (`html.electron` roots: border-radius 14px + inset shadow, square when
   maximized/fullscreen) covers Classic, Cinema, EELA and ALOK alike.
3. **Fullscreen round-trip fixed** — `win:toggle-fullscreen` snapshots
   `getNormalBounds()`, verifies the exit transition and force-restores geometry
   on the transparent-window quirk; OS-initiated exits flush the saved bounds.
   **New:** F11 now always toggles fullscreen from the main process in every UI.
4. **Music no longer stops when returning to Classic** — three root causes fixed:
   - `captureHandoff`/`pause` moved from a cinema component effect to the
     **engine module scope** (the old bridge was deleted on unmount);
   - handoff track ids are now compared **as strings** (the old
     `Number(trackId)` produced NaN for tracks imported inside the new UIs and
     silently aborted the resume);
   - if the track genuinely isn't in the Classic library yet, it is **imported
     automatically** from the shared engine library (by source path) before the
     position is restored; the engine handoff now also carries the full
     shuffle-aware queue order.
5. **Compact mode: background fully blurred** — the compact backdrop image is
   now unconditionally blurred (blur 30px, was sharp brightness-only).
6. **RAM (~1 GB complaint)** — hidden engine UIs (Cinema/EELA/ALOK) now
   **unmount** instead of living forever with `display:none`; the Classic shell
   stays mounted because it owns the desktop library bridge. 4 live UIs → 2.
   Playback continuity is unaffected (module-level engine + handoff blob).

## V1.0.0 — Electron migration baseline

- Tauri 2 → Electron 41 migration (frameless transparent window, streaming
  `app://` protocol, preload bridge, NSIS+MSI packaging).
- Four UIs (Classic / Cinema / EELA / ALOK) sharing one library and one engine.
