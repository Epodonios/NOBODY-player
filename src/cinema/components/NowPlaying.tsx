// ── NOBODY · expanded Now Playing overlay — rêve stage ───────────────────────
// Performance notes (user-reported jank when expanding):
//  • entrance is a short TWEEN on transform/opacity only (no spring, no scale)
//    with will-change hints — the layer promotes once and glides.
//  • while the overlay is open the background aurora/paint work is paused via
//    [data-np] on #nc-root (the overlay carries its own brighter dream).
//  • the lyrics pane is now full-bleed (one less large backdrop-filter surface
//    animating inside the panel).

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Heart, ListMusic, Moon, ImagePlus, SlidersHorizontal,
} from "lucide-react";
import { engine } from "../lib/engine";
import { useUi, uiApi, trackMotif } from "../store/ui";
import { useLibrary, LIKED_ID } from "../store/library";
import { useSettings } from "../store/settings";
import { fetchOneCover } from "../lib/smartFetch";
import { useT } from "../lib/useT";
import { fmtTime, clamp } from "../lib/utils";
import { Slider } from "./Slider";
import { CoverArt } from "./CoverArt";
import { LyricsView } from "./LyricsView";
import { Visualizer } from "./Visualizer";
import { DreamField } from "./DreamField";
import { cn } from "../utils/cn";

export function NowPlaying() {
  const t = useT();
  const ui = useUi();
  const track = useLibrary((s) => (ui.currentId ? s.tracks[ui.currentId] : undefined));
  const likedIds = useLibrary((s) => s.playlists.find((p) => p.id === LIKED_ID)?.trackIds ?? []);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const eqStyle = useSettings((s) => s.eqStyle);
  const liked = ui.currentId ? likedIds.includes(ui.currentId) : false;

  const scrubWrap = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLSpanElement>(null);
  const durRef = useRef<HTMLSpanElement>(null);

  // signal the shell that the big stage is open (pauses background aurora)
  useEffect(() => {
    const root = document.getElementById("nc-root");
    if (!root) return;
    if (ui.showNowPlaying) root.setAttribute("data-np", "true");
    else root.removeAttribute("data-np");
    return () => root.removeAttribute("data-np");
  }, [ui.showNowPlaying]);

  useEffect(() => {
    if (!ui.showNowPlaying) return;
    let raf = 0;
    let lastEl = -1, lastDur = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const a = engine.audio;
      const dur = a.duration || track?.duration || 0;
      const wrap = scrubWrap.current;
      if (wrap) {
        const fill = wrap.querySelector<HTMLElement>("[data-slider] > div > div");
        const knob = wrap.querySelectorAll<HTMLElement>("[data-slider] > div")[1];
        const f = clamp(dur ? a.currentTime / dur : 0, 0, 1);
        if (fill) fill.style.transform = `scaleX(${f})`;
        if (knob) knob.style.insetInlineStart = `${f * 100}%`;
      }
      const el = Math.floor(a.currentTime);
      const d = Math.floor(dur);
      if (el !== lastEl && elRef.current) { elRef.current.textContent = fmtTime(el); lastEl = el; }
      if (d !== lastDur && durRef.current) { durRef.current.textContent = fmtTime(d); lastDur = d; }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ui.showNowPlaying, track?.duration]);

  const motif = trackMotif(track);

  const RepIcon = ui.repeat === "one" ? Repeat1 : Repeat;

  return (
    <AnimatePresence>
      {ui.showNowPlaying && (
        <motion.div
          initial={{ opacity: 0, y: "3.5%" }}
          animate={{ opacity: 1, y: "0%" }}
          exit={{ opacity: 0, y: "3%" }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: "transform, opacity", contain: "layout paint" }}
          className="fixed inset-0 z-50 overflow-hidden"
        >
          {/* stage floor — opaque, painted once; lighter than a blurred backdrop */}
          <div className="absolute inset-0" style={{ background: "var(--bg)" }} aria-hidden />
          {/* the dream, closer and brighter on the big stage */}
          <DreamField strong />

          {/* deterministic motif backdrop */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {motif === 0 && track && (
              <div className="outline-text absolute -bottom-8 start-0 select-none whitespace-nowrap font-display text-[22vw] font-bold italic leading-none opacity-60">
                {track.artist}
              </div>
            )}
            {motif === 1 && track && (
              <div className="outline-text absolute -top-10 end-4 select-none font-display text-[34vw] font-bold italic leading-none opacity-50">
                {[...track.title][0]}
              </div>
            )}
            {motif === 2 && (
              <div className="absolute inset-0 flex items-center justify-center opacity-40">
                {[26, 34, 46, 62].map((s) => (
                  <div key={s} className="absolute rounded-full border" style={{ width: `${s}vmin`, height: `${s}vmin`, borderColor: "var(--line)" }} />
                ))}
              </div>
            )}
          </div>

          {/* Electron window drag strip — the ONLY drag surface while the
              overlay is open (the main TopBar parks its strip). An empty 16px
              band above the buttons: this row's py-4 puts its controls at
              y=16 exactly, so the strip never underlaps them. inset-x-0
              covers RTL. */}
          <div aria-hidden data-tauri-drag-region className="absolute inset-x-0 top-0 z-10 h-4" />

          {/* top bar — the close/expand/queue buttons are normal no-drag
              controls (cursor fix V1.2.1: the OS-level drag region made the
              custom cursor die over this whole row) */}
          <div
            className="relative z-10 flex items-center justify-between px-5 py-4 lg:px-8"
          >
            <button
              onClick={() => ui.setShowNowPlaying(false)}
              aria-label={t("collapse")}
              className="t-mut rounded-full p-2.5 transition-colors hover:bg-white/10"
            >
              <ChevronDown size={20} />
            </button>
            <div className="t-faint text-[10px] uppercase tracking-[0.28em]">{t("nowPlaying")}</div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => ui.setShowFx(true)}
                aria-label={t("fxTitle")}
                title={t("fxTitle")}
                className="t-mut rounded-full p-2.5 transition-colors hover:bg-white/10"
              >
                <SlidersHorizontal size={16} />
              </button>
              <button
                onClick={() => ui.setAmbient(true, true)}
                aria-label={t("enterAmbient")}
                title={t("enterAmbient")}
                className="t-mut rounded-full p-2.5 transition-colors hover:bg-white/10"
              >
                <Moon size={17} />
              </button>
              <button
                onClick={() => { ui.setShowQueue(true); }}
                aria-label={t("queue")}
                className="t-mut rounded-full p-2.5 transition-colors hover:bg-white/10"
              >
                <ListMusic size={17} />
              </button>
            </div>
          </div>

          {track ? (
            <div className="relative z-10 mx-auto grid h-[calc(100%-64px)] w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] px-5 pb-5 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-12 lg:px-8 lg:pb-10">
              {/* cover side */}
              <div className="flex items-center justify-center lg:h-full">
                <motion.div
                  key={track.id}
                  initial={{ scale: 0.94, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.45, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
                  className="relative aspect-square w-[min(58vw,300px)] lg:w-full"
                >
                  {/* orbiting halo of light */}
                  <div className="nc-halo" aria-hidden />
                  <div
                    className="absolute -inset-6 rounded-[2.2rem] blur-2xl"
                    style={{
                      background: "var(--accent)",
                      transition: "background .8s",
                      opacity: ui.isPlaying ? 0.5 : 0.3,
                    }}
                    aria-hidden
                  />
                  <div className="relative h-full w-full overflow-hidden rounded-[1.6rem] border" style={{ borderColor: "var(--line2)", boxShadow: "var(--shadow)" }}>
                    <CoverArt trackId={track.id} />
                    <div className="vinyl-ring pointer-events-none absolute inset-0 opacity-60" />
                  </div>
                  {track.isPlaceholderCover && (
                    <button
                      onClick={async () => {
                        const ok = await fetchOneCover(track.id);
                        uiApi.toast(ok ? t("coverFound") : t("notFoundToast"), ok ? "success" : "info");
                      }}
                      className="absolute bottom-3 end-3 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10.5px] backdrop-blur-md transition-transform hover:scale-105"
                      style={{ background: "rgba(0,0,0,.5)", borderColor: "rgba(255,255,255,.18)", color: "#fff" }}
                    >
                      <ImagePlus size={12} /> {t("sfCovers")}
                    </button>
                  )}
                </motion.div>
              </div>

              {/* info + controls + lyrics */}
              <div className="flex min-h-0 flex-col">
                {/* tabs — floating segmented pill */}
                <div className="mb-3 flex items-center gap-1 lg:mb-4">
                  <div className="glass flex items-center gap-0.5 rounded-full p-1">
                    {(["play", "lyrics"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => ui.setNpTab(tab)}
                        className={cn(
                          "relative rounded-full px-4 py-1.5 text-[12px] transition-colors",
                          ui.npTab === tab ? "font-semibold t-accent" : "t-mut hover:text-[var(--fg)]"
                        )}
                      >
                        {ui.npTab === tab && (
                          <motion.span
                            layoutId="np-tab-pill"
                            transition={{ type: "spring", stiffness: 460, damping: 36 }}
                            className="absolute inset-0 rounded-full"
                            style={{
                              background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                              boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 36%, transparent)",
                            }}
                          />
                        )}
                        <span className="relative">{tab === "play" ? t("nowPlaying") : t("lyrics")}</span>
                      </button>
                    ))}
                  </div>
                  <span className="t-faint ms-auto hidden text-[10px] uppercase tracking-widest sm:block">
                    {track.format}{track.bitrate ? ` · ${track.bitrate} kbps` : ""}{track.year ? ` · ${track.year}` : ""}
                  </span>
                </div>

                {ui.npTab === "lyrics" ? (
                  /* full-bleed lyric stage — breathing mask fades instead of a glass box */
                  <div className="min-h-0 flex-1">
                    <LyricsView track={track} />
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col justify-end lg:justify-center">
                    {/* animated title reveal — per track change */}
                    <motion.h1
                      key={track.id}
                      className="font-display text-[clamp(1.7rem,4.6vw,3.6rem)] font-semibold leading-[1.04] tracking-tight"
                      aria-label={track.title}
                    >
                      {track.title.split(/\s+/).map((w, i) => (
                        <span key={i} className="inline-block overflow-hidden pb-1 align-bottom">
                          <motion.span
                            className="inline-block"
                            initial={{ y: "110%", rotate: 4 }}
                            animate={{ y: 0, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 210, damping: 26, delay: 0.05 + i * 0.055 }}
                          >
                            {w}&nbsp;
                          </motion.span>
                        </span>
                      ))}
                    </motion.h1>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="t-mut mt-2 flex items-center gap-2 text-[clamp(0.95rem,1.6vw,1.25rem)]"
                    >
                      <span className="font-display italic">{track.artist}</span>
                      {track.album !== "Unknown Album" && (
                        <>
                          <span className="t-faint">—</span>
                          <span className="truncate text-[0.85em]">{track.album}</span>
                        </>
                      )}
                    </motion.div>

                    {/* live visual strip */}
                    <div className="mt-5 h-14 opacity-90 lg:mt-7">
                      <Visualizer variant={eqStyle} trackSeed={track.id} className="h-full w-full" dim />
                    </div>

                    {/* scrubber */}
                    <div ref={scrubWrap} className="dream-slider mt-4">
                      <Slider
                        label="seek"
                        height={5}
                        getFrac={() => (engine.audio.duration ? engine.audio.currentTime / engine.audio.duration : 0)}
                        onSeek={(f) => engine.seek(f * (engine.audio.duration || 0))}
                      />
                      <div className="tnum t-mut mt-1 flex justify-between text-[11px]">
                        <span ref={elRef}>0:00</span>
                        <span ref={durRef}>{fmtTime(track.duration)}</span>
                      </div>
                    </div>

                    {/* transport */}
                    <div className="mt-3 flex items-center gap-2 lg:mt-5">
                      <button
                        onClick={() => engine.setShuffle(!ui.shuffle)}
                        aria-label={t("shuffle")}
                        className={cn("rounded-full p-2.5 transition-colors hover:bg-white/10", ui.shuffle ? "t-accent" : "t-mut")}
                      >
                        <Shuffle size={16} />
                      </button>
                      <div className="flex flex-1 items-center justify-center gap-3">
                        <button onClick={() => engine.prev()} aria-label="prev" className="rounded-full p-3 transition-colors hover:bg-white/10">
                          <SkipBack size={22} fill="currentColor" />
                        </button>
                        <button
                          onClick={() => engine.toggle()}
                          aria-label="play/pause"
                          className="bg-accent np-play flex h-14 w-14 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95"
                          data-playing={ui.isPlaying}
                        >
                          {ui.isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="ms-0.5" />}
                        </button>
                        <button onClick={() => engine.next()} aria-label="next" className="rounded-full p-3 transition-colors hover:bg-white/10">
                          <SkipForward size={22} fill="currentColor" />
                        </button>
                      </div>
                      <button
                        onClick={() => engine.cycleRepeat()}
                        aria-label={t("repeat")}
                        className={cn("rounded-full p-2.5 transition-colors hover:bg-white/10", ui.repeat !== "off" ? "t-accent" : "t-mut")}
                      >
                        <RepIcon size={16} />
                      </button>
                      <button
                        onClick={() => toggleLike(track.id)}
                        aria-label={t("like")}
                        className={cn("rounded-full p-2.5 transition-colors hover:bg-white/10", liked ? "t-accent" : "t-mut")}
                      >
                        <Heart size={16} fill={liked ? "currentColor" : "none"} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="t-mut relative z-10 flex h-full items-center justify-center">{t("queueEmpty")}</div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
