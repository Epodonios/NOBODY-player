/**
 * NOBODY Setup — preload bridge (MEMENTO lineage, NOBODY contract).
 *
 * Exposes the typed `window.nobodySetup` to the wizard (the design-exact
 * renderer speaks ONLY through shared/contract.ts). contextIsolation:true,
 * nodeIntegration:false. Every channel is fixed and lives in ONE table —
 * the renderer can read the context, pick a destination, run the install
 * or the uninstall, watch the event stream, launch the app or control
 * the window; nothing else exists.
 */
import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import type {
  SetupApi as ContractSetupApi,
  SetupContext,
  SetupEvent,
  InstallOptions,
  UninstallOptions,
} from "../shared/contract";

/** MIRRORED from shared/contract.ts (SETUP_API_NAME). Sandboxed preload
 *  scripts cannot require app files — only built-ins — so the value is
 *  inlined here and the shared import stays type-only (erased at build).
 *  If the contract's name ever changes, change THIS string with it. */
const SETUP_API_NAME = "nobodySetup";

/** Every IPC channel the setup speaks — one table, mirrored by
 *  electron/main.ts (the contract forbids channel strings elsewhere). */
const CHANNELS = {
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

const api: ContractSetupApi & { isSetup: true } = {
  isSetup: true,

  getContext: (): Promise<SetupContext> => ipcRenderer.invoke(CHANNELS.ctx),

  statPath: (path: string): Promise<{ exists: boolean; isDir: boolean; freeBytes: number | null }> =>
    ipcRenderer.invoke(CHANNELS.statPath, { path }),

  chooseDir: (current: string): Promise<string | null> =>
    ipcRenderer.invoke(CHANNELS.chooseDir, { current }),

  startInstall: (opts: InstallOptions): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(CHANNELS.startInstall, opts),

  cancelInstall: (): Promise<boolean> => ipcRenderer.invoke(CHANNELS.cancelInstall),

  startUninstall: (opts: UninstallOptions): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(CHANNELS.startUninstall, opts),

  launchApp: (): Promise<boolean> => ipcRenderer.invoke(CHANNELS.launchApp),

  openFolder: (): Promise<boolean> => ipcRenderer.invoke(CHANNELS.openFolder),

  minimize: async (): Promise<void> => {
    await ipcRenderer.invoke(CHANNELS.minimize);
  },

  close: async (): Promise<void> => {
    await ipcRenderer.invoke(CHANNELS.close);
  },

  /** The install/uninstall event stream (progress / log / stage / done /
   *  error). Returns an unsubscribe function. */
  onEvent: (cb: (ev: SetupEvent) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, payload: unknown) => cb(payload as SetupEvent);
    ipcRenderer.on(CHANNELS.event, handler);
    return () => {
      ipcRenderer.removeListener(CHANNELS.event, handler);
    };
  },
};

contextBridge.exposeInMainWorld(SETUP_API_NAME, api);

export type SetupApi = typeof api;
