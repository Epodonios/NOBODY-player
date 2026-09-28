// ── NOBODY ALOK · mood sheet (right slide-in, the fun one) ───────────────────
// The ring palette picker (cover / spectrum / ember / aurora / ice / mono)
// shown as gradient swatches, plus the radial visualizer, custom cursor and
// Void/Graphite theme toggles.

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useSettings } from "../../cinema/store/settings";
import { useAlokUi } from "../store/alokUi";
import { useT } from "../../cinema/lib/useT";
import { ALOK_RINGS, type AlokRing } from "../lib/palette";

const SWATCH_BG: Record<AlokRing, string> = {
  cover: "conic-gradient(from -90deg, #ffb347, #ff5c8a 30%, #a06bff 60%, #4dd8ff 85%, #ffb347)",
  spectrum: "conic-gradient(from -90deg, #ffb347, #ff5c8a 28%, #a06bff 55%, #4dd8ff 80%, #ffb347)",
  ember: "conic-gradient(from -90deg, #ffd29d, #ff8a3d 32%, #ff3d5e 66%, #ffd29d)",
  aurora: "conic-gradient(from -90deg, #3dffb0, #4dd8ff 38%, #4d9fff 68%, #3dffb0)",
  ice: "conic-gradient(from -90deg, #e8fbff, #7dd8ff 40%, #9db4ff 74%, #e8fbff)",
  mono: "conic-gradient(from -90deg, #ffffff, #8b8b95 38%, #e6e6ec 68%, #ffffff)",
};

const RING_LABEL: Record<AlokRing, "alCover" | "alSpectrum" | "alEmber" | "alAurora" | "alIce" | "alMono"> = {
  cover: "alCover",
  spectrum: "alSpectrum",
  ember: "alEmber",
  aurora: "alAurora",
  ice: "alIce",
  mono: "alMono",
};

export function MoodSheet() {
  const t = useT();
  const show = useAlokUi((s) => s.showMood);
  const setShow = useAlokUi((s) => s.setShowMood);
  const s = useSettings();

  const ring = s.alokRing ?? "cover";
  const vizOn = s.alokVisualizer ?? true;

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          className="na-sheet"
          role="dialog"
          aria-label={t("alMood")}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: "transform, opacity" }}
        >
          <div className="na-sheet-head">
            <div className="na-sheet-title">{t("alMood")}</div>
            <button className="na-panel-x" onClick={() => setShow(false)} title={t("close")} aria-label={t("close")}>
              <X size={15} />
            </button>
          </div>

          <div className="na-sheet-body na-scroll">
            {/* ring palette */}
            <section className="px-4 pt-4">
              <div className="na-fx-label mb-3">{t("alPalette")}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ALOK_RINGS.map((id) => (
                  <button
                    key={id}
                    className="na-swatch"
                    data-on={ring === id}
                    onClick={() => s.set("alokRing", id)}
                    aria-pressed={ring === id}
                  >
                    <span className="na-swatch-dot" style={{ background: SWATCH_BG[id] }} aria-hidden />
                    <span className="na-swatch-name">{t(RING_LABEL[id])}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* visualizer */}
            <div className="na-setting-row mt-4">
              <span className="na-setting-label">{t("alVisualizer")}</span>
              <span
                role="switch"
                aria-checked={vizOn}
                tabIndex={0}
                className="na-switch"
                data-on={vizOn}
                onClick={() => s.set("alokVisualizer", !vizOn)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") s.set("alokVisualizer", !vizOn); }}
              />
            </div>

            {/* custom cursor removed (user ask: same cursor as Classic UI everywhere) */}

            {/* theme */}
            <div className="na-setting-row" style={{ borderBottom: "none" }}>
              <span className="na-setting-label">{t("stTheme")}</span>
              <div className="na-seg" role="group" aria-label={t("stTheme")}>
                <button className="na-seg-btn" data-on={(s.alokTheme ?? "void") === "void"} onClick={() => s.set("alokTheme", "void")}>
                  {t("alThemeVoid")}
                </button>
                <button className="na-seg-btn" data-on={s.alokTheme === "graphite"} onClick={() => s.set("alokTheme", "graphite")}>
                  {t("alThemeGraphite")}
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
