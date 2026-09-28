// ── NOBODY · ambient / idle mode ─────────────────────────────────────────────
// After N seconds of no interaction while music plays: full-screen display with
// a PRE-RENDERED blurred cover backdrop (painted once into a canvas), big
// typography, and the live audio-reactive visualizer. Any interaction exits —
// UNLESS the user enabled it manually (NowPlaying moon / Ctrl+K "Ambient mode"):
// then it's a deliberate Focus session that survives mouse motion, wheel and
// keyboard, and only a backdrop click, the ✕ button or Escape closes it.
// Elements marked [data-ambient-ui] (transport, ✕) never trigger the exit path.
// The rAF visualizer pauses itself when the tab is hidden.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "../lib/db";
import { blurredBackdrop } from "../lib/covers";
import { engine } from "../lib/engine";
import { useUi } from "../store/ui";
import { useLibrary } from "../store/library";
import { useSettings } from "../store/settings";
import { useSmartFetch } from "../lib/smartFetch";
import { useT } from "../lib/useT";
import { fmtTime } from "../lib/utils";
import { Visualizer } from "./Visualizer";
import { CoverArt } from "./CoverArt";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";

export function AmbientMode() {
  const t = useT();
  const ambient = useUi((s) => s.ambient);
  const ambientManual = useUi((s) => s.ambientManual);
  const setAmbient = useUi((s) => s.setAmbient);
  const isPlaying = useUi((s) => s.isPlaying);
  const currentId = useUi((s) => s.currentId);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const eqStyle = useSettings((s) => s.eqStyle);
  const delay = useSettings((s) => s.ambientDelay);
  const lastActive = useRef(Date.now());
  const [bg, setBg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // idle tracking — opens after inactivity while playing.
  // Exit rules (mark):
  //  • events on [data-ambient-ui] (ambient's own buttons) NEVER exit the mode
  //    — they only refresh lastActive, so the auto timer stays honest too.
  //  • MANUAL focus (NowPlaying moon / palette, manual=true): pointermove,
  //    wheel and keydown are ignored; only a deliberate pointerdown somewhere
  //    else (the backdrop) exits. Escape has its own dedicated rule below.
  //  • AUTO (idle-opened) focus keeps the classic exit-on-anything behavior.
  useEffect(() => {
    let throttled = 0;
    const mark = (e: Event) => {
      const el = e.target as Element | null;
      if (el?.closest?.("[data-ambient-ui]")) {
        lastActive.current = Date.now(); // mode's own controls: never exit, just stay fresh
        return;
      }
      if (useUi.getState().ambientManual && e.type !== "pointerdown") return;
      const now = Date.now();
      if (now - throttled > 800) {
        throttled = now;
        lastActive.current = now;
        if (useUi.getState().ambient) setAmbient(false); // auto: any interaction · manual: deliberate backdrop click
      }
    };
    const iv = setInterval(() => {
      const s = useUi.getState();
      if (!s.ambient && s.isPlaying && Date.now() - lastActive.current > delay * 1000 && !s.showNowPlaying && !s.showQueue && !s.draggingFiles && !useSmartFetch.getState().open) {
        setAmbient(true); // auto-open: manual=false
      }
    }, 1000);
    window.addEventListener("pointermove", mark, { passive: true });
    window.addEventListener("pointerdown", mark, { passive: true });
    window.addEventListener("keydown", mark);
    window.addEventListener("wheel", mark, { passive: true });
    return () => {
      clearInterval(iv);
      window.removeEventListener("pointermove", mark);
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
      window.removeEventListener("wheel", mark);
    };
  }, [delay, setAmbient]);

  // manual focus: Escape closes the session even though mark() ignores keydown
  useEffect(() => {
    if (!ambientManual) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useUi.getState().ambient) setAmbient(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ambientManual, setAmbient]);

  // close when playback stops — but a MANUAL focus session persists across pause
  useEffect(() => {
    if (!isPlaying && ambient && !useUi.getState().ambientManual) setAmbient(false);
  }, [isPlaying, ambient, setAmbient]);

  // pre-rendered blurred backdrop — painted ONCE per track, opacity transitions only
  useEffect(() => {
    let alive = true;
    setBg(null);
    if (!ambient || !track) return;
    db.getCover(track.id).then(async (blob) => {
      if (!blob || !alive) return;
      const url = await blurredBackdrop(track.id, blob);
      if (alive) setBg(url);
    });
    return () => { alive = false; };
  }, [ambient, track?.id, track]);

  // progress for the thin timeline (state at 1Hz is fine here — fullscreen only)
  useEffect(() => {
    if (!ambient) return;
    const iv = setInterval(() => {
      const a = engine.audio;
      setProgress(a.duration ? a.currentTime / a.duration : 0);
    }, 1000);
    return () => clearInterval(iv);
  }, [ambient]);

  return (
    <AnimatePresence>
      {ambient && track && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-black"
        >
          {/* pre-rendered blurred cover backdrop — static image, we only fade it */}
          <AnimatePresence>
            {bg && (
              <motion.img
                key={track.id}
                src={bg}
                alt=""
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.85 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2 }}
                className="absolute inset-0 h-full w-full scale-110 object-cover"
              />
            )}
          </AnimatePresence>
          <div className="absolute inset-0 bg-black/45" />

          {/* manual focus exit — only shown for deliberately enabled sessions */}
          {ambientManual && (
            <button
              data-ambient-ui
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setAmbient(false)}
              aria-label={t("close")}
              title={t("close")}
              className="glass absolute end-5 top-5 z-20 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
            >
              <X size={18} />
            </button>
          )}

          {/* content */}
          <div className="relative z-10 flex h-full flex-col items-center justify-center px-6 text-center text-white">
            <motion.div
              key={track.id}
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              className="h-[min(30vh,220px)] w-[min(30vh,220px)] overflow-hidden rounded-2xl border border-white/15 shadow-2xl"
            >
              <CoverArt trackId={track.id} />
            </motion.div>
            <motion.h2
              key={"t" + track.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 }}
              className="mt-6 max-w-4xl font-display text-[clamp(1.8rem,5vw,3.4rem)] font-semibold leading-tight"
            >
              {track.title}
            </motion.h2>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.75 }}
              transition={{ delay: 0.25 }}
              className="mt-1 font-display text-[clamp(1rem,2vw,1.4rem)] italic"
            >
              {track.artist}
            </motion.div>

            {/* live equalizer — the always-on heart of ambient mode */}
            <div className="mt-8 h-[min(22vh,180px)] w-[min(80vw,760px)]">
              <Visualizer variant={eqStyle} trackSeed={track.id} className="h-full w-full" />
            </div>

            {/* thin progress + micro transport */}
            <div className="mt-4 w-[min(80vw,760px)]">
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: "var(--accent)", transition: "width 1s linear" }} />
              </div>
              <div className="tnum mt-1.5 flex justify-between text-[11px] text-white/60">
                <span>{fmtTime((track.duration || 0) * progress)}</span>
                <span>{fmtTime(track.duration)}</span>
              </div>
            </div>
            <div data-ambient-ui className="mt-2 flex items-center gap-4 text-white/80">
              <button
                onClick={() => engine.prev()}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded-full p-2 transition-colors hover:bg-white/10"
                aria-label="prev"
              >
                <SkipBack size={18} fill="currentColor" />
              </button>
              <button
                onClick={() => engine.toggle()}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded-full border border-white/25 p-3.5 transition-colors hover:bg-white/10"
                aria-label="toggle"
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
              </button>
              <button
                onClick={() => engine.next()}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded-full p-2 transition-colors hover:bg-white/10"
                aria-label="next"
              >
                <SkipForward size={18} fill="currentColor" />
              </button>
            </div>
          </div>

          {/* exit hint — fades away after a moment */}
          <motion.div
            initial={{ opacity: 0.7 }}
            animate={{ opacity: [0.7, 0.7, 0] }}
            transition={{ duration: 4, times: [0, 0.7, 1] }}
            className="absolute bottom-6 left-0 right-0 z-10 text-center text-[11px] tracking-[0.2em] text-white/60"
          >
            {t("ambientHint")}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
