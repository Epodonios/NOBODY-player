/**
 * NOBODY Setup — Electron main (MEMENTO lineage, adapted).
 *
 * Owns the design-exact frameless window (the wizard draws its own title
 * bar), the payload context, and the Windows touchpoints for
 * installerCore:
 *   - real directory picker (dialog.showOpenDialog)
 *   - real free-space probe (fs.statfs)
 *   - real shortcuts (shell.writeShortcutLink — Start Menu\NOBODY\,
 *     optional desktop, "Uninstall NOBODY.lnk" → the uninstaller exe)
 *   - real Add/Remove Programs registration (scope-aware: HKLM for
 *     "all", HKCU for "me" — the portable wizard runs elevated)
 *   - real upgrade path (taskkill a running NOBODY, stage-aside backup)
 *   - real run-after-finish (plain detached spawn of NOBODY.exe)
 *
 * MODE — runtime-reuse ONLY: the payload carries NOBODY's app code
 * (resources/app.asar + icon); the destination reuses THIS wizard's own
 * Electron 41.7.1 runtime (electron-builder.yml pins the exact version —
 * setup and app must never drift). The payload is additionally STAGED
 * out of the volatile portable-extraction folder at every launch
 * (MEMENTO's field fix: a second launch of the portable stub wipes the
 * %TEMP% folder out from under the running wizard).
 *
 * The setup exe DOUBLES as the uninstaller: installed as
 * "<dest>\Uninstall NOBODY.exe" with a .nobody-uninstall.json marker
 * beside it. This process runs in uninstall mode when that marker exists
 * next to the launch exe, or argv contains --nobody-uninstall, or the
 * exe filename starts with "Uninstall".
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import path from "path";
import fs from "fs";
import { execFile, execFileSync, spawn } from "child_process";
import {
  runInstall,
  runUninstall,
  buildUninstallPlan,
  freeDiskBytes,
  computeManifest,
  UNINSTALL_SENTINEL,
  type InstallDeps,
  type InstallResult,
  type PayloadManifest,
  type RuntimeFileEntry,
  type Scope,
  type UninstallInfo,
} from "./installerCore";
import type { InstallOptions, SetupContext, SetupEvent, UninstallOptions } from "../shared/contract";

const IS_WIN = process.platform === "win32";
const EXE_NAME = IS_WIN ? "NOBODY.exe" : "NOBODY";
const SPEC = 1; // installer surface spec — bump when install/uninstall changes

/** IPC channels — MUST mirror electron/preload.ts (one table there). */
const CHANNEL = {
  ctx: "setup:ctx",
  statPath: "setup:stat-path",
  chooseDir: "setup:choose-dir",
  startInstall: "setup:install",
  cancelInstall: "setup:install-cancel",
  startUninstall: "setup:uninstall",
  launchApp: "setup:launch-app",
  openFolder: "setup:open-folder",
  minimize: "setup:win-minimize",
  close: "setup:win-close",
  event: "setup:event",
} as const;

let mainWindow: BrowserWindow | null = null;
let installBusy = false;
let cancelRequested = false;
let lastResult: InstallResult | null = null;

/* ------------------------------------------------------------------ */
/* userData — the setup must NEVER collide with the real app           */
/* ------------------------------------------------------------------ */
/* productName is NOBODYSetup, so Electron would default the setup's
 * userData to %APPDATA%\NOBODYSetup. The task pins an explicit override
 * so the wizard's own caches never touch the real app's %APPDATA%\NOBODY. */
app.setPath("userData", path.join(app.getPath("appData"), "NOBODY-Setup"));

/* ------------------------------------------------------------------ */
/* Payload plumbing                                                    */
/* ------------------------------------------------------------------ */

function payloadDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, "payload");
  // __dirname = <asar>/dist-electron/electron (tsc emits the electron/
  // subdir layout) — two levels up is the app root.
  return path.join(__dirname, "..", "..", "payload");
}

function payloadMeta(): { appVersion?: string; mode?: string; electron?: string } {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "payload-meta.json"), "utf8"));
  } catch {
    return {};
  }
}

let manifestCache: PayloadManifest | null | undefined;
/** The sha256 contract from payload-manifest.json (written by
 *  scripts/sync-payload.js). null → installerCore computes one live. */
function loadPayloadManifest(): PayloadManifest | null {
  if (manifestCache !== undefined) return manifestCache;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "payload-manifest.json"), "utf8"));
    const files = Array.isArray(raw?.files) ? raw.files : [];
    manifestCache = {
      files: files.map((f: any) => ({
        rel: String(f?.rel ?? ""),
        bytes: Number(f?.bytes) || 0,
        sha256: String(f?.sha256 ?? ""),
      })),
      totalBytes: Number(raw?.totalBytes) || 0,
      totalFiles: Number(raw?.totalFiles) || files.length,
    };
  } catch {
    manifestCache = null;
  }
  return manifestCache;
}

function safeReaddir(dir: string): fs.Dirent[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** runtime-reuse: the files of the installer's OWN Electron runtime that
 *  the destination needs. The wizard's app.asar, the payload itself, the
 *  icons, the metadata files, the sentinel and every exe name are
 *  deliberately excluded — the payload provides NOBODY's app code. */
function runtimeFileEntries(): RuntimeFileEntry[] {
  const root = path.dirname(process.execPath);
  const SKIP = new Set<string>([
    "app.asar",
    "payload",
    "icon.ico",
    "icon.png",
    "payload-manifest.json",
    "payload-meta.json",
    UNINSTALL_SENTINEL,
    "NOBODY-Setup.exe",
    "NOBODYSetup.exe",
    "NOBODY.exe",
    "Uninstall NOBODY.exe",
    path.basename(process.execPath), // the running setup exe itself
    process.env.PORTABLE_EXECUTABLE_FILENAME ?? "", // the portable stub name, if any
  ]);
  const out: RuntimeFileEntry[] = [];
  for (const e of safeReaddir(root)) {
    if (e.isDirectory() || SKIP.has(e.name)) continue;
    const p = path.join(root, e.name);
    try {
      out.push({ rel: e.name, bytes: fs.statSync(p).size });
    } catch {
      /* unreadable runtime file — skip */
    }
  }
  const loc = path.join(root, "locales");
  if (fs.existsSync(loc)) {
    for (const e of safeReaddir(loc)) {
      if (!e.isFile()) continue;
      try {
        out.push({ rel: path.join("locales", e.name), bytes: fs.statSync(path.join(loc, e.name)).size });
      } catch {
        /* skip */
      }
    }
  }
  const elevate = path.join(root, "resources", "elevate.exe");
  if (fs.existsSync(elevate)) {
    try {
      out.push({ rel: path.join("resources", "elevate.exe"), bytes: fs.statSync(elevate).size });
    } catch {
      /* skip */
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Payload staging — the portable-extraction rescue (MEMENTO field fix)*/
/* ------------------------------------------------------------------ */
/* electron-builder's portable target extracts the whole app into the
 * SAME %TEMP%\<unpack-id> folder at EVERY launch, and a NEW launch of
 * the same exe begins with `RMDir /r` on that exact folder. Users double-
 * click (the silent extraction gives no feedback), so a second stub
 * wipes the payload out from under the RUNNING wizard. FIX: right after
 * launch the payload is MOVED (same-volume rename — a pure metadata
 * operation) into a private staging folder; the install reads from
 * THERE. Dev runs read the repo payload directly. */

interface StagingState {
  root: string;
  payloadDir: string | null;
  ready: boolean;
  skipped: number;
  error: string | null;
  promise: Promise<void> | null;
}

let staging: StagingState | null = null;

function stagingBase(): string {
  if (IS_WIN) {
    // %LOCALAPPDATA%\NOBODY-Setup\staging
    const base = process.env.LOCALAPPDATA || app.getPath("userData");
    return path.join(base, "NOBODY-Setup", "staging");
  }
  // POSIX gate/dev runs: appData\NOBODY-Setup IS userData here (set above),
  // so do NOT append "NOBODY-Setup" a second time.
  return path.join(app.getPath("userData"), "staging");
}

/** Per-file tolerant recursive copy — returns the skipped count.
 *  Runs with process.noAsar = true: the payload contains app.asar and
 *  Electron's fs patch would otherwise treat that copy as an archive
 *  write ("Invalid package") and skip it. */
function copyTreeTolerant(src: string, dst: string): number {
  const p = process as NodeJS.Process & { noAsar?: boolean };
  const prev = p.noAsar;
  p.noAsar = true;
  let skipped = 0;
  const walk = (s: string, d: string): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(s, { withFileTypes: true });
    } catch {
      skipped++;
      return;
    }
    try {
      fs.mkdirSync(d, { recursive: true });
    } catch {
      skipped += entries.filter((e) => e.isFile()).length || 1;
      return;
    }
    for (const e of entries) {
      const sp = path.join(s, e.name);
      const dp = path.join(d, e.name);
      if (e.isDirectory()) walk(sp, dp);
      else if (e.isFile()) {
        try {
          fs.copyFileSync(sp, dp);
        } catch {
          skipped++;
        }
      }
    }
  };
  walk(src, dst);
  p.noAsar = prev ?? false;
  return skipped;
}

function cleanupStaleStaging(): void {
  const base = stagingBase();
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith("stage-")) continue;
    try {
      fs.rmSync(path.join(base, e.name), { recursive: true, force: true });
    } catch {
      /* best-effort — the next boot retries */
    }
  }
}

function startPayloadStaging(): void {
  if (!app.isPackaged) return; // dev runs read the repo payload directly
  cleanupStaleStaging();
  const src = payloadDir();
  if (!fs.existsSync(src)) return;
  const root = path.join(stagingBase(), `stage-${process.pid}-${Date.now()}`);
  const st: StagingState = {
    root,
    payloadDir: null,
    ready: false,
    skipped: 0,
    error: null,
    promise: null,
  };
  staging = st;
  st.promise = (async () => {
    try {
      const dst = path.join(root, "payload");
      // MOVE the payload out of the volatile SFX extraction folder
      // instead of byte-copying it: a same-volume rename writes ZERO
      // file content, completes in about a second, and the extraction
      // dir can be wiped at any moment afterwards.
      let moved = false;
      try {
        fs.renameSync(src, dst);
        moved = true;
      } catch {
        /* EXDEV (different volume) / EBUSY / EPERM — tolerant copy below */
      }
      st.skipped = moved ? 0 : copyTreeTolerant(src, dst);
      st.payloadDir = dst;
      st.ready = true;
    } catch (e: any) {
      st.error = String(e?.message || e);
    }
  })();
  void st.promise;
}

/** The payload the INSTALL reads from: the private staged copy when it
 *  exists, the (volatile) extraction copy otherwise. */
function installPayloadDir(): string {
  if (staging?.ready && staging.payloadDir && fs.existsSync(staging.payloadDir)) {
    return staging.payloadDir;
  }
  return payloadDir();
}

function disposeStaging(): void {
  if (!staging) return;
  try {
    fs.rmSync(staging.root, { recursive: true, force: true });
  } catch {
    /* stale sweep on next boot */
  }
  staging = null;
}

/* ------------------------------------------------------------------ */
/* Defaults + probes                                                   */
/* ------------------------------------------------------------------ */

function defaultUserDir(): string {
  if (IS_WIN) {
    const localAppData =
      process.env.LOCALAPPDATA || path.join(app.getPath("home"), "AppData", "Local");
    return path.join(localAppData, "Programs", "NOBODY");
  }
  // POSIX (dev / gate runs): a writable sandbox path, never the system.
  return path.join(app.getPath("home"), ".local", "share", "nobody-test");
}

function defaultAllDir(): string {
  if (IS_WIN) {
    return path.join(process.env.ProgramFiles ?? "C:\\Program Files", "NOBODY");
  }
  return path.join(app.getPath("home"), ".local", "share", "nobody-test");
}

/** The REAL app's data dir — %APPDATA%\NOBODY. The setup's own Electron
 *  userData was overridden to NOBODY-Setup above; these two never mix. */
function appDataDirOfApp(): string {
  return path.join(app.getPath("appData"), "NOBODY");
}

function desktopDir(): string {
  try {
    return app.getPath("desktop");
  } catch {
    return path.join(app.getPath("home"), "Desktop");
  }
}

function startMenuDir(): string {
  if (IS_WIN) {
    return path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs");
  }
  return path.join(app.getPath("home"), ".local", "share", "applications");
}

const ARP_KEY_BASE = "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NOBODY";

function arpKey(scope: Scope): string {
  return `${scope === "all" ? "HKLM" : "HKCU"}\\${ARP_KEY_BASE}`;
}

/** Upgrade probe: reg.exe query of the NOBODY ARP key (HKLM + HKCU) plus
 *  the uninstall marker in the default destinations. */
function probeInstalledVersion(): { upgrade: boolean; installedVersion: string | null } {
  const found: string[] = [];
  if (IS_WIN) {
    for (const hive of ["HKLM", "HKCU"]) {
      try {
        const out = execFileSync(
          "reg",
          ["query", `${hive}\\${ARP_KEY_BASE}`, "/v", "DisplayVersion"],
          { encoding: "utf8", windowsHide: true, timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }
        );
        const m = /DisplayVersion\s+REG_\S+\s+(\S+)/.exec(out);
        if (m) found.push(m[1]);
      } catch {
        /* key absent — not installed (for this scope) */
      }
    }
  }
  for (const dir of [defaultUserDir(), defaultAllDir()]) {
    try {
      const marker = JSON.parse(fs.readFileSync(path.join(dir, UNINSTALL_SENTINEL), "utf8"));
      if (marker && typeof marker.version === "string" && marker.version) found.push(marker.version);
    } catch {
      /* no marker here */
    }
  }
  return { upgrade: found.length > 0, installedVersion: found[0] ?? null };
}

/* ------------------------------------------------------------------ */
/* Uninstaller detection (the setup exe doubles as the uninstaller)    */
/* ------------------------------------------------------------------ */

interface UninstallLaunch {
  exePath: string;
  via: "marker" | "argv" | "name";
}

/** The exe the user ACTUALLY launched. electron-builder's portable stub
 *  re-launches an extracted copy from %TEMP%, so process.execPath alone
 *  can lie — the PORTABLE_EXECUTABLE_* env vars carry the truth. */
function uninstallerRunningImage(): string {
  const dir = process.env.PORTABLE_EXECUTABLE_DIR;
  const name = process.env.PORTABLE_EXECUTABLE_FILENAME;
  if (dir && name) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return process.execPath;
}

function detectUninstallLaunch(): UninstallLaunch | null {
  const exe = uninstallerRunningImage();
  // 1 — the marker file next to the launch exe (the installed uninstaller)
  if (fs.existsSync(path.join(path.dirname(exe), UNINSTALL_SENTINEL))) {
    return { exePath: exe, via: "marker" };
  }
  if (fs.existsSync(path.join(path.dirname(process.execPath), UNINSTALL_SENTINEL))) {
    return { exePath: process.execPath, via: "marker" };
  }
  // 2 — explicit argv flag
  if (process.argv.slice(1).includes("--nobody-uninstall")) {
    return { exePath: exe, via: "argv" };
  }
  // 3 — the exe filename starts with "Uninstall"
  if (/^uninstall/i.test(path.basename(exe))) {
    return { exePath: exe, via: "name" };
  }
  return null;
}

function readSentinel(dir: string): { installDir?: unknown; scope?: unknown; version?: unknown } | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, UNINSTALL_SENTINEL), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

interface UninstallTarget {
  installDir: string;
  scope: Scope;
  version: string;
}

/** Where is the NOBODY install this uninstaller should remove? The
 *  marker wins; otherwise the default destinations are probed. */
function resolveUninstallTarget(launch: UninstallLaunch | null): UninstallTarget | null {
  const meta = payloadMeta();
  const candidates: string[] = [];
  if (launch) candidates.push(path.dirname(launch.exePath), path.dirname(process.execPath));
  candidates.push(defaultUserDir(), defaultAllDir());
  for (const dir of candidates) {
    const s = readSentinel(dir);
    if (!s) continue;
    const installDir =
      typeof s.installDir === "string" && s.installDir && fs.existsSync(s.installDir)
        ? s.installDir
        : dir;
    if (!fs.existsSync(installDir)) continue;
    const scope: Scope = s.scope === "all" ? "all" : "me";
    const version =
      typeof s.version === "string" && s.version ? s.version : meta.appVersion || app.getVersion();
    return { installDir, scope, version };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Windows touchpoints for installerCore                               */
/* ------------------------------------------------------------------ */

function writeShortcut(
  lnkPath: string,
  exePath: string,
  args: string | null,
  description: string,
  iconPath?: string
): "created" | "skipped" | "failed" {
  try {
    if (!IS_WIN) {
      // POSIX gate/dev runs: write a .desktop stub so the pipeline is
      // observable outside Windows too.
      try {
        fs.writeFileSync(
          lnkPath,
          [
            "[Desktop Entry]",
            "Type=Application",
            `Name=${description.split("—")[0].trim()}`,
            `Exec="${exePath}" ${args ?? ""}`.trim(),
            "Terminal=false",
          ].join("\n"),
          "utf8"
        );
        return "created";
      } catch {
        return "skipped";
      }
    }
    const okFlag = shell.writeShortcutLink(lnkPath, "create", {
      target: exePath,
      args: args ?? "",
      description,
      icon: iconPath ?? exePath,
      iconIndex: 0,
    });
    return okFlag ? "created" : "failed";
  } catch {
    return "failed";
  }
}

async function writeUninstallRegistration(info: UninstallInfo): Promise<void> {
  if (!IS_WIN) {
    // POSIX gate runs: persist the registration beside the install so the
    // smoke can assert the EXACT fields Windows would write.
    const twinPath = path.join(info.InstallLocation, UNINSTALL_SENTINEL);
    let merged: Record<string, unknown> = {};
    try {
      merged = JSON.parse(fs.readFileSync(twinPath, "utf8"));
    } catch {
      /* no sentinel yet */
    }
    fs.writeFileSync(twinPath, JSON.stringify({ ...merged, ...info }, null, 2), "utf8");
    return;
  }
  const key = arpKey(info.scope);
  const pairs: Array<[string, string, string?]> = [
    ["DisplayName", info.DisplayName],
    ["DisplayVersion", info.DisplayVersion],
    ["Publisher", info.Publisher],
    ["InstallLocation", info.InstallLocation],
    ["DisplayIcon", info.DisplayIcon],
    ["UninstallString", info.UninstallString],
    ["NoModify", String(info.NoModify), "REG_DWORD"],
    ["NoRepair", String(info.NoRepair), "REG_DWORD"],
    ["EstimatedSize", String(info.EstimatedSizeKB), "REG_DWORD"],
  ];
  for (const [name, value, type] of pairs) {
    await new Promise<void>((resolve) => {
      const argv = ["add", key, "/v", name, "/d", value, "/f"];
      if (type) argv.push("/t", type);
      execFile("reg", argv, { windowsHide: true }, () => resolve());
    });
  }
}

function removeUninstallRegistration(scope: Scope): Promise<void> | void {
  if (!IS_WIN) return;
  execFile("reg", ["delete", arpKey(scope), "/f"], { windowsHide: true }, () => {});
}

function closeRunningApp(exeName: string): boolean {
  if (!IS_WIN) return false;
  // never taskkill ourselves (the uninstaller can run as NOBODY.exe
  // --nobody-uninstall — killing by that image name would suicide)
  if (path.basename(process.execPath).toLowerCase() === exeName.toLowerCase()) return false;
  try {
    execFileSync("taskkill", ["/F", "/IM", exeName, "/T"], {
      windowsHide: true,
      timeout: 15_000,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false; // nothing was running (taskkill exits non-zero)
  }
}

/** Launch-after-finish: a plain detached spawn. (MEMENTO dropped the
 *  admin token through explorer.exe; NOBODY installs run fine as the
 *  invoking user and the token dance is not needed here.) */
function launchInstalledApp(exe: string, cwd: string): void {
  try {
    const child = spawn(exe, [], { cwd, detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    /* best-effort — the user can start NOBODY from the shortcut */
  }
}

/** The install destination of the last successful run, else the probed
 *  install (marker in the default destinations), else null. */
function installedDir(): string | null {
  if (lastResult?.ok && lastResult.destDir) return lastResult.destDir;
  for (const dir of [defaultUserDir(), defaultAllDir()]) {
    if (fs.existsSync(path.join(dir, UNINSTALL_SENTINEL))) return dir;
  }
  return null;
}

function sendEvent(ev: SetupEvent): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(CHANNEL.event, ev);
  }
}

function installDeps(): InstallDeps {
  const meta = payloadMeta();
  return {
    isWin: IS_WIN,
    appVersion: meta.appVersion || app.getVersion(),
    payloadDir: installPayloadDir(),
    manifest: loadPayloadManifest(),
    desktopDir,
    startMenuDir,
    writeShortcut,
    writeUninstallRegistration,
    removeUninstallRegistration,
    closeRunningApp,
    onEvent: sendEvent,
    cancelled: () => cancelRequested,
    runtimeDir: () => path.dirname(process.execPath),
    runtimeFiles: runtimeFileEntries,
    runtimeExePath: () => process.execPath,
  };
}

/* ------------------------------------------------------------------ */
/* The window                                                          */
/* ------------------------------------------------------------------ */

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 640,
    minWidth: 900,
    minHeight: 620,
    useContentSize: true,
    center: true,
    frame: false, // the design draws its own title bar
    backgroundColor: "#09080B",
    title: "NOBODY Setup",
    show: false,
    autoHideMenuBar: true,
    icon: (() => {
      const candidates = [
        path.join(__dirname, "..", "..", "build", "icon.ico"),
        path.join(__dirname, "..", "..", "build", "icon.png"),
      ];
      for (const p of candidates) if (fs.existsSync(p)) return p;
      return undefined;
    })(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  mainWindow.on("page-title-updated", (e) => e.preventDefault());
  mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }
}

/* ------------------------------------------------------------------ */
/* IPC surface (the renderer's window.nobodySetup)                     */
/* ------------------------------------------------------------------ */

function registerIpc(): void {
  ipcMain.handle(CHANNEL.ctx, (): SetupContext => {
    const meta = payloadMeta();
    const manifest = loadPayloadManifest();
    const runtimeEntries = runtimeFileEntries();
    const runtimeBytes = runtimeEntries.reduce((a, b) => a + b.bytes, 0);
    let exeBytes = 0;
    try {
      exeBytes = fs.statSync(process.execPath).size;
    } catch {
      /* best-effort */
    }
    const dest = defaultUserDir();
    const probe = probeInstalledVersion();
    return {
      mode: detectUninstallLaunch() ? "uninstall" : "setup",
      version: meta.appVersion || app.getVersion(),
      spec: SPEC,
      // the meters must show the FULL installed footprint (payload +
      // the wizard's own runtime + the two exe links), not just the payload
      payloadBytes: (manifest?.totalBytes ?? 0) + runtimeBytes + exeBytes,
      payloadFiles: (manifest?.totalFiles ?? manifest?.files.length ?? 0) + runtimeEntries.length + 2,
      defaultUserDir: dest,
      defaultAllDir: defaultAllDir(),
      userDataDir: appDataDirOfApp(),
      freeBytes: freeDiskBytes(dest),
      upgrade: probe.upgrade,
      installedVersion: probe.installedVersion,
      devMode: !app.isPackaged,
    };
  });

  ipcMain.handle(CHANNEL.statPath, (_e, args: { path?: unknown }) => {
    const p = String(args?.path ?? "").trim();
    let exists = false;
    let isDir = false;
    if (p) {
      try {
        const st = fs.statSync(p);
        exists = true;
        isDir = st.isDirectory();
      } catch {
        /* absent — that is exactly what we report */
      }
    }
    return { exists, isDir, freeBytes: p ? freeDiskBytes(p) : null };
  });

  ipcMain.handle(CHANNEL.chooseDir, async (_e, args: { current?: unknown }) => {
    const w = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
    const res = await dialog.showOpenDialog(w as BrowserWindow, {
      title: "Choose where NOBODY is installed",
      defaultPath: String(args?.current || defaultUserDir()),
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  ipcMain.handle(
    CHANNEL.startInstall,
    async (_e, opts: InstallOptions): Promise<{ ok: boolean; error?: string }> => {
      if (installBusy) return { ok: false, error: "another operation is already running" };
      // runtime-reuse ONLY — anything else means the payload was not
      // synced (or was synced by the wrong script)
      if (payloadMeta().mode !== "runtime-reuse") {
        return {
          ok: false,
          error: "payload-meta.json does not declare mode runtime-reuse — run scripts/sync-payload.js first",
        };
      }
      installBusy = true;
      cancelRequested = false;
      try {
        // The install must read from the PRIVATE staged payload — the
        // temp extraction dir can be wiped by a second launch at ANY moment.
        if (staging?.promise) {
          try {
            await staging.promise;
          } catch {
            /* fall back to the live payload below */
          }
        }
        const normalized: InstallOptions = {
          destDir: String(opts?.destDir ?? "").trim(),
          scope: opts?.scope === "all" ? "all" : "me",
          desktop: !!opts?.desktop,
          launchAfter: !!opts?.launchAfter,
          openFolder: !!opts?.openFolder,
        };
        const result = await runInstall(normalized, installDeps());
        lastResult = result;
        if (result.ok) {
          if (normalized.launchAfter) {
            launchInstalledApp(path.join(result.destDir, EXE_NAME), result.destDir);
          }
          if (normalized.openFolder) {
            void shell.openPath(result.destDir);
          }
        }
        return { ok: result.ok, error: result.error };
      } catch (e: any) {
        return { ok: false, error: String(e?.message || e) };
      } finally {
        installBusy = false;
      }
    }
  );

  ipcMain.handle(CHANNEL.cancelInstall, () => {
    cancelRequested = true;
    return true;
  });

  ipcMain.handle(
    CHANNEL.startUninstall,
    async (_e, opts: UninstallOptions): Promise<{ ok: boolean; error?: string }> => {
      if (installBusy) return { ok: false, error: "another operation is already running" };
      installBusy = true;
      cancelRequested = false;
      try {
        const launch = detectUninstallLaunch();
        const target = resolveUninstallTarget(launch);
        if (!target) {
          return {
            ok: false,
            error: `no NOBODY install marker (${UNINSTALL_SENTINEL}) found — this exe is not a registered uninstaller`,
          };
        }
        const plan = buildUninstallPlan({
          installDir: target.installDir,
          scope: target.scope,
          version: target.version,
          keepData: !!opts?.keepData,
          isWin: IS_WIN,
          desktopDir: desktopDir(),
          startMenuDir: startMenuDir(),
          userDataDir: appDataDirOfApp(),
          runningImage: uninstallerRunningImage(),
        });
        const result = await runUninstall(plan, {
          isWin: IS_WIN,
          onEvent: sendEvent,
          cancelled: () => cancelRequested,
          closeRunningApp,
          removeUninstallRegistration,
        });
        // the wizard has served its purpose — leave the stage (the final
        // stage's detached self-delete needs this process gone anyway)
        if (result.ok) setTimeout(() => app.quit(), 1500);
        return { ok: result.ok, error: result.error };
      } catch (e: any) {
        return { ok: false, error: String(e?.message || e) };
      } finally {
        installBusy = false;
      }
    }
  );

  ipcMain.handle(CHANNEL.launchApp, (): boolean => {
    const dir = installedDir();
    if (!dir) return false;
    const exe = path.join(dir, EXE_NAME);
    if (!fs.existsSync(exe)) return false;
    launchInstalledApp(exe, dir);
    return true;
  });

  ipcMain.handle(CHANNEL.openFolder, async (): Promise<boolean> => {
    const dir = installedDir() ?? defaultUserDir();
    try {
      return (await shell.openPath(dir)) === "";
    } catch {
      return false;
    }
  });

  ipcMain.handle(CHANNEL.minimize, () => {
    mainWindow?.minimize();
  });

  ipcMain.handle(CHANNEL.close, () => {
    // the renderer owns any confirm UX; if work is in flight, cancel it —
    // the cooperative flag makes installerCore roll back cleanly
    if (installBusy) cancelRequested = true;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
  });
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    // a second launch (even with uninstall args) just focuses the wizard
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    startPayloadStaging();
  });
  app.on("window-all-closed", () => {
    const finish = () => {
      disposeStaging();
      app.quit();
    };
    // If an operation is unwinding (close during install → cooperative
    // cancel → rollback), let it finish before quitting.
    if (!installBusy) {
      finish();
      return;
    }
    const iv = setInterval(() => {
      if (!installBusy) {
        clearInterval(iv);
        finish();
      }
    }, 100);
    const safety = setTimeout(() => {
      clearInterval(iv);
      finish();
    }, 15_000);
    safety.unref();
  });
  app.on("will-quit", disposeStaging);
}
