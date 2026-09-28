/**
 * Install payload manifest.
 *
 * In the real Setup.exe this table is not hand-written: it is produced by
 * scripts/afterPack-payload.mjs (walk of dist/win-unpacked) and handed to
 * installer.nsi as a single solid app-1.5.0.7z. Nsis7z::ExtractWithFileCallback
 * then gives us (fileName, totalSize, completedSize) per file, and those three
 * numbers are what the equalizer, the readout and the progress bar eat.
 *
 * In this renderer the REAL manifest is owned by the Electron main process:
 * it streams byte-exact ProgressEvents over window.nobodySetup (see
 * shared/contract.ts), and SetupProvider swaps the live TOTAL_BYTES/
 * FILE_COUNT below for ctx.payloadBytes/payloadFiles the moment getContext()
 * resolves. The deterministic table below is therefore the DEV FALLBACK only
 * — it keeps the wizard fully runnable in a plain browser (bun run dev),
 * where the same shape is generated with the same phase boundaries, file
 * kinds and total size as before. The QA panel labels it as simulated,
 * because it is.
 */

export interface PayloadFile {
  name: string;
  size: number;
  phase: number;
}

/** Phase index → LangString key (see installer.nsi §3 and i18n.ts). */
export const PHASE_KEYS = [
  "inst.p1",
  "inst.p2",
  "inst.p3",
  "inst.p4",
  "inst.p5",
  "inst.p6",
] as const;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CORE_DLLS: [string, number][] = [
  ["NOBODY.exe", 193_024],
  ["chrome_100_percent.pak", 108_288],
  ["chrome_200_percent.pak", 156_672],
  ["d3dcompiler_47.dll", 4_280_960],
  ["ffmpeg.dll", 2_674_688],
  ["icudtl.dat", 10_477_568],
  ["libEGL.dll", 712_704],
  ["libGLESv2.dll", 9_371_648],
  ["vk_swiftshader.dll", 5_918_720],
  ["v8_context_snapshot.bin", 1_638_400],
  ["resources.pak", 5_427_200],
  ["snapshot_blob.bin", 1_069_056],
  ["resources\\app.asar", 94_838_784],
  ["resources\\elevate.exe", 131_072],
  ["LICENSE.electron.txt", 71_680],
];

const FONTS: [string, number][] = [
  ["Vazirmatn-Variable.woff2", 145_408],
  ["InterVariable.woff2", 331_776],
  ["JetBrainsMono-Variable.woff2", 187_392],
  ["Michroma-Regular.woff2", 41_984],
  ["nobody-stage.woff2", 22_528],
];

const CODECS: [string, number][] = [
  ["avcodec-61.dll", 15_728_640],
  ["avformat-61.dll", 3_145_728],
  ["avutil-59.dll", 1_048_576],
  ["swresample-5.dll", 524_288],
  ["swscale-8.dll", 786_432],
  ["bass.dll", 1_310_720],
  ["bass_fx.dll", 393_216],
  ["tags.dll", 196_608],
];

const LOCALES = [
  "af", "am", "ar", "bg", "bn", "ca", "cs", "da", "de", "el", "en-GB", "en-US", "es", "et",
  "fa", "fi", "fil", "fr", "gu", "he", "hi", "hr", "hu", "id", "it", "ja", "kn", "ko", "lt",
  "lv", "ml", "mr", "ms", "nb", "nl", "pl", "pt-BR", "pt-PT", "ro", "ru", "sk", "sl", "sr",
  "sv", "sw", "ta", "te", "th", "tr", "uk", "ur", "vi", "zh-CN", "zh-TW",
];

function build(): { files: PayloadFile[]; total: number } {
  const rnd = mulberry32(0x09080b);
  const files: PayloadFile[] = [];

  // phase 1 — core
  for (const [name, size] of CORE_DLLS) files.push({ name, size, phase: 1 });
  for (const loc of LOCALES) {
    files.push({
      name: `locales\\${loc}.pak`,
      size: Math.round(140_000 + rnd() * 620_000),
      phase: 1,
    });
  }

  // phase 2 — fonts (the app ships its own, always)
  for (const [name, size] of FONTS) {
    files.push({ name: `resources\\fonts\\${name}`, size, phase: 2 });
    files.push({
      name: `resources\\fonts\\${name}.meta`,
      size: Math.round(512 + rnd() * 2_048),
      phase: 2,
    });
  }

  // phase 3 — codecs / audio stack
  for (const [name, size] of CODECS) files.push({ name: `codecs\\${name}`, size, phase: 3 });
  for (let i = 0; i < 42; i++) {
    files.push({
      name: `codecs\\presets\\preset-${String(i).padStart(2, "0")}.bin`,
      size: Math.round(4_096 + rnd() * 96_000),
      phase: 3,
    });
  }

  // phase 1 (tail) — the app's own web assets, extracted from the asar
  const webAssets = [
    "index.html", "assets\\index.js", "assets\\index.css", "assets\\stage.js",
    "assets\\voice.js", "assets\\equalizer.js", "assets\\fonts.css",
  ];
  for (const a of webAssets) {
    files.push({
      name: `resources\\app\\${a}`,
      size: Math.round(48_000 + rnd() * 1_400_000),
      phase: 1,
    });
  }

  files.sort((a, b) => a.phase - b.phase || a.name.localeCompare(b.name));
  const total = files.reduce((n, f) => n + f.size, 0);
  return { files, total };
}

const built = build();

/* --- the simulated manifest (DEV FALLBACK ONLY) ---------------------------
 * Same tables, same seed, same totals as the design preview. Never consulted
 * when window.nobodySetup is present: the real pipeline owns the numbers. */
export const SIM_PAYLOAD: PayloadFile[] = built.files;
export const SIM_TOTAL = built.total;

/** Simulated manifest — consumed only by the dev-fallback engine in useSetup. */
export const PAYLOAD = SIM_PAYLOAD;

/* Live totals. Initialised from the simulated manifest so a bare browser
 * render shows exactly the numbers the design preview did; SetupProvider
 * replaces them with the real ctx values via setRealPayload(). Pages import
 * these names unchanged — ESM live bindings keep every readout current. */
export let TOTAL_BYTES = built.total;
export let FILE_COUNT = built.files.length;

export function setRealPayload(totalBytes: number, fileCount: number): void {
  TOTAL_BYTES = totalBytes;
  FILE_COUNT = fileCount;
}

export const MB = 1024 * 1024;

/** "214.6 MB" — mono, tabular, latin digits in every language (like the app). */
export function formatMb(bytes: number): string {
  return `${(bytes / MB).toFixed(1)} MB`;
}

export function formatSize(bytes: number): string {
  if (bytes >= MB) return formatMb(bytes);
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} kB`;
  return `${bytes} B`;
}

/** Deterministic per-file read time so the preview has the same texture as NVMe. */
export function readJitter(index: number): number {
  const t = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return 0.55 + ((t >>> 8) % 1000) / 1000; // 0.55 .. 1.55
}
