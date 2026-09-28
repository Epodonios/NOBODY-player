// ── NOBODY EELA · Now Playing (full view) ────────────────────────────────────
// Light gradient stage over the app: framed cover + serif titles + transport
// on the left, the live lyrics sheet (Calm / Karaoke / Minimal) on the right.
// Entrance/exit are transform+opacity only — compositor friendly, no jank.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, SkipBack, SkipForward, ChevronDown, Maximize2, Heart,
} from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary, LIKED_ID } from "../../cinema/store/library";
import { useUi } from "../../cinema/store/ui";
import { useEelaUi } from "../store/eelaUi";
import { useSettings } from "../../cinema/store/settings";
import { useT } from "../../cinema/lib/useT";
import { CoverArt } from "../../cinema/components/CoverArt";
import { smoothBackdrop } from "../lib/backdrop";
import { activeLineIndex, fmtTime } from "../../cinema/lib/utils";
import { EelaSlider } from "./EelaSlider";
import type { EelaLyricsStyle } from "../../cinema/types";

export function NowPlaying() {
  const show = useEelaUi((s) => s.showNp);
  const setShow = useEelaUi((s) => s.setShowNp);
  const setShowAmbient = useEelaUi((s) => s.setShowAmbient);
  const currentId = useUi((s) => s.currentId);
  const isPlaying = useUi((s) => s.isPlaying);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const playlists = useLibrary((s) => s.playlists);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const lyricsStyle = useSettings((s) => s.eelaLyricsStyle ?? "karaoke");
  const setSetting = useSettings((s) => s.set);
  const lyricsSize = useSettings((s) => s.lyricsSize);
  const t = useT();
  const [bg, setBg] = useState<string | null>(null);

  const liked = playlists.find((p) => p.id === LIKED_ID)?.trackIds.includes(currentId ?? "") ?? false;

  // soft cover backdrop — V1.2.0: canvas-smoothed PNG (silky wash, no GPU
  // blur banding / "thumbnail" look)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!currentId || !track?.hasCover) { if (alive) setBg(null); return; }
      const u = await smoothBackdrop(currentId);
      if (alive) setBg(u);
    })();
    return () => { alive = false; };
  }, [currentId, track?.hasCover]);

  const style = { ["--ne-lyr-scale" as any]: String(lyricsSize) };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="ne-np"
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 26 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: "transform, opacity" }}
          role="dialog"
          aria-label={t("nowPlaying")}
        >
          {/* backdrop */}
          {bg && <div className="ne-np-bg" style={{ backgroundImage: `url(${bg})` }} aria-hidden />}
          <div className="ne-np-veil" aria-hidden />

          {/* Electron window drag strip — the ONLY drag surface while NP is
              open (the TopNav parks its own strip while overlays are up).
              16px band above the buttons: the row's pt-5 puts its controls at
              y=20, so the strip never underlaps them. inset-x-0 covers RTL. */}
          <div aria-hidden data-tauri-drag-region className="absolute inset-x-0 top-0 z-10 h-4" />

          {/* top strip — close/ambient buttons are normal no-drag controls
              (cursor fix V1.2.1: the OS-level drag region made the custom
              cursor die over this whole row) */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 pt-5">
            <button className="ne-icon-btn !bg-[var(--card)] !shadow-sm" onClick={() => setShow(false)} title={t("collapse")} aria-label={t("collapse")}>
              <ChevronDown size={17} />
            </button>
            <div className="ne-eyebrow">{t("nowPlaying")}</div>
            <button className="ne-icon-btn !bg-[var(--card)] !shadow-sm" onClick={() => { setShow(false); setShowAmbient(true); }} title={t("enterAmbient")} aria-label={t("enterAmbient")}>
              <Maximize2 size={14} />
            </button>
          </div>

          {!track ? (
            <div className="relative z-10 flex h-full items-center justify-center text-[13px] text-[var(--mut)]">
              {t("queueEmpty")}
            </div>
          ) : (
            <div className="relative z-10 mx-auto grid h-full max-w-[1100px] grid-cols-1 items-center gap-8 px-6 pb-16 pt-20 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:px-10">
              {/* left — art + titles + transport */}
              <div className="flex min-w-0 flex-col items-center lg:items-start">
                <div className="ne-np-frame w-[min(62vw,300px)] lg:w-[300px]">
                  <div className="aspect-square w-full overflow-hidden rounded-[16px]">
                    <CoverArt trackId={track.id} rounded="rounded-[16px]" />
                  </div>
                </div>

                <h2 className="ne-display ne-np-title mt-6 w-full text-center lg:text-start">{track.title}</h2>
                <div className="ne-display ne-np-artist mt-1 w-full text-center lg:text-start">{track.artist}</div>
                <div className="ne-np-meta mt-2 text-center lg:text-start">
                  {track.album || t("unknownAlbum")} · {track.format.toUpperCase()}
                  {track.bitrate
                    ? ` · ${typeof track.bitrate === "number" ? `${track.bitrate} kbps` : String(track.bitrate).replace(/\s*kbps$/i, "") + " kbps"}`
                    : ""}
                </div>

                {/* progress */}
                <div className="mt-5 flex w-full max-w-[360px] items-center gap-3">
                  <span className="ne-player-time" data-np-elapsed aria-hidden>0:00</span>
                  <EelaSlider
                    getFrac={() => {
                      const d = isFinite(engine.audio.duration) ? engine.audio.duration : 0;
                      return d ? engine.audio.currentTime / d : 0;
                    }}
                    onSeek={(f) => {
                      const d = isFinite(engine.audio.duration) ? engine.audio.duration : 0;
                      if (d) engine.seek(f * d);
                    }}
                    label={t("seekFwdBwd")}
                  />
                  <span className="ne-player-time" data-np-remain aria-hidden>-0:00</span>
                  <NpClock />
                </div>

                {/* transport */}
                <div className="mt-3 flex items-center gap-3">
                  <button className="ne-icon-btn !h-10 !w-10" onClick={() => engine.prev()} title={t("previous")} aria-label={t("previous")}>
                    <SkipBack size={18} fill="currentColor" />
                  </button>
                  <button
                    className="ne-play-btn !h-[56px] !w-[56px]"
                    onClick={() => engine.toggle()}
                    title={isPlaying ? t("pause") : t("play")}
                    aria-label={isPlaying ? t("pause") : t("play")}
                  >
                    {isPlaying ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" style={{ marginInlineStart: 3 }} />}
                  </button>
                  <button className="ne-icon-btn !h-10 !w-10" onClick={() => engine.next()} title={t("next")} aria-label={t("next")}>
                    <SkipForward size={18} fill="currentColor" />
                  </button>
                  <button
                    className="ne-icon-btn !h-10 !w-10"
                    data-on={liked}
                    onClick={() => toggleLike(track.id)}
                    title={t("like")}
                    aria-label={t("like")}
                  >
                    <Heart size={17} fill={liked ? "currentColor" : "none"} />
                  </button>
                </div>
              </div>

              {/* right — lyrics sheet (fetch moved to the Download Center) */}
              <LyricsSheet
                trackId={track.id}
                styleMode={lyricsStyle}
                onStyle={(v) => setSetting("eelaLyricsStyle", v)}
                style={style}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* per-frame clock for the NP time labels (mounted only while NP is open) */
function NpClock() {
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = engine.audio;
      const el = document.querySelector<HTMLElement>("#ne-root .ne-np [data-np-elapsed]");
      const rem = document.querySelector<HTMLElement>("#ne-root .ne-np [data-np-remain]");
      const d = isFinite(a.duration) ? a.duration : 0;
      if (el) el.textContent = fmtTime(a.currentTime || 0);
      if (rem) rem.textContent = d ? `-${fmtTime(Math.max(0, d - a.currentTime))}` : "-0:00";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return null;
}

function LyricsSheet({
  trackId, styleMode, onStyle, style,
}: {
  trackId: string;
  styleMode: EelaLyricsStyle;
  onStyle: (s: EelaLyricsStyle) => void;
  style: React.CSSProperties;
}) {
  const t = useT();
  const track = useLibrary((s) => s.tracks[trackId]);
  const isPlaying = useUi((s) => s.isPlaying);
  const currentId = useUi((s) => s.currentId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(-1);

  const lines = useMemo(() => track?.syncedLyrics ?? [], [track?.syncedLyrics]);

  // follow the playhead — state changes only when the line index changes
  useEffect(() => {
    let raf = 0;
    let last = -2;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const a = engine.audio;
      const live = currentId === trackId && (isFinite(a.duration) || true);
      const idx = currentId === trackId ? activeLineIndex(lines, a.currentTime || 0) : -1;
      const next = currentId === trackId && live ? idx : -1;
      if (next !== last) { last = next; setActive(next); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines, trackId, currentId]);

  // keep the active line centered — V1.2.0 fix: the old math used
  // `el.offsetTop`, which is measured against the nearest POSITIONED
  // ancestor, not necessarily this scroll box. When an ancestor above the
  // box was positioned, the computed scroll target landed BELOW the real
  // position — the active line scrolled PAST the viewport (clipped above
  // the box, invisible) and stayed stuck there. Rect deltas are immune to
  // offsetParent; the double rAF re-applies after the style-driven size
  // change of the line itself settles.
  useEffect(() => {
    if (active < 0) return;
    const centerActive = () => {
      const el = lineRefs.current[active];
      const box = scrollRef.current;
      if (!el || !box) return;
      const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
      const target = box.scrollTop + delta - box.clientHeight / 2 + el.clientHeight / 2;
      box.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    };
    centerActive();
    const raf = requestAnimationFrame(centerActive);
    return () => cancelAnimationFrame(raf);
  }, [active, styleMode]);

  const styles: { id: EelaLyricsStyle; label: string }[] = [
    { id: "calm", label: t("eCalm") },
    { id: "karaoke", label: t("stKaraoke") },
    { id: "minimal", label: t("stMinimal") },
  ];

  return (
    <div className="ne-card flex h-[min(64vh,560px)] min-h-0 flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="ne-eyebrow">{t("lyrics")} · LIVE</div>
        <div className="ne-seg" role="group" aria-label={t("stLyricsStyle")}>
          {styles.map((s) => (
            <button key={s.id} className="ne-seg-btn" data-on={styleMode === s.id} onClick={() => onStyle(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {lines.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="ne-display text-[20px] italic text-[var(--mut)]">{t("noLyricsTitle")}</div>
          <div className="max-w-[300px] text-[12px] leading-relaxed text-[var(--faint)]">{t("noLyricsHint")}</div>
          <div className="text-[11px] text-[var(--faint)]">{t("dlTitle")}</div>
        </div>
      ) : (
        <div ref={scrollRef} className="ne-scroll ne-lyr-mask mt-2 min-h-0 flex-1 px-1 pe-2" style={style}>
          <div className="ne-lyr py-[24%]" data-style={styleMode} data-paused={!isPlaying}>
            {lines.map((ln, i) => (
              <button
                key={`${i}-${ln.t}`}
                ref={(el) => { lineRefs.current[i] = el; }}
                className="ne-lyr-line"
                data-active={i === active}
                onClick={() => engine.seek(Math.max(0, ln.t - 0.2))}
                aria-label={ln.text}
              >
                {ln.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
