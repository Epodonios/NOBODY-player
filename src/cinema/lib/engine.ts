// ── NOBODY · audio engine (module singleton) ─────────────────────────────────
// HTMLAudioElement + WebAudio analyser. Coarse events only — the per-frame
// hooks (currentTime, analyser bytes) are read directly by components via rAF,
// never funneled through React state.

import { db } from "./db";
import { Emitter, clamp } from "./utils";
import { getBridge } from "./desktopBridge";
import { useLibrary } from "../store/library";
import { useUi, uiApi } from "../store/ui";
import { useSettings } from "../store/settings";
import type { RepeatMode } from "../types";
import { onMediaKey } from "../../mediaKeys";
import { getUiMode } from "../../uiMode";

const RESUME_KEY = "nobody-resume";

interface ResumeBlob {
  trackId: string | null;
  position: number;
  queue: string[];
  repeat: RepeatMode;
  shuffle: boolean;
  volume: number;
}

class Engine extends Emitter<"state" | "track"> {
  audio: HTMLAudioElement;
  queue: string[] = [];
  order: number[] = []; // positions into queue (identity, or shuffled)
  pos = 0;
  repeat: RepeatMode = "off";
  shuffle = false;
  private actx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private freq: Uint8Array<ArrayBuffer> | null = null;
  private objectUrl: string | null = null;
  private objectUrlOwned = false; // only revoke URLs this engine created (bridge URLs belong to classic)
  private playedMs = 0;
  private lastTick = 0;
  private loggedRecent = false;
  private saveTimer: number | null = null;

  // ── equalizer (WebAudio peaking filters) ──
  static readonly EQ_FREQS = [60, 150, 400, 1000, 2400, 15000];
  private eqNodes: BiquadFilterNode[] = [];
  private preamp: GainNode | null = null;
  eqEnabled = false;
  eqGains: number[] = [0, 0, 0, 0, 0, 0]; // dB per band, -12..+12

  constructor() {
    super();
    this.audio = new Audio();
    this.audio.preload = "auto";
    this.audio.addEventListener("ended", () => this.onEnded());
    this.audio.addEventListener("play", () => {
      // covers every start path (handoff, media keys, resume) — the classic
      // element must never keep playing while this engine is audible
      this.silenceClassic();
      this.pushState();
    });
    this.audio.addEventListener("pause", () => this.pushState());
    this.audio.addEventListener("timeupdate", () => this.onTick());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.saveResume();
    });
    window.addEventListener("beforeunload", () => this.saveResume());
  }

  // ── state mirror ────────────────────────────────────────────────────────────
  pushState() {
    const currentId = this.queue[this.order[this.pos]] ?? null;
    useUi.getState().mirror({
      currentId,
      isPlaying: !this.audio.paused,
      repeat: this.repeat,
      shuffle: this.shuffle,
      queueLength: this.queue.length,
      queueIndex: this.pos,
      // LISTEN order (shuffle-aware) — mirrors what next/prev actually plays,
      // so queue sheets can use display indexes for jump/remove/reorder.
      queueIds: this.order.map((q) => this.queue[q]).filter(Boolean),
      hasAudio: !!this.audio.src,
    });
    this.emit("state");
  }

  get currentId(): string | null {
    return this.queue[this.order[this.pos]] ?? null;
  }

  /** LISTEN order (shuffle-aware) ids — what next/prev will actually play. */
  get queueIds(): string[] {
    return this.order.map((q) => this.queue[q]).filter(Boolean);
  }

  get analyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  /** Frequency bytes for the current frame, or null when analyser unavailable. */
  freqData(): Uint8Array | null {
    if (!this.analyserNode || !this.freq) return null;
    this.analyserNode.getByteFrequencyData(this.freq);
    return this.freq;
  }

  private ensureGraph() {
    if (this.actx) {
      if (this.actx.state === "suspended") this.actx.resume().catch(() => void 0);
      return;
    }
    try {
      this.actx = new AudioContext();
      const src = this.actx.createMediaElementSource(this.audio);
      // preamp → 6 peaking bands → analyser → destination
      this.preamp = this.actx.createGain();
      this.eqNodes = Engine.EQ_FREQS.map((f, i) => {
        const node = this.actx!.createBiquadFilter();
        node.type = "peaking";
        node.frequency.value = f;
        node.Q.value = 1.1;
        node.gain.value = this.eqGains[i] ?? 0;
        return node;
      });
      const analyser = this.actx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      let chain: AudioNode = src;
      chain.connect(this.preamp);
      chain = this.preamp;
      for (const node of this.eqNodes) { chain.connect(node); chain = node; }
      chain.connect(analyser);
      analyser.connect(this.actx.destination);
      this.analyserNode = analyser;
      this.freq = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    } catch {
      /* graph optional — playback still works */
    }
  }

  // ── equalizer control ──────────────────────────────────────────────────────
  setEq(enabled: boolean, gains: number[]) {
    this.eqEnabled = enabled;
    this.eqGains = Engine.EQ_FREQS.map((_, i) => clamp(gains[i] ?? 0, -12, 12));
    this.applyEq();
    this.persistEq();
  }

  private applyEq() {
    const on = this.eqEnabled;
    this.eqNodes.forEach((node, i) => {
      try { node.gain.value = on ? this.eqGains[i] : 0; } catch { /* graph not built yet */ }
    });
  }

  private persistEq() {
    const s = useSettings.getState();
    if (s.eqEnabled !== this.eqEnabled) s.set("eqEnabled", this.eqEnabled);
    if (JSON.stringify(s.eqGains) !== JSON.stringify(this.eqGains)) s.set("eqGains", [...this.eqGains]);
  }

  /** Called once at app boot — adopt persisted EQ/speed before first play. */
  applyPersistedAudioPrefs() {
    const s = useSettings.getState();
    this.eqEnabled = !!s.eqEnabled;
    this.eqGains = Engine.EQ_FREQS.map((_, i) => clamp(s.eqGains?.[i] ?? 0, -12, 12));
    if (s.speed && s.speed !== 1) this.setRate(s.speed);
  }

  // ── queue management ─────────────────────────────────────────────────────────
  setQueue(ids: string[], startId?: string, autoplay = true) {
    this.queue = ids.filter(Boolean);
    this.order = this.queue.map((_, i) => i);
    let start = 0;
    if (startId) {
      const idx = this.queue.indexOf(startId);
      if (idx >= 0) start = idx;
    }
    if (this.shuffle) this.reshuffle(start);
    this.pos = this.order.indexOf(start);
    if (this.pos < 0) this.pos = 0;
    this.loadCurrent(autoplay);
  }

  addToQueue(id: string, playNext = false) {
    if (!this.queue.length) { this.setQueue([id], id, true); return; }
    const insertAt = playNext ? this.order[this.pos] + 1 : this.queue.length; // QUEUE position
    this.queue.splice(insertAt, 0, id);
    this.order = this.order.map((q) => (q >= insertAt ? q + 1 : q));
    if (playNext) this.order.splice(this.pos + 1, 0, insertAt);
    else this.order.push(insertAt);
    this.pushState();
  }

  removeFromQueue(listenPos: number) {
    const qPos = this.order[listenPos];
    if (qPos === undefined) return;
    const wasPlaying = !this.audio.paused;
    const removingCurrent = listenPos === this.pos;
    this.queue.splice(qPos, 1);
    this.order.splice(listenPos, 1);
    this.order = this.order.map((q) => (q > qPos ? q - 1 : q));
    if (listenPos < this.pos) this.pos--;
    if (!this.queue.length) { this.stopAndClear(); return; }
    if (this.pos >= this.order.length) this.pos = this.order.length - 1;
    if (removingCurrent) {
      // load whatever now sits at the current listen position, preserving play state
      this.loadCurrent(wasPlaying);
      return;
    }
    this.pushState();
  }

  clearQueue() {
    this.stopAndClear();
  }

  /** Reorder the queue by one slot (dir -1 = up, +1 = down) at a LISTEN position. */
  moveInQueue(listenPos: number, dir: -1 | 1) {
    const to = listenPos + dir;
    if (listenPos < 0 || to < 0 || to >= this.order.length) return;
    const a = this.order[listenPos];
    const b = this.order[to];
    this.order[listenPos] = b;
    this.order[to] = a;
    if (this.pos === listenPos) this.pos = to;
    else if (this.pos === to) this.pos = listenPos;
    this.pushState();
    this.saveResume();
  }

  jumpTo(listenPos: number, autoplay = true) {
    if (listenPos < 0 || listenPos >= this.order.length) return;
    this.pos = listenPos;
    this.loadCurrent(autoplay);
  }

  private reshuffle(keepQPos?: number) {
    const arr = this.queue.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (keepQPos !== undefined) {
      const at = arr.indexOf(keepQPos);
      if (at > 0) { arr.splice(at, 1); arr.unshift(keepQPos); }
    }
    this.order = arr;
  }

  setShuffle(v: boolean) {
    this.shuffle = v;
    const curQ = this.order[this.pos];
    if (v) this.reshuffle(curQ);
    else this.order = this.queue.map((_, i) => i);
    this.pos = Math.max(0, this.order.indexOf(curQ));
    this.pushState();
    this.saveResume();
  }

  cycleRepeat() {
    this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off";
    this.pushState();
    this.saveResume();
  }

  // ── transport ──────────────────────────────────────────────────────────────
  /** Resolve a playable source for a track: bridged classic URL (asset:// or
   *  blob:// owned by classic) first, then the local IndexedDB blob store. */
  private async applySource(id: string): Promise<boolean> {
    const bridge = getBridge();
    const bridgedUrl = bridge ? bridge.resolveSource(id) : null;
    if (bridgedUrl) {
      if (this.objectUrlOwned && this.objectUrl) URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
      this.objectUrlOwned = false;
      this.setCrossOriginFor(bridgedUrl);
      this.audio.src = bridgedUrl;
      return true;
    }
    const blob = await db.getFile(id);
    if (!blob) return false;
    if (this.objectUrlOwned && this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(blob);
    this.objectUrlOwned = true;
    this.setCrossOriginFor(this.objectUrl);
    this.audio.src = this.objectUrl;
    return true;
  }

  /** QA fix (UI-switch silence bug): EVERY engine source flows through the
   *  WebAudio graph (createMediaElementSource). Chromium silences that graph
   *  — "MediaElementAudioSource outputs zeroes" — whenever the media
   *  resource is CORS-cross-origin. Under Electron, classic desktop tracks
   *  resolve to app:// URLs, a different origin from the file:// renderer,
   *  so the whole Cinema/EELA/ALOK surface played SILENT (element running,
   *  zero output) the moment a classic folder import was handed over.
   *  Asking for the resource in CORS mode fixes the taint: the app://
   *  handler answers Access-Control-Allow-Origin: * (electron/main.cjs).
   *  blob: URLs are same-origin (no-op) and foreign schemes (Tauri
   *  asset://) keep their previous behavior — crossOrigin stays unset. */
  private setCrossOriginFor(url: string) {
    try {
      if (url.startsWith("app://")) this.audio.crossOrigin = "anonymous";
      else this.audio.removeAttribute("crossorigin");
    } catch { /* ignore */ }
  }

  async loadCurrent(autoplay: boolean) {
    const id = this.currentId;
    if (!id) { this.stopAndClear(); return; }
    const ok = await this.applySource(id);
    if (!ok) { this.next(); return; }
    this.playedMs = 0;
    this.lastTick = 0;
    this.loggedRecent = false;
    this.emit("track", id);
    if (autoplay) {
      await this.play();
    } else {
      this.pushState();
    }
    this.saveResume();
  }

  async play() {
    if (!this.audio.src && this.currentId) { await this.loadCurrent(true); return; }
    this.ensureGraph();
    // ── single-source rule: whenever THIS engine starts, silence the classic
    // shell's audio element. Both UIs stay mounted, so without this guard the
    // two elements can overlap and the user hears two songs at once.
    this.silenceClassic();
    try {
      await this.audio.play();
    } catch { /* autoplay policies etc. */ }
    this.pushState();
  }

  /** Pause the classic shell's <audio> (if it is playing). Best-effort. */
  private silenceClassic() {
    try {
      const w = globalThis as any;
      w.__NOBODY_BRIDGE__?.pause?.();
    } catch { /* ignore */ }
  }

  pause() {
    this.audio.pause();
    this.pushState();
    this.saveResume();
  }

  toggle() {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  next(auto = false) {
    if (!this.queue.length) return;
    if (this.repeat === "one" && auto) {
      this.audio.currentTime = 0;
      this.play();
      return;
    }
    if (this.pos + 1 >= this.order.length) {
      if (this.repeat === "all") {
        if (this.shuffle) this.reshuffle();
        this.pos = 0;
        this.loadCurrent(true);
      } else if (!auto) {
        this.pos = 0;
        this.loadCurrent(true);
      } else {
        this.audio.pause();
        this.pushState();
      }
      return;
    }
    this.pos++;
    this.loadCurrent(true);
  }

  prev() {
    if (this.audio.currentTime > 3.5) { this.seek(0); return; }
    if (this.pos > 0) { this.pos--; this.loadCurrent(true); }
    else this.seek(0);
  }

  seek(t: number) {
    if (!isFinite(this.audio.duration)) return;
    this.audio.currentTime = clamp(t, 0, this.audio.duration || 0);
    this.playedMs = 0; // seeking restarts the "genuine play" measurement
  }

  setVolume(v: number) {
    this.audio.volume = clamp(v, 0, 1);
    this.pushState();
    this.saveResume();
  }

  get volume() { return this.audio.volume; }

  private stopAndClear() {
    this.audio.pause();
    this.audio.removeAttribute("src");
    // PHASE-3 audit follow-up (Electron migration §5): clearing the queue
    // used to drop the owned blob URL without revoking it — every
    // clearQueue() pinned the last local file's bytes in RAM until reload.
    if (this.objectUrlOwned && this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.objectUrlOwned = false;
    this.queue = [];
    this.order = [];
    this.pos = 0;
    this.pushState();
    this.saveResume();
  }

  private onEnded() {
    if (this.sleepMode === "track") {
      this.cancelSleepTimer();
      this.pushState();
      return; // stay silent — the listener asked to sleep at end of track
    }
    this.next(true);
  }

  // ── "genuinely playing" recent logger ─────────────────────────────────────
  private onTick() {
    const now = performance.now();
    if (!this.audio.paused && this.lastTick) {
      this.playedMs += now - this.lastTick;
      if (!this.loggedRecent && this.playedMs > 5000) {
        this.loggedRecent = true;
        const id = this.currentId;
        if (id) {
          useLibrary.getState().pushRecent(id);
          /* V1.2.0: "genuinely played" also feeds the Most-Played category. */
          useLibrary.getState().recordPlay(id);
        }
      }
    }
    this.lastTick = now;
    if (this.saveTimer === null) {
      this.saveTimer = window.setTimeout(() => { this.saveTimer = null; this.saveResume(); }, 4000);
    }
  }

  // ── resume ─────────────────────────────────────────────────────────────────
  saveResume() {
    const data: ResumeBlob = {
      trackId: this.currentId,
      position: this.audio.currentTime || 0,
      queue: this.queue,
      repeat: this.repeat,
      shuffle: this.shuffle,
      volume: this.audio.volume,
    };
    try { localStorage.setItem(RESUME_KEY, JSON.stringify(data)); } catch { /* full */ }
  }

  // ── playback rate ─────────────────────────────────────────────────────────
  setRate(r: number) {
    const rate = clamp(r, 0.5, 2);
    try {
      this.audio.playbackRate = rate;
      (this.audio as any).preservesPitch = true; // chipmunk-free by default
    } catch { /* ignore */ }
    const s = useSettings.getState();
    if (s.speed !== rate) s.set("speed", rate);
    this.pushState();
  }

  get rate() { return this.audio.playbackRate || 1; }

  // ── sleep timer ───────────────────────────────────────────────────────────
  private sleepTimer: number | null = null;
  private sleepEndsAt = 0;
  sleepMode: "off" | "timed" | "track" = "off";
  sleepMinutes = 0; // configured duration (UI chip matching)

  /** minutes=0 → "when track ends"; otherwise pause after that many minutes. */
  startSleepTimer(minutes: number) {
    this.cancelSleepTimer();
    this.sleepMinutes = minutes;
    if (minutes <= 0) {
      this.sleepMode = "track";
      this.pushState();
      return;
    }
    this.sleepMode = "timed";
    this.sleepEndsAt = Date.now() + minutes * 60_000;
    this.sleepTimer = window.setTimeout(() => {
      this.sleepTimer = null;
      this.sleepMode = "off";
      this.pause();
      this.announceSleepEnd();
    }, minutes * 60_000);
    this.pushState();
  }

  private announceSleepEnd() {
    try {
      const lang = useSettings.getState().lang;
      const msg =
        lang === "fa" ? "خواب‌سنج تمام شد — پخش متوقف شد"
        : lang === "tr" ? "Uyku zamanlayıcısı doldu — çalma duraklatıldı"
        : "Sleep timer ended — playback paused";
      uiApi.toast(msg, "info");
    } catch { /* ui may be gone */ }
  }

  cancelSleepTimer() {
    if (this.sleepTimer !== null) { window.clearTimeout(this.sleepTimer); this.sleepTimer = null; }
    this.sleepEndsAt = 0;
    this.sleepMinutes = 0;
    const wasOff = this.sleepMode === "off";
    this.sleepMode = "off";
    if (!wasOff) this.pushState();
  }

  get sleepEndsAtMs() { return this.sleepEndsAt; }

  // ── resume ──────────────────────────────────────────────────────────────────
  /** QA: a resume attempted before the (async) classic folder re-scan has
   *  filled the mirror is kept here so it can be retried when the library
   *  arrives — otherwise a restart straight into a engine-driven UI silently
   *  lost the previous session. */
  private resumeDeferred: ResumeBlob | null = null;

  async restoreResume(): Promise<string | null> {
    let data: ResumeBlob | null = null;
    try {
      const raw = localStorage.getItem(RESUME_KEY);
      if (raw) data = JSON.parse(raw);
    } catch { /* ignore */ }
    if (!data) return null;
    this.resumeDeferred = null;
    const lib = useLibrary.getState();
    const queue = (data.queue || []).filter((id) => lib.tracks[id]);
    this.repeat = data.repeat ?? "off";
    this.audio.volume = clamp(data.volume ?? 0.9, 0, 1);
    if (!queue.length || !data.trackId || !lib.tracks[data.trackId]) {
      this.resumeDeferred = data; // retry via retryDeferredResume() once tracks exist
      this.pushState();
      return null;
    }
    this.queue = queue;
    this.order = queue.map((_, i) => i);
    if (data.shuffle) {
      const cur = queue.indexOf(data.trackId);
      this.reshuffle(cur >= 0 ? cur : 0);
      this.shuffle = true;
    }
    this.pos = Math.max(0, this.order.indexOf(queue.indexOf(data.trackId)));
    // load WITHOUT autoplay, seek to position once metadata is ready
    const id = this.currentId!;
    const ok = await this.applySource(id);
    if (ok) {
      const target = data.position || 0;
      const onMeta = () => {
        if (isFinite(this.audio.duration)) this.audio.currentTime = clamp(target, 0, this.audio.duration - 0.5);
        this.audio.removeEventListener("loadedmetadata", onMeta);
      };
      this.audio.addEventListener("loadedmetadata", onMeta);
    }
    this.pushState();
    this.emit("track", id);
    return id;
  }

  /** Re-run a resume that was deferred because the library mirror wasn't
   *  filled yet. No-op when anything is already loaded (never clobber live
   *  playback) — callers invoke it after a mirror rehydrate. */
  retryDeferredResume(): boolean {
    if (!this.resumeDeferred || this.queue.length || this.audio.src) return false;
    this.resumeDeferred = null;
    void this.restoreResume();
    return true;
  }
}

export const engine = new Engine();
export const EQ_FREQS = Engine.EQ_FREQS;

// ── module-level switch bridge (BUG FIX: music died when returning to Classic)
// switchUiMode captures playback via window.__NOBODY_CINEMA__.captureHandoff().
// That bridge used to live inside cinema/App.tsx as a COMPONENT effect — tied
// to the cinema pane's mount lifecycle. Two reported breakages came from that:
//   • the engine keeps playing while the VISIBLE pane is eela or alok, so the
//     capture must work there too (it did, while every pane stayed mounted);
//   • with the new single-active-pane shell (RAM fix) the cinema pane is
//     UNMOUNTED most of the time — its cleanup even deleted the bridge, so a
//     switch back to Classic found no captureHandoff and the song stopped.
// Exposing it at MODULE scope (this file is imported by classic, cinema, EELA
// and ALOK alike, and ES modules live for the whole session) makes the capture
// always available, from every engine-driven UI, in every direction.
try {
  const w = globalThis as any;
  const engineBridge = {
    captureHandoff: () => ({
      trackId: engine.currentId,
      position: engine.audio.currentTime || 0,
      isPlaying: !engine.audio.paused,
      volume: engine.audio.volume,
      queueIds: engine.queueIds,
    }),
    pause: () => {
      try { engine.audio.pause(); } catch { /* ignore */ }
    },
  };
  // Merge over any earlier exposure instead of clobbering extra keys.
  w.__NOBODY_CINEMA__ = Object.assign({}, w.__NOBODY_CINEMA__, engineBridge);
} catch { /* non-window environment */ }

// ── V1.4.0 (#9): hardware media keys ─────────────────────────────────────────
// electron/main.cjs owns the OS global shortcuts (they fire even when the
// window is minimized/unfocused) and forwards every press through the
// mediaKeys bridge installed at root level. The engine answers only when an
// engine-driven face (cinema / eela / alok) is the active one — classic
// drives its own <audio> element. Module scope, AFTER the singleton above:
// this subscription lives for the whole session, whichever face is visible.
// try/catch so a web runtime without the bridge can never break the module.
try {
  onMediaKey((action) => {
    if (getUiMode() === "classic") return;
    if (action === "play-pause") engine.toggle();
    else if (action === "next") engine.next();
    else if (action === "prev") engine.prev();
    else if (action === "stop") engine.pause();
  });
} catch { /* web runtime / bridge absent — nothing to do */ }
