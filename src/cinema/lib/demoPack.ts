// ── NOBODY · demo pack ───────────────────────────────────────────────────────
// Three tracks synthesized entirely in-browser (OfflineAudioContext → WAV),
// with generated covers and authored synced lyrics. Lets a first-time visitor
// experience playback, visualizers, lyrics and Smart Fetch in one click.

import { db } from "./db";
import { makePlaceholderCover } from "./covers";
import { useLibrary } from "../store/library";
import type { Batch, LrcLine, Track } from "../types";
import { hashId } from "./utils";

const SR = 32000;

interface Composition {
  title: string;
  artist: string;
  album: string;
  year: string;
  seconds: number;
  bpm: number;
  root: number; // midi
  progression: number[]; // semitone offsets per bar
  scale: number[];
  mood: number; // 0..1 brightness
  lyrics: [number, string][];
  fileName: string;
}

function midi(n: number) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

/** Render one composition into a mono Float32 PCM buffer. */
function render(c: Composition): Float32Array {
  const len = Math.floor(c.seconds * SR);
  const out = new Float32Array(len);
  const beat = 60 / c.bpm;
  const bar = beat * 4;

  // noise buffer for hats / air
  const noise = new Float32Array(SR);
  let nseed = 22222;
  for (let i = 0; i < SR; i++) {
    nseed = (nseed * 16807) % 2147483647;
    noise[i] = (nseed / 2147483647) * 2 - 1;
  }

  const addSine = (start: number, dur: number, f0: number, f1: number, amp: number, attack: number) => {
    const s0 = Math.floor(start * SR), s1 = Math.min(len, Math.floor((start + dur) * SR));
    let phase = 0;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR;
      const k = t / dur;
      const f = f0 + (f1 - f0) * k;
      phase += (2 * Math.PI * f) / SR;
      const env = Math.min(1, t / attack) * Math.pow(1 - k, 2);
      out[i] += Math.sin(phase) * amp * env;
    }
  };

  const bars = Math.ceil(c.seconds / bar);
  for (let b = 0; b < bars; b++) {
    const chordRoot = c.root + c.progression[b % c.progression.length];
    const t0 = b * bar;

    // pad: 3 detuned voices per chord tone
    const tones = [0, c.scale[1], c.scale[2]];
    for (const tone of tones) {
      for (let v = 0; v < 3; v++) {
        const det = (v - 1) * (2 + c.mood * 5);
        const dur = bar * 1.05;
        const s0 = Math.floor(t0 * SR), s1 = Math.min(len, Math.floor((t0 + dur) * SR));
        let phase = Math.random() * 6.28;
        for (let i = s0; i < s1; i++) {
          const t = (i - s0) / SR;
          const f = midi(chordRoot + 12 + tone) + det * t * 0.02;
          phase += (2 * Math.PI * (midi(chordRoot + 12 + tone) + det * 0.4)) / SR;
          void f;
          const attack = Math.min(1, t / (beat * 1.4));
          const release = Math.min(1, (dur - t) / (beat * 1.2));
          const lp = 0.5 + 0.5 * Math.sin(t * 0.7 + v); // slow timbre drift
          const v1 = Math.sin(phase);
          const v2 = Math.sin(phase * 2.003) * 0.28 * (0.4 + lp * c.mood);
          out[i] += (v1 + v2) * 0.038 * Math.min(attack, release);
        }
      }
    }

    // sub root
    addSine(t0, bar, midi(chordRoot - 12), midi(chordRoot - 12), 0.16, beat * 0.4);

    // kick on beats 1 & 3
    for (const bt of [0, 2]) addSine(t0 + bt * beat, 0.24, 108, 42, 0.5, 0.004);
    // soft hats offbeat
    for (let h = 0; h < 4; h++) {
      const start = t0 + h * beat + beat / 2;
      const s0 = Math.floor(start * SR);
      const d = Math.floor(0.05 * SR);
      for (let i = 0; i < d && s0 + i < len; i++) {
        const env = 1 - i / d;
        out[s0 + i] += noise[(i * 7) % SR] * env * env * 0.05 * (0.5 + c.mood);
      }
    }

    // sparse pluck melody
    const pluckNotes = Math.floor(2 + c.mood * 3);
    let mseed = b * 7919 + 13;
    const rnd = () => {
      mseed = (mseed * 16807) % 2147483647;
      return mseed / 2147483647;
    };
    for (let p = 0; p < pluckNotes; p++) {
      const when = t0 + Math.floor(rnd() * 8) * (beat / 2);
      const deg = c.scale[Math.floor(rnd() * c.scale.length)];
      const f = midi(chordRoot + 24 + deg);
      // note + two delay taps
      addSine(when, 0.5, f, f * 0.995, 0.11, 0.005);
      addSine(when + beat * 0.75, 0.4, f, f, 0.045, 0.005);
      addSine(when + beat * 1.5, 0.35, f * 2, f * 2, 0.02, 0.005);
    }
  }

  // gentle master: soft clip + fade in/out
  const fade = Math.floor(SR * 1.2);
  for (let i = 0; i < len; i++) {
    let s = out[i];
    s = Math.tanh(s * 1.4) * 0.85;
    if (i < fade) s *= i / fade;
    if (i > len - fade) s *= (len - i) / fade;
    out[i] = s;
  }
  return out;
}

function encodeWav(pcm: Float32Array): Blob {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); wr(8, "WAVE"); wr(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, SR, true); v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  wr(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

const COMPOSITIONS: Composition[] = [
  {
    title: "Midnight Run", artist: "EPODONIOS & The Static", album: "Night Drives", year: "2025",
    seconds: 36, bpm: 88, root: 45, progression: [0, -2, 3, -4], scale: [0, 3, 5, 7, 10],
    mood: 0.65, fileName: "EPODONIOS & The Static - Midnight Run.wav",
    lyrics: [
      [2.5, "The city hums in lower light"],
      [7, "Tail-lights bleeding into night"],
      [11.5, "We're nobody, and that's just fine"],
      [16, "Nobody owns this borderline"],
      [21, "Turn the dial, let the static sing"],
      [25.5, "Midnight runs on everything"],
      [30, "We're nobody — and we drive"],
    ],
  },
  {
    title: "Kâğıt Gemiler", artist: "NOBODY Ensemble", album: "Paper Harbors", year: "2024",
    seconds: 34, bpm: 72, root: 50, progression: [0, -3, 5, 2], scale: [0, 2, 4, 7, 9],
    mood: 0.4, fileName: "NOBODY Ensemble - Kagit Gemiler.wav",
    lyrics: [
      [2.5, "Kâğıttan gemiler uzak limanlara"],
      [8, "Sessizce yüzer gece yarısı"],
      [14, "Kimseler bilmez adımızı"],
      [20, "Biz hiç kimseyiz — özgürüz"],
      [27, "Dalgalar fısıldar eski şarkıları"],
    ],
  },
  {
    title: "شب‌تاب (Firefly)", artist: "EPODONIOS", album: "شب‌های روشن", year: "2025",
    seconds: 38, bpm: 64, root: 43, progression: [0, 5, -4, 2], scale: [0, 2, 3, 7, 8],
    mood: 0.3, fileName: "EPODONIOS - Shabtab.wav",
    lyrics: [
      [3, "در سکوت شب، چراغی کوچک"],
      [9, "شب‌تابی می‌رقصد بر لبِ بام"],
      [15, "هیچ‌کس نیست اگر بگویند"],
      [21, "اما نورش تمام شهر را می‌بیند"],
      [28, "ما هیچ‌کس‌ایم — و شب مال ماست"],
      [34, "…"],
    ],
  },
];

export async function loadDemoPack(t: (k: string) => string): Promise<number> {
  const lib = useLibrary.getState();
  const batch: Batch = { id: "demo", name: t("demoBatch"), count: 0, importedAt: Date.now() };
  const tracks: Track[] = [];
  let added = 0;

  for (const c of COMPOSITIONS) {
    const id = "demo-" + hashId(c.fileName);
    if (lib.tracks[id]) continue;
    const pcm = render(c);
    const wav = encodeWav(pcm);
    const cover = await makePlaceholderCover(c.title, c.artist);
    const track: Track = {
      id,
      title: c.title,
      artist: c.artist,
      album: c.album,
      year: c.year,
      duration: c.seconds,
      format: "wav",
      bitrate: Math.round((wav.size * 8) / c.seconds / 1000),
      hasCover: true,
      isPlaceholderCover: true, // Smart Fetch can replace with real art
      hasEmbeddedLyrics: true,
      syncedLyrics: c.lyrics.map(([tt, text]): LrcLine => ({ t: tt, text })),
      batchId: batch.id,
      importedAt: Date.now(),
      fileName: c.fileName,
      fileSize: wav.size,
      demo: true,
    };
    await db.putFile(id, wav).catch(() => void 0);
    await db.putCover(id, cover).catch(() => void 0);
    tracks.push(track);
    added++;
  }

  if (tracks.length) {
    batch.count = tracks.length;
    useLibrary.getState().addImported(tracks, batch);
  }
  return added;
}
