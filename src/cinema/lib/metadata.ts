// ── NOBODY · metadata parsing ────────────────────────────────────────────────
// Hand-rolled, header-only reader: ID3v2 (2.2/2.3/2.4) text frames + APIC cover
// + USLT lyrics, ID3v1 fallback, filename fallback. Reads only the tag region
// of a file (never the whole file into memory) — per NOBODY performance rules.

import { AUDIO_EXT, pool } from "./utils";

export interface ParsedMeta {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  lyrics?: string;
  picture?: Blob;
}

// syncsafe 7-bit int (ID3 frame/tag sizes in v2.4 + tag header)
function syncsafe(v: DataView, off: number) {
  return (
    ((v.getUint8(off) & 0x7f) << 21) |
    ((v.getUint8(off + 1) & 0x7f) << 14) |
    ((v.getUint8(off + 2) & 0x7f) << 7) |
    (v.getUint8(off + 3) & 0x7f)
  );
}

function decodeText(bytes: Uint8Array): string {
  if (!bytes.length) return "";
  const enc = bytes[0];
  const body = bytes.subarray(1);
  try {
    if (enc === 0) return new TextDecoder("latin1").decode(body).replace(/\0+$/, "");
    if (enc === 1) return new TextDecoder("utf-16").decode(body).replace(/\0+$/, "");
    if (enc === 2) return new TextDecoder("utf-16be").decode(body).replace(/\0+$/, "");
    return new TextDecoder("utf-8").decode(body).replace(/\0+$/, "");
  } catch {
    return new TextDecoder().decode(body).replace(/\0+$/, "");
  }
}

function terminatorLen(enc: number) {
  return enc === 1 || enc === 2 ? 2 : 1;
}

/** Parse an embedded lyrics frame (USLT / ULT). */
function parseUSLT(bytes: Uint8Array): string | undefined {
  if (bytes.length < 5) return undefined;
  const enc = bytes[0];
  let i = 4; // skip encoding + 3-byte language
  const term = terminatorLen(enc);
  // skip content descriptor
  while (i < bytes.length) {
    if (term === 2) {
      if (bytes[i] === 0 && bytes[i + 1] === 0) { i += 2; break; }
      i += 2;
    } else {
      if (bytes[i] === 0) { i += 1; break; }
      i += 1;
    }
  }
  return decodeText(new Uint8Array([enc, ...bytes.subarray(i)]));
}

/** Parse APIC → cover Blob. */
function parseAPIC(bytes: Uint8Array): Blob | undefined {
  if (bytes.length < 4) return undefined;
  const enc = bytes[0];
  let i = 1;
  // mime (always latin1, null-terminated)
  let mime = "";
  while (i < bytes.length && bytes[i] !== 0) { mime += String.fromCharCode(bytes[i]); i++; }
  i++; // null
  i++; // picture type byte
  const term = terminatorLen(enc);
  // skip description
  while (i < bytes.length) {
    if (term === 2) {
      if (bytes[i] === 0 && bytes[i + 1] === 0) { i += 2; break; }
      i += 2;
    } else {
      if (bytes[i] === 0) { i += 1; break; }
      i += 1;
    }
  }
  if (i >= bytes.length) return undefined;
  const type = mime === "PNG" || /png/i.test(mime) ? "image/png" : "image/jpeg";
  return new Blob([bytes.slice(i).buffer as ArrayBuffer], { type });
}

const V22_MAP: Record<string, string> = {
  TT2: "TIT2", TP1: "TPE1", TAL: "TALB", TYE: "TYER", ULT: "USLT", PIC: "APIC",
};

export async function parseFileMeta(file: File | Blob & { name?: string }): Promise<ParsedMeta> {
  const out: ParsedMeta = {};
  try {
    const headBuf = await file.slice(0, 10).arrayBuffer();
    if (headBuf.byteLength < 10) return out;
    const hv = new DataView(headBuf);
    if (hv.getUint8(0) === 0x49 && hv.getUint8(1) === 0x44 && hv.getUint8(2) === 0x33) {
      const ver = hv.getUint8(3);
      const tagSize = syncsafe(hv, 6);
      const readSize = Math.min(tagSize, 6 * 1024 * 1024); // cap tag read at 6MB
      const buf = await file.slice(10, 10 + readSize).arrayBuffer();
      const v = new DataView(buf);
      const u8 = new Uint8Array(buf);
      let pos = 0;
      const extHeader = ver === 4 && (hv.getUint8(5) & 0x40) !== 0;
      if (extHeader) pos = syncsafe(v, 0) + (ver === 4 ? 0 : 4);
      while (pos + 10 <= buf.byteLength) {
        let id = "";
        let size = 0;
        let dataOff = 0;
        if (ver === 2) {
          id = V22_MAP[String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2])] ?? "";
          if (!/^[A-Z0-9]{4}$/.test(id)) break;
          size = (u8[pos + 3] << 16) | (u8[pos + 4] << 8) | u8[pos + 5];
          dataOff = pos + 6;
          pos = dataOff + size;
        } else {
          id = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
          if (!/^[A-Z0-9]{4}$/.test(id)) break;
          size = ver === 4 ? syncsafe(v, pos + 4) : v.getUint32(pos + 4, false);
          dataOff = pos + 10;
          pos = dataOff + size;
        }
        if (size <= 0 || dataOff + size > buf.byteLength) continue;
        const frame = u8.subarray(dataOff, dataOff + size);
        if (id === "TIT2" && !out.title) out.title = decodeText(frame) || undefined;
        else if (id === "TPE1" && !out.artist) out.artist = decodeText(frame) || undefined;
        else if (id === "TALB" && !out.album) out.album = decodeText(frame) || undefined;
        else if ((id === "TYER" || id === "TDRC") && !out.year) out.year = (decodeText(frame) || "").slice(0, 4) || undefined;
        else if (id === "USLT" && !out.lyrics) out.lyrics = parseUSLT(frame) || undefined;
        else if (id === "APIC" && !out.picture) out.picture = parseAPIC(frame);
      }
    }
    // ID3v1 fallback for missing fields
    if ((!out.title || !out.artist) && file.size > 128) {
      const tail = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
      if (tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47) {
        const rd = (o: number, l: number) => new TextDecoder("latin1").decode(tail.subarray(o, o + l)).replace(/\0+.*$/s, "").trim();
        out.title = out.title || rd(3, 30) || undefined;
        out.artist = out.artist || rd(33, 30) || undefined;
        out.album = out.album || rd(63, 30) || undefined;
        out.year = out.year || rd(93, 4) || undefined;
      }
    }
  } catch {
    /* malformed tags are fine — fallbacks kick in */
  }
  return out;
}

/** Derive title/artist from a filename like "Artist - Title.mp3". */
export function fromFilename(name: string): { title: string; artist?: string } {
  const base = name.replace(AUDIO_EXT, "").replace(/\.[^.]+$/, "").trim();
  const m = base.split(/\s+[-–—]\s+/);
  if (m.length >= 2) return { artist: m[0].trim(), title: m.slice(1).join(" - ").trim() };
  return { title: base.replace(/[_]+/g, " ") };
}

/** Probe duration via <audio> metadata only (streams headers, not whole file),
 *  with bounded concurrency so importing hundreds of files doesn't thrash. */
export async function probeDurations(jobs: { file: Blob; done: (d: number) => void }[]) {
  await pool(jobs, 3, async (job) => {
    const url = URL.createObjectURL(job.file);
    try {
      const d = await new Promise<number>((resolve) => {
        const a = new Audio();
        const to = setTimeout(() => resolve(0), 8000);
        a.preload = "metadata";
        a.onloadedmetadata = () => {
          clearTimeout(to);
          // some formats report Infinity → seek toforce real duration
          if (a.duration === Infinity) {
            a.currentTime = 1e7;
            a.ontimeupdate = () => {
              a.ontimeupdate = null;
              resolve(isFinite(a.duration) ? a.duration : 0);
            };
          } else resolve(a.duration || 0);
        };
        a.onerror = () => { clearTimeout(to); resolve(0); };
        a.src = url;
      });
      job.done(d);
    } finally {
      URL.revokeObjectURL(url); // always release
    }
  });
}
