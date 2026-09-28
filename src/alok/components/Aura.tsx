// ── NOBODY ALOK · Aura (fullscreen ambient) ──────────────────────────────────
// Pure black stage, a pre-blurred cover wash, one big breathing ring
// visualizer and the mono track title. Click anywhere or Esc to return
// (Esc is handled by the App keyboard guard — topmost overlay).

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, SkipBack, Play, Pause, SkipForward } from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { db } from "../../cinema/lib/db";
import { blurredBackdrop } from "../../cinema/lib/covers";
import { useLibrary } from "../../cinema/store/library";
import { useUi } from "../../cinema/store/ui";
import { useAlokUi } from "../store/alokUi";
import { useSettings } from "../../cinema/store/settings";
import { useT } from "../../cinema/lib/useT";
import { useAlokT } from "../lib/i18n";
import { RadialViz } from "./RadialViz";
import { vizColors } from "../lib/palette";

export function Aura({ accent }: { accent: string }) {
  const t = useT();
  // ALOK-dict-first lookup with a defensive EN fallback — the RU dictionary
  // agent adds the alAmb* keys in parallel, so a missing key must not print
  // its raw key name into the ambient UI
  const at = useAlokT();
  const tt = (k: string, fb: string) => {
    const v = at(k);
    return !v || v === k ? fb : v;
  };
  const show = useAlokUi((s) => s.showAura);
  const setShow = useAlokUi((s) => s.setShowAura);
  const currentId = useUi((s) => s.currentId);
  const isPlaying = useUi((s) => s.isPlaying);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const ring = useSettings((s) => s.alokRing ?? "cover");
  const [bg, setBg] = useState<string | null>(null);

  // pre-blurred backdrop — the blur is painted ONCE into a canvas, never a
  // live CSS filter on an animating layer
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!currentId || !track?.hasCover) { if (alive) setBg(null); return; }
      const blob = await db.getCover(currentId);
      if (!blob) { if (alive) setBg(null); return; }
      const url = await blurredBackdrop(currentId, blob);
      if (alive) setBg(url);
    })();
    return () => { alive = false; };
  }, [currentId, track?.hasCover]);

  const size = Math.min(560, typeof window !== "undefined" ? Math.min(window.innerWidth * 0.72, window.innerHeight * 0.56) : 420);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="na-aura"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          onClick={() => setShow(false)}
          role="dialog"
          aria-label={t("alAura")}
        >
          {bg && <div className="na-aura-bg" style={{ backgroundImage: `url(${bg})` }} aria-hidden />}
          <div className="na-aura-veil" aria-hidden />

          <button
            className="na-aura-close"
            onClick={(e) => { e.stopPropagation(); setShow(false); }}
            title={t("close")}
            aria-label={t("close")}
          >
            <X size={16} />
          </button>

          <div className="relative z-10 flex flex-col items-center px-8 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden
            >
              <RadialViz size={size} colors={vizColors(ring, accent)} bars={96} inner={0.42} alpha={0.85} />
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.5 }}
            >
              <h2 className="na-aura-title">{track?.title ?? "NOBODY"}</h2>
              <div className="na-aura-artist">{track?.artist ?? ""}</div>
            </motion.div>
            {/* transport cluster — mono ruled buttons; both pointer handlers
                stop the event so the stage-root click (close on click) never
                fires from a transport press */}
            <motion.div
              className="na-aura-transport"
              role="group"
              aria-label={tt("alAmbToggle", "Playback")}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="na-aura-tbtn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); engine.prev(); }}
                aria-label={tt("alAmbPrev", "Previous")}
                title={tt("alAmbPrev", "Previous")}
              >
                <SkipBack size={15} />
              </button>
              <button
                type="button"
                className="na-aura-tbtn na-aura-tbtn-main"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); engine.toggle(); }}
                aria-label={tt("alAmbToggle", isPlaying ? "Pause" : "Play")}
                title={tt("alAmbToggle", isPlaying ? "Pause" : "Play")}
              >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ms-0.5" />}
              </button>
              <button
                type="button"
                className="na-aura-tbtn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); engine.next(); }}
                aria-label={tt("alAmbNext", "Next")}
                title={tt("alAmbNext", "Next")}
              >
                <SkipForward size={15} />
              </button>
            </motion.div>
          </div>

          <div className="na-aura-hint" aria-hidden>ESC — {t("close")}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
