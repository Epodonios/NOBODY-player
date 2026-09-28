/**
 * NOBODY — the complete uninstaller (--nobody-uninstall). MEMENTO lineage.
 *
 * Registered in Add/Remove Programs by NOBODY Setup as:
 *   "C:\…\NOBODY.exe" --nobody-uninstall
 *
 * CONTRACT (keep it true):
 *   REMOVED   program files (the install dir), the Start Menu\NOBODY
 *             group, the optional desktop shortcut, the ARP registration,
 *             any other running NOBODY instance.
 *   KEPT      userData (%APPDATA%\NOBODY) — libraries, settings, LRC
 *             cache, stats. A reinstall picks up exactly where the user
 *             left off.
 *
 * Headless mode: no window, no tray, no single-instance lock fight —
 * argv is checked BEFORE requestSingleInstanceLock in main.cjs (the
 * CommonJS wrapper allows the top-level return that skips the player).
 * All file deletion runs in a DETACHED shell (cmd /c timeout & rmdir —
 * or a temp script for in-place installs) because Windows cannot delete
 * a running executable's own directory, and because a shell is not
 * subject to Electron's asar fs interception (app.asar is just a file).
 *
 * Ported 1:1 from MEMENTO's electron/uninstall.ts + the
 * startUninstallMode runner in its electron/main.ts, adapted to NOBODY's
 * names, scopes and sentinel.
 */
'use strict';

const { app, dialog } = require('electron');
const { execFile, execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UNINSTALL_FLAG = '--nobody-uninstall';
const SENTINEL = '.nobody-uninstall.json';
const IS_WIN = process.platform === 'win32';
const EXE_NAME = IS_WIN ? 'NOBODY.exe' : 'NOBODY';
const ARP_KEY = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NOBODY';

/* ── pure helpers (gate-script friendly) ─────────────────────────────── */

function isUninstallInvocation(argv) {
  return (argv || []).slice(1).includes(UNINSTALL_FLAG);
}

function isQuietUninstall(argv) {
  const rest = (argv || []).slice(1);
  return rest.includes('/quiet') || rest.includes('--quiet');
}

/** The plan for removing one NOBODY install. Electron paths come from the
 *  runner; everything else is computed here. */
function buildPlan(args) {
  const { exePath, desktopDir, startMenuDir, userDataDir } = args;
  const installDir = path.dirname(exePath);
  const shortcuts = IS_WIN
    ? [
        path.join(startMenuDir, 'NOBODY'), // the whole Start Menu\NOBODY group
        path.join(desktopDir, 'NOBODY.lnk'),
      ]
    : [
        path.join(startMenuDir, 'NOBODY'),
        path.join(desktopDir, 'nobody.desktop'),
      ];
  return {
    installDir,
    exeName: path.basename(exePath),
    shortcuts,
    registryKeys: IS_WIN ? [`HKLM\\${ARP_KEY}`, `HKCU\\${ARP_KEY}`] : [],
    preservedUserData: userDataDir,
  };
}

/** The detached self-delete command for an OWNED install dir. */
function selfDeleteCommand(installDir) {
  if (IS_WIN) {
    return {
      cmd: 'cmd',
      args: ['/c', `timeout /t 2 /nobreak >nul & rmdir /s /q "${installDir}"`],
    };
  }
  return { cmd: 'sh', args: ['-c', `sleep 1; rm -rf '${installDir.replace(/'/g, "'\\''")}'`] };
}

/** PIDs of every OTHER NOBODY instance (a running GUI keeps the install
 *  dir locked). The uninstaller IS NOBODY.exe too, so the own pid must be
 *  excluded — naive `taskkill /IM NOBODY.exe /F` would suicide mid-run. */
function otherAppPids(opts) {
  const { exeName, ownPid, listOutput } = opts;
  const pids = [];
  for (const line of String(listOutput || '').split(/\r?\n/)) {
    let name = null;
    let pid = NaN;
    if (IS_WIN) {
      // tasklist /FI "IMAGENAME eq NOBODY.exe" /FO CSV /NH
      const m = line.match(/^"([^"]+)","(\d+)"/);
      if (m) {
        name = m[1];
        pid = Number(m[2]);
      }
    } else {
      // ps -eo comm=,pid=
      const m = line.match(/^(.+?)\s+(\d+)$/);
      if (m) {
        name = m[1].trim();
        pid = Number(m[2]);
      }
    }
    if (name && name.toLowerCase() === exeName.toLowerCase()) {
      if (Number.isInteger(pid) && pid > 0 && pid !== ownPid) pids.push(pid);
    }
  }
  return pids;
}

function terminateCommand(pid) {
  return IS_WIN ? { cmd: 'taskkill', args: ['/F', '/PID', String(pid), '/T'] } : { cmd: 'kill', args: ['-9', String(pid)] };
}

/* ── in-place ownership (MEMENTO 2.0.7/3.1.8 contract) ───────────────── */
/* When the setup installed INTO a foreign folder, the sentinel carries
 * `inPlace: true` + the exact file list. The uninstaller then deletes ONLY
 * those files and rmdir-s our (now empty) directories — bare rmdir refuses
 * non-empty dirs, so foreign content is structurally untouchable. */

function readOwnershipSentinel(installDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(installDir, SENTINEL), 'utf8'));
    if (
      raw &&
      raw.inPlace === true &&
      Array.isArray(raw.files) &&
      raw.files.length > 0 &&
      raw.files.every((f) => typeof f === 'string')
    ) {
      return { inPlace: true, files: raw.files.map(String) };
    }
    if (raw && typeof raw === 'object') return { inPlace: false, files: null, meta: raw };
  } catch {
    /* absent/corrupt → owned-dir contract */
  }
  return null;
}

/** Pure: the per-line delete script for an in-place install. */
function inPlaceDeleteLines(installDir, files) {
  const root = path.resolve(installDir);
  const q = (p) => (IS_WIN ? `"${p}"` : `'${p.replace(/'/g, "'\\''")}'`);
  const lines = [];
  for (const rel of files) {
    const full = path.resolve(path.join(installDir, rel));
    if (full !== root && !full.startsWith(root + path.sep)) continue; // traversal guard
    lines.push(IS_WIN ? `del /f /q ${q(full)}` : `rm -f ${q(full)}`);
  }
  const dirs = new Set();
  for (const rel of files) {
    const d = path.dirname(rel);
    if (d && d !== '.' && d !== '/') dirs.add(d);
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    const full = path.resolve(path.join(installDir, d));
    if (!full.startsWith(root + path.sep)) continue;
    lines.push(IS_WIN ? `rmdir /q ${q(full)}` : `rmdir ${q(full)}`);
  }
  return lines;
}

/** Detached self-delete for an in-place install: a temp script carries the
 *  exact lines (one argv would risk the 8191-char Windows limit). */
function inPlaceSelfDeleteCommand(installDir, files) {
  const lines = inPlaceDeleteLines(installDir, files);
  if (IS_WIN) {
    const body = ['@echo off', 'timeout /t 2 /nobreak >nul', ...lines, 'del /f /q "%~f0"'].join('\r\n');
    const bat = path.join(os.tmpdir(), `nobody-inplace-uninstall-${process.pid}.bat`);
    fs.writeFileSync(bat, body, 'utf8');
    return { cmd: 'cmd', args: ['/c', bat] };
  }
  const script = path.join(os.tmpdir(), `nobody-inplace-uninstall-${process.pid}.sh`);
  fs.writeFileSync(script, '#!/bin/sh\nsleep 1\n' + lines.join('\n') + '\n', 'utf8');
  return { cmd: 'sh', args: [script] };
}

/* ── the runner (Electron glue) ──────────────────────────────────────── */

async function startUninstallMode() {
  await app.whenReady();
  try {
    const startMenuDir = IS_WIN
      ? path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
      : path.join(app.getPath('home'), '.local', 'share', 'applications');
    const plan = buildPlan({
      exePath: process.execPath,
      desktopDir: app.getPath('desktop'),
      startMenuDir,
      userDataDir: app.getPath('appData') && path.join(app.getPath('appData'), 'NOBODY'),
    });
    const quiet = isQuietUninstall(process.argv);

    // refine from the ownership sentinel the setup wrote beside the exe
    const ownership = readOwnershipSentinel(plan.installDir);
    const version = (ownership && ownership.meta && ownership.meta.version) || '';

    if (!quiet) {
      const confirm = await dialog.showMessageBox({
        type: 'question',
        title: 'Uninstall NOBODY',
        message: 'Uninstall NOBODY?',
        detail:
          'Program files, shortcuts and the Add/Remove Programs entry are removed.\n\n' +
          'Your library, settings and stats are PRESERVED (' +
          plan.preservedUserData +
          ') — reinstalling NOBODY picks up exactly where you left off.' +
          (version ? '\n\nInstalled version: ' + version : ''),
        buttons: ['Uninstall', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (confirm.response !== 0) {
        app.exit(0);
        return;
      }
    }

    // 1 — every OTHER NOBODY instance must die (a running player locks the
    // dir; the naive taskkill /IM would kill THIS uninstaller too).
    try {
      const listOutput = execFileSync(
        IS_WIN ? 'tasklist' : 'ps',
        IS_WIN ? ['/FI', `IMAGENAME eq ${plan.exeName}`, '/FO', 'CSV', '/NH'] : ['-eo', 'comm=,pid='],
        { encoding: 'utf8', timeout: 15000, windowsHide: true }
      );
      for (const pid of otherAppPids({ exeName: plan.exeName, ownPid: process.pid, listOutput })) {
        const { cmd, args } = terminateCommand(pid);
        try {
          execFileSync(cmd, args, { timeout: 15000, windowsHide: true });
        } catch {
          /* already gone — fine */
        }
      }
    } catch {
      /* best-effort — a locked dir only ever leaves stale files, never
       * user data (userData is not touched). */
    }

    // 2 — shortcuts (the Start Menu\NOBODY group dies recursively)
    for (const target of plan.shortcuts) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }

    // 3 — Add/Remove Programs registration (HKLM needs the elevated token;
    // failures are silently ignored — MEMENTO's contract).
    for (const key of plan.registryKeys) {
      await new Promise((resolve) => {
        execFile('reg', ['delete', key, '/f'], { windowsHide: true }, () => resolve());
      });
    }

    // 4 — detached self-delete. userData is NEVER touched. In-place
    // installs delete ONLY the recorded files (foreign content survives).
    const del =
      ownership && ownership.inPlace
        ? inPlaceSelfDeleteCommand(plan.installDir, ownership.files)
        : selfDeleteCommand(plan.installDir);
    try {
      const child = spawn(del.cmd, del.args, { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    } catch {
      /* best-effort */
    }

    if (!quiet) {
      dialog.showMessageBox({
        type: 'info',
        title: 'NOBODY',
        message: 'NOBODY was uninstalled.',
        detail:
          'Your library, settings and stats are kept in ' +
          plan.preservedUserData +
          '. Reinstalling NOBODY restores everything.',
        buttons: ['OK'],
        noLink: true,
      });
      setTimeout(() => app.exit(0), 800);
    } else {
      app.exit(0);
    }
  } catch (e) {
    console.error(`[NobodyUninstall] fatal: ${String(e)}`);
    app.exit(1);
  }
}

module.exports = {
  UNINSTALL_FLAG,
  isUninstallInvocation,
  isQuietUninstall,
  buildPlan,
  selfDeleteCommand,
  otherAppPids,
  readOwnershipSentinel,
  inPlaceDeleteLines,
  inPlaceSelfDeleteCommand,
  startUninstallMode,
};
