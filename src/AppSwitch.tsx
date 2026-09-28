// ── NOBODY · UI mode shell ───────────────────────────────────────────────────
// Single-active-pane host for the engine UIs: of cinema/eela/alok ONLY the
// visible one is mounted (RAM FIX — the user reported ~1 GB memory usage: all
// four UIs used to stay mounted for the whole session with display:none on the
// hidden ones, keeping every DOM tree, canvas and React state alive at once).
// The classic shell stays mounted even while hidden — it owns the desktop
// library bridge and its own audio element.
// Playback still survives every switch: cinema/eela/alok share ONE module-level
// audio engine (src/cinema/lib/engine.ts — captureHandoff also lives at module
// scope there), and classic ⇄ engine handoffs flow through the localStorage
// blob written by switchUiMode BEFORE the panes swap.
//
// Switch choreography (user ask: "یعنی یهویی عوض نشه — یکمی طول بکشه"):
//   → entering CINEMA: a cinematic veil covers the window (aurora + NOBODY
//     letters assembling), the pane swaps underneath, then the veil dissolves.
//   → entering EELA: a paper-light veil (teal glows + serif EELA assembling).
//   → entering ALOK: a neon-core veil (spinning conic ring + mono ALOK glow).
//   → entering CLASSIC: a short quiet fade.
//   prefers-reduced-motion: instant swap, brief fade only.

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import App from "./App";
import CinemaApp from "./cinema/App";
import EelaApp from "./eela/App";
import AlokApp from "./alok/App";
import { getUiMode, UI_SWITCH_EVENT, type UiMode } from "./uiMode";
import { readUiPrefs } from "./uiMode";
import "./eela/index.css";

type Stage = "in" | "hold" | "out";

const T = {
  coverMs: 560, // veil fully covers
  holdMs: 1050, // logo moment after the swap
  outMs: 760, // dissolve
  fadeMs: 480, // classic-direction fade
};

function veilTagline(target: UiMode): string {
  const lang = readUiPrefs()?.lang;
  if (target === "eela") {
    if (lang === "fa") return "در حال ورود به ایلا";
    if (lang === "tr") return "EELA'ya giriş";
    return "Entering EELA";
  }
  if (target === "alok") {
    if (lang === "fa") return "در حال ورود به آلوک";
    if (lang === "tr") return "ALOK'a giriş";
    return "Entering ALOK";
  }
  if (lang === "fa") return "در حال ورود به سینما";
  if (lang === "tr") return "Sinemaya giriş";
  return "Entering the cinema";
}

export default function AppSwitch() {
  const [mode, setMode] = useState<UiMode>(() => getUiMode());
  const [veil, setVeil] = useState<UiMode | null>(null);
  const [stage, setStage] = useState<Stage>("in");
  const busy = useRef(false);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Cursor fix (V1.2.1): stamp the active face on <body> so CSS can key
  // face-specific cursor behaviour off the custom-cursor system (e.g. ALOK's
  // idle `cursor: none` in src/alok/index.css only applies while ALOK's
  // dynamic cursor is actually driving the pointer).
  useEffect(() => {
    document.body.dataset.customCursor = mode;
    return () => { delete document.body.dataset.customCursor; };
  }, [mode]);

  // Context-menu consistency: classic suppresses the native right-click menu,
  // but the three engine faces used to pop the raw Chromium menu (with the OS
  // cursor). One global handler here — NOT per-UI — keeps all four faces
  // identical. Text entry keeps the native menu (cut/copy/paste).
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest("input, textarea, [contenteditable]")) return;
      if (getUiMode() !== "classic") e.preventDefault();
    };
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  useEffect(() => {
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    const onSwitch = (e: Event) => {
      const to = (e as CustomEvent).detail?.to;
      const target: UiMode | undefined = to === "cinema" || to === "classic" || to === "eela" || to === "alok" ? to : undefined;
      if (!target || busy.current || target === modeRef.current) return;
      busy.current = true;

      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      if (reduced || target === "classic") {
        // short quiet fade both directions
        setVeil(target);
        setStage("in");
        later(() => setMode(target), T.fadeMs / 2);
        later(() => setStage("out"), T.fadeMs + 120);
        later(() => { setVeil(null); busy.current = false; }, T.fadeMs + 620);
        return;
      }

      // full choreography: cinema veil or EELA paper veil
      setVeil(target);
      setStage("in");
      later(() => { setMode(target); setStage("hold"); }, T.coverMs);
      later(() => setStage("out"), T.coverMs + T.holdMs);
      later(() => { setVeil(null); busy.current = false; }, T.coverMs + T.holdMs + T.outMs);
    };

    window.addEventListener(UI_SWITCH_EVENT, onSwitch);
    // NOTE: no [mode] dep — the choreography must survive the mid-flight pane
    // swap (the timers clear only on unmount).
    return () => {
      window.removeEventListener(UI_SWITCH_EVENT, onSwitch);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <>
      {/* RAM FIX: hidden engine UIs (cinema/eela/alok) unmount entirely —
          each had heavy canvases, blur layers and React trees alive for the
          whole session. The classic shell stays mounted even while hidden:
          it OWNS the desktop library bridge (window.__NOBODY_BRIDGE__) and
          its own <audio> element — unmounting it would leave the engine UIs
          without a library in the packaged app. 4 live UIs → 2.
          The engine module singleton keeps the song alive across engine-driven
          switches, and switchUiMode has already written the handoff blob (and
          paused the outgoing audio) before this re-render happens, so
          classic ⇄ engine continuity is preserved. */}
      <div data-ui-pane="classic" style={{ display: mode === "classic" ? "contents" : "none" }}>
        <App />
      </div>
      <div data-ui-pane="cinema" style={mode === "cinema" ? { display: "contents" } : undefined}>
        {mode === "cinema" && <CinemaApp />}
      </div>
      <div data-ui-pane="eela" style={mode === "eela" ? { display: "contents" } : undefined}>
        {mode === "eela" && <EelaApp />}
      </div>
      <div data-ui-pane="alok" style={mode === "alok" ? { display: "contents" } : undefined}>
        {mode === "alok" && <AlokApp />}
      </div>

      {veil !== null && (
        <motion.div
          className={veil === "eela" ? "ne-veil" : veil === "alok" ? "na-veil" : "nc-veil"}
          initial={{ opacity: 0 }}
          animate={{ opacity: stage === "out" ? 0 : 1 }}
          transition={{ duration: stage === "out" ? 0.72 : 0.45, ease: "easeOut" }}
          style={{ pointerEvents: stage === "out" ? "none" : "auto" }}
          aria-hidden
        >
          {/* ── EELA paper veil ── */}
          {veil === "eela" && stage !== "in" && (
            <div className="relative z-10 flex flex-col items-center">
              <div className="ne-veil-glow" aria-hidden />
              <div className="ne-veil-glow g2" aria-hidden />
              <div className="relative flex" aria-label="EELA">
                {"EELA".split("").map((ch, i) => (
                  <motion.span
                    key={i}
                    className="ne-veil-word inline-block"
                    initial={{ opacity: 0, y: 30, filter: "blur(12px)" }}
                    animate={
                      stage === "out"
                        ? { opacity: 0, y: -34, filter: "blur(14px)", transition: { duration: 0.55, delay: i * 0.03 } }
                        : { opacity: 1, y: 0, filter: "blur(0px)" }
                    }
                    transition={stage === "hold" ? { delay: 0.05 + i * 0.07, type: "spring", stiffness: 190, damping: 22 } : {}}
                  >
                    {ch}
                  </motion.span>
                ))}
              </div>

              <motion.div
                className="ne-veil-tag relative mt-3"
                initial={{ opacity: 0, letterSpacing: "0.2em" }}
                animate={stage === "out" ? { opacity: 0, transition: { duration: 0.35 } } : { opacity: 1, letterSpacing: "0.5em" }}
                transition={{ delay: 0.5, duration: 0.7, ease: "easeOut" }}
              >
                NOBODY · {veilTagline("eela")}
              </motion.div>

              <div className="ne-veil-line relative mt-7" aria-hidden />
            </div>
          )}

          {/* ── ALOK neon-core veil ── */}
          {veil === "alok" && stage !== "in" && (
            <div className="relative z-10 flex flex-col items-center">
              <div className="na-veil-core" aria-hidden />
              <div className="relative mt-7 flex" aria-label="ALOK">
                {"ALOK".split("").map((ch, i) => (
                  <motion.span
                    key={i}
                    className="na-veil-word inline-block"
                    initial={{ opacity: 0, y: 30, filter: "blur(12px)" }}
                    animate={
                      stage === "out"
                        ? { opacity: 0, y: -34, filter: "blur(14px)", transition: { duration: 0.55, delay: i * 0.03 } }
                        : { opacity: 1, y: 0, filter: "blur(0px)" }
                    }
                    transition={stage === "hold" ? { delay: 0.05 + i * 0.07, type: "spring", stiffness: 190, damping: 22 } : {}}
                  >
                    {ch}
                  </motion.span>
                ))}
              </div>

              <motion.div
                className="na-veil-tag relative mt-3"
                initial={{ opacity: 0, letterSpacing: "0.2em" }}
                animate={stage === "out" ? { opacity: 0, transition: { duration: 0.35 } } : { opacity: 1, letterSpacing: "0.5em" }}
                transition={{ delay: 0.5, duration: 0.7, ease: "easeOut" }}
              >
                NOBODY · {veilTagline("alok")}
              </motion.div>

              <div className="na-veil-line relative mt-7" aria-hidden />
            </div>
          )}

          {/* ── CINEMA dream veil ── */}
          {veil === "cinema" && stage !== "in" && (
            <>
              <div className="nc-veil-blob a" />
              <div className="nc-veil-blob b" />
              <div className="nc-veil-blob c" />
              <div className="relative z-10 flex flex-col items-center">
                <div className="flex" aria-label="NOBODY">
                  {"NOBODY".split("").map((ch, i) => (
                    <motion.span
                      key={i}
                      className="inline-block font-display text-6xl font-bold italic text-[#f2efe7] sm:text-7xl"
                      initial={{ opacity: 0, y: 34, filter: "blur(14px)", rotate: i % 2 ? 6 : -6 }}
                      animate={
                        stage === "out"
                          ? { opacity: 0, y: -40, filter: "blur(16px)", transition: { duration: 0.55, delay: i * 0.025 } }
                          : { opacity: 1, y: 0, filter: "blur(0px)", rotate: 0 }
                      }
                      transition={stage === "hold" ? { delay: 0.06 + i * 0.055, type: "spring", stiffness: 210, damping: 21 } : {}}
                    >
                      {ch}
                    </motion.span>
                  ))}
                </div>

                <motion.div
                  className="mt-3 text-[11px] font-medium tracking-[0.55em] text-[#e3b162]"
                  initial={{ opacity: 0, letterSpacing: "0.2em" }}
                  animate={stage === "out" ? { opacity: 0, transition: { duration: 0.35 } } : { opacity: 1, letterSpacing: "0.55em" }}
                  transition={{ delay: 0.55, duration: 0.7, ease: "easeOut" }}
                >
                  CINEMA
                </motion.div>

                <motion.div
                  className="mt-6 text-[12px] text-[#98938a]"
                  initial={{ opacity: 0 }}
                  animate={stage === "out" ? { opacity: 0, transition: { duration: 0.3 } } : { opacity: 1 }}
                  transition={{ delay: 0.85, duration: 0.5 }}
                >
                  {veilTagline("cinema")}…
                </motion.div>

                <div className="mt-7 h-[2px] w-44 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full w-1/3 rounded-full"
                    style={{ background: "linear-gradient(90deg, transparent, #e3b162, transparent)" }}
                    initial={{ x: "-120%" }}
                    animate={stage === "out" ? { opacity: 0 } : { x: "320%" }}
                    transition={stage === "out" ? { duration: 0.3 } : { repeat: Infinity, duration: 1.15, ease: "easeInOut" }}
                  />
                </div>
              </div>
            </>
          )}
        </motion.div>
      )}
    </>
  );
}
