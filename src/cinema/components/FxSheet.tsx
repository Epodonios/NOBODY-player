// ── NOBODY · Fx sheet — equalizer / speed / sleep timer ──────────────────────
// The "advanced player" control room in one glass sheet. EQ drives the
// engine's WebAudio peaking chain, speed maps to playbackRate (pitch kept),
// sleep timer pauses playback after N minutes or at the end of the track.

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, X, Timer, Gauge, AudioWaveform, Power } from "lucide-react";
import { engine, EQ_FREQS } from "../lib/engine";
import { useUi } from "../store/ui";
import { useSettings } from "../store/settings";
import { useT } from "../lib/useT";
import { cn } from "../utils/cn";

const PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0],
  bass: [7, 5, 2.5, 0, -1, -1.5],
  vocal: [-2, -1, 1.5, 4.5, 4, 1.5],
  treble: [-1.5, -1, 0, 1, 4.5, 6.5],
  electronic: [5.5, 4, 1, 0, 3, 5],
  acoustic: [3, 2, 1.5, 2, 1.5, 2.5],
  cinema: [4.5, 3, 0, 2, 4, 3],
};

const SLEEP_OPTIONS = [0, 5, 15, 30, 60]; // 0 = end of track

export function FxSheet() {
  const t = useT();
  const show = useUi((s) => s.showFx);
  const setShow = useUi((s) => s.setShowFx);
  const settings = useSettings();
  const [, force] = useState(0); // re-render for countdown + engine-driven chips

  // engine pushes coarse state (play/pause/sleep changes) — reflect instantly
  useEffect(() => engine.on("state", () => force((n) => n + 1)), []);

  // countdown tick while a timed sleep is active
  useEffect(() => {
    if (engine.sleepMode !== "timed") return;
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

  const applyPreset = (name: string) => {
    engine.setEq(true, PRESETS[name]);
  };

  const activePreset = Object.keys(PRESETS).find(
    (k) => eqOn && PRESETS[k].every((g, i) => Math.abs(gains[i] - g) < 0.01)
  );

  const speedChips = [0.75, 1, 1.25, 1.5, 2];
  const sleepActive = engine.sleepMode !== "off";
  const remainMs = Math.max(0, engine.sleepEndsAtMs - Date.now());
  const remainLabel = `${Math.floor(remainMs / 60000)}:${String(Math.floor((remainMs % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[57] bg-black/50"
            onClick={() => setShow(false)}
          />
          <motion.div
            role="dialog"
            aria-label={t("fxTitle")}
            initial={{ opacity: 0, y: 26, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.99 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="glass fixed inset-x-0 bottom-0 z-[58] mx-auto flex max-h-[88vh] w-[min(560px,96vw)] flex-col overflow-hidden rounded-t-[26px]"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}>
                  <SlidersHorizontal size={15} className="t-accent" />
                </span>
                <div>
                  <div className="font-display text-lg italic leading-tight">{t("fxTitle")}</div>
                  <div className="t-faint text-[10.5px]">{t("fxSub")}</div>
                </div>
              </div>
              <button onClick={() => setShow(false)} aria-label={t("close")} className="t-mut rounded-full p-2 transition-colors hover:bg-white/10">
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {/* ── equalizer ── */}
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <AudioWaveform size={14} className="t-accent" /> {t("fxEq")}
                  </div>
                  <button
                    role="switch"
                    aria-checked={eqOn}
                    onClick={() => engine.setEq(!eqOn, gains)}
                    className="switch"
                    data-on={eqOn}
                    aria-label={t("fxEq")}
                  />
                </div>

                <div className={cn("flex items-end justify-between gap-2 rounded-2xl px-3 py-4 transition-opacity", !eqOn && "opacity-40")} style={{ background: "var(--bg2)" }}>
                  {EQ_FREQS.map((f, i) => (
                    <div key={f} className="flex w-full flex-col items-center gap-1.5">
                      <span className="tnum t-faint text-[9.5px]">{gains[i] > 0 ? `+${gains[i].toFixed(1)}` : gains[i].toFixed(1)}</span>
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={0.5}
                        value={gains[i]}
                        onChange={(e) => setGain(i, Number(e.target.value))}
                        className="nc-vert-range nobody-range"
                        disabled={!eqOn}
                        aria-label={`${f} Hz`}
                      />
                      <span className="tnum t-mut text-[9.5px]">{f >= 1000 ? `${f / 1000}k` : f}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {Object.keys(PRESETS).map((name) => (
                    <button
                      key={name}
                      disabled={!eqOn}
                      onClick={() => applyPreset(name)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] transition-all disabled:opacity-40",
                        activePreset === name ? "bg-accent font-semibold" : "t-mut hover:text-[var(--fg)]"
                      )}
                      style={{ borderColor: activePreset === name ? "transparent" : "var(--line2)" }}
                    >
                      {t(`fxPreset_${name}` as any)}
                    </button>
                  ))}
                </div>
              </section>

              {/* ── speed ── */}
              <section className="mt-6">
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <Gauge size={14} className="t-accent" /> {t("fxSpeed")}
                  </div>
                  <span className="tnum t-mut text-[12px]">{speed.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={speed}
                  onChange={(e) => engine.setRate(Number(e.target.value))}
                  className="nobody-range w-full"
                  aria-label={t("fxSpeed")}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {speedChips.map((r) => (
                    <button
                      key={r}
                      onClick={() => engine.setRate(r)}
                      className={cn(
                        "tnum rounded-full border px-3 py-1 text-[11px] transition-all",
                        Math.abs(speed - r) < 0.01 ? "bg-accent font-semibold" : "t-mut hover:text-[var(--fg)]"
                      )}
                      style={{ borderColor: Math.abs(speed - r) < 0.01 ? "transparent" : "var(--line2)" }}
                    >
                      {r}×
                    </button>
                  ))}
                  {Math.abs(speed - 1) > 0.01 && (
                    <button
                      onClick={() => engine.setRate(1)}
                      className="t-faint rounded-full border px-3 py-1 text-[11px] transition-colors hover:text-[var(--fg)]"
                      style={{ borderColor: "var(--line2)" }}
                    >
                      {t("fxReset")}
                    </button>
                  )}
                </div>
              </section>

              {/* ── sleep timer ── */}
              <section className="mt-6 pb-1">
                <div className="mb-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold">
                    <Timer size={14} className="t-accent" /> {t("fxSleep")}
                  </div>
                  {sleepActive && (
                    <span className="t-accent tnum flex items-center gap-1.5 text-[11.5px]">
                      <span className="blink inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
                      {engine.sleepMode === "track" ? t("fxSleepTrack") : remainLabel}
                      <button
                        onClick={() => engine.cancelSleepTimer()}
                        className="t-faint ms-1 rounded-full p-1 transition-colors hover:text-[var(--fg)]"
                        aria-label={t("fxSleepCancel")}
                      >
                        <Power size={11} />
                      </button>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SLEEP_OPTIONS.map((m) => (
                    <button
                      key={m}
                      onClick={() => engine.startSleepTimer(m)}
                      className={cn(
                        "tnum rounded-full border px-3.5 py-1.5 text-[11.5px] transition-all",
                        (m === 0 && engine.sleepMode === "track") || (m > 0 && engine.sleepMode === "timed" && engine.sleepMinutes === m)
                          ? "bg-accent font-semibold"
                          : "t-mut hover:text-[var(--fg)]"
                      )}
                      style={{ borderColor: "var(--line2)" }}
                    >
                      {m === 0 ? t("fxSleepTrack") : `${m} ${t("fxMin")}`}
                    </button>
                  ))}
                </div>
                <p className="t-faint mt-2.5 text-[11px] leading-relaxed">{t("fxSleepHint")}</p>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
