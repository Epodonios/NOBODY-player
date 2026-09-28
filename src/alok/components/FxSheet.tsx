// ── NOBODY ALOK · FX bottom sheet ────────────────────────────────────────────
// EQ on/off + 6 vertical band sliders (engine.setEq) + presets, playback speed
// (engine.setRate 0.5–2, pitch preserved by the engine) and the sleep timer
// with a live countdown. Logic adapted from cinema's FxSheet, restyled to the
// ALOK mono/hairline aesthetic.

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { engine, EQ_FREQS } from "../../cinema/lib/engine";
import { useSettings } from "../../cinema/store/settings";
import { useAlokUi } from "../store/alokUi";
import { useT } from "../../cinema/lib/useT";

const PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0],
  bass: [7, 5, 2.5, 0, -1, -1.5],
  vocal: [-2, -1, 1.5, 4.5, 4, 1.5],
  treble: [-1.5, -1, 0, 1, 4.5, 6.5],
};

const SLEEP_OPTIONS = [0, 5, 15, 30, 60]; // 0 = end of track
const SPEED_CHIPS = [0.75, 1, 1.25, 1.5, 2];

export function FxSheet() {
  const t = useT();
  const show = useAlokUi((s) => s.showFx);
  const setShow = useAlokUi((s) => s.setShowFx);
  const settings = useSettings();
  const [, force] = useState(0); // re-render for countdown + engine-driven chips

  // engine pushes coarse state (play/pause/sleep changes) — reflect instantly
  useEffect(() => engine.on("state", () => force((n) => n + 1)), []);

  // countdown tick while a timed sleep is active
  useEffect(() => {
    if (!show || engine.sleepMode !== "timed") return;
    const iv = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(iv);
  }, [show, engine.sleepMode]);

  const eqOn = settings.eqEnabled ?? false;
  const gains = settings.eqGains ?? [0, 0, 0, 0, 0, 0];
  const speed = settings.speed ?? 1;

  const setGain = (i: number, v: number) => {
    const next = [...gains];
    next[i] = v;
    engine.setEq(eqOn, next);
  };

  const activePreset = Object.keys(PRESETS).find(
    (k) => eqOn && PRESETS[k].every((g, i) => Math.abs(gains[i] - g) < 0.01)
  );

  const sleepActive = engine.sleepMode !== "off";
  const remainMs = Math.max(0, engine.sleepEndsAtMs - Date.now());
  const remainLabel = `${Math.floor(remainMs / 60000)}:${String(Math.floor((remainMs % 60000) / 1000)).padStart(2, "0")}`;

  const speedPct = Math.round(((speed - 0.5) / (2 - 0.5)) * 100);

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="na-panel-scrim"
            style={{ zIndex: 54, background: "color-mix(in srgb, #050507 45%, transparent)" }}
            onClick={() => setShow(false)}
            aria-hidden
          />
          <motion.div
            className="na-fx"
            role="dialog"
            aria-label={t("alFx")}
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
            style={{ willChange: "transform, opacity" }}
          >
            <div className="na-sheet-head">
              <div className="na-sheet-title">{t("alFx")}</div>
              <button className="na-panel-x" onClick={() => setShow(false)} title={t("close")} aria-label={t("close")}>
                <X size={15} />
              </button>
            </div>

            <div className="na-scroll min-h-0 flex-1">
              {/* ── equalizer ── */}
              <section className="na-fx-section">
                <div className="na-fx-head">
                  <span className="na-fx-label">{t("alEq")}</span>
                  <span
                    role="switch"
                    aria-checked={eqOn}
                    tabIndex={0}
                    className="na-switch"
                    data-on={eqOn}
                    onClick={() => engine.setEq(!eqOn, gains)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") engine.setEq(!eqOn, gains); }}
                    aria-label={t("alEq")}
                  />
                </div>

                <div className="na-eq-grid" style={{ opacity: eqOn ? 1 : 0.4 }}>
                  {EQ_FREQS.map((f, i) => (
                    <div key={f} className="na-eq-band">
                      <span className="na-eq-val">{gains[i] > 0 ? `+${gains[i].toFixed(1)}` : gains[i].toFixed(1)}</span>
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={gains[i]}
                        onChange={(e) => setGain(i, Number(e.target.value))}
                        className="na-vert"
                        disabled={!eqOn}
                        aria-label={`${f} Hz`}
                      />
                      <span className="na-eq-hz">{f >= 1000 ? `${f / 1000}k` : f}</span>
                    </div>
                  ))}
                </div>

                <div className="na-pill-row">
                  {Object.keys(PRESETS).map((name) => (
                    <button
                      key={name}
                      disabled={!eqOn}
                      className="na-chip"
                      data-on={activePreset === name}
                      onClick={() => engine.setEq(true, PRESETS[name])}
                    >
                      {t(`fxPreset_${name}` as any)}
                    </button>
                  ))}
                </div>
              </section>

              {/* ── speed ── */}
              <section className="na-fx-section">
                <div className="na-fx-head">
                  <span className="na-fx-label">{t("alSpeed")}</span>
                  <span className="na-mono text-[11px] text-[var(--na-mut)]" style={{ fontSize: 11 }}>
                    {speed.toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={speed}
                  onChange={(e) => engine.setRate(Number(e.target.value))}
                  className="na-range w-full"
                  style={{ ["--na-val" as any]: `${speedPct}%` }}
                  aria-label={t("alSpeed")}
                />
                <div className="na-pill-row">
                  {SPEED_CHIPS.map((r) => (
                    <button
                      key={r}
                      className="na-chip na-mono"
                      data-on={Math.abs(speed - r) < 0.01}
                      onClick={() => engine.setRate(r)}
                    >
                      {r}×
                    </button>
                  ))}
                  {Math.abs(speed - 1) > 0.01 && (
                    <button className="na-chip" onClick={() => engine.setRate(1)}>
                      {t("fxReset")}
                    </button>
                  )}
                </div>
              </section>

              {/* ── sleep timer ── */}
              <section className="na-fx-section">
                <div className="na-fx-head">
                  <span className="na-fx-label">{t("alSleep")}</span>
                  {sleepActive && (
                    <span className="na-mono flex items-center gap-2 text-[11px]" style={{ fontSize: 11, color: "var(--na-accent)" }}>
                      <span
                        aria-hidden
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 999,
                          background: "var(--na-accent)",
                          animation: "na-blink 1.1s steps(1) infinite",
                          display: "inline-block",
                        }}
                      />
                      {engine.sleepMode === "track" ? t("alSleepTrack") : remainLabel}
                      <button
                        onClick={() => engine.cancelSleepTimer()}
                        className="na-icon-btn"
                        style={{ width: 26, height: 26 }}
                        aria-label={t("fxSleepCancel")}
                      >
                        ×
                      </button>
                    </span>
                  )}
                </div>
                <div className="na-pill-row" style={{ marginTop: 0 }}>
                  {SLEEP_OPTIONS.map((m) => (
                    <button
                      key={m}
                      className="na-chip na-mono"
                      data-on={
                        (m === 0 && engine.sleepMode === "track") ||
                        (m > 0 && engine.sleepMode === "timed" && engine.sleepMinutes === m)
                      }
                      onClick={() => engine.startSleepTimer(m)}
                    >
                      {m === 0 ? t("alSleepTrack") : `${m} ${t("alMin")}`}
                    </button>
                  ))}
                </div>
                <div className="mt-2.5 text-[10.5px] leading-relaxed" style={{ fontSize: 10.5, color: "var(--na-faint)" }}>
                  {t("fxSleepHint")}
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
