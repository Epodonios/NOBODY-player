// ── NOBODY · mini floating lyric ─────────────────────────────────────────────
// A weightless glass chip floating above the player dock that whispers the
// current lyric line — for when the full lyrics view feels like too much.
// rAF + refs: per-frame time reads never re-render React. Only shows when the
// track HAS synced lyrics and the setting is on.

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { engine } from "../lib/engine";
import { useUi } from "../store/ui";
import { useLibrary } from "../store/library";
import { useSettings } from "../store/settings";
import { activeLineIndex } from "../lib/utils";

export function MiniLyrics() {
  const enabled = useSettings((s) => s.miniLyrics !== false);
  const showNowPlaying = useUi((s) => s.showNowPlaying);
  const ambient = useUi((s) => s.ambient);
  const isPlaying = useUi((s) => s.isPlaying);
  const currentId = useUi((s) => s.currentId);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const textRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const lines = track?.syncedLyrics ?? [];
  const hasLines = lines.length > 0;

  useEffect(() => {
    if (!enabled || !hasLines) return;
    let raf = 0;
    let last = -2;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const box = boxRef.current;
      if (!box || box.offsetParent === null) return; // pane hidden / not mounted
      const el = textRef.current ?? box.querySelector("[data-mini-line]") as HTMLDivElement | null;
      if (!el) return;
      const idx = activeLineIndex(lines, engine.audio.currentTime);
      if (idx !== last) {
        last = idx;
        const text = lines[idx]?.text || "♪";
        if (el.textContent !== text) el.textContent = text;
        el.dataset.on = engine.audio.paused ? "false" : "true";
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled, hasLines, lines, track?.id]);

  const visible = enabled && hasLines && !showNowPlaying && !ambient && !!currentId;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 10, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed inset-x-0 bottom-[86px] z-[45] flex justify-center px-6"
        >
          <div
            ref={boxRef}
            className="glass flex items-center gap-2.5 rounded-full px-5 py-2.5"
            style={{ maxWidth: "min(680px, 92vw)", boxShadow: "0 12px 40px -12px rgba(0,0,0,.6)" }}
          >
            <span aria-hidden className="flex items-end gap-[2px]">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-[2.5px] rounded-full"
                  style={{
                    height: isPlaying ? 8 + (i % 2) * 5 : 5,
                    background: "var(--accent)",
                    transition: "height .4s ease",
                    animation: isPlaying ? `nc-eq-bounce ${1.1 + i * 0.25}s ease-in-out infinite` : undefined,
                    opacity: isPlaying ? 1 : 0.5,
                  }}
                />
              ))}
            </span>
            <div
              ref={textRef}
              data-mini-line
              className="truncate text-[13.5px] italic leading-snug"
              style={{ fontFamily: "var(--font-display)" }}
              data-on="false"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
