// ── NOBODY · audio Visualizer ────────────────────────────────────────────────
// One reusable canvas visualizer: classic bars / glowing dot-wave / rotating
// radial ring (+ random-per-track). Reads the analyser directly via rAF and
// paints imperatively — zero React state per frame. Pauses when the tab is
// hidden or unmounted; animates a gentle idle wave when nothing is playing.

import { useEffect, useRef } from "react";
import { engine } from "../lib/engine";
import { prng } from "../lib/utils";
import type { EqStyle } from "../types";

interface Props {
  variant: EqStyle; // may be "random"
  trackSeed?: string; // used when variant is "random" — stable per track
  className?: string;
  dim?: boolean; // render more subdued (background usage)
}

function pick(variant: EqStyle, seed: string): Exclude<EqStyle, "random"> {
  if (variant !== "random") return variant;
  const r = prng("eq:" + seed)();
  return r < 1 / 3 ? "bars" : r < 2 / 3 ? "dots" : "ring";
}

export function Visualizer({ variant, trackSeed = "nobody", className, dim }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let w = 0, h = 0, dpr = 1;
    let style = pick(variant, trackSeed);
    let rotation = 0;
    let accent = "#e3b162";
    let accentAlt = "#ffffff";
    let lastColorRead = 0;
    const peaks = new Float32Array(96).fill(0);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = rect.width; h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const readColors = (now: number) => {
      if (now - lastColorRead > 800) {
        lastColorRead = now;
        const cs = getComputedStyle(document.documentElement);
        accent = cs.getPropertyValue("--accent").trim() || accent;
        accentAlt = cs.getPropertyValue("--fg").trim() || accentAlt;
      }
    };

    const N = 64;
    const vals = new Float32Array(N);

    const sample = (t: number, playing: boolean) => {
      const data = playing ? engine.freqData() : null;
      if (data) {
        for (let i = 0; i < N; i++) {
          const bin = Math.floor(Math.pow(i / N, 1.35) * (data.length * 0.72)) + 1;
          vals[i] = data[Math.min(bin, data.length - 1)] / 255;
        }
      } else {
        // idle wave — keeps breathing even when silent
        for (let i = 0; i < N; i++) {
          vals[i] =
            0.10 +
            0.05 * Math.sin(t * 1.3 + i * 0.34) * Math.sin(t * 0.7 + i * 0.11) +
            0.035 * Math.sin(t * 0.9 - i * 0.21);
        }
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return; // hard pause — the audit's rule
      const t = now / 1000;
      readColors(now);
      const playing = !engine.audio.paused && !!engine.audio.src;
      sample(t, playing);
      style = pick(variant, trackSeed);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const alpha = dim ? 0.55 : 1;

      if (style === "bars") {
        const bw = w / N;
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, accent);
        grad.addColorStop(1, accentAlt);
        ctx.fillStyle = grad;
        ctx.globalAlpha = alpha;
        for (let i = 0; i < N; i++) {
          const v = vals[i];
          peaks[i] = Math.max(peaks[i] - 0.008, v);
          const bh = Math.max(2, v * h * 0.92);
          const x = i * bw + bw * 0.18;
          const rw = bw * 0.64;
          // mirrored bar around vertical center feels premium
          const yc = h / 2;
          ctx.beginPath();
          const hh = bh / 2;
          ctx.roundRect(x, yc - hh, rw, hh * 2, rw / 2);
          ctx.fill();
          // peak cap
          ctx.globalAlpha = alpha * 0.9;
          const ph = Math.max(0.02, peaks[i]) * h * 0.46;
          ctx.fillRect(x, yc - ph - 3, rw, 2);
          ctx.fillRect(x, yc + ph + 1, rw, 2);
          ctx.globalAlpha = alpha;
        }
      } else if (style === "dots") {
        ctx.globalAlpha = alpha;
        const baseY = h / 2;
        for (let i = 0; i < N; i++) {
          const v = vals[i];
          const x = (i + 0.5) * (w / N);
          const wave = Math.sin(t * 2 + i * 0.45) * h * 0.05;
          const y = baseY - v * h * 0.38 + wave;
          const rad = 1.8 + v * (h * 0.05) + 1;
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad * 3);
          g.addColorStop(0, accent);
          g.addColorStop(1, "transparent");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, rad * 3, 0, 6.2832); ctx.fill();
          ctx.fillStyle = accentAlt;
          ctx.globalAlpha = alpha * (0.65 + v * 0.35);
          ctx.beginPath(); ctx.arc(x, y, Math.max(1.1, rad * 0.42), 0, 6.2832); ctx.fill();
          ctx.globalAlpha = alpha;
        }
      } else {
        // ring
        ctx.globalAlpha = alpha;
        const cx = w / 2, cy = h / 2;
        const baseR = Math.min(w, h) * 0.30;
        const energy = vals.reduce((a, b) => a + b, 0) / N;
        rotation += 0.0016 + energy * 0.004;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);
        const spokes = 72;
        for (let i = 0; i < spokes; i++) {
          const v = vals[Math.floor((i / spokes) * N)];
          const ang = (i / spokes) * Math.PI * 2;
          const len = baseR + v * baseR * 0.85 + 3;
          ctx.strokeStyle = i % 6 === 0 ? accentAlt : accent;
          ctx.globalAlpha = alpha * (0.28 + v * 0.72);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(ang) * baseR, Math.sin(ang) * baseR);
          ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
          ctx.stroke();
        }
        // inner pulse ring
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, baseR * (0.86 + energy * 0.22), 0, 6.2832);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [variant, trackSeed, dim]);

  return <canvas ref={ref} className={className} aria-hidden />;
}
