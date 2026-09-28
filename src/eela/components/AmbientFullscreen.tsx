// ── NOBODY EELA · ambient fullscreen ─────────────────────────────────────────
// The screenshot-510 moment: blurred cover wash, centered art, serif titles
// and a breathing teal spectrum. Click anywhere or press Escape to return.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary } from "../../cinema/store/library";
import { useUi } from "../../cinema/store/ui";
import { useEelaUi } from "../store/eelaUi";
import { useT } from "../../cinema/lib/useT";
import { CoverArt } from "../../cinema/components/CoverArt";
import { smoothBackdrop } from "../lib/backdrop";
import { EelaVisualizer } from "./EelaVisualizer";

export function AmbientFullscreen() {
  const show = useEelaUi((s) => s.showAmbient);
  const setShow = useEelaUi((s) => s.setShowAmbient);
  const currentId = useUi((s) => s.currentId);
  const isPlaying = useUi((s) => s.isPlaying);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const t = useT();
  const [bg, setBg] = useState<string | null>(null);

  // defensive lookup — the shared cinema dict may not carry these ambient
  // transport keys yet; fall back to the English labels
  const tt = (k: string, fb: string) => { const v = t(k); return !v || v === k ? fb : v; };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!currentId || !track?.hasCover) { if (alive) setBg(null); return; }
      const u = await smoothBackdrop(currentId);
      if (alive) setBg(u);
    })();
    return () => { alive = false; };
  }, [currentId, track?.hasCover]);

  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShow(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, setShow]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="ne-ambient"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          onClick={() => setShow(false)}
          role="dialog"
          aria-label={t("enterAmbient")}
        >
          {bg && <div className="ne-ambient-bg" style={{ backgroundImage: `url(${bg})` }} aria-hidden />}
          <button
            className="ne-ambient-close"
            onClick={(e) => { e.stopPropagation(); setShow(false); }}
            title={t("close")}
            aria-label={t("close")}
          >
            <X size={16} />
          </button>

          <div className="relative z-10 flex flex-col items-center px-8 text-center">
            {currentId && (
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="w-[min(46vw,220px)]"
              >
                <div className="aspect-square w-full overflow-hidden rounded-[22px]" style={{ boxShadow: "var(--shadow-lg)" }}>
                  <CoverArt trackId={currentId} rounded="rounded-[22px]" />
                </div>
              </motion.div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.5 }}
            >
              <h2 className="ne-display mt-7 text-[clamp(2rem,5.4vw,3.3rem)] font-bold leading-tight">
                {track?.title ?? "NOBODY"}
              </h2>
              <div className="ne-display mt-1 text-[15px] italic text-[var(--mut)]">{track?.artist ?? ""}</div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.6 }}
              className="mt-8 w-[min(84vw,560px)]"
            >
              <EelaVisualizer height={72} bars={44} />
            </motion.div>

            {/* transport — prev / play-pause / next, serif ghost buttons.
                The root overlay closes on ANY click, so both pointerdown and
                click stopPropagation here: pressing transport must never
                exit the stage. */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38, duration: 0.5 }}
              className="ne-transport"
              role="group"
              aria-label={tt("ambToggle", "Play or pause")}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="ne-transport-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); engine.prev(); }}
                aria-label={tt("ambPrev", "Previous")}
                title={tt("ambPrev", "Previous")}
              >
                <SkipBack size={16} />
              </button>
              <button
                type="button"
                className="ne-transport-btn"
                data-main="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); engine.toggle(); }}
                aria-label={tt("ambToggle", "Play or pause")}
                title={tt("ambToggle", "Play or pause")}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
              </button>
              <button
                type="button"
                className="ne-transport-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); engine.next(); }}
                aria-label={tt("ambNext", "Next")}
                title={tt("ambNext", "Next")}
              >
                <SkipForward size={16} />
              </button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
