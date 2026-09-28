/**
 * The real deliverables, imported straight off disk with Vite's ?raw, so what
 * you read in the viewer is byte-for-byte what ships in the repo — not a copy
 * pasted into a string.
 *
 * SETUP-APP NOTE: this renderer lives inside the Electron setup skeleton,
 * which does not vendor the NSIS build tree of the installer design repo.
 * Eight of the ten sources therefore have no on-disk file here; they resolve
 * to an honest pointer instead of a stale copy. src/version.ts is real and
 * inlined verbatim. This viewer is reviewer scaffolding — App.tsx mounts it
 * only in the browser preview or a devMode build, never in a packaged
 * install.
 */
import versionTs from "../version.ts?raw";

/** Honest stand-in for a repo file that is not vendored in setup-app. */
const NOT_BUNDLED = (path: string) =>
  `[not bundled in setup-app — source of truth: ${path} in the NOBODY installer design repo]`;

export interface Deliverable {
  path: string;
  kind: "nsis" | "script" | "config" | "doc";
  role: string;
  content: string;
}

export const DELIVERABLES: Deliverable[] = [
  {
    path: "build/installer.nsi",
    kind: "nsis",
    role:
      "The whole installer: five custom pages + a custom uninstaller, nsDialogs only, PNG through the GDI+ flat API, 4 languages with a real Farsi mirror, per-file progress from Nsis7z.",
    content: NOT_BUNDLED("build/installer.nsi"),
  },
  {
    path: "build/installer-assets/generate.mjs",
    kind: "script",
    role:
      "Samples the two accent colours out of build/icon.png, renders the art set at every DPI, subsets and renames the four embedded fonts.",
    content: NOT_BUNDLED("build/installer-assets/generate.mjs"),
  },
  {
    path: "build/installer-assets/prepare.mjs",
    kind: "script",
    role: "Fetches Nsis7z + nsProcess with pinned SHA-256 digests. No unpinned DLL ever enters the build.",
    content: NOT_BUNDLED("build/installer-assets/prepare.mjs"),
  },
  {
    path: "build/installer-assets/tokens.json",
    kind: "config",
    role: "Machine-written theme tokens: accent1 #FF2D78, accent2 #FF9EC4, window geometry, motion timings.",
    content: NOT_BUNDLED("build/installer-assets/tokens.json"),
  },
  {
    path: "scripts/afterPack-payload.mjs",
    kind: "script",
    role:
      "electron-builder afterPack hook: packs win-unpacked into one solid app-1.5.0.7z and writes the fallback file list with identical progress granularity.",
    content: NOT_BUNDLED("scripts/afterPack-payload.mjs"),
  },
  {
    path: "scripts/fetch-fonts.mjs",
    kind: "script",
    role:
      "Inline base64 font subsets for this preview (Michroma / Inter / Vazirmatn / JetBrains Mono) — the mirror of what generate.mjs does for the .exe.",
    content: NOT_BUNDLED("scripts/fetch-fonts.mjs"),
  },
  {
    path: "patches/package.build.json",
    kind: "config",
    role:
      "Merge target for package.json: version 1.5.0, nsis.script, afterPack hook, MSI target left untouched.",
    content: NOT_BUNDLED("patches/package.build.json"),
  },
  {
    path: "src/version.ts",
    kind: "config",
    role: "APP_VERSION 1.5.0 · INSTALLER_SPEC 5, plus the merge note about not breaking existing imports.",
    content: versionTs,
  },
  {
    path: "VERSIONS.md",
    kind: "doc",
    role: "V1.5.0 entry: what was added, what changed, what is explicitly preserved.",
    content: NOT_BUNDLED("VERSIONS.md"),
  },
  {
    path: "worklog.md",
    kind: "doc",
    role:
      "Task ID / Work Log / Stage Summary, including every verification this environment could not perform.",
    content: NOT_BUNDLED("worklog.md"),
  },
];
