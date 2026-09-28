import { isElectron, isTauri } from "./desktopWindow";

export type DesktopImportFile = {
  file: File;
  path: string;
  folder: string;
  sourceUrl: string;
  /* PHASE-3 memory fix: true when `file` holds ONLY the first
   * METADATA_HEAD_BYTES of the audio (enough for tag/cover parsing), never
   * the whole song. Playback always streams from `sourceUrl` off disk. */
  isPartial?: boolean;
  /* Real on-disk size in bytes (a partial File only knows the head size). */
  fileSize?: number;
  /* PHASE-4: last bytes of the physical file for formats that keep their
   * metadata/duration at EOF (MP4 moov atom, OggS last page). */
  tailFile?: File;
};

const AUDIO_RE = /\.(mp3|wav|flac|ogg|oga|opus|m4a|aac|alac|aif|aiff|caf|webm|mp4|wma|ape|amr|3gp|dsf|mpc)$/i;
const TEXT_RE = /\.(lrc|txt)$/i;
const IMAGE_RE = /\.(jpg|jpeg|png|webp)$/i;
/* PHASE-4: formats that keep metadata/duration at the END of the file. */
const OGG_TAIL_RE = /\.(ogg|oga|opus)$/i;
const MP4_TAIL_RE = /\.(mp4|m4a|m4b|m4p|mp4a|alac)$/i;
const OGG_TAIL_BYTES = 256 * 1024; // last OggS page (pages max ~64KB)
const MP4_TAIL_BYTES = 1024 * 1024; // moov atom start

/* PHASE-3 memory fix — THE "WHOLE SYSTEM LAGS" SMOKING GUN:
 * the old import flow called readFile() on EVERY audio file, loading each
 * song fully into JS RAM and keeping every File alive in the import batch
 * until the whole scan finished (a 300-track FLAC library @ 35MB = ~10GB of
 * retained bytes -> OOM / page-file thrash -> system-wide freeze).
 * Only this many LEADING bytes are now read for metadata/cover parsing;
 * full playback streams from disk through the app:// (Electron) or
 * asset:// (Tauri) URL. */
export const METADATA_HEAD_BYTES = 1024 * 1024 * 3;

/* Extensions handed to the Electron main-process walker (electron/main.cjs
 * fs:walk filters by extension so huge trees never ship every path over
 * IPC). Keep in lock-step with the three regexes above. */
const WALK_EXTENSIONS = [
  "mp3", "wav", "flac", "ogg", "oga", "opus", "m4a", "aac", "alac", "aif",
  "aiff", "caf", "webm", "mp4", "wma", "ape", "amr", "3gp", "dsf", "mpc",
  "lrc", "txt", "jpg", "jpeg", "png", "webp",
];

/* Electron migration (Issue 5): "desktop runtime" now means Tauri OR
 * Electron. Everything gated on this flag (native dialogs, folder walks,
 * streaming file sources, the CORS-bypassing HTTP proxy) works identically
 * under both — desktopLibrary/desktopWindow expose the same surface and
 * main.cjs implements the same scoping as capabilities/default.json. */
export const isDesktopRuntime = () => isTauri() || isElectron();

/** Electron's equivalent of Tauri convertFileSrc(): a STREAMING custom
 *  protocol URL. The app:// handler (electron/main.cjs) range-reads the
 *  file off disk, so a 60MB FLAC never enters JS memory — the <audio>
 *  element reads it straight from the filesystem like asset:// did. */
function electronFileSrc(path: string): string {
  return `app://${encodeURIComponent(path)}`;
}

/** Runtime-agnostic streaming source URL for an absolute file path:
 *  Electron → app:// (streaming custom protocol); Tauri → the native
 *  convertFileSrc (asset://) so its exact encoding is preserved. */
async function fileSourceUrl(path: string): Promise<string> {
  if (isElectron()) return electronFileSrc(path);
  const { convertFileSrc } = await import("@tauri-apps/api/core");
  return convertFileSrc(path);
}

/** Runtime-agnostic whole-file read (sidecar .lrc/.txt/.jpg only — audio
 *  always goes through the bounded head/tail reads below). */
async function desktopReadFile(path: string): Promise<Uint8Array> {
  if (isElectron()) {
    return window.electronAPI!.readFile(path);
  }
  const { readFile } = await import("@tauri-apps/plugin-fs");
  return readFile(path);
}

/** Runtime-agnostic stat (size only is used). */
async function desktopStatSize(path: string): Promise<number> {
  if (isElectron()) {
    const info = await window.electronAPI!.stat(path);
    return info.size;
  }
  const { stat } = await import("@tauri-apps/plugin-fs");
  const info = await stat(path);
  return Number(info.size) || 0;
}

function fileFromBytes(bytes: Uint8Array, name: string, type: string): File {
  // The cast only bridges TS 5.9's stricter ArrayBufferLike variance; the
  // bytes are a valid BlobPart at runtime. (Also removes the old
  // `new Uint8Array(bytes)` double-copy of every buffer.)
  return new File([bytes as unknown as BlobPart], name, { type });
}

/** Electron: reads the metadata head (+ optional container tail) of an
 *  audio file via the main process's bounded fs:read-slice IPC. Identical
 *  memory contract to the Tauri branch below: NEVER the whole song. */
async function readAudioHeadElectron(
  path: string,
  name: string,
): Promise<{ file: File; size: number; tail?: Uint8Array }> {
  const api = window.electronAPI!;
  const size = await desktopStatSize(path);
  const tailLen = OGG_TAIL_RE.test(path) ? OGG_TAIL_BYTES : MP4_TAIL_RE.test(path) ? MP4_TAIL_BYTES : 0;

  if (size > METADATA_HEAD_BYTES) {
    const head = await api.readSlice(path, 0, METADATA_HEAD_BYTES);
    let tail: Uint8Array | undefined;
    if (tailLen > 0) {
      try {
        const realTailLen = Math.min(tailLen, size - METADATA_HEAD_BYTES);
        if (realTailLen > 0) {
          tail = await api.readSlice(path, size - realTailLen, realTailLen);
        }
      } catch {
        tail = undefined; // duration falls back to the audio probe
      }
    }
    return { file: fileFromBytes(head, name, "audio/*"), size, tail };
  }

  // Small file: one bounded slice covers the entire file.
  const bytes = await api.readSlice(path, 0, Math.min(size, METADATA_HEAD_BYTES));
  return { file: fileFromBytes(bytes, name, "audio/*"), size };
}

/** Reads the metadata head of an audio file WITHOUT loading it fully into
 *  RAM. Prefers a bounded FileHandle read (open/read/close); files that are
 *  smaller than the head size are read whole; any runtime failure falls back
 *  to the old full readFile() so imports can never break outright.
 *  For MP4/OGG containers it also reads a small END slice (tail) the native
 *  parser needs for moov-at-EOF atoms and the last OggS page. */
async function readAudioHead(
  path: string,
  name: string,
): Promise<{ file: File; size: number; tail?: Uint8Array }> {
  if (isElectron()) return readAudioHeadElectron(path, name);

  const { open, stat, readFile, SeekMode } = await import("@tauri-apps/plugin-fs");
  const tailLen = OGG_TAIL_RE.test(path) ? OGG_TAIL_BYTES : MP4_TAIL_RE.test(path) ? MP4_TAIL_BYTES : 0;
  try {
    const info = await stat(path);
    const size = Number(info.size) || 0;
    if (size > METADATA_HEAD_BYTES) {
      const handle = await open(path, { read: true });
      try {
        const buffer = new Uint8Array(METADATA_HEAD_BYTES);
        const bytesRead = await handle.read(buffer);
        const head = bytesRead && bytesRead > 0 ? buffer.subarray(0, bytesRead) : buffer.subarray(0, 0);
        let tail: Uint8Array | undefined;
        if (tailLen > 0) {
          try {
            const realTailLen = Math.min(tailLen, size - METADATA_HEAD_BYTES);
            if (realTailLen > 0) {
              await handle.seek(size - realTailLen, SeekMode.Start);
              const tailBuffer = new Uint8Array(realTailLen);
              const tailRead = await handle.read(tailBuffer);
              tail = tailRead && tailRead > 0 ? tailBuffer.subarray(0, tailRead) : undefined;
            }
          } catch {
            tail = undefined; // duration falls back to the audio probe
          }
        }
        return { file: fileFromBytes(head, name, "audio/*"), size, tail };
      } finally {
        try {
          await handle.close();
        } catch {
          /* the handle is released by the runtime even if close errors */
        }
      }
    }
    // Small file: reading it whole is the cheaper code path (no tail needed —
    // the head already contains the entire file).
    const bytes = await readFile(path);
    return { file: fileFromBytes(bytes, name, "audio/*"), size };
  } catch {
    // Graceful degradation to the previous (heavy) behaviour only when the
    // streaming APIs are unavailable at runtime.
    const bytes = await readFile(path);
    return { file: fileFromBytes(bytes, name, "audio/*"), size: bytes.byteLength };
  }
}

async function readDesktopFile(path: string, folder: string): Promise<DesktopImportFile> {
  const name = path.split(/[\\/]/).pop() || "audio";
  const { file, size, tail } = await readAudioHead(path, name);
  return {
    file,
    path,
    folder,
    sourceUrl: await fileSourceUrl(path),
    isPartial: size > METADATA_HEAD_BYTES,
    fileSize: size,
    tailFile: tail ? fileFromBytes(tail, name, "audio/*") : undefined,
  };
}

/** Base name (lowercase, extension stripped) used to match sidecar files. */
function baseNameOf(path: string): string {
  return (path.split(/[\\/]/).pop() || path).replace(/\.[^.]+$/, "").toLowerCase();
}

/** Recursive folder walk. Electron delegates to the main process (one IPC,
 *  filtered by extension there); Tauri uses plugin-fs readDir recursion. */
async function walkFolder(root: string): Promise<string[]> {
  if (isElectron()) {
    try {
      return await window.electronAPI!.walk(root, WALK_EXTENSIONS);
    } catch {
      return []; // removed / inaccessible folder
    }
  }

  const [{ readDir }, { join }] = await Promise.all([
    import("@tauri-apps/plugin-fs"),
    import("@tauri-apps/api/path"),
  ]);
  const out: string[] = [];

  const walk = async (folder: string) => {
    const entries = await readDir(folder);
    for (const entry of entries) {
      const fullPath = await join(folder, entry.name);
      if (entry.isDirectory) await walk(fullPath);
      else if (entry.isFile && (AUDIO_RE.test(entry.name) || TEXT_RE.test(entry.name) || IMAGE_RE.test(entry.name)))
        out.push(fullPath);
    }
  };

  await walk(root);
  return out;
}

export async function chooseMusicFolders(): Promise<string[]> {
  if (isElectron()) {
    try {
      return await window.electronAPI!.pickFolders();
    } catch {
      return [];
    }
  }
  if (!isTauri()) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({ directory: true, multiple: true, title: "Add music folders to Nobody" });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function chooseMusicFiles(): Promise<string[]> {
  if (isElectron()) {
    try {
      return await window.electronAPI!.pickFiles();
    } catch {
      return [];
    }
  }
  if (!isTauri()) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    multiple: true,
    title: "Add music to Nobody",
    filters: [
      { name: "Audio & Lyrics", extensions: ["mp3", "wav", "flac", "ogg", "oga", "opus", "m4a", "aac", "alac", "aif", "aiff", "caf", "webm", "mp4", "wma", "ape", "amr", "3gp", "dsf", "mpc", "lrc", "txt"] },
    ],
  });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
}

export async function loadDesktopFolders(folders: string[]): Promise<DesktopImportFile[]> {
  const results: DesktopImportFile[] = [];
  for (const folder of folders) {
    try {
      const paths = await walkFolder(folder);
      const audioPaths = paths.filter((path) => AUDIO_RE.test(path));
      for (const path of audioPaths) results.push(await readDesktopFile(path, folder));

      /* PHASE-3 memory fix: sidecar .lrc/.txt/.jpg files are only ever used
       * when their base name matches an audio file in the same scan — skip
       * reading (and holding in RAM) every unrelated text/image file. Large
       * libraries with a cover.jpg per album folder no longer preload all
       * that image data up front. */
      const audioBaseNames = new Set(audioPaths.map(baseNameOf));
      const matchesAudio = (path: string) => audioBaseNames.has(baseNameOf(path));

      // Include LRC/TXT files as regular Files so the import engine can match them.
      for (const path of paths.filter((item) => TEXT_RE.test(item) && matchesAudio(item))) {
        const bytes = await desktopReadFile(path);
        const name = path.split(/[\\/]/).pop() || "lyrics.lrc";
        results.push({
          file: fileFromBytes(bytes, name, "text/plain"),
          path,
          folder,
          sourceUrl: await fileSourceUrl(path),
        });
      }

      // Include cover-image files (e.g. same-name .jpg downloaded via the
      // cover-art fetcher) as regular Files too, matched the same way as lrc.
      for (const path of paths.filter((item) => IMAGE_RE.test(item) && matchesAudio(item))) {
        const bytes = await desktopReadFile(path);
        const name = path.split(/[\\/]/).pop() || "cover.jpg";
        const ext = name.split(".").pop()?.toLowerCase() || "jpg";
        results.push({
          file: fileFromBytes(bytes, name, `image/${ext === "jpg" ? "jpeg" : ext}`),
          path,
          folder,
          sourceUrl: await fileSourceUrl(path),
        });
      }
    } catch {
      // A removed or inaccessible folder should not prevent other folders loading.
    }
  }
  return results;
}

/** Writes fetched LRC lyric text next to its audio file on disk, e.g.
 *  ".../Song.mp3" -> ".../Song.lrc", so the app's existing same-name .lrc
 *  matching picks it up automatically on the next scan/import. */
export async function saveLrcFile(sourcePath: string, lrcContent: string): Promise<string> {
  const lrcPath = sourcePath.replace(/\.[^./\\]+$/, "") + ".lrc";
  if (isElectron()) {
    await window.electronAPI!.writeTextFile(lrcPath, lrcContent);
    return lrcPath;
  }
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await writeTextFile(lrcPath, lrcContent);
  return lrcPath;
}

/** Writes fetched cover art bytes next to its audio file on disk, e.g.
 *  ".../Song.mp3" -> ".../Song.jpg", so the app's same-name cover-image
 *  matching picks it up automatically on the next scan/import. */
export async function saveCoverImage(sourcePath: string, bytes: Uint8Array, ext: string): Promise<string> {
  const cleanExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
  const imagePath = sourcePath.replace(/\.[^./\\]+$/, "") + "." + cleanExt;
  if (isElectron()) {
    await window.electronAPI!.writeBinaryFile(imagePath, bytes);
    return imagePath;
  }
  const { writeFile } = await import("@tauri-apps/plugin-fs");
  await writeFile(imagePath, bytes);
  return imagePath;
}

export async function loadDesktopFiles(paths: string[]): Promise<DesktopImportFile[]> {
  const results: DesktopImportFile[] = [];
  for (const path of paths) {
    const parent = path.replace(/[\\/][^\\/]+$/, "");
    try {
      if (AUDIO_RE.test(path)) results.push(await readDesktopFile(path, parent));
      else if (TEXT_RE.test(path)) {
        const bytes = await desktopReadFile(path);
        const name = path.split(/[\\/]/).pop() || "lyrics.lrc";
        results.push({
          file: fileFromBytes(bytes, name, "text/plain"),
          path,
          folder: parent,
          sourceUrl: await fileSourceUrl(path),
        });
      }
      /* V1.2.0: same-name cover images dropped as FILES (drag-and-drop onto a
       * new-UI surface routes real paths through here too) must survive like
       * they do in the folder walker above. */
      else if (IMAGE_RE.test(path)) {
        const bytes = await desktopReadFile(path);
        const name = path.split(/[\\/]/).pop() || "cover.jpg";
        const ext = name.split(".").pop()?.toLowerCase() || "jpg";
        results.push({
          file: fileFromBytes(bytes, name, `image/${ext === "jpg" ? "jpeg" : ext}`),
          path,
          folder: parent,
          sourceUrl: await fileSourceUrl(path),
        });
      }
    } catch {
      // Ignore unreadable paths.
    }
  }
  return results;
}
