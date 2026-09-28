/**
 * NOBODY Setup — the REAL installation engine (MEMENTO lineage, adapted).
 *
 * ELECTRON-FREE (node builtins only): every platform touchpoint is an
 * injected dependency (shortcuts, registry, process management), so gate
 * scripts can drive the FULL pipeline against a fixture payload on any
 * OS. electron/main.ts supplies the Windows implementations:
 *
 *   shortcuts    -> shell.writeShortcutLink (NOBODY.lnk, Uninstall NOBODY.lnk)
 *   registry     -> HKLM|HKCU\...\Uninstall\NOBODY via reg.exe (scope-aware;
 *                   the portable wizard runs elevated, so "all" can write
 *                   HKLM for real and "me" stays HKCU)
 *   running app  -> taskkill /IM NOBODY.exe (graceless — upgrade path)
 *
 * MODE — runtime-reuse ONLY (payload-meta.json mode "runtime-reuse"):
 * the payload carries NOBODY's app code (resources/app.asar + icon), and
 * the destination reuses the WIZARD'S OWN Electron 41.7.1 runtime: every
 * file next to the running setup exe (minus the wizard's app.asar /
 * payload / icons / metadata / sentinel / exe names — see main.ts
 * runtimeFileEntries) plus locales\* and resources\elevate.exe. The
 * running setup exe is HARDLINKED (fs.link) as NOBODY.exe and as
 * "Uninstall NOBODY.exe" (plain copy fallback when the destination sits
 * on another volume): zero bytes of the running image are re-written.
 *
 * PROGRESS — the design's simulated engine rendered a 6-phase meter
 * (shared/contract.ts ProgressEvent.phase 0..5); the real pipeline feeds
 * byte-exact values into the identical interface:
 *   phase 0 preparing    validate / close app / stage-aside backup
 *   phase 1..3 copy      ONE unified queue (runtime + payload) sorted by
 *                        class so the narrative is monotonic:
 *                          exe/dll/pak/dat/bin/asar -> 1 (extracting core)
 *                          .woff2/.ttf              -> 2 (writing fonts)
 *                          ffmpeg/d3dcompiler/...   -> 3 (installing codecs)
 *   phase 4 shortcuts    Start Menu \NOBODY\ + optional desktop .lnk
 *   phase 5 registry     Add/Remove Programs registration
 *
 * VERIFY + HEAL (MEMENTO 2.0.4 hard gate): payload-manifest.json ships a
 * sha256 per payload file; after the copy EVERY manifest entry is hashed
 * at the destination (plus NOBODY.exe presence/size). A mismatch is
 * healed by one re-copy from the payload; a SECOND mismatch FAILS the
 * install with code E-VERIFY and rolls back — no broken "100% success".
 *
 * ROLLBACK: an existing NOBODY install (its .nobody-uninstall.json
 * sentinel) is renamed aside to <dest>.bak-<ts> and restored on ANY
 * failure; a failed FRESH destination is removed again (leave no trace);
 * a failed in-place install into a foreign folder removes only the files
 * this run wrote. userData (%APPDATA%\NOBODY) is NEVER touched.
 *
 * UNINSTALL (the setup exe doubles as the uninstaller): kill NOBODY.exe
 * -> shortcuts -> registry -> files (bytes-based progress; the running
 * image is spared) -> user data (only on consent) or skip-data -> final
 * detached self-delete (cmd /c ping … & del … & rmdir …). Stage keys
 * "shortcuts" | "registry" | "files" | "user data" | "skip-data" |
 * "final" go to the renderer as { type: "stage" } events; progress is
 * bytes-based for "files" and deterministic 0->1 interpolation elsewhere
 * so the bar never stalls and never regresses.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import type { InstallOptions, ProgressEvent, SetupEvent } from "../shared/contract";

/* ------------------------------------------------------------------ */
/* Electron's asar fs interception — the installer MUST bypass it       */
/* ------------------------------------------------------------------ */
/* Electron patches Node's fs so every path that contains ".asar" is
 * handled as an ARCHIVE (read/write happen inside the archive). The
 * installer copies the payload's resources/app.asar as a PLAIN FILE and
 * deletes the installed app's asar on uninstall — both would fail with
 * "Invalid package" (or silently skip) without the standard escape
 * hatch: process.noAsar = true. All payload/dest fs work therefore runs
 * wrapped in withNoAsar. */
type NoAsarProcess = NodeJS.Process & { noAsar?: boolean };

function withNoAsarSync<T>(fn: () => T): T {
  const p = process as NoAsarProcess;
  const prev = p.noAsar;
  p.noAsar = true;
  try {
    return fn();
  } finally {
    p.noAsar = prev ?? false;
  }
}

function withNoAsarAsync<T>(fn: () => Promise<T>): Promise<T> {
  const p = process as NoAsarProcess;
  const prev = p.noAsar;
  p.noAsar = true;
  return fn().finally(() => {
    p.noAsar = prev ?? false;
  });
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Scope = InstallOptions["scope"]; // "all" | "me"

export interface PayloadFile {
  rel: string;
  bytes: number;
  sha256: string;
}

export interface PayloadManifest {
  files: PayloadFile[];
  totalBytes: number;
  totalFiles: number;
}

export interface RuntimeFileEntry {
  rel: string;
  bytes: number;
}

export interface UninstallInfo {
  DisplayName: string;
  DisplayVersion: string;
  Publisher: string;
  InstallLocation: string;
  DisplayIcon: string;
  UninstallString: string;
  QuietUninstallString: string;
  NoModify: number;
  NoRepair: number;
  EstimatedSizeKB: number;
  scope: Scope;
}

export interface InstallDeps {
  isWin: boolean;
  appVersion: string;
  payloadDir: string;
  /** The sha256 contract from payload-manifest.json (sync-payload.js).
   *  When null, installerCore computes a live manifest instead. */
  manifest: PayloadManifest | null;
  desktopDir: () => string;
  startMenuDir: () => string;
  writeShortcut: (
    lnkPath: string,
    exePath: string,
    args: string | null,
    description: string,
    /** icon source — defaults to the target exe (iconIndex 0) */
    iconPath?: string
  ) => "created" | "skipped" | "failed";
  writeUninstallRegistration: (info: UninstallInfo) => Promise<void> | void;
  removeUninstallRegistration: (scope: Scope) => Promise<void> | void;
  closeRunningApp: (exeName: string) => boolean;
  onEvent: (ev: SetupEvent) => void;
  cancelled: () => boolean;
  /** runtime-reuse (the ONLY mode): the wizard's own Electron runtime. */
  runtimeDir: () => string;
  runtimeFiles: () => RuntimeFileEntry[];
  runtimeExePath: () => string;
}

export interface InstallResult {
  ok: boolean;
  destDir: string;
  cancelled: boolean;
  shortcuts: string[];
  error?: string;
}

export interface UninstallDeps {
  isWin: boolean;
  onEvent: (ev: SetupEvent) => void;
  cancelled: () => boolean;
  closeRunningApp: (exeName: string) => boolean;
  removeUninstallRegistration: (scope: Scope) => Promise<void> | void;
}

export interface UninstallResult {
  ok: boolean;
  cancelled: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* Naming contract (NOBODY)                                            */
/* ------------------------------------------------------------------ */

export const NOBODY_EXE = "NOBODY.exe";
export const UNINSTALL_EXE = "Uninstall NOBODY.exe";
export const UNINSTALL_LNK = "Uninstall NOBODY.lnk";
/** The ownership sentinel — its presence marks a destination as OURS
 *  (eligible for the stage-aside upgrade path) and tells the uninstaller
 *  where/what it removed. */
export const UNINSTALL_SENTINEL = ".nobody-uninstall.json";
/** The payload files the installed app CANNOT run without. */
export const CRITICAL_PAYLOAD_FILES = ["resources/app.asar"];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function nowStamp(d = new Date()): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function sha256File(p: string): string {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function isInsideDir(parent: string, child: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

const IGNORED = new Set(["payload-meta.json", "payload-manifest.json", ".DS_Store"]);

function emit(deps: { onEvent: (ev: SetupEvent) => void }, message: string): void {
  deps.onEvent({ type: "log", message });
}

/* ------------------------------------------------------------------ */
/* Progress meter — byte-exact, phase-classified, never regressing     */
/* ------------------------------------------------------------------ */

interface InstallMeter {
  total: number;
  bytes: number;
  fileIndex: number;
  emit: (frac: number, phase: number, file: string, done?: boolean) => void;
}

function makeMeter(deps: InstallDeps): InstallMeter {
  const t0 = Date.now();
  const m = {
    total: 0,
    bytes: 0,
    fileIndex: 0,
    frac: 0,
    phase: 0,
  };
  const emitNow = (frac: number, phase: number, file: string, done = false) => {
    const f = done ? 1 : clamp01(frac);
    m.frac = Math.max(m.frac, f);
    m.phase = phase;
    const elapsedMs = Math.max(1, Date.now() - t0);
    const ev: ProgressEvent = {
      type: "progress",
      frac: m.frac,
      bytes: done ? m.total : m.bytes,
      total: m.total,
      file,
      fileIndex: m.fileIndex,
      phase: m.phase,
      rate: m.bytes / (elapsedMs / 1000),
      elapsedMs,
      running: !done,
      done,
    };
    deps.onEvent(ev);
  };
  return { total: m.total, bytes: m.bytes, fileIndex: m.fileIndex, emit: emitNow } as InstallMeter;
}

/* ------------------------------------------------------------------ */
/* validate / disk space / manifest                                    */
/* ------------------------------------------------------------------ */

/** Windows-absolute-path validator — same shape rules as the wizard's
 *  inline validation, enforced main-side too (defense in depth). */
export function validateDestPath(p: string, isWin: boolean): { ok: boolean; reason?: string } {
  const v = String(p || "").trim();
  if (!v) return { ok: false, reason: "empty" };
  if (isWin) {
    if (!/^[A-Za-z]:\\/.test(v)) return { ok: false, reason: "not-absolute" };
    const tail = v.slice(3);
    if (!tail) return { ok: false, reason: "no-tail" };
    if (/[<>:"|?*]/.test(tail)) return { ok: false, reason: "bad-chars" };
    if (/[\s.]$/.test(v)) return { ok: false, reason: "bad-ending" };
    if (tail.toUpperCase() === "WINDOWS") return { ok: false, reason: "reserved" };
    return { ok: true };
  }
  if (!v.startsWith("/")) return { ok: false, reason: "not-absolute" };
  return { ok: true };
}

/** Free bytes on the volume that hosts `p` (fs.statfs — no wmic dance). */
export function freeDiskBytes(p: string): number | null {
  try {
    const probe = path.parse(path.resolve(p)).root || path.resolve(p);
    const st = (fs as any).statfsSync(probe);
    if (st && typeof st.bsize === "number" && typeof st.bavail === "number") {
      return st.bsize * st.bavail;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Walk a payload tree and hash EVERY file — the fallback manifest when
 *  payload-manifest.json is missing (dev runs before sync-payload). */
export function computeManifest(payloadDir: string, maxFiles = 200_000): PayloadManifest {
  return withNoAsarSync(() => computeManifestImpl(payloadDir, maxFiles));
}

function computeManifestImpl(payloadDir: string, maxFiles = 200_000): PayloadManifest {
  const files: PayloadFile[] = [];
  const walk = (dir: string) => {
    if (files.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        if (IGNORED.has(e.name)) continue;
        let bytes = 0;
        let sha = "";
        try {
          bytes = fs.statSync(p).size;
          sha = sha256File(p);
        } catch {
          continue;
        }
        files.push({
          rel: path.relative(payloadDir, p).split(path.sep).join("/"),
          bytes,
          sha256: sha,
        });
      }
    }
  };
  walk(payloadDir);
  return {
    files,
    totalBytes: files.reduce((a, b) => a + b.bytes, 0),
    totalFiles: files.length,
  };
}

/* ------------------------------------------------------------------ */
/* VERIFY + HEAL (the hard gate)                                       */
/* ------------------------------------------------------------------ */

export interface VerifyEntry {
  rel: string;
  src: string;
  bytes: number;
  /** when set, the destination file must hash to exactly this */
  sha256?: string;
  critical: boolean;
}

export interface VerifyResult {
  verified: number;
  total: number;
  healed: number;
  failed: VerifyEntry[];
}

function entryOk(destDir: string, e: VerifyEntry): boolean {
  const p = path.join(destDir, ...e.rel.split("/"));
  try {
    const st = fs.statSync(p);
    if (st.size !== e.bytes) return false;
    if (e.sha256) return sha256File(p) === e.sha256;
    return true;
  } catch {
    return false;
  }
}

/** Ground truth of what REALLY landed at the destination, with one heal
 *  round. Antivirus engines routinely hold a freshly-written file open
 *  (or hide it) for a few seconds while scanning. Mismatched/missing
 *  entries are re-copied from their source once; whatever still fails
 *  the sha256/size check afterwards is returned honestly — runInstall
 *  treats ANY survivor as fatal (NOBODY has no Update Center to heal
 *  itself later, unlike MEMENTO's proxy cores). */
export async function verifyAndHealInstall(
  destDir: string,
  entries: VerifyEntry[],
  deps: Pick<InstallDeps, "cancelled" | "onEvent">,
  rounds = 1
): Promise<VerifyResult> {
  let failed = entries.filter((e) => !entryOk(destDir, e));
  let healed = 0;
  for (let round = 1; round <= rounds && failed.length > 0; round++) {
    await sleepMs(400 * round);
    for (const e of failed) {
      if (deps.cancelled()) break;
      const dst = path.join(destDir, ...e.rel.split("/"));
      try {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.copyFileSync(e.src, dst);
        try {
          fs.chmodSync(dst, 0o755);
        } catch {
          /* best-effort */
        }
        if (entryOk(destDir, e)) healed++;
      } catch {
        /* stays failed — reported honestly */
      }
    }
    failed = entries.filter((e) => !entryOk(destDir, e));
  }
  return {
    verified: entries.length - failed.length,
    total: entries.length,
    healed,
    failed,
  };
}

/* ------------------------------------------------------------------ */
/* The copy queue (runtime + payload in ONE byte meter)                */
/* ------------------------------------------------------------------ */

interface CopyEntry {
  rel: string;
  src: string;
  bytes: number;
  phase: number;
  /** hardlink the running image instead of a byte copy (exe, uninstaller) */
  link?: boolean;
}

/** Design phase class of a file (contract phases 1..3): codec-named
 *  dlls install LAST (phase 3), fonts (phase 2), everything else —
 *  exe/dll/pak/dat/bin/asar — is core (phase 1). */
export function phaseOfClass(rel: string): number {
  const name = rel.split(/[\\/]/).pop() ?? rel;
  const lower = name.toLowerCase();
  if (/^(ffmpeg|d3dcompiler|swresample|avcodec|avformat|avutil|swscale)/.test(lower)) return 3;
  if (lower.endsWith(".woff2") || lower.endsWith(".ttf")) return 2;
  return 1;
}

/** The copy span of the global meter: 2% -> 86% is the unified
 *  runtime+payload transfer; shortcuts take 90->94, registry 95->99. */
const COPY_SPAN_START = 0.02;
const COPY_SPAN_END = 0.86;

/** Port of MEMENTO's copyTreeWithProgress, restructured for
 *  runtime-reuse: the inventory is KNOWN (runtime entries + the payload
 *  manifest), so the tree-walk became one flat, phase-sorted queue with
 *  the same proven semantics — per-file tolerance with honest skip
 *  lines, cancel checks between every file, byte-exact throttled
 *  progress. */
function copyEntriesWithProgress(
  destDir: string,
  queue: CopyEntry[],
  exeName: string,
  uninstName: string,
  deps: InstallDeps,
  meter: InstallMeter
): { copied: number; skipped: number; cancelled: boolean } {
  let copied = 0;
  let skipped = 0;
  let nextEmitAt = 0;
  for (let i = 0; i < queue.length; i++) {
    if (deps.cancelled()) return { copied, skipped, cancelled: true };
    const entry = queue[i];
    const dst = path.join(destDir, ...entry.rel.split(/[\\/]/));
    try {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
    } catch (e: any) {
      skipped++;
      emit(deps, `skipped ${entry.rel} (cannot create folder: ${String(e?.code || e)})`);
      continue;
    }
    let linked = false;
    if (entry.link) {
      // 2.0.3 AV-hardening, ported: hardlink the running image instead of
      // copying it — a process byte-copying ITS OWN exe is one of the
      // strongest dropper heuristics there is; a hardlink writes ZERO new
      // file content. The plain copy survives as the cross-volume fallback.
      try {
        fs.linkSync(entry.src, dst);
        linked = true;
      } catch {
        try {
          fs.copyFileSync(entry.src, dst);
          try {
            fs.chmodSync(dst, 0o755);
          } catch {
            /* best-effort */
          }
        } catch (err: any) {
          skipped++;
          emit(deps, `skipped ${entry.rel} (${String(err?.code || err)})`);
          continue;
        }
      }
    } else {
      try {
        fs.copyFileSync(entry.src, dst);
        try {
          fs.chmodSync(dst, 0o755);
        } catch {
          /* best-effort */
        }
      } catch (err: any) {
        skipped++;
        emit(deps, `skipped ${entry.rel} (${String(err?.code || err)})`);
        continue;
      }
    }
    copied++;
    meter.bytes += entry.bytes;
    meter.fileIndex = i + 1;
    if (entry.rel === exeName) {
      emit(
        deps,
        linked
          ? "runtime exe → " + exeName + " (linked — zero bytes of the running image re-written)"
          : "runtime exe → " + exeName + " (copied — different volume, hardlink impossible)"
      );
    } else if (entry.rel === uninstName) {
      emit(deps, "uninstaller staged → " + uninstName + " (the setup exe doubles as the uninstaller)");
    }
    if (meter.bytes >= nextEmitAt || i === queue.length - 1) {
      nextEmitAt = meter.bytes + Math.max(256 * 1024, meter.total / 200);
      meter.emit(
        COPY_SPAN_START + clamp01(meter.bytes / Math.max(1, meter.total)) * (COPY_SPAN_END - COPY_SPAN_START),
        entry.phase,
        path.basename(entry.rel)
      );
    }
  }
  return { copied, skipped, cancelled: false };
}

/* ------------------------------------------------------------------ */
/* The install pipeline                                                */
/* ------------------------------------------------------------------ */

export function runInstall(opts: InstallOptions, deps: InstallDeps): Promise<InstallResult> {
  return withNoAsarAsync(() => runInstallImpl(opts, deps));
}

async function runInstallImpl(
  opts: InstallOptions,
  deps: InstallDeps
): Promise<InstallResult> {
  const destDir = String(opts.destDir || "").trim();
  const scope: Scope = opts.scope === "all" ? "all" : "me";
  const shortcuts: string[] = [];
  const exeName = deps.isWin ? NOBODY_EXE : "NOBODY";
  const uninstName = deps.isWin ? UNINSTALL_EXE : "Uninstall NOBODY";
  let backupDir: string | null = null;

  const meter = makeMeter(deps);
  const fail = (msg: string, code?: string): InstallResult => {
    emit(deps, msg);
    deps.onEvent({ type: "error", message: msg, code });
    return { ok: false, destDir, cancelled: false, shortcuts, error: msg };
  };

  emit(deps, "initializing installer context");
  meter.emit(0.004, 0, "");

  /* 1 — validate the destination (same rules as the wizard input) */
  const validity = validateDestPath(destDir, deps.isWin);
  if (!validity.ok) {
    return fail(`invalid destination (${validity.reason}): ${destDir}`);
  }

  /* runtime-reuse ONLY — the destination reuses the installer's own
   * Electron runtime; resolve the inventory up-front so space checks and
   * meters see the truth. */
  const runtimeEntries = deps.runtimeFiles();
  if (runtimeEntries.length === 0) {
    return fail(
      "runtime-reuse mode is active but no runtime files were resolved — the installer runtime inventory is empty"
    );
  }

  const manifest =
    deps.manifest && deps.manifest.files.length > 0 ? deps.manifest : computeManifest(deps.payloadDir);
  if (manifest.files.length === 0) {
    return fail(
      "payload is missing — the installer package is broken (no files to install). " +
        "Your antivirus most likely removed the installer files, or the setup exe was launched twice. " +
        "Run this setup alone (or add an antivirus exclusion) and try again."
    );
  }
  // CONTRACT GATE — BEFORE the copy: the runtime-reuse payload MUST
  // contain the app code. If an antivirus quarantined resources/app.asar
  // before the install even started, a manifest-driven check alone would
  // never notice, so the contract itself is enforced first, with the
  // exact file named.
  const missingCritical = CRITICAL_PAYLOAD_FILES.filter(
    (rel) => !manifest.files.some((f) => f.rel === rel)
  );
  if (missingCritical.length > 0) {
    return fail(
      "the app code (" +
        missingCritical.join(", ") +
        ") is missing from the installer payload — your antivirus most likely removed it. " +
        "Open Windows Security → Protection history, allow/restore the removed file, then re-run this setup. " +
        "Nothing was installed."
    );
  }

  let exeBytes = 0;
  try {
    exeBytes = fs.statSync(deps.runtimeExePath()).size;
  } catch {
    /* best-effort — the space check still covers the rest */
  }
  const runtimeTotalBytes = runtimeEntries.reduce((a, b) => a + b.bytes, 0);
  const totalNeeded = exeBytes + runtimeTotalBytes + manifest.totalBytes;
  meter.total = totalNeeded;

  const free = freeDiskBytes(destDir);
  if (free !== null && free < totalNeeded + 64 * 1024 * 1024) {
    return fail(
      `not enough disk space: ${(totalNeeded / 1024 ** 2).toFixed(0)} MB needed, ${(free / 1024 ** 3).toFixed(1)} GB free`
    );
  }
  emit(
    deps,
    `destination ${destDir} · ${manifest.files.length + runtimeEntries.length + 2} files · ${(totalNeeded / 1024 ** 2).toFixed(1)} MB · free ${
      free === null ? "n/a" : (free / 1024 ** 3).toFixed(1) + " GB"
    } · runtime-reuse`
  );

  /* 2 — a running NOBODY would hold file locks; close it (graceless) */
  if (deps.closeRunningApp(deps.isWin ? "NOBODY.exe" : "NOBODY")) {
    emit(deps, "closed a running NOBODY instance");
  }

  /* 3 — stage a clean destination (MEMENTO 2.0.7 rules): ONLY a previous
   * NOBODY install — detected by its sentinel — is renamed aside for
   * rollback. A pre-existing folder that is NOT ours is installed INTO
   * in place: nothing of theirs is renamed, moved, or deleted. */
  let inPlace = false;
  if (fs.existsSync(destDir)) {
    if (fs.existsSync(path.join(destDir, UNINSTALL_SENTINEL))) {
      backupDir = destDir + ".bak-" + Date.now();
      try {
        fs.renameSync(destDir, backupDir);
        emit(deps, "staged the previous installation for replacement");
        meter.emit(0.012, 0, "");
      } catch (e: any) {
        return fail(
          "cannot stage the previous NOBODY installation (" +
            String(e?.message || e) +
            "). Close NOBODY and any Explorer window showing this folder — an antivirus scan can also lock it — then retry, or pick a different destination."
        );
      }
    } else {
      inPlace = true;
      emit(
        deps,
        "destination exists and is not a NOBODY install — installing into it in place (no existing files are renamed, moved or removed)"
      );
    }
  }

  // whether THIS run created the destination from scratch — a failed
  // fresh install is removed again (leave no trace)
  const createdDest = !backupDir && !inPlace;

  // a failed IN-PLACE install removes ONLY the files this run wrote —
  // never the foreign folder's own content
  const cleanupInPlaceFiles = () => {
    const rels = new Set<string>();
    for (const f of manifest.files) rels.add(f.rel);
    for (const r of runtimeEntries) rels.add(r.rel);
    rels.add(exeName);
    rels.add(uninstName);
    rels.add(UNINSTALL_SENTINEL);
    for (const rel of rels) {
      try {
        fs.rmSync(path.join(destDir, ...rel.split(/[\\/]/)), { force: true });
      } catch {
        /* best-effort */
      }
    }
    // our now-empty directories, deepest first — rmdir refuses non-empty
    // dirs, so foreign content is structurally safe; root is never touched
    const dirs = new Set<string>();
    for (const rel of rels) {
      const d = path.dirname(rel);
      if (d && d !== "." && d !== "/") dirs.add(d);
    }
    for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
      try {
        const p = path.join(destDir, ...d.split(/[\\/]/));
        if (fs.existsSync(p) && fs.readdirSync(p).length === 0) fs.rmdirSync(p);
      } catch {
        /* best-effort */
      }
    }
  };

  const restoreBackup = () => {
    try {
      if (backupDir) {
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
        fs.renameSync(backupDir, destDir);
        backupDir = null;
      } else if (createdDest) {
        // LEAVE-NO-TRACE: a FRESH install that failed must leave the
        // machine exactly as it found it.
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true });
      } else if (inPlace) {
        cleanupInPlaceFiles();
      }
    } catch {
      /* best-effort */
    }
  };

  const onCancel = (): InstallResult => {
    emit(deps, "installation cancelled by user");
    restoreBackup();
    return { ok: false, destDir, cancelled: true, shortcuts, error: "cancelled" };
  };

  try {
    /* 4 — the unified copy queue: the wizard's runtime (exe hardlink +
     * dlls/paks/locales/elevate) + the payload (app code + icon), sorted
     * by design phase so the labels run core → fonts → codecs. */
    const runtimeDir = deps.runtimeDir();
    const exeSrc = deps.runtimeExePath();
    const queue: CopyEntry[] = [
      { rel: exeName, src: exeSrc, bytes: exeBytes, phase: 1, link: true },
    ];
    for (const r of runtimeEntries) {
      queue.push({
        rel: r.rel,
        src: path.join(runtimeDir, ...r.rel.split(/[\\/]/)),
        bytes: r.bytes,
        phase: phaseOfClass(r.rel),
      });
    }
    for (const f of manifest.files) {
      queue.push({
        rel: f.rel,
        src: path.join(deps.payloadDir, ...f.rel.split("/")),
        bytes: f.bytes,
        phase: phaseOfClass(f.rel),
      });
    }
    queue.sort((a, b) => a.phase - b.phase); // stable — preserves inventory order within a phase

    emit(
      deps,
      `reusing the installer runtime (${runtimeEntries.length} runtime files · ${(runtimeTotalBytes / 1024 ** 2).toFixed(1)} MB) — cloning the wizard's own Electron`
    );
    meter.emit(COPY_SPAN_START, 1, path.basename(exeSrc));

    const copyRes = copyEntriesWithProgress(destDir, queue, exeName, uninstName, deps, meter);
    if (copyRes.cancelled) return onCancel();
    if (copyRes.skipped > 0) {
      emit(deps, `${copyRes.skipped} file(s) could not be copied (locked or removed mid-copy) — verification will decide`);
    }
    emit(deps, "electron runtime cloned → " + exeName);
    emit(deps, "NOBODY app code written (resources/app.asar)");
    meter.emit(COPY_SPAN_END, 1, "");

    /* 5 — VERIFY + HEAL: ground truth of what REALLY landed. The entries
     * are the sha256 manifest PLUS the runtime files (size) PLUS both exe
     * links (presence/size, critical). One heal round rescues transient
     * antivirus locks; a second mismatch fails the whole install. */
    const verifyEntries: VerifyEntry[] = [];
    for (const f of manifest.files) {
      verifyEntries.push({
        rel: f.rel,
        src: path.join(deps.payloadDir, ...f.rel.split("/")),
        bytes: f.bytes,
        sha256: f.sha256 || undefined,
        critical: CRITICAL_PAYLOAD_FILES.includes(f.rel),
      });
    }
    for (const r of runtimeEntries) {
      verifyEntries.push({
        rel: r.rel,
        src: path.join(runtimeDir, ...r.rel.split(/[\\/]/)),
        bytes: r.bytes,
        critical: false,
      });
    }
    verifyEntries.push({ rel: exeName, src: exeSrc, bytes: exeBytes, critical: true });

    const verification = await verifyAndHealInstall(destDir, verifyEntries, deps);
    if (verification.healed > 0) {
      emit(deps, `${verification.healed} file(s) recovered on re-check (transient antivirus lock)`);
    }
    if (deps.cancelled()) return onCancel();
    if (verification.failed.length > 0) {
      const names = verification.failed.map((e) => e.rel).join(", ");
      emit(deps, `installation aborted: ${names} failed verification — rolling back`);
      restoreBackup();
      const msg =
        "these required files failed sha256 verification after one heal attempt: " +
        names +
        ". Your antivirus most likely removed them — open Windows Security → Protection history, allow/restore the removed file (or exclude the install folder), then re-run this setup. Nothing was left half-installed.";
      deps.onEvent({ type: "error", message: msg, code: "E-VERIFY" });
      return { ok: false, destDir, cancelled: false, shortcuts, error: msg };
    }
    emit(
      deps,
      `verified ${verification.verified}/${verification.total} installed files against the payload manifest (sha256)`
    );
    meter.emit(0.9, 1, "");

    /* 6 — shortcuts (phase 4): Start Menu group + optional desktop */
    emit(deps, "linking start menu entries");
    const smDir = deps.startMenuDir();
    const smGroup = path.join(smDir, "NOBODY");
    try {
      fs.mkdirSync(smGroup, { recursive: true });
    } catch {
      /* best-effort */
    }
    const exePath = path.join(destDir, exeName);
    const uninstPath = path.join(destDir, uninstName);
    const linkJobs: Array<[string, string, string, string | null, string]> = [
      [smGroup, deps.isWin ? "NOBODY.lnk" : "nobody.desktop", exePath, null, "NOBODY — premium desktop audio player"],
      // MEMENTO contract: the INSTALLED APP is the uninstaller
      [smGroup, deps.isWin ? UNINSTALL_LNK : "nobody-uninstall.desktop", exePath, "--nobody-uninstall", "Uninstall NOBODY"],
    ];
    if (opts.desktop) {
      linkJobs.push([
        deps.desktopDir(),
        deps.isWin ? "NOBODY.lnk" : "nobody.desktop",
        exePath,
        null,
        "NOBODY — premium desktop audio player",
      ]);
    }
    for (let i = 0; i < linkJobs.length; i++) {
      if (deps.cancelled()) return onCancel();
      const [baseDir, fileName, target, args, description] = linkJobs[i];
      const lnkPath = path.join(baseDir, fileName);
      // every shortcut icon = dest\NOBODY.exe,0
      const r = deps.writeShortcut(lnkPath, target, args, description, exePath);
      if (r === "created") {
        shortcuts.push(
          fileName === "NOBODY.lnk" && baseDir === deps.desktopDir()
            ? "desktop"
            : fileName === UNINSTALL_LNK
              ? "start-menu-uninstall"
              : "start-menu"
        );
      }
      meter.emit(0.9 + ((i + 1) / linkJobs.length) * 0.04, 4, fileName);
    }
    emit(deps, `shortcuts written (${[...new Set(shortcuts)].join(" + ") || "none"})`);

    /* 7 — uninstall registration (Add/Remove Programs, scope-aware) */
    emit(deps, "writing uninstaller registration (Add/Remove Programs)");
    meter.emit(0.95, 5, "");
    const info: UninstallInfo = {
      DisplayName: "NOBODY",
      DisplayVersion: deps.appVersion,
      Publisher: "EPODONIOS",
      InstallLocation: destDir,
      DisplayIcon: exePath,
      UninstallString: `"${exePath}" --nobody-uninstall`,
      QuietUninstallString: `"${exePath}" --nobody-uninstall /quiet`,
      NoModify: 1,
      NoRepair: 1,
      EstimatedSizeKB: Math.max(1, Math.round(totalNeeded / 1024)),
      scope,
    };
    await deps.writeUninstallRegistration(info);
    meter.emit(0.99, 5, "");

    /* 8 — success: uninstall marker + drop the staged backup */
    try {
      fs.writeFileSync(
        path.join(destDir, UNINSTALL_SENTINEL),
        JSON.stringify(
          {
            installDir: destDir,
            scope,
            version: deps.appVersion,
            // MEMENTO 2.0.7/3.1.8 in-place ownership: when the install
            // lives INSIDE a foreign folder the sentinel records the exact
            // file list, so the uninstaller removes ONLY our files.
            ...(inPlace
              ? {
                  inPlace: true,
                  files: [
                    ...manifest.files.map((f) => f.rel),
                    ...runtimeEntries.map((r) => r.rel),
                    exeName,
                    UNINSTALL_SENTINEL,
                  ],
                }
              : {}),
          },
          null,
          2
        ),
        "utf8"
      );
      emit(deps, "uninstall marker written (" + UNINSTALL_SENTINEL + ")");
    } catch {
      /* best-effort — the uninstaller also probes the registry */
    }
    if (backupDir) {
      try {
        fs.rmSync(backupDir, { recursive: true, force: true });
      } catch {
        /* best-effort — a stale .bak never blocks the install */
      }
      backupDir = null;
      emit(deps, "removed the staged backup of the previous installation");
    }
    emit(deps, "installation complete");
    meter.emit(1, 5, "", true);
    deps.onEvent({ type: "done", ok: true, message: destDir });
    return { ok: true, destDir, cancelled: false, shortcuts };
  } catch (e: any) {
    const msg = String(e?.message || e);
    emit(deps, `installation failed: ${msg}`);
    restoreBackup();
    deps.onEvent({ type: "error", message: msg, code: "E-INSTALL" });
    return { ok: false, destDir, cancelled: false, shortcuts, error: msg };
  }
}

/* ------------------------------------------------------------------ */
/* Uninstall plan (pure — consumed by runUninstall)                    */
/* ------------------------------------------------------------------ */

export interface UninstallPlan {
  installDir: string;
  scope: Scope;
  version: string;
  keepData: boolean;
  startMenuGroup: string;
  appShortcut: string;
  uninstallShortcut: string;
  desktopShortcut: string;
  registryKey: string | null;
  userDataDir: string;
  removedUserData: string | null;
  preserved: string[];
  /** the RUNNING image when it physically sits inside installDir — the
   *  files stage cannot delete it; the final detached self-delete does. */
  protectedExe: string | null;
}

/** The full removal plan for an installed NOBODY. userData (%APPDATA%\NOBODY)
 *  only enters the plan when the user consents (keepData false). */
export function buildUninstallPlan(args: {
  installDir: string;
  scope: Scope;
  version: string;
  keepData: boolean;
  isWin: boolean;
  desktopDir: string;
  startMenuDir: string;
  userDataDir: string;
  runningImage: string;
}): UninstallPlan {
  const { installDir, scope, version, keepData, isWin, desktopDir, startMenuDir, userDataDir, runningImage } = args;
  const startMenuGroup = path.join(startMenuDir, "NOBODY");
  const appShortcut = path.join(startMenuGroup, isWin ? "NOBODY.lnk" : "nobody.desktop");
  const uninstallShortcut = path.join(startMenuGroup, isWin ? UNINSTALL_LNK : "nobody-uninstall.desktop");
  const desktopShortcut = path.join(desktopDir, isWin ? "NOBODY.lnk" : "nobody.desktop");
  return {
    installDir,
    scope,
    version,
    keepData,
    startMenuGroup,
    appShortcut,
    uninstallShortcut,
    desktopShortcut,
    registryKey: isWin
      ? `${scope === "all" ? "HKLM" : "HKCU"}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NOBODY`
      : null,
    userDataDir,
    removedUserData: keepData ? null : userDataDir,
    preserved: [userDataDir],
    protectedExe: isInsideDir(installDir, runningImage) ? runningImage : null,
  };
}

/* ------------------------------------------------------------------ */
/* The uninstall pipeline                                              */
/* ------------------------------------------------------------------ */

/** Walk the install dir once — deletable files (bytes) + dirs, deepest
 *  first. The protected running image (if inside installDir) is skipped. */
function walkForDeletion(
  root: string,
  protectedExe: string | null
): { files: Array<{ path: string; bytes: number }>; dirs: string[] } {
  const files: Array<{ path: string; bytes: number }> = [];
  const dirs: string[] = [];
  const protectedLower = protectedExe ? path.resolve(protectedExe).toLowerCase() : null;
  const walk = (dir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        dirs.push(p);
        walk(p);
      } else if (e.isFile()) {
        if (protectedLower && path.resolve(p).toLowerCase() === protectedLower) continue;
        let bytes = 0;
        try {
          bytes = fs.statSync(p).size;
        } catch {
          /* best-effort — it will simply count as 0 */
        }
        files.push({ path: p, bytes });
      }
    }
  };
  walk(root);
  dirs.sort((a, b) => b.length - a.length);
  return { files, dirs };
}

/** Final stage: self-delete detached. Two ping seconds let the wizard
 *  exit; then the deferred exe is deleted (if it was locked) and the
 *  (now hopefully empty) install dir is removed. */
function scheduleSelfDelete(plan: UninstallPlan, deps: UninstallDeps): void {
  if (!deps.isWin) return; // POSIX dev/gate runs: nothing stays locked
  const chain = [
    "ping -n 2 127.0.0.1 >nul",
    plan.protectedExe ? `del /f /q "${plan.protectedExe}"` : "",
    `rmdir /s /q "${plan.installDir}"`,
  ]
    .filter(Boolean)
    .join(" & ");
  try {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", chain], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    /* best-effort — the folder lingers if the exe stayed locked */
  }
}

export function runUninstall(plan: UninstallPlan, deps: UninstallDeps): Promise<UninstallResult> {
  return withNoAsarAsync(() => runUninstallImpl(plan, deps));
}

async function runUninstallImpl(plan: UninstallPlan, deps: UninstallDeps): Promise<UninstallResult> {
  const t0 = Date.now();
  let stageBytesTotal = 0;
  let currentFrac = 0; // within-stage — reset per stage, never regresses inside one

  const stage = (key: string) => deps.onEvent({ type: "stage", key });
  const log = (message: string) => emit(deps, message);
  const progress = (frac: number, phase: number, file = "") => {
    currentFrac = Math.max(currentFrac, clamp01(frac));
    deps.onEvent({
      type: "progress",
      frac: currentFrac,
      bytes: Math.round(currentFrac * Math.max(1, stageBytesTotal)),
      total: Math.max(1, stageBytesTotal),
      file,
      fileIndex: 0,
      phase,
      rate: 0,
      elapsedMs: Date.now() - t0,
      running: true,
      done: false,
    });
  };
  const cancelled = (): UninstallResult => {
    log("uninstall cancelled by user");
    return { ok: false, cancelled: true, error: "cancelled" };
  };

  log(`uninstalling NOBODY ${plan.version} from ${plan.installDir}`);

  /* 0 — a running NOBODY would hold locks; graceless kill (never
   * ourselves: the guard lives in main's closeRunningApp) */
  if (deps.closeRunningApp(deps.isWin ? "NOBODY.exe" : "NOBODY")) {
    log("closed a running NOBODY instance");
  }

  /* 1 — shortcuts */
  stage("shortcuts");
  stageBytesTotal = 0;
  currentFrac = 0;
  progress(0, 4);
  const shortcutTargets: Array<[string, boolean]> = [
    [plan.startMenuGroup, true], // the whole Start Menu\NOBODY group
    [plan.desktopShortcut, false],
  ];
  for (let i = 0; i < shortcutTargets.length; i++) {
    if (deps.cancelled()) return cancelled();
    const [target, isDir] = shortcutTargets[i];
    try {
      if (isDir) fs.rmSync(target, { recursive: true, force: true });
      else if (fs.existsSync(target)) fs.rmSync(target, { force: true });
      log(`removed ${target}`);
    } catch (e: any) {
      log(`could not remove ${target} (${String(e?.code || e)})`);
    }
    progress((i + 1) / shortcutTargets.length, 4);
  }

  /* 2 — registry */
  stage("registry");
  currentFrac = 0;
  progress(0, 5);
  if (deps.cancelled()) return cancelled();
  try {
    await deps.removeUninstallRegistration(plan.scope);
    log(`removed Add/Remove Programs entry (${plan.registryKey ?? "registry n/a on this platform"})`);
  } catch (e: any) {
    log(`could not remove the registry key (${String(e?.message || e)}) — continuing`);
  }
  progress(1, 5);

  /* 3 — files (bytes-based progress from a pre-walked size sum) */
  stage("files");
  const { files, dirs } = walkForDeletion(plan.installDir, plan.protectedExe);
  stageBytesTotal = files.reduce((a, f) => a + f.bytes, 0);
  currentFrac = 0;
  progress(0, 1);
  let deletedBytes = 0;
  let nextEmit = 0;
  for (let i = 0; i < files.length; i++) {
    if (deps.cancelled()) return cancelled();
    const f = files[i];
    try {
      fs.rmSync(f.path, { force: true });
    } catch (e: any) {
      log(`could not remove ${path.basename(f.path)} (${String(e?.code || e)})`);
      continue;
    }
    deletedBytes += f.bytes;
    if (deletedBytes >= nextEmit || i === files.length - 1) {
      nextEmit = deletedBytes + Math.max(512 * 1024, stageBytesTotal / 200);
      progress(deletedBytes / Math.max(1, stageBytesTotal), 1, path.basename(f.path));
    }
  }
  for (const d of dirs) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort — final stage retries the root */
    }
  }
  try {
    fs.rmSync(plan.installDir, { recursive: true, force: true });
  } catch {
    /* the protected running exe (if any) keeps it alive — final stage retries */
  }
  log("removed the NOBODY program files");
  progress(1, 1);

  /* 4 — user data (only on consent) or skip-data */
  if (plan.keepData) {
    stage("skip-data");
    currentFrac = 0;
    progress(0, 1);
    log(`kept ${plan.userDataDir} (user data preserved)`);
    progress(1, 1);
  } else {
    stage("user data");
    currentFrac = 0;
    progress(0, 1);
    if (deps.cancelled()) return cancelled();
    try {
      fs.rmSync(plan.userDataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      log(`removed ${plan.userDataDir}`);
    } catch (e: any) {
      log(`could not fully remove ${plan.userDataDir} (${String(e?.code || e)}) — some files may remain`);
    }
    progress(1, 1);
  }

  /* 5 — final: detached self-delete, then the main process quits */
  stage("final");
  currentFrac = 0;
  progress(0, 1);
  scheduleSelfDelete(plan, deps);
  await sleepMs(150);
  progress(1, 1);
  log("uninstall complete");
  deps.onEvent({ type: "done", ok: true, message: "uninstalled" });
  return { ok: true, cancelled: false };
}
