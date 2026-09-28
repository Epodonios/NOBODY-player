// ── NOBODY · import pipeline ─────────────────────────────────────────────────
// File picker / folder picker (File System Access where supported, graceful
// fallback elsewhere) / drag-and-drop with directory walking. Dedupe by stable
// track id, parse headers incrementally, generate placeholder covers, persist.

import { db } from "./db";
import { fromFilename, parseFileMeta, probeDurations } from "./metadata";
import { makePlaceholderCover } from "./covers";
import { parseLrc, looksLikeLrc } from "./lyrics";
import { useLibrary } from "../store/library";
import { useSettings } from "../store/settings";
import { uiApi } from "../store/ui";
import { tStatic } from "./useT";
import { bridgeImportFiles, bridgeImportPaths, hasBridge } from "./desktopBridge";
import { chooseMusicFiles, chooseMusicFolders, isDesktopRuntime } from "../../desktopLibrary";
import { isAudioFile, pool, trackIdFromFile, uuid } from "./utils";
import type { Batch, Track } from "../types";

export interface ImportResult {
  added: number;
  skipped: number;
  batch?: Batch;
}

/** Walk a dropped DataTransferItemList to collect files (folders included). */
async function walkDataTransfer(items: DataTransferItemList): Promise<File[]> {
  const out: File[] = [];
  const entries: (FileSystemEntry | null)[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const entry = (it as any).webkitGetAsEntry?.() as FileSystemEntry | null;
    entries.push(entry);
  }
  const readEntries = (dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> =>
    new Promise((res, rej) => dir.createReader().readEntries(res, rej));
  const walk = async (entry: FileSystemEntry, depth: number): Promise<void> => {
    if (depth > 12) return;
    if (entry.isFile) {
      const f = await new Promise<File | null>((res) => (entry as FileSystemFileEntry).file(res, () => res(null)));
      if (f && isAudioFile(f.name, f.type)) out.push(f);
    } else if (entry.isDirectory) {
      const kids = await readEntries(entry as FileSystemDirectoryEntry).catch(() => [] as FileSystemEntry[]);
      for (const k of kids) await walk(k, depth + 1);
    }
  };
  const hasEntries = entries.some(Boolean);
  if (hasEntries) {
    for (const e of entries) if (e) await walk(e, 0);
    return out;
  }
  // flat fallback
  for (let i = 0; i < items.length; i++) {
    const f = items[i].getAsFile();
    if (f && isAudioFile(f.name, f.type)) out.push(f);
  }
  return out;
}

/** Folder import via File System Access API; returns null when unsupported. */
export async function pickFolder(): Promise<{ files: File[]; name: string } | null> {
  const anyWin = window as any;
  if (typeof anyWin.showDirectoryPicker === "function") {
    try {
      const dir = await anyWin.showDirectoryPicker({ id: "nobody-import" });
      const files: File[] = [];
      const walk = async (handle: any, depth: number) => {
        if (depth > 12) return;
        for await (const entry of handle.values()) {
          if (entry.kind === "file") {
            const f: File = await entry.getFile();
            if (isAudioFile(f.name, f.type)) files.push(f);
          } else if (entry.kind === "directory") {
            await walk(entry, depth + 1);
          }
        }
      };
      await walk(dir, 0);
      return { files, name: dir.name as string };
    } catch (e: any) {
      if (e?.name === "AbortError") return { files: [], name: "" }; // user cancelled
      return null; // fall back to input below
    }
  }
  return null;
}

/** V1.2.0 — resolve real absolute paths for renderer File objects.
 *  Electron 32 removed File.path; webUtils.getPathForFile (exposed by the
 *  preload) is the sanctioned replacement and covers picker, <input> and
 *  drag-and-drop files. Returns [] outside Electron. */
async function resolveFilePaths(files: File[]): Promise<string[]> {
  const api = (globalThis as any).window?.electronAPI;
  if (!api || typeof api.getPathForFile !== "function") return [];
  const out: string[] = [];
  for (const f of files) {
    try {
      const p = api.getPathForFile(f);
      if (p) out.push(p);
    } catch {
      /* unidentifiable file — skipped */
    }
  }
  return out;
}

/** V1.2.0 installer import fix — import through the NATIVE folder dialog +
 *  the classic real-path pipeline (the exact flow the classic UI uses, which
 *  works in the packaged app). Returns null only when the user's browser has
 *  no FSA support either, so the caller can fall back to pickFiles(directory).
 *  Task 30: in the desktop runtime the native dialog is the ONLY dialog — a
 *  cancel (or a folder without audio) must never open the FSA directory
 *  picker afterwards (that was the "two dialogs in a row" bug), and a folder
 *  that yields no audio now says so instead of failing silently. */
export async function importViaFolderPicker(label: string): Promise<ImportResult | null> {
  if (isDesktopRuntime()) {
    const folders = await chooseMusicFolders();
    if (!folders.length) return { added: 0, skipped: 0 }; // user cancelled — stay silent
    const res = await bridgeImportPaths(folders);
    if (res) {
      if (res.added === 0) {
        uiApi.toast(tStatic(useSettings.getState().lang, "fmNoAudio"), "info");
      }
      return { added: res.added, skipped: res.skipped };
    }
    // Desktop but no classic bridge: the real-path pipeline is unavailable,
    // and falling through would pop a SECOND dialog. Fail honestly.
    return { added: 0, skipped: 0 };
  }
  const picked = await pickFolder();
  if (picked === null) return null;
  if (!picked.files.length) {
    uiApi.toast(tStatic(useSettings.getState().lang, "fmNoAudio"), "info");
    return { added: 0, skipped: 0 };
  }
  return importFiles(picked.files, picked.name, label);
}

/** V1.2.0 installer import fix — import through the NATIVE file dialog +
 *  the classic real-path pipeline. */
export async function importViaFilesPicker(label: string): Promise<ImportResult> {
  if (isDesktopRuntime()) {
    const paths = await chooseMusicFiles();
    if (!paths.length) return { added: 0, skipped: 0 }; // user cancelled
    const res = await bridgeImportPaths(paths);
    if (res) return { added: res.added, skipped: res.skipped };
    // no bridge → fall through to the web flow below
  }
  const files = await pickFiles(true);
  if (!files.length) return { added: 0, skipped: 0 };
  return importFiles(files, undefined, label);
}

export function pickFiles(multiple = true, directory = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    /* Task 30 — accept attr in lock-step with utils.AUDIO_EXT / classic's
     * AUDIO_RE so the file picker never grey-outs formats the app supports. */
    input.accept =
      "audio/*,.mp3,.flac,.ogg,.oga,.opus,.m4a,.aac,.wav,.webm,.wma,.aif,.aiff,.alac,.ape,.caf,.dsf,.mpc,.3gp,.amr,.mp4,.mka";
    input.multiple = multiple;
    if (directory) (input as any).webkitdirectory = true;
    input.onchange = () => resolve(Array.from(input.files ?? []).filter((f) => isAudioFile(f.name, f.type)));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** The core import routine shared by every entry point. */
export async function importFiles(files: File[], batchName?: string, label = "Importing"): Promise<ImportResult> {
  const lib = useLibrary.getState();
  if (!files.length) return { added: 0, skipped: 0 };

  // Classic-bridge mode → route through the classic app's proven import
  // pipeline (native parser, sidecar lyrics/covers, stable IDs), then mirror
  // the refreshed library back via the bridge notify → rehydrateTracks.
  if (hasBridge()) {
    /* V1.2.0: prefer the REAL-path pipeline whenever Electron can identify
     * these files. The old File[] route built tracks around blob: URLs that
     * could not stream (and died on reload) in the packaged app. */
    const realPaths = await resolveFilePaths(files);
    if (realPaths.length) {
      const pathToast = uiApi.toast(label, "progress", { sticky: true, progress: 0.4, sub: `${realPaths.length}` });
      try {
        const res = await bridgeImportPaths(realPaths);
        uiApi.dismissToast(pathToast);
        if (res) {
          if (res.added > 0) uiApi.toast(`${res.added} / ${realPaths.length}`, "success");
          else uiApi.toast(`${label}: 0 / ${realPaths.length}`, "error");
          return { added: res.added, skipped: res.skipped };
        }
      } catch {
        uiApi.dismissToast(pathToast);
        /* fall through to the File[] bridge route below */
      }
    }
    const toastId = uiApi.toast(label, "progress", { sticky: true, progress: 0.4, sub: `${files.length}` });
    try {
      const res = await bridgeImportFiles(files);
      uiApi.dismissToast(toastId);
      const added = res?.added ?? 0;
      // honest result — the old silent-swallow made failed imports look like
      // "nothing happened" (the user had to re-import from the classic UI)
      if (added > 0) uiApi.toast(`${added} / ${files.length}`, "success");
      else uiApi.toast(`${label}: 0 / ${files.length}`, "error");
      return { added, skipped: res?.skipped ?? 0 };
    } catch {
      uiApi.dismissToast(toastId);
      uiApi.toast(`${label}: 0 / ${files.length}`, "error");
      return { added: 0, skipped: 0 };
    }
  }

  const toastId = uiApi.toast(label, "progress", { sticky: true, progress: 0, sub: `0 / ${files.length}` });
  const tick = (done: number, total: number) =>
    uiApi.updateToast(toastId, { progress: total ? done / total : 0, sub: `${done} / ${total}` });

  // dedupe against library & within the batch itself
  const seen = new Set<string>();
  const fresh: { file: File; id: string }[] = [];
  let skipped = 0;
  for (const f of files) {
    const id = trackIdFromFile(f);
    if (seen.has(id) || lib.tracks[id]) { skipped++; continue; }
    seen.add(id);
    fresh.push({ file: f, id });
  }

  const batch: Batch = {
    id: uuid(),
    name: batchName || `${dateFmt.format(new Date())} · ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`,
    count: 0,
    importedAt: Date.now(),
  };

  const tracks: Track[] = [];
  const covers: { id: string; blob: Blob }[] = [];
  let done = 0;

  await pool(fresh, 3, async ({ file, id }) => {
    const meta = await parseFileMeta(file);
    const fb = fromFilename(file.name);
    const title = (meta.title || fb.title || file.name).trim();
    const artist = (meta.artist || fb.artist || "").trim();
    const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || file.type.split("/")[1] || "?").toLowerCase();

    const track: Track = {
      id,
      title,
      artist: artist || "Unknown Artist",
      album: (meta.album || "").trim() || "Unknown Album",
      year: meta.year,
      duration: 0, // probed below
      format: ext,
      hasCover: false,
      isPlaceholderCover: true,
      hasEmbeddedLyrics: !!meta.lyrics,
      batchId: batch.id,
      importedAt: Date.now(),
      fileName: file.name,
      fileSize: file.size,
      /* V1.2.0: keep the real path when the runtime exposes one (Electron
       * File.path/webUtils) so the Folders/Subfolders library categories work
       * for standalone imports too. */
      filePath: (file as any).path || undefined,
      folderPath: (file as any).path ? String((file as any).path).replace(/[\\/][^\\/]+$/, "") : undefined,
    };
    if (meta.lyrics) {
      if (looksLikeLrc(meta.lyrics)) track.syncedLyrics = parseLrc(meta.lyrics);
      else track.plainLyrics = meta.lyrics;
    }
    if (meta.picture) {
      covers.push({ id, blob: meta.picture });
      track.hasCover = true;
      track.isPlaceholderCover = false;
    }
    tracks.push(track);
    done++;
    tick(done, fresh.length);
  });

  // probe durations (bounded concurrency, header-only streaming)
  await probeDurations(
    fresh.map((f, i) => ({
      file: f.file,
      done: (d) => {
        const t = tracks[i];
        // order may differ — find by id
        const tr = tracks.find((x) => x.id === f.id) ?? t;
        if (tr) {
          tr.duration = d;
          if (d > 0) tr.bitrate = Math.round((tr.fileSize * 8) / d / 1000);
        }
      },
    }))
  );

  // placeholder covers for the coverless
  await pool(tracks, 3, async (t) => {
    if (!t.hasCover) {
      const blob = await makePlaceholderCover(t.title, t.artist);
      covers.push({ id: t.id, blob: blob });
      t.hasCover = true;
    }
  });

  // persist
  await pool(covers, 4, async (c) => { await db.putCover(c.id, c.blob).catch(() => void 0); });
  await pool(fresh, 4, async (f) => { await db.putFile(f.id, f.file).catch(() => void 0); });

  if (tracks.length) {
    batch.count = tracks.length;
    useLibrary.getState().addImported(tracks, batch);
  }

  uiApi.dismissToast(toastId);
  return { added: tracks.length, skipped, batch: tracks.length ? batch : undefined };
}

export async function importDropped(items: DataTransferItemList, fallbackFiles: FileList | null, label?: string): Promise<ImportResult> {
  let files: File[] = [];
  try {
    files = await walkDataTransfer(items);
  } catch { /* fall back below */ }
  if (!files.length && fallbackFiles) {
    files = Array.from(fallbackFiles).filter((f) => isAudioFile(f.name, f.type));
  }
  return importFiles(files, undefined, label);
}
