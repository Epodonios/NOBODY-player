// ── NOBODY · persistent player dock — rêve edition ───────────────────────────
// A floating glass dock with an aurora halo beneath it, a spinning vinyl whose
// label is the album art, and a glowing liquid scrubber. The scrubber + time-
// stamps are still driven by a local rAF loop writing to refs — the 4×/s
// timeupdate never re-renders this component (audit rule).

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Heart, ListMusic, MicVocal, ChevronUp, AudioLines, SlidersHorizontal,
} from "lucide-react";
import { engine } from "../lib/engine";
import { useUi } from "../store/ui";
import { useLibrary, LIKED_ID } from "../store/library";
import { useT } from "../lib/useT";
import { fmtTime, clamp } from "../lib/utils";
import { Slider } from "./Slider";
import { CoverArt } from "./CoverArt";
import { cn } from "../utils/cn";

export function PlayerBar() {
  const t = useT();
  const ui = useUi();
  const track = useLibrary((s) => (ui.currentId ? s.tracks[ui.currentId] : undefined));
  const likedIds = useLibrary((s) => s.playlists.find((p) => p.id === LIKED_ID)?.trackIds ?? []);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const liked = ui.currentId ? likedIds.includes(ui.currentId) : false;

  const scrubWrap = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLSpanElement>(null);
  const remRef = useRef<HTMLSpanElement>(null);
  const volWrap = useRef<HTMLDivElement>(null);

  // ── rAF progress loop: refs only, no state ──
  useEffect(() => {
    let raf = 0;
    let lastEl = -1, lastRem = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const a = engine.audio;
      const dur = a.duration || 0;
      const frac = dur ? a.currentTime / dur : 0;
      const wrap = scrubWrap.current;
      if (wrap) {
        const fill = wrap.querySelector<HTMLElement>("[data-slider] > div > div");
        const knob = wrap.querySelectorAll<HTMLElement>("[data-slider] > div")[1];
        const f = clamp(frac, 0, 1);
        if (fill) fill.style.transform = `scaleX(${f})`;
        if (knob) knob.style.insetInlineStart = `${f * 100}%`;
      }
      const el = Math.floor(a.currentTime);
      const rem = Math.max(0, Math.floor(dur - a.currentTime));
      if (el !== lastEl && elRef.current) { elRef.current.textContent = fmtTime(el); lastEl = el; }
      if (rem !== lastRem && remRef.current) { remRef.current.textContent = `-${fmtTime(dur ? rem : 0)}`; lastRem = rem; }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // paint volume slider once on mount
  useEffect(() => {
    const wrap = volWrap.current;
    if (!wrap) return;
    const fill = wrap.querySelector<HTMLElement>("[data-slider] > div > div");
    const knob = wrap.querySelectorAll<HTMLElement>("[data-slider] > div")[1];
    const v = engine.volume;
    if (fill) fill.style.transform = `scaleX(${v})`;
    if (knob) knob.style.insetInlineStart = `${v * 100}%`;
  }, [ui.hasAudio]);

  if (!ui.queueLength) return null;

  const RepIcon = ui.repeat === "one" ? Repeat1 : Repeat;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 28 }}
        className="nc-playerbar fixed inset-x-0 bottom-4 z-40 mx-auto w-[min(1080px,calc(100%-1.5rem))]"
      >
        {/* aurora halo under the dock */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-3 -z-10 rounded-[32px] blur-2xl"
          style={{
            background:
              "radial-gradient(62% 130% at 50% 100%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 72%)",
            opacity: ui.isPlaying ? 0.95 : 0.55,
            transition: "opacity 1.2s ease",
          }}
        />

        <div className="glass relative overflow-hidden rounded-[24px]">
          {/* liquid light seam along the top edge */}
          <div
            aria-hidden
            className="absolute inset-x-10 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 55%, transparent), transparent)",
            }}
          />

          {/* scrubber — the glowing head of the dock */}
          <div ref={scrubWrap} className="dream-slider px-5 pt-2.5">
            <Slider
              label="seek"
              getFrac={() => (engine.audio.duration ? engine.audio.currentTime / engine.audio.duration : 0)}
              onSeek={(f) => engine.seek(f * (engine.audio.duration || 0))}
              height={5}
            />
          </div>

          <div className="flex items-center gap-3 px-4 pb-3.5 pt-1.5">
            {/* identity — spinning vinyl + titles */}
            <button
              className="flex min-w-0 flex-1 items-center gap-3 text-start sm:flex-[1.1]"
              onClick={() => { ui.setNpTab("play"); ui.setShowNowPlaying(true); }}
              aria-label={t("nowPlaying")}
            >
              <div className="nc-vinyl h-12 w-12 shrink-0" data-spin={ui.isPlaying}>
                <div className="nc-vinyl-disc" />
                <div className="absolute inset-[21%] overflow-hidden rounded-full">
                  <CoverArt trackId={ui.currentId} rounded="rounded-full" />
                </div>
                <div className="nc-vinyl-sheen" />
                <div className="nc-vinyl-hole" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold leading-tight">{track?.title ?? "—"}</div>
                <div className="t-mut truncate text-[12px] leading-tight">{track?.artist ?? ""}</div>
              </div>
              <span
                role="button"
                tabIndex={0}
                aria-label={t("like")}
                onClick={(e) => { e.stopPropagation(); if (ui.currentId) toggleLike(ui.currentId); }}
                className={cn(
                  "ms-1 hidden shrink-0 rounded-full p-1.5 transition-all hover:bg-white/10 hover:scale-110 sm:block",
                  liked && "t-accent"
                )}
              >
                <Heart size={16} fill={liked ? "currentColor" : "none"} />
              </span>
            </button>

            {/* transport */}
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={() => engine.setShuffle(!ui.shuffle)}
                aria-label={t("shuffle")}
                className={cn("hidden rounded-full p-2 transition-all hover:bg-white/10 hover:scale-105 sm:block", ui.shuffle ? "t-accent" : "t-mut")}
              >
                <Shuffle size={15} />
              </button>
              <button onClick={() => engine.prev()} aria-label={t("previous")} title={t("previous")} className="t-mut rounded-full p-2 transition-all hover:bg-white/10 hover:text-[var(--fg)] hover:scale-105">
                <SkipBack size={18} fill="currentColor" />
              </button>
              <button
                onClick={() => engine.toggle()}
                aria-label={ui.isPlaying ? t("pause") : t("play")}
                className="bg-accent np-play mx-1 flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
                data-playing={ui.isPlaying}
              >
                {ui.isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ms-0.5" />}
              </button>
              <button onClick={() => engine.next()} aria-label={t("upNext")} className="t-mut rounded-full p-2 transition-all hover:bg-white/10 hover:text-[var(--fg)] hover:scale-105">
                <SkipForward size={18} fill="currentColor" />
              </button>
              <button
                onClick={() => engine.cycleRepeat()}
                aria-label={t("repeat")}
                className={cn("hidden rounded-full p-2 transition-all hover:bg-white/10 hover:scale-105 sm:block", ui.repeat !== "off" ? "t-accent" : "t-mut")}
              >
                <RepIcon size={15} />
              </button>
            </div>

            {/* meta cluster */}
            <div className="hidden flex-[1.1] items-center justify-end gap-1 md:flex">
              <span className="tnum t-mut text-[11px]"><span ref={elRef}>0:00</span></span>
              <span className="t-faint text-[11px]">/</span>
              <span className="tnum t-mut text-[11px]"><span ref={remRef}>-0:00</span></span>
              <button
                onClick={() => ui.setShowFx(true)}
                aria-label={t("fxTitle")}
                title={t("fxTitle")}
                className="t-mut ms-2 rounded-full p-2 transition-all hover:bg-white/10 hover:text-[var(--fg)] hover:scale-105"
              >
                <SlidersHorizontal size={15} />
              </button>
              <button
                onClick={() => { ui.setNpTab("lyrics"); ui.setShowNowPlaying(true); }}
                aria-label={t("lyrics")}
                className="t-mut rounded-full p-2 transition-all hover:bg-white/10 hover:text-[var(--fg)] hover:scale-105"
              >
                <MicVocal size={15} />
              </button>
              <button
                onClick={() => ui.setShowQueue(true)}
                aria-label={t("queue")}
                className="t-mut rounded-full p-2 transition-all hover:bg-white/10 hover:text-[var(--fg)] hover:scale-105"
              >
                <ListMusic size={15} />
              </button>
              <div ref={volWrap} className="hidden w-20 lg:block">
                <Slider
                  label={t("volume")}
                  height={3}
                  getFrac={() => engine.volume}
                  onSeek={(f) => engine.setVolume(f)}
                />
              </div>
              <button
                onClick={() => { ui.setNpTab("play"); ui.setShowNowPlaying(true); }}
                aria-label={t("expand")}
                className="t-mut rounded-full p-2 transition-all hover:bg-white/10 hover:text-[var(--fg)] hover:scale-105"
              >
                <ChevronUp size={16} />
              </button>
            </div>

            {/* mobile expand */}
            <button
              onClick={() => ui.setShowNowPlaying(true)}
              aria-label={t("expand")}
              className="t-mut rounded-full p-2 transition-all hover:bg-white/10 md:hidden"
            >
              <AudioLines size={16} />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
