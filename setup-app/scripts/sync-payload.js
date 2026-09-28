#!/usr/bin/env node
/**
 * NOBODY Setup — payload sync (runtime-reuse, MEMENTO lineage).
 *
 * THE CONTRACT: the setup exe ships as ONE portable file containing the
 * wizard AND the NOBODY payload. The payload carries ONLY the parts the
 * wizard's own Electron runtime cannot provide — NOBODY's app code —
 * because at install time the wizard clones ITS OWN Electron 41.7.1
 * runtime into the destination (runtime-reuse; electron-builder.yml pins
 * the exact version, setup and app must never drift):
 *
 *   payload/resources/app.asar             NOBODY's app code
 *   payload/resources/app.asar.unpacked/**  (when the build has one)
 *   payload/resources/icon.png             app icon
 *
 * SRC is NOBODY's electron-builder output (release/win-unpacked) and is
 * expected to be built BEFORE the setup dist. This script also writes
 * the two contract files the install pipeline reads:
 *
 *   payload-manifest.json  { files: [{rel, bytes, sha256}], totalBytes,
 *                            totalFiles } — the install-time VERIFY+HEAL
 *                            gate hashes the destination against these.
 *   payload-meta.json      { appVersion, mode: "runtime-reuse",
 *                            electron } — the wizard's version/mode.
 *
 * If SRC is missing the script exits 1 with a clear message — it never
 * fabricates a fixture payload, because a partial NOBODY install would
 * fail verification anyway.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const HERE = __dirname;
const ROOT = path.resolve(HERE, ".."); // setup-app
const APP_ROOT = path.resolve(ROOT, ".."); // the NOBODY app root
const SRC = path.join(APP_ROOT, "release", "win-unpacked");
const DEST = path.join(ROOT, "payload");

function fail(msg) {
  console.error(`[sync-payload] ERROR: ${msg}`);
  process.exit(1);
}

const ELECTRON_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    return (pkg.devDependencies && pkg.devDependencies.electron) || "41.7.1";
  } catch {
    return "41.7.1";
  }
})();

if (!fs.existsSync(SRC)) {
  fail(
    `NOBODY build not found at ${SRC} — build NOBODY first (vite build + electron-builder --win --dir), then re-run this script.`
  );
}
if (!fs.existsSync(path.join(SRC, "resources", "app.asar"))) {
  fail(
    `${path.join(SRC, "resources", "app.asar")} is missing — the NOBODY win-unpacked build is incomplete or stale (asar must be on).`
  );
}

fs.rmSync(DEST, { recursive: true, force: true });

const manifest = { files: [], totalBytes: 0, totalFiles: 0 };

function addFile(absSrc, rel) {
  const dst = path.join(DEST, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(absSrc, dst);
  const bytes = fs.statSync(dst).size;
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(dst)).digest("hex");
  manifest.files.push({ rel: rel.split(path.sep).join("/"), bytes, sha256 });
  manifest.totalBytes += bytes;
  manifest.totalFiles += 1;
}

function addTree(absDir, relBase) {
  for (const e of fs.readdirSync(absDir, { withFileTypes: true })) {
    const s = path.join(absDir, e.name);
    const rel = path.join(relBase, e.name);
    if (e.isDirectory()) addTree(s, rel);
    else if (e.isFile()) addFile(s, rel);
  }
}

// ---- the payload (app code + icon ONLY — runtime-reuse) ----
addFile(path.join(SRC, "resources", "app.asar"), path.join("resources", "app.asar"));
const unpacked = path.join(SRC, "resources", "app.asar.unpacked");
if (fs.existsSync(unpacked)) addTree(unpacked, path.join("resources", "app.asar.unpacked"));
const iconSrc = fs.existsSync(path.join(SRC, "resources", "icon.png"))
  ? path.join(SRC, "resources", "icon.png")
  : path.join(ROOT, "build", "icon.png");
addFile(iconSrc, path.join("resources", "icon.png"));

fs.writeFileSync(
  path.join(ROOT, "payload-manifest.json"),
  JSON.stringify(manifest, null, 2),
  "utf8"
);

const appVersion = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_ROOT, "package.json"), "utf8")).version;
  } catch {
    fail(`cannot read NOBODY's package.json at ${path.join(APP_ROOT, "package.json")}`);
  }
})();

fs.writeFileSync(
  path.join(ROOT, "payload-meta.json"),
  JSON.stringify({ appVersion, mode: "runtime-reuse", electron: ELECTRON_VERSION }, null, 2),
  "utf8"
);

console.log(
  `[sync-payload] runtime-reuse payload: ${manifest.totalFiles} file(s) · ${(manifest.totalBytes / 1024 ** 2).toFixed(1)} MB ` +
    `(NOBODY ${appVersion}, electron ${ELECTRON_VERSION}) — the wizard clones its own runtime at install time`
);
