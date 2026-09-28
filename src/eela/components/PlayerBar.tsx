// ── NOBODY EELA · floating player bar ────────────────────────────────────────
// Paper dock: mini cover + titles, expand chevron, transport, live progress
// slider (rAF-written --ne-frac), volume, queue toggle and the like heart.
// The two time labels are written imperatively per frame — no React state.

import { useEffect, useState } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Repeat, Repeat1, Shuffle,
  ChevronUp, Heart, ListMusic, Volume2, VolumeX, Music2,
} from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary, LIKED_ID } from "../../cinema/store/library";
import { useUi } from "../../cinema/store/ui";
import { useEelaUi } from "../store/eelaUi";
import { useT } from "../../cinema/lib/useT";
import { CoverArt } from "../../cinema/components/CoverArt";
import { EelaSlider } from "./EelaSlider";
import { fmtTime } from "../../cinema/lib/utils";

/** Per-frame clock for the dock's time labels (single global rAF loop). */
let clockStarted = false;
function startDockClock() {
  if (clockStarted || typeof window === "undefined") return;
  clockStarted = true;
  const tick = () => {
    requestAnimationFrame(tick);
    const a = engine.audio;
    const el = document.querySelector<HTMLElement>("#ne-root .ne-player-time[data-live]");
    const rem = document.querySelector<HTMLElement>("#ne-root .ne-player-time[data-remain]");
    if (!el && !rem) return;
    const d = isFinite(a.duration) ? a.duration : 0;
    if (el) el.textContent = fmtTime(a.currentTime || 0);
    if (rem) rem.textContent = d ? `-${fmtTime(Math.max(0, d - a.currentTime))}` : "-0:00";
  };
  requestAnimationFrame(tick);
}

export function PlayerBar() {
  const t = useT();
  const currentId = useUi((s) => s.currentId);
  const isPlaying = useUi((s) => s.isPlaying);
  const repeat = useUi((s) => s.repeat);
  const shuffle = useUi((s) => s.shuffle);
  const queueLength = useUi((s) => s.queueLength);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const playlists = useLibrary((s) => s.playlists);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const setShowNp = useEelaUi((s) => s.setShowNp);
  const showQueue = useEelaUi((s) => s.showQueue);
  const setShowQueue = useEelaUi((s) => s.setShowQueue);
  const [muted, setMuted] = useState(false);

  useEffect(() => { startDockClock(); }, []);

  const liked = playlists.find((p) => p.id === LIKED_ID)?.trackIds.includes(currentId ?? "") ?? false;

  const toggleMute = () => {
    if (engine.audio.volume > 0) {
      engine.setVolume(0);
      setMuted(true);
    } else {
      engine.setVolume(0.9);
      setMuted(false);
    }
  };

  return (
    <div className="ne-player">
      <div className="ne-player-card">
        {/* now playing (click → full view) */}
        <div
          className="ne-now-track"
          onClick={() => currentId && setShowNp(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" && currentId) setShowNp(true); }}
          aria-label={t("nowPlaying")}
        >
          <div className="h-[42px] w-[42px] shrink-0 overflow-hidden rounded-[10px] shadow-sm">
            {currentId ? (
              <CoverArt trackId={currentId} rounded="rounded-[10px]" />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-[var(--card2)] text-[var(--faint)]">
                <Music2 size={16} />
              </div>
            )}
          </div>
          <div className="ne-now-titles">
            <div className="ne-now-title">{track ? track.title : "NOBODY"}</div>
            <div className="ne-now-artist">{track ? track.artist : t("queueEmpty")}</div>
          </div>
          <button
            className="ne-icon-btn"
            onClick={(e) => { e.stopPropagation(); if (currentId) setShowNp(true); }}
            title={t("expand")}
            aria-label={t("expand")}
          >
            <ChevronUp size={16} />
          </button>
        </div>

        <div className="ne-player-mid">
          <button
            className="ne-icon-btn"
            data-on={shuffle}
            onClick={() => engine.setShuffle(!shuffle)}
            title={t("shuffle")}
            aria-label={t("shuffle")}
            aria-pressed={shuffle}
          >
            <Shuffle size={15} />
          </button>
          <button className="ne-icon-btn" onClick={() => engine.prev()} title={t("previous")} aria-label={t("previous")}>
            <SkipBack size={16} fill="currentColor" />
          </button>
          <button
            className="ne-play-btn"
            onClick={() => engine.toggle()}
            title={isPlaying ? t("pause") : t("play")}
            aria-label={isPlaying ? t("pause") : t("play")}
          >
            {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" style={{ marginInlineStart: 2 }} />}
          </button>
          <button className="ne-icon-btn" onClick={() => engine.next()} title={t("next")} aria-label={t("next")}>
            <SkipForward size={16} fill="currentColor" />
          </button>
          <button
            className="ne-icon-btn"
            data-on={repeat !== "off"}
            onClick={() => engine.cycleRepeat()}
            title={repeat === "one" ? t("repeatOne") : t("repeat")}
            aria-label={repeat === "one" ? t("repeatOne") : t("repeat")}
            aria-pressed={repeat !== "off"}
          >
            {repeat === "one" ? <Repeat1 size={15} /> : <Repeat size={15} />}
          </button>

          <span className="ne-player-time" data-live aria-hidden>0:00</span>
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
          <span className="ne-player-time" data-remain aria-hidden>-0:00</span>
        </div>

        {/* volume + queue + like */}
        <div className="flex items-center gap-1.5" style={{ flex: "none" }}>
          <div className="ne-vol-group flex items-center gap-1.5">
            <button className="ne-icon-btn" onClick={toggleMute} title={t("volume")} aria-label={t("volume")}>
              {muted || engine.audio.volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <div className="w-[76px]">
              <EelaSlider
                getFrac={() => engine.audio.volume}
                onSeek={(f) => { engine.setVolume(f); setMuted(f === 0); }}
                label={t("volume")}
              />
            </div>
          </div>
          <button
            className="ne-icon-btn"
            data-on={showQueue}
            onClick={() => setShowQueue(!showQueue)}
            title={`${t("queue")} · ${queueLength}`}
            aria-label={t("queue")}
            aria-pressed={showQueue}
          >
            <ListMusic size={15} />
          </button>
          <button
            className="ne-icon-btn"
            data-on={liked}
            onClick={() => currentId && toggleLike(currentId)}
            title={t("like")}
            aria-label={t("like")}
            disabled={!currentId}
          >
            <Heart size={15} fill={liked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
    </div>
  );
}
