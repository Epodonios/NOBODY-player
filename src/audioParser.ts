// Native zero-dependency audio metadata, cover-art AND embedded-lyrics extractor.
// PHASE-4: fully replaces the ~1MB `music-metadata` bundle. Everything below
// parses from at most the first 3MB of the file (+ an optional small tail
// slice for formats that keep their metadata/duration at the end of file).
//
// Supported containers:
//   MP3 (ID3v2.3/v2.4 tags + MPEG frame header + Xing/Info duration)
//   FLAC (STREAMINFO + VORBIS_COMMENT + PICTURE blocks)
//   MP4/M4A (moov→mvhd duration + udta→meta→ilst tags/covr/©lyr)
//   OGG / Opus (id headers + VorbisComment + last-page granule duration)
//   WAV (fmt/data chunks + LIST/INFO tags + embedded id3 chunk)
//   AIFF (COMM chunk + embedded id3 chunk)

export interface ParsedAudioMeta {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  cover?: string;
  /** Raw embedded lyric text – may already contain [mm:ss.xx] LRC timestamps. */
  lyrics?: string;
  /* ---- PHASE-4 technical info (previously provided by music-metadata) ---- */
  /** Seconds. Only set when the value is trustworthy (exact header value or
   *  a real-size based estimate); otherwise the caller probes the player. */
  duration?: number;
  container?: string;
  codec?: string;
  /** bits per second */
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

export type ParseAudioOptions = {
  /** Bytes from the physical END of the file. Desktop imports pass a small
   *  tail File; browser imports pass the full File itself. Used to reach an
   *  MP4 `moov` atom written at EOF and the last OggS page (duration). */
  tail?: File | Uint8Array;
  /** Real on-disk size — desktop head-Files only report the 3MB head size. */
  realSize?: number;
};

/** 3 MB captures even large embedded covers + full lyric frames. */
const HEAD_BYTES = 1024 * 1024 * 3;

export async function parseAudioFileMetadata(file: File, options: ParseAudioOptions = {}): Promise<ParsedAudioMeta> {
  try {
    const buffer = await file.slice(0, HEAD_BYTES).arrayBuffer();
    if (buffer.byteLength < 12) return {};
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);

    const realSize = options.realSize ?? file.size;

    // ---- FLAC -------------------------------------------------------------
    /* NOTE: the FLAC stream marker is "fLaC" — CAPITAL C (0x43). The old
       parser compared against 0x63 (lowercase 'c') so the native FLAC path
       NEVER matched; it only worked because music-metadata did all the work.
       Caught by the synthetic-container test suite. */
    if (u8[0] === 0x66 && u8[1] === 0x4c && u8[2] === 0x61 && u8[3] === 0x43) {
      return parseFLAC(buffer, view);
    }

    // ---- OGG / Opus ---------------------------------------------------------
    if (u8[0] === 0x4f && u8[1] === 0x67 && u8[2] === 0x67 && u8[3] === 0x53) {
      const tail = await readTailBytes(options.tail, 256 * 1024);
      return parseOgg(buffer, tail, realSize);
    }

    // ---- MP4 / M4A (ftyp brand box at offset 4) -----------------------------
    if (
      u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70
    ) {
      const tail = await readTailBytes(options.tail, 1024 * 1024);
      return parseMP4(buffer, view, tail);
    }

    // ---- WAV (RIFF) ---------------------------------------------------------
    if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) {
      return parseWav(buffer, view);
    }

    // ---- AIFF (FORM) --------------------------------------------------------
    if (u8[0] === 0x46 && u8[1] === 0x4f && u8[2] === 0x52 && u8[3] === 0x4d) {
      return parseAiff(buffer, view);
    }

    // ---- ID3v2 leading tag (MP3 / WAV-AIFF exports that start with ID3) -----
    if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {
      const meta = parseID3v2(buffer, view, 0);
      // Whatever starts with ID3 and is not RIFF/FORM (checked above) is an
      // MPEG audio stream — read the first frame header for technicals.
      parseMpegStream(buffer, view, id3TagEnd(view), meta, realSize);
      return meta;
    }

    // ---- Raw MPEG stream without ID3 ----------------------------------------
    const meta: ParsedAudioMeta = {};
    parseMpegStream(buffer, view, 0, meta, realSize);
    if (meta.container) return meta;
  } catch {
    // Silent fallback
  }
  return {};
}

/* ========================================================================== */
/* shared helpers                                                              */
/* ========================================================================== */

/** Last `maxBytes` of the physical file. Small files re-serve their own
 *  (already complete) head bytes, bounded by maxBytes. */
async function readTailBytes(source: File | Uint8Array | undefined, maxBytes: number): Promise<Uint8Array | undefined> {
  try {
    if (!source) return undefined;
    if (source instanceof Uint8Array) {
      return source.byteLength > maxBytes ? source.subarray(source.byteLength - maxBytes) : source;
    }
    const size = source.size;
    if (!Number.isFinite(size) || size <= 0) return undefined;
    const start = Math.max(0, size - maxBytes);
    return new Uint8Array(await source.slice(start, size).arrayBuffer());
  } catch {
    return undefined;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000; // 32768 — safe for every JS engine's stack
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const chunk = bytes.subarray(start, start + CHUNK);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return window.btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes("base64,") ? b64.slice(b64.indexOf("base64,") + 7) : b64;
  const binary = window.atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  // 0 = ISO-8859-1, 1 = UTF-16 (BOM), 2 = UTF-16BE, 3 = UTF-8
  const decoder =
    encoding === 1
      ? new TextDecoder("utf-16")
      : encoding === 2
        ? new TextDecoder("utf-16be")
        : encoding === 3
          ? new TextDecoder("utf-8")
          : new TextDecoder("latin1");
  return decoder.decode(bytes).replace(/\0/g, "").trim();
}

function skipNullTerminated(view: DataView, pos: number, end: number, wide: boolean): number {
  if (wide) {
    while (pos + 1 < end && !(view.getUint8(pos) === 0 && view.getUint8(pos + 1) === 0)) pos += 2;
    return pos + 2;
  }
  while (pos < end && view.getUint8(pos) !== 0) pos++;
  return pos + 1;
}

function formatLrcTime(ms: number): string {
  const totalSeconds = ms / 1000;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `[${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}]`;
}

/* ========================================================================== */
/* ID3v2 (MP3 / WAV / AIFF)                                                    */
/* ========================================================================== */

/** Total leading ID3v2 tag length (header + body [+ footer]). */
function id3TagEnd(view: DataView): number {
  const size =
    ((view.getUint8(6) & 0x7f) << 21) |
    ((view.getUint8(7) & 0x7f) << 14) |
    ((view.getUint8(8) & 0x7f) << 7) |
    (view.getUint8(9) & 0x7f);
  const flags = view.getUint8(5);
  return 10 + size + (flags & 0x10 ? 10 : 0);
}

function parseID3v2(buffer: ArrayBuffer, view: DataView, base: number): ParsedAudioMeta {
  const meta: ParsedAudioMeta = {};
  const version = view.getUint8(base + 3);
  const tagSize =
    ((view.getUint8(base + 6) & 0x7f) << 21) |
    ((view.getUint8(base + 7) & 0x7f) << 14) |
    ((view.getUint8(base + 8) & 0x7f) << 7) |
    (view.getUint8(base + 9) & 0x7f);

  let offset = base + 10;
  const maxOffset = Math.min(buffer.byteLength, base + 10 + tagSize);

  while (offset + 10 < maxOffset) {
    if (version < 3) break;

    const frameID = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3),
    );

    if (!frameID.match(/^[A-Z0-9]{4}$/)) break;

    const frameSize =
      version === 4
        ? ((view.getUint8(offset + 4) & 0x7f) << 21) |
          ((view.getUint8(offset + 5) & 0x7f) << 14) |
          ((view.getUint8(offset + 6) & 0x7f) << 7) |
          (view.getUint8(offset + 7) & 0x7f)
        : view.getUint32(offset + 4);

    if (frameSize <= 0 || offset + 10 + frameSize > maxOffset) break;

    const frameStart = offset + 10;
    const frameEnd = frameStart + frameSize;

    if (frameID === "APIC") {
      try {
        const encoding = view.getUint8(frameStart);
        let pos = frameStart + 1;
        let mime = "";
        while (pos < frameEnd && view.getUint8(pos) !== 0) {
          mime += String.fromCharCode(view.getUint8(pos));
          pos++;
        }
        pos++; // null
        pos++; // picture type
        pos = skipNullTerminated(view, pos, frameEnd, encoding === 1 || encoding === 2);

        if (pos < frameEnd) {
          const imgData = new Uint8Array(buffer, pos, frameEnd - pos);
          meta.cover = `data:${mime || "image/jpeg"};base64,${bytesToBase64(imgData)}`;
        }
      } catch {
        /* ignore */
      }
    } else if (frameID === "USLT") {
      // Unsynchronised lyrics — very often contains full LRC text with timestamps.
      try {
        const encoding = view.getUint8(frameStart);
        let pos = frameStart + 1 + 3; // skip language code
        pos = skipNullTerminated(view, pos, frameEnd, encoding === 1 || encoding === 2); // descriptor
        if (pos < frameEnd) {
          const text = decodeText(new Uint8Array(buffer, pos, frameEnd - pos), encoding);
          if (text && (!meta.lyrics || text.length > meta.lyrics.length)) meta.lyrics = text;
        }
      } catch {
        /* ignore */
      }
    } else if (frameID === "SYLT") {
      // Synchronised lyrics — convert to LRC format so the existing parser can sync them.
      try {
        const encoding = view.getUint8(frameStart);
        const wide = encoding === 1 || encoding === 2;
        let pos = frameStart + 1 + 3; // language
        const timeFormat = view.getUint8(pos); // 1 = MPEG frames, 2 = milliseconds
        pos += 1;
        pos += 1; // content type
        pos = skipNullTerminated(view, pos, frameEnd, wide); // descriptor

        const lines: string[] = [];
        while (pos < frameEnd - 4) {
          const textStart = pos;
          pos = skipNullTerminated(view, pos, frameEnd, wide);
          const textEnd = wide ? pos - 2 : pos - 1;
          if (textEnd <= textStart || pos + 4 > frameEnd) break;
          const text = decodeText(new Uint8Array(buffer, textStart, textEnd - textStart), encoding);
          const stamp = view.getUint32(pos);
          pos += 4;
          if (timeFormat === 2 && text) {
            lines.push(`${formatLrcTime(stamp)}${text.replace(/^\n+/, "")}`);
          }
        }
        if (lines.length > 1) {
          const lrc = lines.join("\n");
          if (!meta.lyrics || lrc.length > meta.lyrics.length) meta.lyrics = lrc;
        }
      } catch {
        /* ignore */
      }
    } else if (
      frameID === "TIT2" ||
      frameID === "TPE1" ||
      frameID === "TPE2" ||
      frameID === "TALB" ||
      frameID === "TYER" ||
      frameID === "TDRC"
    ) {
      try {
        const encoding = view.getUint8(frameStart);
        const text = decodeText(new Uint8Array(buffer, frameStart + 1, frameSize - 1), encoding);
        if (text) {
          if (frameID === "TIT2") meta.title = text;
          else if (frameID === "TPE1") meta.artist = text;
          else if (frameID === "TPE2") meta.artist ||= text;
          else if (frameID === "TALB") meta.album = text;
          else meta.year = text.slice(0, 4);
        }
      } catch {
        /* ignore */
      }
    }

    offset += 10 + frameSize;
  }

  return meta;
}

/* ========================================================================== */
/* MPEG audio frame header + Xing/Info (MP3/MP2 technicals + duration)         */
/* ========================================================================== */

const MPEG_SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

const MPEG_BITRATES: Record<string, number[]> = {
  // `${versionBits}-${layerBits}` -> kbps table (index 0 and 15 are invalid)
  // versionBits: 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5. layerBits: 3 = Layer I,
  // 2 = Layer II, 1 = Layer III.
  "3-3": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], // MPEG1  L1
  "3-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], // MPEG1  L2
  "3-1": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // MPEG1  L3
  "2-3": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], // MPEG2  L1
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // MPEG2  L2
  "2-1": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // MPEG2  L3
  "0-3": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], // MPEG2.5 L1
  "0-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // MPEG2.5 L2
  "0-1": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // MPEG2.5 L3
};

function parseMpegStream(buffer: ArrayBuffer, view: DataView, from: number, meta: ParsedAudioMeta, realSize: number): void {
  const u8 = new Uint8Array(buffer);
  const searchEnd = Math.min(u8.length - 4, from + 65536);
  for (let i = Math.max(0, from); i < searchEnd; i++) {
    if (u8[i] !== 0xff || (u8[i + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (u8[i + 1] >> 3) & 3; // 0=2.5, 2=2, 3=1
    const layerBits = (u8[i + 1] >> 1) & 3; // 1=III, 2=II, 3=I
    const bitrateIdx = (u8[i + 2] >> 4) & 15;
    const srIdx = (u8[i + 2] >> 2) & 3;
    const mode = (u8[i + 3] >> 6) & 3; // 3 = mono

    if (versionBits === 1 || layerBits === 0 || bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) continue;

    const rates = MPEG_SAMPLE_RATES[versionBits];
    const bitrateTable = MPEG_BITRATES[`${versionBits}-${layerBits}`];
    if (!rates || !bitrateTable) continue;

    const sampleRate = rates[srIdx];
    const kbps = bitrateTable[bitrateIdx];
    if (!sampleRate || !kbps) continue;

    meta.container = "MPEG";
    meta.codec = layerBits === 1 ? "MP3" : layerBits === 2 ? "MP2" : "MP1";
    meta.sampleRate = sampleRate;
    meta.channels = mode === 3 ? 1 : 2;
    meta.bitrate = kbps * 1000;

    const samplesPerFrame = layerBits === 3 ? 384 : versionBits === 3 ? 1152 : 576; // L1 / L2 / L3(v2,2.5)

    // Xing/Info frame → exact duration without scanning the whole file.
    try {
      const sideInfo = versionBits === 3 ? (mode === 3 ? 17 : 32) : mode === 3 ? 9 : 17;
      const xingPos = i + 4 + sideInfo;
      if (xingPos + 16 <= u8.length) {
        const word = String.fromCharCode(u8[xingPos], u8[xingPos + 1], u8[xingPos + 2], u8[xingPos + 3]);
        if (word === "Xing" || word === "Info") {
          const flags = view.getUint32(xingPos + 4);
          if (flags & 1) {
            const frames = view.getUint32(xingPos + 8);
            if (frames > 0) meta.duration = (frames * samplesPerFrame) / sampleRate;
          }
        }
      }
    } catch {
      /* ignore */
    }

    // Fallback: real-size/bitrate estimate (same heuristic music-metadata used).
    if (!meta.duration && realSize > 0) {
      meta.duration = (realSize * 8) / meta.bitrate;
    }
    return;
  }
}

/* ========================================================================== */
/* shared Vorbis comment fields (FLAC + OGG)                                   */
/* ========================================================================== */

/** Parses "KEY=value" Vorbis comment fields. `pos` must point at the vendor
 *  length; `end` bounds the comment block. */
function parseVorbisFields(bytes: Uint8Array, pos: number, end: number, meta: ParsedAudioMeta): void {
  if (pos + 8 > end || end > bytes.byteLength) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vendorLen = view.getUint32(pos, true);
  pos += 4 + vendorLen;
  if (pos + 4 > end) return;
  const count = view.getUint32(pos, true);
  pos += 4;
  const utf8 = new TextDecoder("utf-8");

  for (let i = 0; i < count && pos + 4 <= end; i++) {
    const fieldLen = view.getUint32(pos, true);
    pos += 4;
    if (fieldLen > end - pos) break;
    const field = utf8.decode(bytes.subarray(pos, pos + fieldLen));
    pos += fieldLen;

    const eq = field.indexOf("=");
    if (eq < 0) continue;
    const key = field.slice(0, eq).toUpperCase();
    const value = field.slice(eq + 1).trim();
    if (!value) continue;

    if (key === "TITLE") meta.title ||= value;
    else if (key === "ARTIST") meta.artist ||= value;
    else if (key === "ALBUM") meta.album ||= value;
    else if (key === "DATE" || key === "YEAR") meta.year ||= value.slice(0, 4);
    else if (
      key === "LYRICS" ||
      key === "UNSYNCEDLYRICS" ||
      key === "UNSYNCED LYRICS" ||
      key === "SYNCEDLYRICS"
    ) {
      if (!meta.lyrics || value.length > meta.lyrics.length) meta.lyrics = value;
    } else if (key === "METADATA_BLOCK_PICTURE" && !meta.cover) {
      try {
        meta.cover = parseFlacPicture(base64ToBytes(value));
      } catch {
        /* ignore */
      }
    }
  }
}

/** Parses a FLAC PICTURE block payload (also used for OGG
 *  METADATA_BLOCK_PICTURE after base64 decoding). */
function parseFlacPicture(data: Uint8Array): string | undefined {
  if (data.byteLength < 32) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = 0;
  pos += 4; // picture type
  const mimeLen = view.getUint32(pos);
  pos += 4;
  let mime = "";
  for (let i = 0; i < mimeLen && pos + i < data.byteLength; i++) mime += String.fromCharCode(data[pos + i]);
  pos += mimeLen;
  const descLen = view.getUint32(pos);
  pos += 4 + descLen;
  pos += 16; // width, height, depth, colors
  if (pos + 4 > data.byteLength) return undefined;
  const dataLen = view.getUint32(pos);
  pos += 4;
  if (dataLen <= 0 || pos + dataLen > data.byteLength) return undefined;
  return `data:${mime || "image/jpeg"};base64,${bytesToBase64(data.subarray(pos, pos + dataLen))}`;
}

/* ========================================================================== */
/* FLAC                                                                        */
/* ========================================================================== */

function parseFLAC(buffer: ArrayBuffer, view: DataView): ParsedAudioMeta {
  const meta: ParsedAudioMeta = { container: "FLAC", codec: "FLAC" };
  let offset = 4; // skip "fLaC"
  const maxOffset = buffer.byteLength;

  while (offset + 4 < maxOffset) {
    const header = view.getUint8(offset);
    const isLast = (header & 0x80) !== 0;
    const blockType = header & 0x7f;
    const blockSize =
      (view.getUint8(offset + 1) << 16) | (view.getUint8(offset + 2) << 8) | view.getUint8(offset + 3);

    offset += 4;
    if (offset + blockSize > maxOffset) break;

    if (blockType === 0) {
      // STREAMINFO — always the first block. Gives exact duration + technicals.
      try {
        const b = (i: number) => view.getUint8(offset + i);
        const sampleRate = (b(10) << 12) | (b(11) << 4) | (b(12) >> 4);
        const channels = ((b(12) >> 1) & 0x07) + 1;
        const bitDepth = (((b(12) & 0x01) << 4) | (b(13) >> 4)) + 1;
        const totalSamples =
          (b(13) & 0x0f) * 4294967296 + b(14) * 16777216 + (b(15) << 16 | b(16) << 8 | b(17));
        if (sampleRate > 0) {
          meta.sampleRate = sampleRate;
          meta.channels = channels;
          meta.bitDepth = bitDepth;
          if (totalSamples > 0) meta.duration = totalSamples / sampleRate;
        }
      } catch {
        /* ignore */
      }
    } else if (blockType === 4) {
      // VORBIS_COMMENT — little-endian lengths, "KEY=value" fields.
      try {
        parseVorbisFields(new Uint8Array(buffer, offset, blockSize), 0, blockSize, meta);
      } catch {
        /* ignore */
      }
    } else if (blockType === 6) {
      // PICTURE
      try {
        meta.cover ||= parseFlacPicture(new Uint8Array(buffer, offset, blockSize));
      } catch {
        /* ignore */
      }
    }

    if (isLast) break;
    offset += blockSize;
  }

  return meta;
}

/* ========================================================================== */
/* MP4 / M4A                                                                   */
/* ========================================================================== */

/** Walks ISO-BMFF boxes within [start, end). Calls `visit(type, bodyStart,
 *  bodyEnd)` for each direct child. Bounds-checked; never throws on corrupt
 *  input (a broken size just ends the walk). */
function walkBoxes(
  view: DataView,
  start: number,
  end: number,
  visit: (type: string, bodyStart: number, bodyEnd: number) => void,
): void {
  let pos = start;
  const limit = Math.min(end, view.byteLength);
  while (pos + 8 <= limit) {
    let size = view.getUint32(pos);
    let headerSize = 8;
    if (size === 1) {
      if (pos + 16 > limit) break;
      const hi = view.getUint32(pos + 8);
      const lo = view.getUint32(pos + 12);
      size = hi * 4294967296 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = limit - pos; // box extends to the end of the buffer
    }
    if (size < headerSize) break;
    const type = String.fromCharCode(
      view.getUint8(pos + 4),
      view.getUint8(pos + 5),
      view.getUint8(pos + 6),
      view.getUint8(pos + 7),
    );
    visit(type, pos + headerSize, Math.min(limit, pos + size));
    pos += size;
  }
}

const MP4_TEXT_FIELDS: Record<string, "title" | "artist" | "album" | "year" | "lyrics"> = {
  "\u00A9nam": "title",
  "\u00A9ART": "artist",
  aART: "artist",
  "\u00A9alb": "album",
  "\u00A9day": "year",
  "\u00A9lyr": "lyrics",
};

function parseIlst(view: DataView, start: number, end: number, meta: ParsedAudioMeta): void {
  walkBoxes(view, start, end, (itemType, itemBody, itemEnd) => {
    walkBoxes(view, itemBody, itemEnd, (childType, childBody, childEnd) => {
      if (childType !== "data" || childBody + 8 > childEnd) return;
      const kind = view.getUint32(childBody) & 0xffffff; // version(8) + flags(24)
      const bytes = new Uint8Array(view.buffer, view.byteOffset + childBody + 8, childEnd - childBody - 8);

      if (itemType === "covr") {
        if (!meta.cover) {
          const mime = kind === 14 ? "image/png" : "image/jpeg";
          meta.cover = `data:${mime};base64,${bytesToBase64(bytes)}`;
        }
        return;
      }

      const field = MP4_TEXT_FIELDS[itemType];
      if (!field) return;
      const value = new TextDecoder("utf-8").decode(bytes).replace(/\0/g, "").trim();
      if (!value) return;
      if (field === "year") {
        meta.year ||= value.slice(0, 4);
      } else if (field === "lyrics") {
        if (!meta.lyrics || value.length > meta.lyrics.length) meta.lyrics = value;
      } else if (field === "artist") {
        meta.artist ||= value;
      } else {
        meta[field] ||= value;
      }
    });
  });
}

/** `meta` boxes carry 4 version/flag bytes before their child boxes. */
function parseMetaBox(view: DataView, start: number, end: number, meta: ParsedAudioMeta): void {
  walkBoxes(view, start + 4, end, (type, bodyStart, bodyEnd) => {
    if (type === "ilst") parseIlst(view, bodyStart, bodyEnd, meta);
  });
}

function parseMvhd(view: DataView, bodyStart: number, meta: ParsedAudioMeta): void {
  try {
    const version = view.getUint8(bodyStart);
    let timescale = 0;
    let duration = 0;
    if (version === 1 && bodyStart + 32 <= view.byteLength) {
      timescale = view.getUint32(bodyStart + 20);
      duration = view.getUint32(bodyStart + 28) * 4294967296 + view.getUint32(bodyStart + 24);
    } else if (bodyStart + 20 <= view.byteLength) {
      timescale = view.getUint32(bodyStart + 12);
      duration = view.getUint32(bodyStart + 16);
    }
    if (timescale > 0 && duration > 0) meta.duration = duration / timescale;
  } catch {
    /* ignore */
  }
}

function parseMP4(buffer: ArrayBuffer, view: DataView, tail: Uint8Array | undefined): ParsedAudioMeta {
  const meta: ParsedAudioMeta = { container: "MP4" };

  // Container hint from the ftyp major brand ("M4A " for audio-only files).
  try {
    const brand = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11),
    );
    if (brand.startsWith("M4A")) meta.container = "M4A";
  } catch {
    /* ignore */
  }

  let foundMoov = false;

  walkBoxes(view, 0, buffer.byteLength, (type, bodyStart, bodyEnd) => {
    if (type === "moov") {
      foundMoov = true;
      walkBoxes(view, bodyStart, bodyEnd, (childType, cbs, cbe) => {
        if (childType === "mvhd") parseMvhd(view, cbs, meta);
        else if (childType === "meta") parseMetaBox(view, cbs, cbe, meta);
        else if (childType === "udta") {
          walkBoxes(view, cbs, cbe, (t, s, e) => {
            if (t === "meta") parseMetaBox(view, s, e, meta);
          });
        } else if (childType === "trak") {
          // trak → mdia → minf → stbl → stsd (codec sample entry)
          walkBoxes(view, cbs, cbe, (t2, s2, e2) => {
            if (t2 !== "mdia") return;
            walkBoxes(view, s2, e2, (t3, s3, e3) => {
              if (t3 !== "minf") return;
              walkBoxes(view, s3, e3, (t4, s4, e4) => {
                if (t4 !== "stbl") return;
                walkBoxes(view, s4, e4, (t5, s5, e5) => {
                  if (t5 !== "stsd" || s5 + 8 > e5 || meta.codec) return;
                  const codec = String.fromCharCode(
                    view.getUint8(s5 + 8),
                    view.getUint8(s5 + 9),
                    view.getUint8(s5 + 10),
                    view.getUint8(s5 + 11),
                  ).trim();
                  if (!codec) return;
                  const codecs: Record<string, string> = {
                    mp4a: "AAC",
                    alac: "ALAC",
                    "ac-3": "AC-3",
                    Opus: "Opus",
                    fLaC: "FLAC",
                    samr: "AMR",
                    sqcp: "QCELP",
                  };
                  meta.codec = codecs[codec] || codec;
                });
              });
            });
          });
        }
      });
    }
  });

  // moov written at EOF (common for QuickTime/iTunes encodes): retry on the
  // tail slice. Bounds-checked, so a truncated moov still yields mvhd.
  if ((!foundMoov || (!meta.duration && !meta.title)) && tail && tail.byteLength > 8) {
    try {
      const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
      const searchEnd = Math.min(tail.byteLength - 4, 4194304);
      for (let i = 0; i < searchEnd; i++) {
        if (
          tail[i] === 0x6d && tail[i + 1] === 0x6f && tail[i + 2] === 0x6f && tail[i + 3] === 0x76 && // "moov"
          i >= 4
        ) {
          const boxStart = i - 4;
          let size = tailView.getUint32(boxStart);
          if (size >= 8 && boxStart + size <= tail.byteLength) {
            const before = { ...meta };
            walkBoxes(tailView, boxStart + 8, Math.min(tail.byteLength, boxStart + size), (t, s, e) => {
              if (t === "mvhd") parseMvhd(tailView, s, meta);
              else if (t === "meta") parseMetaBox(tailView, s, e, meta);
              else if (t === "udta") {
                walkBoxes(tailView, s, e, (t2, s2, e2) => {
                  if (t2 === "meta") parseMetaBox(tailView, s2, e2, meta);
                });
              }
            });
            // Keep head-derived values if the tail copy is truncated.
            meta.title = before.title || meta.title;
            meta.artist = before.artist || meta.artist;
            meta.album = before.album || meta.album;
            meta.cover = before.cover || meta.cover;
            meta.lyrics = before.lyrics || meta.lyrics;
          }
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return meta;
}

/* ========================================================================== */
/* OGG / Opus                                                                  */
/* ========================================================================== */

function parseOgg(buffer: ArrayBuffer, tail: Uint8Array | undefined, realSize: number): ParsedAudioMeta {
  const meta: ParsedAudioMeta = { container: "OGG" };
  const u8 = new Uint8Array(buffer);

  // Gather the payload of the first pages (id header + comment header live here).
  let cursor = 0;
  const payload: number[] = [];
  for (let page = 0; page < 32 && cursor + 27 <= u8.length; page++) {
    if (!(u8[cursor] === 0x4f && u8[cursor + 1] === 0x67 && u8[cursor + 2] === 0x67 && u8[cursor + 3] === 0x53)) break;
    const segments = u8[cursor + 26];
    let pageSize = 27 + segments;
    for (let s = 0; s < segments; s++) pageSize += u8[cursor + 27 + s];
    if (cursor + pageSize > u8.length) break;
    for (let s = 0; s < segments; s++) {
      const segLen = u8[cursor + 27 + s];
      const segStart = cursor + 27 + segments + payloadPageOffset(u8, cursor, s);
      for (let i = 0; i < segLen; i++) payload.push(u8[segStart + i]);
    }
    cursor += pageSize;
  }

  const p = new Uint8Array(payload);
  const has = (offset: number, word: string) => {
    for (let i = 0; i < word.length; i++) if (p[offset + i] !== word.charCodeAt(i)) return false;
    return true;
  };

  let sampleRate = 0;
  let preSkip = 0;
  let isOpus = false;

  if (p.length >= 30 && has(0, "\x01vorbis")) {
    // identification header: version(4) channels(1) rate(4) ...
    meta.channels = p[11];
    sampleRate = p[12] | (p[13] << 8) | (p[14] << 16) | (p[15] << 24);
    const nominal = p[20] | (p[21] << 8) | (p[22] << 16) | (p[23] << 24);
    meta.sampleRate = sampleRate;
    meta.codec = "Vorbis";
    if (nominal > 0) meta.bitrate = nominal;
  } else if (p.length >= 19 && has(0, "OpusHead")) {
    isOpus = true;
    meta.channels = p[9];
    preSkip = p[10] | (p[11] << 8);
    const inputRate = p[12] | (p[13] << 8) | (p[14] << 16) | (p[15] << 24);
    meta.sampleRate = inputRate || 48000;
    meta.codec = "Opus";
  }

  // comment header (vorbis: 0x03"vorbis" — opus: "OpusTags")
  for (let i = 1; i < p.length - 8; i++) {
    if (has(i, "\x03vorbis")) {
      parseVorbisFields(p, i + 7, p.length, meta);
      break;
    }
    if (has(i, "OpusTags")) {
      parseVorbisFields(p, i + 8, p.length, meta);
      break;
    }
  }

  // duration: granule position of the LAST page. Only trust bytes that are
  // known to reach the physical end of the file (the tail slice, or the head
  // itself when it contains the whole file — never a truncated head).
  const headIsWhole = realSize <= buffer.byteLength;
  const endBytes = tail && tail.byteLength > 64 ? tail : headIsWhole ? u8 : undefined;
  if (endBytes) {
    for (let i = endBytes.byteLength - 4; i >= 0; i--) {
      if (endBytes[i] === 0x4f && endBytes[i + 1] === 0x67 && endBytes[i + 2] === 0x67 && endBytes[i + 3] === 0x53) {
        const endView = new DataView(endBytes.buffer, endBytes.byteOffset, endBytes.byteLength);
        if (i + 14 <= endBytes.byteLength) {
          const lo = endView.getUint32(i + 6, true);
          const hi = endView.getUint32(i + 10, true);
          const granule = hi * 4294967296 + lo;
          if (isOpus) {
            meta.duration = Math.max(0, (granule - preSkip) / 48000);
          } else if (sampleRate > 0) {
            meta.duration = granule / sampleRate;
          }
        }
        break;
      }
    }
  }

  return meta;
}

/** Byte offset of segment `s` inside the page that starts at `pageStart`. */
function payloadPageOffset(u8: Uint8Array, pageStart: number, s: number): number {
  let offset = 0;
  for (let i = 0; i < s; i++) offset += u8[pageStart + 27 + i];
  return offset;
}

/* ========================================================================== */
/* WAV (RIFF)                                                                  */
/* ========================================================================== */

function parseWav(buffer: ArrayBuffer, view: DataView): ParsedAudioMeta {
  const meta: ParsedAudioMeta = { container: "WAV" };
  const u8 = new Uint8Array(buffer);
  let pos = 12; // skip RIFF + size + "WAVE"

  while (pos + 8 <= buffer.byteLength) {
    const id = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
    const size = view.getUint32(pos + 4, true);
    const body = pos + 8;
    if (size === 0 || body + size > buffer.byteLength) {
      if (size === 0) {
        pos = body;
        continue;
      }
      break;
    }

    if (id === "fmt " && size >= 16) {
      const audioFormat = view.getUint16(body, true);
      meta.channels = view.getUint16(body + 2, true) || undefined;
      meta.sampleRate = view.getUint32(body + 4, true) || undefined;
      const byteRate = view.getUint32(body + 8, true);
      meta.bitDepth = view.getUint16(body + 14, true) || undefined;
      meta.bitrate = byteRate ? byteRate * 8 : undefined;
      meta.codec =
        audioFormat === 3 ? "PCM Float" : audioFormat === 6 ? "ALAW" : audioFormat === 7 ? "ULAW" : "PCM";
    } else if (id === "data") {
      const byteRate = meta.bitrate ? meta.bitrate / 8 : 0;
      if (byteRate > 0) meta.duration = size / byteRate;
    } else if (id === "LIST" && size > 4) {
      // LIST/INFO metadata chunks (INAM/IART/IPRD/ICRD)
      try {
        const formType = String.fromCharCode(u8[body], u8[body + 1], u8[body + 2], u8[body + 3]);
        if (formType === "INFO") {
          let sub = body + 4;
          const end = body + size;
          while (sub + 8 <= end) {
            const subId = String.fromCharCode(u8[sub], u8[sub + 1], u8[sub + 2], u8[sub + 3]);
            const subSize = view.getUint32(sub + 4, true);
            const subBody = sub + 8;
            if (subBody + subSize > end) break;
            const value = new TextDecoder("latin1")
              .decode(u8.subarray(subBody, subBody + subSize))
              .replace(/\0/g, "")
              .trim();
            if (value) {
              if (subId === "INAM") meta.title ||= value;
              else if (subId === "IART") meta.artist ||= value;
              else if (subId === "IPRD") meta.album ||= value;
              else if (subId === "ICRD") meta.year ||= value.slice(0, 4);
            }
            sub = subBody + subSize + (subSize % 2);
          }
        }
      } catch {
        /* ignore */
      }
    } else if (id === "id3 " || id === "ID3 ") {
      try {
        const id3 = parseID3v2(buffer, view, body);
        meta.title ||= id3.title;
        meta.artist ||= id3.artist;
        meta.album ||= id3.album;
        meta.year ||= id3.year;
        meta.cover ||= id3.cover;
        meta.lyrics ||= id3.lyrics;
      } catch {
        /* ignore */
      }
    }

    pos = body + size + (size % 2); // chunks are word-aligned
  }

  return meta;
}

/* ========================================================================== */
/* AIFF / AIFC                                                                 */
/* ========================================================================== */

/** 80-bit IEEE 754 extended float (big endian) used in AIFF COMM chunks. */
function readIbm80(view: DataView, pos: number): number {
  const exponent = ((view.getUint8(pos) & 0x7f) << 8) | view.getUint8(pos + 1);
  const hi = view.getUint32(pos + 2);
  const lo = view.getUint32(pos + 6);
  const mantissa = hi * 4294967296 + lo;
  if (exponent === 0 && mantissa === 0) return 0;
  return mantissa * 2 ** (exponent - 16383 - 63);
}

function parseAiff(buffer: ArrayBuffer, view: DataView): ParsedAudioMeta {
  const meta: ParsedAudioMeta = { container: "AIFF", codec: "PCM" };
  const u8 = new Uint8Array(buffer);
  let pos = 12; // skip FORM + size + AIFF/AIFC

  while (pos + 8 <= buffer.byteLength) {
    const id = String.fromCharCode(u8[pos], u8[pos + 1], u8[pos + 2], u8[pos + 3]);
    const size = view.getUint32(pos + 4);
    const body = pos + 8;
    if (size === 0 || body + size > buffer.byteLength) break;

    if (id === "COMM" && size >= 18) {
      meta.channels = view.getUint16(body) || undefined;
      const frames = view.getUint32(body + 2);
      meta.bitDepth = view.getUint16(body + 6) || undefined;
      const rate = readIbm80(view, body + 8);
      meta.sampleRate = Math.round(rate) || undefined;
      if (rate > 0 && frames > 0) {
        meta.duration = frames / rate;
        if (meta.sampleRate && meta.bitDepth) meta.bitrate = rate * (meta.channels || 2) * meta.bitDepth;
      }
    } else if (id === "id3 " || id === "ID3 ") {
      try {
        const id3 = parseID3v2(buffer, view, body);
        meta.title ||= id3.title;
        meta.artist ||= id3.artist;
        meta.album ||= id3.album;
        meta.year ||= id3.year;
        meta.cover ||= id3.cover;
        meta.lyrics ||= id3.lyrics;
      } catch {
        /* ignore */
      }
    }

    pos = body + size + (size % 2);
  }

  return meta;
}
