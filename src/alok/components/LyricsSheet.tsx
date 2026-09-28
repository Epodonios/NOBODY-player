// ── NOBODY ALOK · lyrics sheet (right slide-in) ──────────────────────────────
// Synced lyrics in mono style: the current line bright with a blinking caret
// block, neighbors dimmed by distance, auto-scroll, click a line to seek.
// Plain (unsynced) lyrics render gracefully without a follow highlight.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkles, X } from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary } from "../../cinema/store/library";
import { useUi, uiApi } from "../../cinema/store/ui";
import { useSettings } from "../../cinema/store/settings";
import { useAlokUi } from "../store/alokUi";
import { useT } from "../../cinema/lib/useT";
import { activeLineIndex } from "../../cinema/lib/utils";
import { fetchOneLyrics } from "../../cinema/lib/smartFetch";

export function LyricsSheet() {
  const t = useT();
  const show = useAlokUi((s) => s.showLyrics);
  const setShow = useAlokUi((s) => s.setShowLyrics);
  const currentId = useUi((s) => s.currentId);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const lyrScale = useSettings((s) => s.lyricsSize ?? 1);

  const synced = useMemo(() => track?.syncedLyrics ?? [], [track?.syncedLyrics]);
  const plain = synced.length === 0 && track?.plainLyrics ? track.plainLyrics.split(/\r?\n/) : [];
  const isSynced = synced.length > 0;

  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(-1);

  // follow the playhead — state changes only when the line index changes
  useEffect(() => {
    if (!show || !isSynced) return;
    let raf = 0;
    let last = -2;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const idx = activeLineIndex(synced, engine.audio.currentTime || 0);
      if (idx !== last) { last = idx; setActive(idx); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [show, isSynced, synced]);

  // keep the active line centered
  useEffect(() => {
    if (active < 0) return;
    const el = lineRefs.current[active];
    const box = scrollRef.current;
    if (!el || !box) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [active]);

  const doFetch = async () => {
    if (!track) return;
    const ok = await fetchOneLyrics(track.id);
    if (!ok) uiApi.toast(t("notFoundToast"), "info");
  };

  const lines: { text: string; time?: number }[] = isSynced
    ? synced.map((l) => ({ text: l.text, time: l.t }))
    : plain.map((text) => ({ text }));

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          className="na-sheet"
          role="dialog"
          aria-label={t("alLyrics")}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: "transform, opacity" }}
        >
          <div className="na-sheet-head">
            <div>
              <div className="na-sheet-title">{t("alLyrics")}</div>
              <div className="na-mono mt-1 text-[10px] text-[var(--na-faint)]" style={{ fontSize: 10 }}>
                {track ? `${track.title} — ${track.artist}` : "NOBODY"}
              </div>
            </div>
            <button className="na-panel-x" onClick={() => setShow(false)} title={t("close")} aria-label={t("close")}>
              <X size={15} />
            </button>
          </div>

          <div
            className="na-sheet-body na-scroll na-lyr-mask na-lyr-scale px-3 py-[18%]"
            ref={scrollRef}
            style={{ ["--na-lyr-scale" as any]: lyrScale }}
          >
            {!track || lines.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="na-mono text-[11px] tracking-[0.24em] text-[var(--na-faint)]">{t("alNoLyrics")}</div>
                <button className="na-btn" onClick={() => void doFetch()}>
                  <Sparkles size={13} />
                  {t("fetchLyricsNow")}
                </button>
              </div>
            ) : (
              lines.map((ln, i) => {
                const dist = active < 0 ? 9 : Math.abs(i - active);
                const isActive = isSynced && i === active;
                return (
                  <button
                    key={`${i}-${ln.time ?? "p"}`}
                    ref={(el) => { lineRefs.current[i] = el; }}
                    className="na-lyr-line"
                    data-active={isActive}
                    style={{ opacity: isActive ? 1 : Math.max(0.22, 1 - dist * 0.16) }}
                    onClick={() => { if (ln.time !== undefined) engine.seek(Math.max(0, ln.time - 0.2)); }}
                    aria-label={ln.text}
                  >
                    {ln.text}
                    {isActive && <span className="na-lyr-caret" aria-hidden />}
                  </button>
                );
              })
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
