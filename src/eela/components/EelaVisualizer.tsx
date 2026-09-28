// ── NOBODY EELA · canvas visualizer ──────────────────────────────────────────
// Soft rounded bars in EELA teal, reading the shared engine analyser via rAF.
// A gentle idle wave keeps breathing when nothing plays.

import { useEffect, useRef } from "react";
import { engine } from "../../cinema/lib/engine";

export function EelaVisualizer({ className, height = 64, bars = 48 }: { className?: string; height?: number; bars?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let accent = "#2fadc0";
    let lastRead = 0;
    const vals = new Float32Array(bars);
    const smooth = new Float32Array(bars);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - lastRead > 700) {
        lastRead = now;
        const root = document.getElementById("ne-root");
        const v = root ? getComputedStyle(root).getPropertyValue("--accent").trim() : "";
        if (v) accent = v;
      }
      const playing = !engine.audio.paused;
      const data = playing ? engine.freqData() : null;
      for (let i = 0; i < bars; i++) {
        if (data) {
          const bin = Math.floor(Math.pow(i / bars, 1.4) * (data.length * 0.72)) + 1;
          vals[i] = data[Math.min(bin, data.length - 1)] / 255;
        } else {
          const t = now / 1000;
          vals[i] = 0.08 + 0.05 * Math.sin(t * 1.2 + i * 0.4) * Math.sin(t * 0.6 + i * 0.13);
        }
        smooth[i] += (vals[i] - smooth[i]) * 0.35;
      }
      ctx.clearRect(0, 0, w, h);
      const gap = Math.max(2, w / bars / 3);
      const bw = Math.max(3, w / bars - gap);
      ctx.fillStyle = accent;
      for (let i = 0; i < bars; i++) {
        const v = Math.max(0.035, smooth[i]);
        const bh = Math.max(bw, v * h);
        const x = i * (bw + gap) + gap / 2;
        const y = h - bh;
        const r = Math.min(bw / 2, bh / 2);
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, bw, bh, r) : ctx.rect(x, y, bw, bh);
        ctx.globalAlpha = 0.28 + 0.72 * v;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [bars]);

  return <canvas ref={ref} className={className} style={{ width: "100%", height }} aria-hidden />;
}
