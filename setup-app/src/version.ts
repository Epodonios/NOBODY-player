/**
 * src/version.ts — NOBODY, V1.5.1
 * ---------------------------------------------------------------------------
 * MERGE NOTE (see worklog.md): the original file was not reachable from this
 * environment, so keep whatever named export the app already imports. If the
 * app uses `export const version`, alias it at the bottom — do not break the
 * import sites in src/**.
 */

export const APP_VERSION = "1.5.1";
export const APP_BUILD = "1.5.1.260115";
export const VERSION_LABEL = `V${APP_VERSION}`;

/** Bumped only when the install/uninstall surface changes, not for player fixes. */
export const INSTALLER_SPEC = 5;

export const CHANGELOG_1_5_1 = [
  "Fixed: the packaged Setup could start into an empty dark window — the compiled main entry (dist-electron/electron/main.js) did not match package.json's declared main, so Electron could not boot the wizard. All runtime paths (renderer, payload metadata, dev payload) are now derived from the real emit layout.",
  "The installer surface itself is unchanged (INSTALLER_SPEC stays 5).",
];

export const CHANGELOG_1_5_0 = [
  "New: the fifth face of the app — a fully custom Setup.exe (welcome, license, destination, installing, finish) plus a matching custom uninstaller.",
  "New: fa / en / tr / ru inside the installer, with a real mirrored layout for Farsi.",
  "New: install progress driven by real per-file extraction, not a timer.",
  "New: upgrade path V1.4.0 → V1.5.0 that never touches %APPDATA%\\NOBODY.",
];

/** Read by the About panel and by the installer's version readout. */
export function versionString() {
  return `NOBODY ${VERSION_LABEL} · build ${APP_BUILD}`;
}

export default APP_VERSION;
