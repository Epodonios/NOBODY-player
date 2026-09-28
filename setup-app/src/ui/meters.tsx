/**
 * Meters — the instruments. V2.1.
 *
 * All driven by real progress values out of the extraction engine. All
 * transform/opacity only: no width animation, no layout animation, nothing
 * that would make a Windows DWM frame hitch.
 *
 * V2.1 adds the two details that separate a meter from a picture of a meter:
 *   · ProgressRing gains an inner tick bezel, like a watch — the lit ticks
 *     read as a second, coarser scale of the same value.
 *   · Equalizer gains peak-hold. Every bar keeps a falling peak marker that
 *     sticks at the loudest instant and decays slowly, exactly like a real VU
 *     meter. Without it a bar graph never reads as audio.
 */
import { useEffect, useId, useMemo, useRef } from "react";
import { hash01 } from "@/ui/motion";
import { cn } from "@/utils/cn";

/* --------------------------------------------------------- progress ring */

export function ProgressRing({
  frac,
  size = 126,
  stroke = 7,
  ticks = 44,
  active = true,
  children,
  className,
}: {
  frac: number;
  size?: number;
  stroke?: number;
  ticks?: number;
  active?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const f = Math.max(0, Math.min(1, frac));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - f);
  const trackGap = active ? Math.max(2, c * 0.055) : 0;

  // inner bezel: ticks live between the arc and the centre content
  const tOuter = r - stroke / 2 - 5;
  const tInner = tOuter - 4;

  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`nb-ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF2D78" />
            <stop offset="100%" stopColor="#FF7A4D" />
          </linearGradient>
        </defs>

        {/* tick bezel */}
        {Array.from({ length: ticks }).map((_, i) => {
          const a = (i / ticks) * 360;
          const lit = i / ticks <= f;
          return (
            <line
              key={i}
              x1={size / 2}
              y1={size / 2 - tInner}
              x2={size / 2}
              y2={size / 2 - tOuter}
              transform={`rotate(${a} ${size / 2} ${size / 2})`}
              stroke={lit ? "#FF9EC4" : "rgba(255,255,255,0.09)"}
              strokeWidth={1}
              strokeLinecap="round"
              style={{
                transition: "stroke 400ms ease",
                opacity: lit ? 0.95 : 1,
              }}
            />
          );
        })}

        {/* track with a deliberate gap just ahead of the arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0, c - trackGap - off)} ${c}`}
          strokeDashoffset={trackGap / 2}
        />
        {/* the arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#nb-ring-${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(0.001, c - off)} ${c}`}
          style={{
            transition: "stroke-dasharray 130ms linear",
            filter: "drop-shadow(0 0 6px rgba(255,45,120,0.55))",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------- equalizer */

const BAR_H = 98;

/** Two static gradients so every fourth bar leans warm — zero per-frame cost. */
function barGradient(i: number): string {
  return i % 4 === 3
    ? "linear-gradient(180deg, #FFD9C4 0%, #FF7A4D 46%, rgba(255,122,77,0.32) 100%)"
    : "linear-gradient(180deg, #FFC9DC 0%, #FF2D78 48%, rgba(255,45,120,0.34) 100%)";
}

export function Equalizer({
  active,
  progress,
  bars = 12,
  calm = false,
  barW = 24,
  className,
}: {
  active: boolean;
  progress: number;
  bars?: number;
  calm?: boolean;
  barW?: number;
  className?: string;
}) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const capRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const reflRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const peakRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const state = useRef({
    active,
    progress,
    calm,
    t: 0,
    levels: new Array(bars).fill(0),
    peaks: new Array(bars).fill(0),
    hold: new Array(bars).fill(0),
  });
  state.current.active = active;
  state.current.progress = progress;
  state.current.calm = calm;

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const s = state.current;
      s.t++;
      for (let i = 0; i < bars; i++) {
        const n1 = hash01(i * 131 + s.t * 3);
        const n2 = hash01(i * 17 + s.t * 7 + 91);
        const noise = n1 * 0.65 + n2 * 0.35;
        const envelope = 0.3 + 0.7 * Math.sin(((i + 0.5) / bars) * Math.PI);
        const wave = 0.72 + 0.28 * Math.sin(s.t * 0.055 - i * 0.62);
        const ramp = Math.min(1, s.progress * 7);
        const settle = s.progress > 0.995 ? 0.2 : 1;
        let target: number;
        if (s.calm || !s.active) {
          target = 0.03 + 0.02 * Math.sin(s.t * 0.02 + i);
        } else {
          target = (0.08 + 0.92 * noise * envelope * wave * (0.3 + 0.7 * ramp) * settle) ** 1.2;
        }
        const cur = s.levels[i];
        const k = target > cur ? 0.55 : 0.1; // fast attack, slow decay
        const next = cur + (target - cur) * k;
        s.levels[i] = next;

        // peak-hold: stick at the loudest instant, hold ~28 frames, then fall
        if (next > s.peaks[i]) {
          s.peaks[i] = next;
          s.hold[i] = 28;
        } else if (s.hold[i] > 0) {
          s.hold[i]--;
        } else {
          s.peaks[i] = Math.max(0, s.peaks[i] - 0.0055);
        }

        const el = refs.current[i];
        if (el) el.style.transform = `scaleY(${next.toFixed(4)})`;
        const cap = capRefs.current[i];
        if (cap) cap.style.opacity = String(Math.min(1, next * 2.4));
        const refl = reflRefs.current[i];
        if (refl) refl.style.transform = `scaleY(${(next * 0.5).toFixed(4)})`;
        // the peak marker rides a translate, never `top`
        const pk = peakRefs.current[i];
        if (pk) {
          const p = s.peaks[i];
          pk.style.transform = `translateY(${((1 - p) * BAR_H).toFixed(2)}px)`;
          pk.style.opacity = p > 0.035 ? "1" : "0";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [bars]);

  const tips = useMemo(
    () =>
      Array.from({ length: bars }, (_, i) => ({
        delay: `${(hash01(i * 41) * 2200).toFixed(0)}ms`,
        dur: `${(1500 + hash01(i * 53) * 1600).toFixed(0)}ms`,
        dy: `${-14 - hash01(i * 67) * 26}px`,
      })),
    [bars],
  );

  return (
    <div className={cn("relative w-full select-none", className)} style={{ height: 158 }} aria-hidden>
      {/* floor */}
      <div className="nb-hair-x absolute inset-x-0" style={{ top: BAR_H }} />
      <div
        className="absolute inset-x-0"
        style={{
          top: BAR_H - 4,
          height: 10,
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(255,45,120,0.2) 0%, transparent 78%)",
          opacity: active ? 1 : 0.3,
          transition: "opacity 500ms ease",
        }}
      />

      {/* bars */}
      <div className="absolute inset-x-0 top-0 flex items-end justify-between" style={{ height: BAR_H }}>
        {Array.from({ length: bars }).map((_, i) => (
          <span key={i} className="relative block h-full" style={{ width: barW }}>
            <span
              ref={(el) => {
                refs.current[i] = el;
              }}
              className="absolute inset-x-0 bottom-0 block h-full origin-bottom will-change-transform"
              style={{
                borderRadius: barW / 2,
                background: barGradient(i),
                transform: "scaleY(0.03)",
              }}
            />
            {/* peak-hold marker */}
            <span
              ref={(el) => {
                peakRefs.current[i] = el;
              }}
              className="absolute inset-x-[1px] top-0 block h-[2px] will-change-[transform,opacity]"
              style={{
                borderRadius: 1,
                background: "#FFE6EF",
                boxShadow: "0 0 6px 1px rgba(255,217,230,0.55)",
                opacity: 0,
              }}
            />
            <span
              ref={(el) => {
                capRefs.current[i] = el;
              }}
              className="absolute inset-x-[2px] top-0 block h-[4px] will-change-[opacity]"
              style={{
                borderRadius: 2,
                background: "#FFE6EF",
                boxShadow: "0 0 12px 2px rgba(255,217,230,0.6)",
                opacity: 0,
              }}
            />
            <span
              className="absolute left-1/2 top-1 block h-1 w-1 -translate-x-1/2 rounded-full"
              style={
                {
                  background: "#FF9EC4",
                  "--sy": tips[i].dy,
                  "--sx": "0px",
                  opacity: 0,
                  animation: calm
                    ? "none"
                    : `nb-spark ${tips[i].dur} ease-out ${tips[i].delay} infinite`,
                } as React.CSSProperties
              }
            />
          </span>
        ))}
      </div>

      {/* reflection */}
      <div className="absolute inset-x-0 flex items-start justify-between opacity-[0.22]" style={{ top: BAR_H, height: 48 }}>
        {Array.from({ length: bars }).map((_, i) => (
          <span
            key={i}
            ref={(el) => {
              reflRefs.current[i] = el;
            }}
            className="block h-full origin-top will-change-transform"
            style={{
              width: barW,
              borderRadius: barW / 2,
              background: "linear-gradient(180deg, rgba(255,45,120,0.6) 0%, rgba(255,45,120,0) 100%)",
              transform: "scaleY(0.015)",
              filter: "blur(1.5px)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- pour bar */

export function PourBar({
  frac,
  rtl = false,
  height = 6,
  className,
}: {
  frac: number;
  rtl?: boolean;
  height?: number;
  className?: string;
}) {
  const f = Math.max(0, Math.min(1, frac));
  const moving = f > 0.0005 && f < 0.9995;
  const r = height / 2;
  return (
    <div className={cn("relative", className)} style={{ height: height + 12 }} aria-hidden>
      <div
        className="absolute inset-x-0 top-[6px] overflow-hidden border border-white/[0.08] bg-white/[0.025]"
        style={{ height, borderRadius: r }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.02) 100%)",
          }}
        />
        {moving && (
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="absolute inset-y-0 w-1/2"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(255,158,196,0.18), transparent)",
                animation: `nb-shimmer ${rtl ? 2100 : 1700}ms linear infinite`,
                transform: rtl ? "scaleX(-1)" : undefined,
              }}
            />
          </div>
        )}
      </div>

      <div
        className="absolute top-[6px] w-full overflow-visible"
        style={{
          height,
          transform: `scaleX(${f})`,
          transformOrigin: rtl ? "right" : "left",
          transition: "transform 130ms linear",
          willChange: "transform",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            borderRadius: r,
            background: "linear-gradient(90deg, #C4165A 0%, #FF2D78 45%, #FF7A4D 100%)",
          }}
        />
        {moving && (
          <div
            className="absolute inset-0 overflow-hidden"
            style={{ borderRadius: r, [rtl ? "right" : "left"]: 0 }}
          >
            <div
              className="absolute inset-y-0 w-[200%]"
              style={{
                background:
                  "repeating-linear-gradient(90deg, rgba(255,255,255,0.26) 0 10px, transparent 10px 26px)",
                animation: `nb-wave ${rtl ? 1400 : 900}ms linear infinite`,
                opacity: 0.5,
                maskImage: "linear-gradient(90deg, transparent, #000 30%, #000 70%, transparent)",
              }}
            />
          </div>
        )}
        <div
          className="absolute top-1/2 h-[18px] w-px bg-nb-a2"
          style={
            rtl
              ? {
                  left: 0,
                  transform: "translateY(-50%)",
                  boxShadow:
                    "0 0 8px 1px rgba(255,158,196,0.9), 0 0 24px 5px rgba(255,45,120,0.4)",
                }
              : {
                  right: 0,
                  transform: "translateY(-50%)",
                  boxShadow:
                    "0 0 8px 1px rgba(255,158,196,0.9), 0 0 24px 5px rgba(255,45,120,0.4)",
                }
          }
        />
        <div
          className="absolute top-1/2 h-[14px] w-[46px]"
          style={
            rtl
              ? {
                  left: 0,
                  transform: "translateY(-50%)",
                  background:
                    "linear-gradient(90deg, rgba(255,45,120,0.26) 0%, rgba(255,45,120,0) 100%)",
                }
              : {
                  right: 0,
                  transform: "translateY(-50%) translateX(100%)",
                  background:
                    "linear-gradient(90deg, rgba(255,45,120,0) 0%, rgba(255,45,120,0.26) 100%)",
                }
          }
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ disk gauge */

export function DiskGauge({
  usedFrac,
  danger,
  rtl = false,
}: {
  usedFrac: number;
  danger: boolean;
  rtl?: boolean;
}) {
  const f = Math.max(0, Math.min(1, usedFrac));
  return (
    <div className="relative h-[6px] w-full" aria-hidden>
      <div
        className="absolute inset-0 border border-white/[0.08] bg-white/[0.025]"
        style={{ borderRadius: 3 }}
      />
      <div
        className="absolute inset-y-[0.5px] w-full origin-left"
        style={{
          borderRadius: 3,
          transform: `scaleX(${f})`,
          transformOrigin: rtl ? "right" : "left",
          transition: "transform 900ms var(--ease-nb-out)",
          background: danger
            ? "linear-gradient(90deg, #7A0F37, #FF2D78)"
            : "linear-gradient(90deg, rgba(255,45,120,0.4), #FF2D78 70%, #FF7A4D)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          transform: `translateX(${(rtl ? -1 : 1) * f * 100}%)`,
          transition: "transform 900ms var(--ease-nb-out)",
        }}
      >
        <span
          className="absolute top-1/2 block h-[12px] w-[3px]"
          style={{
            [rtl ? "right" : "left"]: 0,
            transform: "translateY(-50%)",
            borderRadius: 2,
            background: danger ? "#FF2D78" : "#FFD9E6",
            boxShadow: "0 0 10px 1px rgba(255,158,196,0.8)",
          }}
        />
      </div>
    </div>
  );
}
