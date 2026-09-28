/**
 * Motion primitives for the installer surface.
 *
 * House rules, all of them enforced by construction:
 *   · transform / opacity / filter only — no animation ever touches layout.
 *   · every random-looking value is derived from a deterministic hash of an
 *     index, so two runs of the same page look identical (an installer that
 *     "re-rolls" its own visuals every launch feels broken, not alive).
 *   · nothing here needs a re-render to run: CSS keyframes do the looping,
 *     rAF only where a real signal (progress) is involved.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------ hash */

/** Deterministic 0..1 from an integer seed. No Math.random anywhere in here. */
export function hash01(n: number): number {
  let t = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  t = (t ^ (t >>> 13)) >>> 0;
  t = Math.imul(t, 0xc2b2ae35) >>> 0;
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}

/* ---------------------------------------------------------------- reveal */

export function Reveal({
  children,
  delay = 0,
  mode = "rise",
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  mode?: "rise" | "fade" | "blur" | "pop" | "drop" | "slide";
  className?: string;
  style?: CSSProperties;
}) {
  const anim =
    mode === "fade"
      ? "nb-fade"
      : mode === "blur"
        ? "nb-blur-in"
        : mode === "pop"
          ? "nb-pop"
          : mode === "drop"
            ? "nb-drop"
            : mode === "slide"
              ? "nb-slide-in"
              : "nb-rise";
  return (
    <div
      className={cn(anim, className)}
      style={{ animationDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- split text */

/**
 * Staggers text into view. Splits per character for Latin scripts and per
 * word for Arabic-script languages — splitting Farsi per character would
 * break the joining of the letters, which is the one mistake you cannot undo.
 */
export function SplitText({
  text,
  per,
  delay = 0,
  step = 26,
  className,
  charClassName,
  charStyle,
}: {
  text: string;
  per: "char" | "word";
  delay?: number;
  step?: number;
  className?: string;
  charClassName?: string;
  charStyle?: CSSProperties;
}) {
  const units = per === "char" ? [...text] : text.split(/(\s+)/);
  let i = 0;
  return (
    <span className={cn("inline-block", className)}>
      {units.map((u, k) =>
        /^\s+$/.test(u) ? (
          <span key={k}> </span>
        ) : (
          <span
            key={k}
            className={cn("nb-rise-sm inline-block", charClassName)}
            style={{ animationDelay: `${delay + i++ * step}ms`, ...charStyle }}
          >
            {u}
          </span>
        ),
      )}
    </span>
  );
}

/* ------------------------------------------------------------ light sweep */

/** A skewed light bar crossing its parent once (or on a slow loop). */
export function LightSweep({
  duration = 1500,
  delay = 0,
  every = 0,
  className,
  color = "rgba(255,158,196,0.14)",
}: {
  duration?: number;
  delay?: number;
  every?: number;
  className?: string;
  color?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <span
        className="absolute inset-y-0 w-1/3"
        style={{
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          animation: `nb-sweep ${duration}ms var(--ease-nb) ${every ? `${delay}ms ${every}ms infinite` : `${delay}ms 1 both`}`,
        }}
      />
    </span>
  );
}

/** Thin travelling highlight, used on logos and headings. */
export function Sheen({
  delay = 0,
  every = 0,
  duration = 900,
  className,
}: {
  delay?: number;
  every?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <span
        className="absolute inset-y-0 w-1/2"
        style={{
          background:
            "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.32) 50%, transparent 100%)",
          mixBlendMode: "overlay",
          animation: `nb-sheen ${duration}ms var(--ease-nb) ${every ? `${delay}ms ${every}ms infinite` : `${delay}ms 1 both`}`,
        }}
      />
    </span>
  );
}

/* ---------------------------------------------------------------- aurora */

/**
 * Three slow, blurred colour fields drifting behind everything. This is what
 * keeps #09080B from reading as a flat rectangle on a calibrated screen.
 */
export function Aurora({ intensity = 1, energy = 0.3 }: { intensity?: number; energy?: number }) {
  const blobs = useMemo(
    () => [
      { x: "18%", y: "8%", s: 520, dx: 60, dy: 40, c: "rgba(255,45,120,0.11)", d: 26_000 },
      { x: "78%", y: "62%", s: 620, dx: -70, dy: -50, c: "rgba(255,158,196,0.075)", d: 34_000 },
      { x: "52%", y: "38%", s: 760, dx: 40, dy: -60, c: "rgba(120,45,255,0.05)", d: 44_000 },
    ],
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {blobs.map((b, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={
            {
              left: b.x,
              top: b.y,
              width: b.s,
              height: b.s,
              marginLeft: -b.s / 2,
              marginTop: -b.s / 2,
              background: `radial-gradient(circle, ${b.c} 0%, transparent 68%)`,
              filter: "blur(46px)",
              // energy scales both how bright and how slowly the fields move,
              // which reads as "more light, more weight" during extraction
              opacity: intensity * (0.55 + energy * 0.75),
              animationDuration: `${Math.round(b.d * (1.35 - energy * 0.6))}ms`,
              willChange: "transform",
              "--dx": `${b.dx}px`,
              "--dy": `${b.dy}px`,
              animation: `nb-drift ${b.d}ms ease-in-out ${i * 1800}ms infinite`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- motes */

/** Dust in the projector beam. Deterministic, so it never re-rolls. */
export function Motes({
  count = 26,
  className,
  seed = 1,
}: {
  count?: number;
  className?: string;
  seed?: number;
}) {
  const motes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = hash01(i * 7 + seed);
        const b = hash01(i * 13 + seed * 3);
        const c = hash01(i * 29 + seed * 5);
        return {
          left: `${(a * 100).toFixed(2)}%`,
          top: `${(55 + b * 45).toFixed(2)}%`,
          size: 1 + Math.round(c * 2),
          dur: 11_000 + Math.round(a * 16_000),
          delay: -Math.round(b * 20_000),
          mx: `${(b - 0.5) * 90}px`,
          my: `${-90 - a * 190}px`,
          o: 0.18 + c * 0.42,
        };
      }),
    [count, seed],
  );
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {motes.map((m, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={
            {
              left: m.left,
              top: m.top,
              width: m.size,
              height: m.size,
              background: i % 5 === 0 ? "#FF9EC4" : "#F4F1F5",
              "--mx": m.mx,
              "--my": m.my,
              "--o": m.o,
              animation: `nb-mote ${m.dur}ms linear ${m.delay}ms infinite`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- pulse rings */

export function PulseRings({
  count = 3,
  size = 200,
  color = "rgba(255,45,120,0.5)",
  className,
}: {
  count?: number;
  size?: number;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("pointer-events-none absolute inset-0 grid place-items-center", className)}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            width: size,
            height: size,
            border: `1px solid ${color}`,
            animation: `nb-pulse-ring 3200ms var(--ease-nb) ${i * 1050}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

/* ---------------------------------------------------------------- odometer */

/**
 * Rolling digits. A column of 0-9 slides to the target, which reads as a
 * mechanical counter instead of a number that teleports.
 */
export function Odometer({
  value,
  digits = 3,
  className,
}: {
  value: number;
  digits?: number;
  className?: string;
}) {
  const str = Math.max(0, Math.round(value)).toString().padStart(digits, "0");
  const cells = str.slice(-digits).split("");
  return (
    <span
      className={cn("nb-num inline-flex overflow-hidden", className)}
      style={{ height: "1em", lineHeight: 1 }}
      dir="ltr"
    >
      {cells.map((d, i) => (
        <span key={i} className="relative inline-block" style={{ width: "0.62em" }}>
          <span
            className="absolute inset-x-0 top-0 flex flex-col"
            style={{
              transform: `translateY(-${Number(d) * 10}%)`,
              transition: "transform 520ms var(--ease-nb-out)",
            }}
          >
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n} className="block h-[1em] text-center">
                {n}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------- draw check */

export function DrawCheck({
  size = 14,
  color = "#FF9EC4",
  delay = 0,
}: {
  size?: number;
  color?: string;
  delay?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <path
        d="M2.2 7.4 5.4 10.6 11.8 3.6"
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="square"
        style={{
          strokeDasharray: 16,
          strokeDashoffset: 16,
          animation: `nb-draw 460ms var(--ease-nb-out) ${delay}ms both`,
        }}
      />
    </svg>
  );
}

/* ----------------------------------------------------------- light streaks */

/**
 * A one-shot celebration: thin streaks of light flying outward from the
 * centre. Used once on Finish and once on the uninstaller farewell.
 */
export function LightBurst({ trigger, count = 22 }: { trigger: number; count?: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (trigger <= 0) return;
    setOn(true);
    const id = window.setTimeout(() => setOn(false), 2400);
    return () => window.clearTimeout(id);
  }, [trigger]);

  const streaks = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const a = hash01(i * 3 + 11) * Math.PI * 2;
        const dist = 180 + hash01(i * 5 + 3) * 320;
        return {
          rot: `${(a * 180) / Math.PI}deg`,
          tx: `${Math.cos(a) * dist}px`,
          ty: `${Math.sin(a) * dist}px`,
          len: 30 + hash01(i * 17) * 90,
          delay: Math.round(hash01(i * 23) * 420),
          dur: 900 + Math.round(hash01(i * 31) * 700),
          warm: i % 3 === 0,
        };
      }),
    [count],
  );

  if (!on) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden" aria-hidden>
      <span
        className="absolute rounded-full"
        style={{
          width: 260,
          height: 260,
          background:
            "radial-gradient(circle, rgba(255,158,196,0.34) 0%, rgba(255,45,120,0.1) 42%, transparent 70%)",
          animation: "nb-flash 1000ms var(--ease-nb-out) both",
        }}
      />
      {streaks.map((s, i) => (
        <span
          key={i}
          className="absolute"
          style={
            {
              width: s.len,
              height: 1,
              background: s.warm
                ? "linear-gradient(90deg, transparent, rgba(255,158,196,0.95))"
                : "linear-gradient(90deg, transparent, rgba(255,45,120,0.85))",
              "--rot": s.rot,
              "--tx": s.tx,
              "--ty": s.ty,
              animation: `nb-streak ${s.dur}ms var(--ease-nb-out) ${s.delay}ms both`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- typewriter */

/** Reveals a mono string one character at a time. Pure CSS, no timer. */
export function Typewriter({
  text,
  speed = 1.5,
  delay = 0,
  className,
}: {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("nb-type", className)}
      style={{ animationDuration: `${speed}s`, animationDelay: `${delay}ms` }}
    >
      {text}
    </span>
  );
}

/* ------------------------------------------------------------ phase stepper */

/**
 * The six install phases as a rail: done dots are filled, the active one
 * breathes, and the connecting line fills with real progress. This is the
 * "story" readout that sits under the equalizer on page 4.
 */
export function PhaseStepper({
  labels,
  active,
  frac,
  rtl = false,
}: {
  labels: string[];
  active: number;
  frac: number;
  rtl?: boolean;
}) {
  return (
    <div className="relative" dir={rtl ? "rtl" : "ltr"}>
      {/* rail */}
      <div className="absolute inset-x-0 top-[3.5px] h-px bg-nb-hair" aria-hidden />
      <div
        className="absolute top-[3px] h-[2px] origin-left"
        style={{
          width: "100%",
          transform: `scaleX(${Math.max(0, Math.min(1, frac))})`,
          transformOrigin: rtl ? "right" : "left",
          background: "linear-gradient(90deg, rgba(255,45,120,0.25), #FF2D78)",
          transition: "transform 140ms linear",
        }}
        aria-hidden
      />
      <div className="relative flex justify-between">
        {labels.map((l, i) => {
          const done = i < active;
          const now = i === active;
          return (
            <div key={l} className="flex w-1/6 flex-col items-center gap-2">
              <span
                className="relative mt-px block h-2 w-2 rounded-full transition-all duration-500"
                style={{
                  background: done ? "#FF9EC4" : now ? "#FF2D78" : "#1F1B24",
                  boxShadow: now
                    ? "0 0 10px 1px rgba(255,45,120,0.75)"
                    : done
                      ? "0 0 6px rgba(255,158,196,0.35)"
                      : "none",
                  transform: now ? "scale(1.35)" : "scale(1)",
                }}
              >
                {now && (
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{
                      border: "1px solid rgba(255,45,120,0.6)",
                      animation: "nb-pulse-ring 1800ms var(--ease-nb) infinite",
                    }}
                  />
                )}
              </span>
              <span
                className="nb-font-mono text-center text-[9px] leading-3 transition-colors duration-500"
                style={{
                  color: now ? "#F4F1F5" : done ? "#8A8492" : "#3A3440",
                }}
              >
                {l}
              </span>
            </div>
          );
        })}
      </div>
      <span className="sr-only">{`${labels[active]} · ${Math.round(frac * 100)}%`}</span>
    </div>
  );
}

/* ------------------------------------------------------- cursor spotlight */

/**
 * A soft light that follows the pointer inside the window. Translate only, so
 * it can never trigger layout, and it is throttled to one update per frame.
 */
export function useSpotlight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [p, setP] = useState({ x: 0.5, y: 0.4, on: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let next = { x: 0.5, y: 0.4 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      next = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          setP({ ...next, on: true });
        });
      }
    };
    const onLeave = () => setP((s) => ({ ...s, on: false }));
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return { ref, p };
}
