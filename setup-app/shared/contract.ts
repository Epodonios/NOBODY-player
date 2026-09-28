/**
 * NOBODY Setup — the ONE contract between the renderer (the design-exact
 * wizard UI) and the Electron main process (the real install pipeline).
 *
 * Both sides import ONLY from this file — no channel-name strings anywhere
 * else, so a typo is a compile error, not a dead button.
 */

/** Everything the wizard needs to know before the first click. */
export interface SetupContext {
  /** The setup exe doubles as the uninstaller (marker file next to it). */
  mode: "setup" | "uninstall";
  /** NOBODY version being installed (from payload-meta.json). */
  version: string;
  /** Installer surface spec (bumped only when install/uninstall changes). */
  spec: number;
  payloadBytes: number;
  payloadFiles: number;
  defaultUserDir: string; // %LOCALAPPDATA%\Programs\NOBODY
  defaultAllDir: string; // %ProgramFiles%\NOBODY
  userDataDir: string; // %APPDATA%\NOBODY — never touched without consent
  /** Free bytes on the default destination volume (null = probe failed). */
  freeBytes: number | null;
  /** A previous NOBODY install was detected (registry/marker probe). */
  upgrade: boolean;
  installedVersion: string | null;
  /** true only in dev — the QA/Deliverables harness never ships to users. */
  devMode: boolean;
}

/** Same shape the design's simulated engine rendered — the real pipeline
 *  feeds byte-exact values into the identical interface. */
export interface ProgressEvent {
  type: "progress";
  frac: number; // 0..1
  bytes: number;
  total: number;
  file: string; // current file name (already trimmed by the main side)
  fileIndex: number;
  phase: number; // 0..5 — index into i18n `phases`
  rate: number; // bytes/s
  elapsedMs: number;
  running: boolean;
  done: boolean;
}

export type SetupEvent =
  | ProgressEvent
  | { type: "log"; message: string }
  | { type: "stage"; key: string } // uninstall stage keys (see Uninstall.tsx)
  | { type: "done"; ok: boolean; message?: string }
  | { type: "error"; message: string; code?: string };

export interface InstallOptions {
  destDir: string;
  scope: "all" | "me"; // all → %ProgramFiles% + HKLM · me → LOCALAPPDATA + HKCU
  desktop: boolean; // desktop shortcut
  launchAfter: boolean; // run NOBODY when the wizard closes
  openFolder: boolean; // open the install folder at the end
}

export interface UninstallOptions {
  keepData: boolean; // keep %APPDATA%\NOBODY (the default, always)
}

export interface SetupApi {
  getContext(): Promise<SetupContext>;
  statPath(path: string): Promise<{ exists: boolean; isDir: boolean; freeBytes: number | null }>;
  chooseDir(current: string): Promise<string | null>;
  startInstall(opts: InstallOptions): Promise<{ ok: boolean; error?: string }>;
  cancelInstall(): Promise<boolean>;
  startUninstall(opts: UninstallOptions): Promise<{ ok: boolean; error?: string }>;
  launchApp(): Promise<boolean>;
  openFolder(): Promise<boolean>;
  minimize(): Promise<void>;
  close(): Promise<void>;
  onEvent(cb: (ev: SetupEvent) => void): () => void;
}

export const SETUP_API_NAME = "nobodySetup";
