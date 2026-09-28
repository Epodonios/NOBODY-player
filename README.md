# Nobody — Desktop Luxury Audio Player

> Premium aesthetics-first music player with real-time synchronized lyrics, dynamic cover-driven theming, and an immersive cinematic desktop experience.
> Designed and engineered by **EPODONIOS**.

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Requirements](#requirements)
3. [Web Build](#web-build)
4. [Compiling with Tauri (EXE / MSI / DMG / AppImage)](#compiling-with-tauri)
5. [Application Icon](#application-icon)
6. [Keyboard Shortcuts](#keyboard-shortcuts)
7. [Features](#features)
8. [Troubleshooting](#troubleshooting)

---

## Project Structure

```
nobody/
├── public/
│   └── icon.png          # 1024×1024 master app icon
├── src/
│   ├── App.tsx           # Main shell, routing, state, import engine
│   ├── audioParser.ts    # Client-side ID3 / FLAC metadata + cover extraction
│   ├── i18n.ts           # Multi-language dictionary (FA / EN / TR)
│   ├── index.css         # Complete stylesheet
│   ├── main.tsx          # Vite entry point
│   ├── quotes.ts         # 1000 inspiring music & night quotes
│   ├── stylesData.ts     # 400 title animations + 400 artist fonts
│   ├── translate.ts      # Smart translation engine
│   ├── types.ts          # TypeScript definitions
│   └── uiCopy.ts         # Interface copy per language
├── index.html
├── package.json
├── vite.config.ts
└── README.md
```

> **Note:** The production build ships with an **empty library**. On first run the user is greeted by an import screen and adds their own music folders.

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Rust | ≥ 1.70 (for Tauri only) |

### Platform prerequisites for Tauri

**Windows**
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (select *Desktop development with C++*)
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (pre-installed on Windows 11)

**macOS**
```bash
xcode-select --install
```

**Linux (Debian / Ubuntu)**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Install Rust (all platforms)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Windows: download and run https://win.rustup.rs/x86_64
```

Verify:
```bash
rustc --version
cargo --version
```

---

## Web Build

```bash
npm install
npm run build
```

Output is a **fully self-contained single-file HTML page**:

```
dist/index.html
```

All JavaScript, CSS and fonts are inlined into that one file.

---

## Compiling with Tauri 2

> This project is already fully configured for **Tauri 2**. The `src-tauri/`
> folder (config, capabilities, Rust entry points) is ready — **do NOT run
> `npx tauri init`**, it would overwrite the prepared config.

### ⚠️ If you previously built with Tauri 1 — clean first

The old Tauri 1 build cache is what still shows the duplicate Windows titlebar
and the *"outdated Tauri"* warning. Delete it once:

```bash
# from the project root (Windows PowerShell / CMD)
rmdir /s /q src-tauri\target
del package-lock.json
rmdir /s /q node_modules
```

### Step 1 — Install dependencies (Tauri 2 versions are already in package.json)

```bash
npm install
```

`package.json` already pins the Tauri 2 toolchain:

```jsonc
{
  "devDependencies": {
    "@tauri-apps/cli": "^2"
  },
  "dependencies": {
    "@tauri-apps/api": "^2"
  }
}
```

### Step 2 — Install the Rust desktop toolchain (once)

```bash
# Rust (if not already installed)
# download & run: https://win.rustup.rs/x86_64

rustc --version   # must print a version ≥ 1.77
```

You also need the **Microsoft C++ Build Tools** and **WebView2 Runtime**
(pre-installed on Windows 11). See the *Requirements* section above.

### Step 3 — Generate the app icons (once)

```bash
npx tauri icon public/icon.png
```

Creates `src-tauri/icons/` with `icon.ico`, `32x32.png`, `128x128.png`,
`128x128@2x.png`, `icon.icns` and the Windows Store logos — all from the single
master icon so the taskbar / installer icon matches the in-app logo exactly.

### Step 4 — Run in development

```bash
npx tauri dev
```

A native, **frameless** desktop window opens with hot-reload. Only the app's own
titlebar (with the coloured dot controls) is shown — the OS titlebar is removed
by `"decorations": false`.

### Step 5 — Build the Windows `.exe`

```bash
npx tauri build
```

Artifacts land in `src-tauri/target/release/`:

| Output | Path |
|--------|------|
| **Installer (.exe)** | `bundle/nsis/Nobody_1.0.0_x64-setup.exe` |
| **Installer (.msi)** | `bundle/msi/Nobody_1.0.0_x64_en-US.msi` |
| **Portable (.exe)** | `Nobody.exe` |

### The prepared Tauri 2 config (already in `src-tauri/tauri.conf.json`)

```jsonc
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Nobody",
  "version": "1.0.0",
  "identifier": "com.epodonios.nobody",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "label": "main",
        "title": "Nobody",
        "width": 1360,
        "height": 860,
        "minWidth": 720,
        "minHeight": 520,
        "decorations": false,   // ← removes the native Windows titlebar
        "shadow": true,
        "center": true,
        "theme": "Dark"
      }
    ],
    "security": { "csp": null }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.ico"]
  }
}
```

### Window permissions (already in `src-tauri/capabilities/default.json`)

Tauri 2 blocks every window command until it is granted in a capability file.
The prepared file grants minimize / maximize / close / fullscreen / resize /
set-size / set-position / always-on-top / start-dragging so the custom titlebar
and the compact mini-player work.

### Cross-platform note

Tauri cannot cross-compile — build Windows binaries on Windows.

---

## Application Icon

The master icon is at **`public/icon.png`** — a 1024×1024 dark rounded-square tile featuring the gradient **N** monogram (pink `#EF4C78` → violet `#6542D8`) with a glowing accent dot.

To regenerate every platform variant after editing it:

```bash
npx tauri icon public/icon.png
```

To use a completely custom icon, simply replace `public/icon.png` with your own **1024×1024 PNG** and re-run the command above.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Seek −5s / +5s |
| `↑` / `↓` | Volume up / down |
| `PgUp` / `PgDn` | Previous / Next track |
| `Home` / `End` | Jump to start / end |
| `M` | Mute toggle |
| `L` | Like current track |
| `S` | Shuffle toggle |
| `R` | Repeat toggle |
| `C` | Compact mini-player |
| `Q` | Toggle queue panel |
| `F` | Fullscreen |
| `/` | Focus search |
| `Esc` | Close overlays |
| `1` – `5` | Focus · Library · Lyrics · Contact · Donate |

---

## Features

- **Live synchronized lyrics (LRC)** with automatic same-name file matching during folder import
- **Smart translation engine** — auto-detects language and translates lyrics into FA / EN / TR
- **400 dynamic title animations** — every track title receives a unique cinematic effect
- **400 artist font presets** — deterministic signature typography per artist
- **Compact mini-player** with three-line scrollable lyrics and beat-aware equalizer
- **Idle Cinema** — after 30s of inactivity the chrome fades and live beat bars appear
- **Command-palette search** across titles, artists, albums, years and formats
- **Playlists** — automatic Liked Songs plus custom lists with colour themes and emblems
- **Lyrics fullscreen mode** with centred typography and hidden scrollbar
- **Donate page** with USDT / TRX / BTC wallets and Reymit portal
- **Responsive** across four breakpoint tiers
- **Persistent session** — last track, position, volume, language and playlists are restored

### Supported audio formats

`MP3` · `FLAC` · `WAV` · `OGG` · `OPUS` · `M4A` · `AAC` · `ALAC` · `AIFF` · `APE` · `WMA` · `WebM` · `3GP` · `DSF` · `MPC`

---

## Troubleshooting

**`Error: Can't open language file - "...Persian.nlf"` (Windows NSIS build)**
This occurs when Windows locale is set to Persian (`fa-IR`), causing Tauri's bundled NSIS to search for `Persian.nlf` (which standard NSIS distributions name `Farsi.nlf` or omit).  
*This is fixed in `src-tauri/tauri.conf.json` by explicitly setting `"languages": ["en-US"]` under `bundle.windows.nsis`.*

**`error: linker 'cc' not found` (Linux)**
```bash
sudo apt install build-essential
```

**`failed to run custom build command for 'webkit2gtk'` (Linux)**
```bash
sudo apt install libwebkit2gtk-4.1-dev
```

**Blank white window on launch**
Confirm `frontendDist` in `tauri.conf.json` points to `../dist` and that `npm run build` has been executed at least once.

**Icons not updating**
Delete `src-tauri/icons/`, then re-run `npx tauri icon public/icon.png`.

**Very slow first build**
Normal — Rust compiles all dependencies from scratch on the first run. Subsequent builds are cached and much faster.

**Reduce binary size**

Add to `src-tauri/Cargo.toml`:
```toml
[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

---

## Licence

**Nobody** — an independent project by **EPODONIOS**.
Provided "as is" without warranty of any kind.

*Last updated: 2026-04*
