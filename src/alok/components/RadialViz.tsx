// ── NOBODY ALOK · radial visualizer ──────────────────────────────────────────
// A ring of thin radial bars around the core, drawn on one canvas from the
// shared engine analyser. Transform/opacity discipline: the loop is a single
// rAF, decays to silence when playback stops and fully cancels when the pane
// is hidden or the visualizer is switched off. DPR capped at 2.

import { useEffect, useRef } from "react";
import { engine } from "../../cinema/lib/engine";
import { UI_SWITCH_EVENT } from "../../uiMode";

interface Props {
  /** bar count around the circle */
  bars?: number;
  /** canvas CSS size (square) */
  size: number;
  /** stroke colors, looped across bars */
  colors: string[];
  /** inner radius factor of the bar ring (0..1 of half-size) */
  inner?: number;
  /** stroke opacity multiplier */
  alpha?: number;
}

export function RadialViz({ bars = 84, size, colors, inner = 0.56, alpha = 0.9 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef(colors);
  useEffect(() => { colorsRef.current = colors; }, [colors]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || size <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let running = true;
    let dpr = 1;
    const vals = new Float32Array(bars);
    const smooth = new Float32Array(bars);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(size * dpr));
      canvas.height = Math.max(1, Math.floor(size * dpr));
    };
    resize();

    const draw = () => {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      // pane hidden (another UI active) → park the loop entirely.
      // NOTE: #na-root is position:fixed, so offsetParent is always null —
      // detect a display:none ancestor via getClientRects() instead.
      const root = document.getElementById("na-root");
      if (!root || root.getClientRects().length === 0) { running = false; return; }

      const playing = !engine.audio.paused;
      const data = playing ? engine.freqData() : null;
      let energy = 0;
      for (let i = 0; i < bars; i++) {
        let target: number;
        if (data) {
          // logarithmic-ish bin spread so bass doesn't hog the whole ring
          const bin = Math.floor(Math.pow(i / bars, 1.35) * (data.length * 0.7)) + 1;
          target = data[Math.min(bin, data.length - 1)] / 255;
        } else {
          target = 0; // decay to silence when paused
        }
        vals[i] = target;
        smooth[i] += (vals[i] - smooth[i]) * (data ? 0.32 : 0.08);
        energy += smooth[i];
      }

      // nothing playing and fully decayed → park the loop until an event wakes us
      if (!playing && energy < 0.004 * bars) {
        running = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const rBase = (Math.min(w, h) / 2) * inner;
      const rMax = Math.min(w, h) / 2 * 0.965;
      const palette = colorsRef.current;
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(1.5 * dpr, (rMax - rBase) / bars * 1.5);
      for (let i = 0; i < bars; i++) {
        const v = Math.max(0.02, smooth[i]);
        const a = (i / bars) * Math.PI * 2 - Math.PI / 2;
        const r1 = rBase;
        const r2 = rBase + (rMax - rBase) * v;
        ctx.strokeStyle = palette[i % palette.length];
        ctx.globalAlpha = alpha * (0.22 + 0.78 * v);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);

    // wake the loop when playback starts again or when this pane becomes
    // visible again after a UI switch (the loop parks itself when idle/hidden)
    const wake = () => {
      if (!running) { running = true; raf = requestAnimationFrame(draw); }
    };
    engine.on("state", wake);
    const onSwitch = () => window.setTimeout(wake, 160); // after the pane swap renders
    window.addEventListener(UI_SWITCH_EVENT, onSwitch);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      engine.off("state", wake);
      window.removeEventListener(UI_SWITCH_EVENT, onSwitch);
    };
  }, [bars, size, inner, alpha]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width: size, height: size, display: "block" }}
    />
  );
}
