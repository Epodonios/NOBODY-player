// ── NOBODY ALOK · the core ───────────────────────────────────────────────────
// A layered "reactor core" instrument. From the outside in: a hairline orbit
// with cardinal dots and a slow radar sheen, a fine tick ring, the thin conic
// seek band (drag/click on the ring → engine.seek; hover shows a ghost head +
// time tooltip) with a comet tail and a glowing playhead, and a glass vinyl
// disc — grooves, spindle, static gloss, paused veil — holding the cover art
// on a cover-derived aurora. The disc IS the play/pause button. A mono dial
// on the orbit reads the playhead angle per frame.
//
// Per-frame values (progress fraction, head angle, time labels, bass energy)
// are written via rAF + refs + CSS vars — never React state. The transport
// row, volume cluster, active-state chips, like heart and the lyric whisper
// live under the core.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle, Music2,
  Heart, Volume2, VolumeX, SlidersHorizontal, Gauge, MoonStar,
} from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary } from "../../cinema/store/library";
import { useUi } from "../../cinema/store/ui";
import { useSettings } from "../../cinema/store/settings";
import { useT } from "../../cinema/lib/useT";
import { CoverArt } from "../../cinema/components/CoverArt";
import { cssGradientFor, paletteFor } from "../../cinema/lib/covers";
import { activeLineIndex, clamp, fmtTime } from "../../cinema/lib/utils";
import { UI_SWITCH_EVENT } from "../../uiMode";
import { RadialViz } from "./RadialViz";
import { ringGradient, vizColors } from "../lib/palette";
import { useAlokUi } from "../store/alokUi";

/** angle → fraction: 12 o'clock = 0, clockwise to 1 */
function pointerFrac(el: HTMLElement, e: PointerEvent | React.PointerEvent): number {
  const r = el.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  const deg = Math.atan2(dy, dx) * (180 / Math.PI); // -180..180, 0 = 3 o'clock
  const shifted = deg + 90; // 12 o'clock → 0, clockwise positive
  const norm = shifted < 0 ? shifted + 360 : shifted;
  return clamp(norm / 360, 0, 1);
}

export function Core({ accent }: { accent: string }) {
  const t = useT();
  const currentId = useUi((s) => s.currentId);
  const isPlaying = useUi((s) => s.isPlaying);
  const shuffle = useUi((s) => s.shuffle);
  const repeat = useUi((s) => s.repeat);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const order = useLibrary((s) => s.order);
  const playlists = useLibrary((s) => s.playlists);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const lang = useSettings((s) => s.lang);
  const ring = useSettings((s) => s.alokRing ?? "cover");
  const vizOn = useSettings((s) => s.alokVisualizer ?? true);
  const glowOn = useSettings((s) => s.alokGlow ?? true);
  const miniOn = useSettings((s) => s.miniLyrics ?? true);
  const eqOn = useSettings((s) => s.eqEnabled ?? false);
  const speed = useSettings((s) => s.speed ?? 1);
  const setShowFx = useAlokUi((s) => s.setShowFx);
  const setShowInfo = useAlokUi((s) => s.setShowInfo);

  const ringRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const dialRef = useRef<HTMLSpanElement>(null);
  const marqueeRef = useRef<HTMLSpanElement>(null);
  const [ringPx, setRingPx] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [preview, setPreview] = useState(false);
  const scrubFrac = useRef(0);
  const lastSeekAt = useRef(0);

  // volume mirror (engine is the source of truth — synced via its state event)
  const [vol, setVol] = useState(() => engine.volume);
  const [muted, setMuted] = useState(() => engine.audio.muted);
  const [, force] = useState(0); // re-render for sleep countdown + volume sync
  const [miniIdx, setMiniIdx] = useState(-1);
  const [marquee, setMarquee] = useState(false); // title overflows → kinetic mode

  const emptyLibrary = order.length === 0;
  const hasTrack = !!track;
  const liked = playlists.find((p) => p.id === "liked")?.trackIds.includes(currentId ?? "") ?? false;
  const synced = useMemo(() => track?.syncedLyrics ?? [], [track?.syncedLyrics]);

  const grad = useMemo(() => ringGradient(ring, accent), [ring, accent]);
  // cover palette inherits --na-accent (set by the app shell); others are fixed
  const gradCss = ring === "cover" ? "conic-gradient(from -90deg, var(--na-accent), color-mix(in srgb, var(--na-accent) 42%, #ffffff) 30%, var(--na-accent) 58%, color-mix(in srgb, var(--na-accent) 62%, #101013) 82%, var(--na-accent))" : grad;
  const vizCols = useMemo(() => vizColors(ring, accent), [ring, accent]);

  // measure the ring so the canvas visualizer can match it (transform-only viz)
  useEffect(() => {
    const el = ringRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRingPx(el.getBoundingClientRect().width));
    ro.observe(el);
    setRingPx(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // engine pushes coarse state (sleep changes, volume from media keys) → reflect
  useEffect(() => engine.on("state", () => {
    setVol(engine.volume);
    setMuted(engine.audio.muted);
    force((n) => n + 1);
  }), []);

  // live scrub flag mirrored into a ref so the rAF clock can read it
  const scrubbingRef = useRef(false);
  scrubbingRef.current = scrubbing;

  // ── per-frame clock: --na-frac on the ring + dial + time labels (no state) ──
  useEffect(() => {
    let raf = 0;
    let lastFrac = -1;
    let lastTotal = "";
    let lastDeg = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const ringEl = ringRef.current;
      if (!ringEl) return;
      const a = engine.audio;
      const d = isFinite(a.duration) ? a.duration : 0;
      const frac = d ? clamp(a.currentTime / d, 0, 1) : 0;
      const active = scrubbingRef.current ? scrubFrac.current : frac;
      if (Math.abs(active - lastFrac) > 0.0008) {
        lastFrac = active;
        ringEl.style.setProperty("--na-frac", active.toFixed(4));
        const deg = Math.round(active * 360) % 360;
        if (deg !== lastDeg) {
          lastDeg = deg;
          if (dialRef.current) dialRef.current.textContent = `${String(deg).padStart(3, "0")}°`;
        }
        const hit = ringEl.querySelector<HTMLElement>(".na-ring-hit");
        if (hit) hit.setAttribute("aria-valuenow", String(Math.round(active * 100)));
      }
      const totalStr = fmtTime(d || 0);
      if (totalStr !== lastTotal) {
        lastTotal = totalStr;
        if (totalRef.current) totalRef.current.textContent = totalStr;
      }
      if (elapsedRef.current) elapsedRef.current.textContent = fmtTime(a.currentTime || 0);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── kinetic title: does the single copy overflow? (event-driven, not rAF) ──
  useEffect(() => {
    const el = marqueeRef.current;
    if (!el) return;
    const measure = () => {
      const half = el.querySelector<HTMLElement>(".na-marquee-half");
      if (!half) { setMarquee(false); return; }
      setMarquee(half.getBoundingClientRect().width > el.clientWidth + 1);
    };
    const raf = requestAnimationFrame(measure); // async → no sync set-state in effect
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    const t1 = window.setTimeout(measure, 450); // after webfont settle
    let alive = true;
    document.fonts.ready.then(() => { if (alive) measure(); });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.clearTimeout(t1);
    };
  }, [track?.title, lang]);

  // ── reactive glow: bass energy → --na-bass on #na-root (halo + beat pulse) ──
  useEffect(() => {
    const clear = () => document.getElementById("na-root")?.style.removeProperty("--na-bass");
    if (!glowOn) { clear(); return; }
    let raf = 0;
    let running = true;
    let sm = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const root = document.getElementById("na-root");
      if (!root || root.getClientRects().length === 0) { running = false; clear(); return; }
      const playing = !engine.audio.paused;
      let target = 0;
      if (playing) {
        const data = engine.freqData();
        if (data) {
          let sum = 0;
          const n = Math.min(10, data.length);
          for (let i = 0; i < n; i++) sum += data[i];
          target = sum / n / 255;
        }
      }
      sm += (target - sm) * (target > sm ? 0.35 : 0.08);
      if (sm < 0.003) sm = 0;
      root.style.setProperty("--na-bass", sm.toFixed(3));
      if (!playing && sm === 0) running = false; // park until playback resumes
    };
    raf = requestAnimationFrame(tick);
    const wake = () => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };
    engine.on("state", wake);
    const onSwitch = () => window.setTimeout(wake, 160);
    window.addEventListener(UI_SWITCH_EVENT, onSwitch);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      engine.off("state", wake);
      window.removeEventListener(UI_SWITCH_EVENT, onSwitch);
      clear();
    };
  }, [glowOn]);

  // ── sleep countdown tick (only while a timer is live) ──
  useEffect(() => {
    if (engine.sleepMode !== "timed") return;
    const iv = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(iv);
  }, [engine.sleepMode, force]);

  // ── mini lyric whisper: follow the playhead, re-render on line change only ──
  useEffect(() => {
    if (!miniOn || !track || synced.length === 0) { setMiniIdx(-1); return; }
    let raf = 0;
    let last = -2;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const idx = activeLineIndex(synced, engine.audio.currentTime || 0);
      if (idx !== last) { last = idx; setMiniIdx(idx); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [miniOn, track, synced]);
  const miniLine = miniOn && synced.length > 0 && miniIdx >= 0 ? synced[miniIdx]?.text : "";

  // ── ring seeking (pointer) ─────────────────────────────────────────────────
  const seekToFrac = (f: number, forceSeek = false) => {
    const a = engine.audio;
    const d = isFinite(a.duration) ? a.duration : 0;
    if (!d) return;
    scrubFrac.current = f;
    const now = performance.now();
    if (forceSeek || now - lastSeekAt.current > 120) {
      lastSeekAt.current = now;
      engine.seek(f * d);
    }
  };

  const dur = () => (isFinite(engine.audio.duration) ? engine.audio.duration : 0);

  const positionTip = (el: HTMLElement, f: number) => {
    if (!tipRef.current) return;
    const size = el.getBoundingClientRect().width;
    const R = size / 2;
    const a = f * Math.PI * 2 - Math.PI / 2;
    const x = size / 2 + Math.cos(a) * (R + 12); // just outside the tick ring
    const y = size / 2 + Math.sin(a) * (R + 12);
    tipRef.current.style.left = `${x}px`;
    tipRef.current.style.top = `${y}px`;
    tipRef.current.textContent = fmtTime(f * dur());
  };

  const onRingDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ringRef.current;
    if (!el || !isFinite(engine.audio.duration)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setScrubbing(true);
    setPreview(true);
    const f = pointerFrac(el, e);
    el.style.setProperty("--na-ghost", f.toFixed(4));
    positionTip(el, f);
    seekToFrac(f, true);
  };
  const onRingMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ringRef.current;
    if (!el) return;
    if (scrubbingRef.current) {
      const f = pointerFrac(el, e);
      scrubFrac.current = f;
      el.style.setProperty("--na-frac", f.toFixed(4));
      el.style.setProperty("--na-ghost", f.toFixed(4));
      positionTip(el, f);
      seekToFrac(f);
      return;
    }
    // hover preview (ghost head + time tooltip)
    if (!hasTrack || !isFinite(engine.audio.duration)) return;
    const f = pointerFrac(el, e);
    setPreview(true);
    el.style.setProperty("--na-ghost", f.toFixed(4));
    positionTip(el, f);
  };
  const onRingLeave = () => setPreview(false);
  const onRingUp = () => {
    if (!scrubbingRef.current) return;
    setScrubbing(false);
    const d = dur();
    if (d && scrubFrac.current > 0) engine.seek(scrubFrac.current * d);
    scrubFrac.current = 0;
    setPreview(false);
  };
  // (arrow-key seeking is handled by the App-level keyboard guard — the slider
  //  here stays pointer-only so a focused slider can't double-apply a seek)

  // fallback art (deterministic gradient + mono initials) when nothing is loaded
  const pal = paletteFor(track ? `${track.title}|${track.artist}` : "alok");
  const fallbackBg = cssGradientFor(track ? `${track.title}|${track.artist}` : "alok");

  // active-state chips (hidden states made visible)
  const sleepActive = engine.sleepMode !== "off";
  const remainMs = Math.max(0, engine.sleepEndsAtMs - Date.now());
  const remainLabel = `${Math.floor(remainMs / 60000)}:${String(Math.floor((remainMs % 60000) / 1000)).padStart(2, "0")}`;
  const chips: { icon: any; label: string }[] = [];
  if (eqOn) chips.push({ icon: SlidersHorizontal, label: t("alEq") });
  if (Math.abs(speed - 1) > 0.01) chips.push({ icon: Gauge, label: `${speed.toFixed(2)}×` });
  if (sleepActive) chips.push({ icon: MoonStar, label: engine.sleepMode === "track" ? t("alSleepTrack") : remainLabel });

  const toggleMute = () => {
    const next = !engine.audio.muted;
    engine.audio.muted = next;
    setMuted(next);
  };

  // kinetic title loop duration grows with the text (clamped)
  const marqueeDur = Math.max(9, Math.min(26, (track?.title.length ?? 6) * 0.55));

  return (
    <>
      {/* the ring — layered instrument + seekbar; --na-frac written per-frame */}
      <div
        ref={ringRef}
        className="na-ring"
        data-empty={!hasTrack}
        data-preview={preview || scrubbing}
        data-playing={isPlaying ? "true" : "false"}
        data-live={isPlaying || emptyLibrary || scrubbing ? "true" : "false"}
        style={{ ["--na-grad" as any]: gradCss }}
      >
        {/* audio-reactive halo hugging the core (bass → scale/opacity) */}
        {glowOn && <div className="na-halo" aria-hidden />}

        {/* radial visualizer — parked (no rAF) when paused / hidden / disabled */}
        {vizOn && ringPx > 0 && (
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              top: "50%", /* dead-center on the ring (no stage-offset guessing) */
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          >
            <RadialViz size={Math.round(ringPx * 1.52)} colors={vizCols} bars={88} inner={0.5} alpha={0.75} />
          </div>
        )}

        {/* cover-derived aurora behind the glass disc */}
        <div className="na-core-aurora" aria-hidden />

        {/* inner bezel hairline between the seek band and the disc */}
        <div className="na-ring-bezel" aria-hidden />

        {/* outer hairline orbit: cardinal dots + slow radar sheen (live only) */}
        <div className="na-orbitline" aria-hidden />

        <div className="na-ring-ticks" aria-hidden />
        <div className="na-ring-rotor" data-spin={emptyLibrary}>
          <div className="na-ring-track" />
          <div className="na-ring-fill" />
          <div className="na-ring-tail" aria-hidden />
        </div>
        <div className="na-ring-head" />
        <div className="na-ring-ghost" aria-hidden />
        <div ref={tipRef} className="na-ring-tip" aria-hidden />
        <span ref={dialRef} className="na-dial" aria-hidden>000°</span>
        <div
          className="na-ring-hit"
          role="slider"
          tabIndex={0}
          aria-label={t("seekFwdBwd")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          aria-disabled={!hasTrack}
          onPointerDown={hasTrack ? onRingDown : undefined}
          onPointerMove={onRingMove}
          onPointerUp={onRingUp}
          onPointerCancel={onRingUp}
          onPointerLeave={onRingLeave}
        />

        {/* the disc — a glass vinyl record; click = play/pause */}
        <motion.button
          className="na-core"
          onClick={() => engine.toggle()}
          whileTap={{ scale: 0.965 }}
          aria-label={isPlaying ? t("pause") : t("play")}
          disabled={!currentId}
        >
          {currentId ? (
            <>
              <span className="na-core-art">
                <CoverArt trackId={currentId} rounded="rounded-full" />
              </span>
              <span className="na-core-vinyl" aria-hidden />
              <span className="na-core-gloss" aria-hidden />
              <span className="na-core-veil" aria-hidden />
              <span className="na-core-spindle" aria-hidden />
            </>
          ) : emptyLibrary ? (
            <span className="na-core-empty">
              <span className="na-core-ghost na-mono" aria-hidden>NOBODY</span>
              <span className="na-core-index na-mono">
                <i className="na-pulse-dot" aria-hidden />
                {t("alIndexing")}
              </span>
              <small>{t("alAddMusic")}</small>
            </span>
          ) : (
            <span className="na-core-fallback" style={{ background: fallbackBg }}>
              <span className="na-core-vinyl" aria-hidden />
              <Music2 size={30} strokeWidth={1.2} style={{ opacity: 0.55, color: `hsl(${pal.h1} 70% 70%)` }} />
              <small className="na-core-fallback-tag na-mono" aria-hidden>NOBODY</small>
            </span>
          )}
        </motion.button>
      </div>

      {/* meta: kinetic mono-annotated title, artist, ruled time readout */}
      <div className="na-meta" data-playing={isPlaying ? "true" : "false"}>
        <div className="na-meta-top">
          <button
            className="na-meta-title-btn"
            onClick={() => setShowInfo(true)}
            disabled={!track}
            title={t("alInfo")}
            aria-label={track ? track.title : "NOBODY"}
          >
            <span ref={marqueeRef} className="na-marquee" data-on={marquee ? "true" : "false"}>
              <span
                className="na-marquee-in"
                style={{ ["--na-marquee-dur" as any]: `${marqueeDur}s` }}
              >
                <span className="na-marquee-half">
                  <span className="na-title-text">{track ? track.title : "NOBODY"}</span>
                  {track && <span className="na-title-sep" aria-hidden>◆</span>}
                </span>
                {track && marquee && (
                  <span className="na-marquee-half" aria-hidden>
                    <span className="na-title-text">{track.title}</span>
                    <span className="na-title-sep" aria-hidden>◆</span>
                  </span>
                )}
              </span>
            </span>
          </button>
          {track && (
            <button
              className="na-meta-like"
              data-on={liked}
              onClick={() => toggleLike(track.id)}
              title={t("like")}
              aria-label={`${t("like")}: ${track.title}`}
              aria-pressed={liked}
            >
              <Heart size={15} fill={liked ? "currentColor" : "none"} />
            </button>
          )}
        </div>
        <div className="na-meta-artist" dir="ltr">
          {track ? track.artist : "· · ·"}
        </div>
        <div className="na-times" dir="ltr">
          <span ref={elapsedRef} className="na-fg" aria-hidden>0:00</span>
          <span className="na-times-sep" aria-hidden>/</span>
          <span ref={totalRef} aria-hidden>0:00</span>
        </div>
      </div>

      {/* lyric whisper */}
      {miniOn && miniLine && (
        <div className="na-mini-line" aria-hidden key={miniIdx}>{miniLine}</div>
      )}

      {/* transport */}
      <div className="na-transport">
        <button
          className="na-t-btn"
          data-on={shuffle}
          onClick={() => engine.setShuffle(!shuffle)}
          title={t("shuffle")}
          aria-label={t("shuffle")}
          aria-pressed={shuffle}
        >
          <Shuffle size={17} />
        </button>
        <button className="na-t-btn" onClick={() => engine.prev()} title={t("previous")} aria-label={t("previous")}>
          <SkipBack size={19} fill="currentColor" />
        </button>
        <motion.button
          className="na-play"
          onClick={() => engine.toggle()}
          whileTap={{ scale: 0.9 }}
          title={isPlaying ? t("pause") : t("play")}
          aria-label={isPlaying ? t("pause") : t("play")}
          disabled={!currentId}
        >
          {isPlaying
            ? <Pause size={22} fill="currentColor" />
            : <Play size={22} fill="currentColor" style={{ marginInlineStart: 3 }} />}
        </motion.button>
        <button className="na-t-btn" onClick={() => engine.next()} title={t("next")} aria-label={t("next")}>
          <SkipForward size={19} fill="currentColor" />
        </button>
        <button
          className="na-t-btn"
          data-on={repeat !== "off"}
          onClick={() => engine.cycleRepeat()}
          title={repeat === "one" ? t("repeatOne") : t("repeat")}
          aria-label={repeat === "one" ? t("repeatOne") : t("repeat")}
          aria-pressed={repeat !== "off"}
        >
          {repeat === "one" ? <Repeat1 size={17} /> : <Repeat size={17} />}
        </button>

        {/* volume cluster: mute + slider that unfolds on hover */}
        <div className="na-vol">
          <button
            className="na-vol-btn"
            data-on={muted || vol === 0}
            onClick={toggleMute}
            title={t("alMute")}
            aria-label={t("alMute")}
            aria-pressed={muted || vol === 0}
          >
            {muted || vol === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <div className="na-vol-slider">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : vol}
              onChange={(e) => {
                const v = Number(e.target.value);
                engine.audio.muted = false;
                setMuted(false);
                engine.setVolume(v);
                setVol(v);
              }}
              className="na-range"
              style={{ ["--na-val" as any]: `${Math.round((muted ? 0 : vol) * 100)}%` }}
              aria-label={t("volume")}
            />
          </div>
        </div>
      </div>

      {/* active-state chips — hidden states made visible, click → FX */}
      {chips.length > 0 && (
        <div className="na-state-row">
          {chips.map((c) => (
            <button key={c.label} className="na-state-chip" onClick={() => setShowFx(true)}>
              <c.icon size={11} aria-hidden />
              {c.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
