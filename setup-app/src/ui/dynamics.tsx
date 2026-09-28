/**
 * Dynamics — V3 interactive primitives.
 *
 * This is the layer that turns a staged layout into something that answers
 * back. Four primitives, all transform/opacity only:
 *
 *   GlowCard    the border and the surface light up under the pointer, with a
 *               radial gradient masked to the 1px edge. The single most
 *               recognisable "current" UI effect, and it costs nothing.
 *   Magnetic    a wrapper that leans its child toward the pointer — used on the
 *               hero CTA and the app mark. Perspective is inside the transform,
 *               so no parent needs `perspective`.
 *   OrbitRing   dots circling a focal point, two counter-rotating rings.
 *   PageSweep   a light bar that crosses the content on every page change,
 *               which is what makes a hard page swap read as a choreography.
 *
 * Nothing here animates layout, and nothing re-renders per frame: pointer
 * handlers write CSS variables, not React state.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------- glow card */

export function GlowCard({
  children,
  className,
  style,
  radius = 14,
  /** static glow strength when not hovering — used to make the installing
   *  hero card visibly "hot" while the extraction is running */
  glow = 0,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  radius?: number;
  glow?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  /* Pointer position is written straight to CSS variables. No state, so no
     re-render on mousemove — the compositor does all the work. */
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--gx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--gy", `${((e.clientY - r.top) / r.height) * 100}%`);
    el.style.setProperty("--gon", "1");
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--gon", String(glow));
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={cn("nb-glowcard", className)}
      style={
        {
          borderRadius: radius,
          "--gon": glow,
          ...style,
        } as CSSProperties
      }
    >
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------- magnetic */

export function Magnetic({
  children,
  strength = 7,
  tilt = 5,
  className,
}: {
  children: ReactNode;
  /** max px of travel toward the pointer */
  strength?: number;
  /** max degrees of lean */
  tilt?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const raf = useRef(0);
  const target = useRef({ x: 0, y: 0 });
  const cur = useRef({ x: 0, y: 0 });

  /* Smoothed follow: the lean eases toward the pointer rather than snapping,
     which is the difference between "magnetic" and "buggy". */
  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const c = cur.current;
      const t = target.current;
      c.x += (t.x - c.x) * 0.14;
      c.y += (t.y - c.y) * 0.14;
      const el = ref.current;
      if (el && (Math.abs(t.x - c.x) > 0.01 || Math.abs(t.y - c.y) > 0.01)) {
        el.style.transform =
          `perspective(700px) translate3d(${c.x.toFixed(2)}px,${c.y.toFixed(2)}px,0) ` +
          `rotateX(${(-c.y / strength) * tilt}deg) rotateY(${(c.x / strength) * tilt}deg)`;
      } else if (el && t.x === 0 && t.y === 0) {
        el.style.transform = "";
      }
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf.current);
    };
  }, [strength, tilt]);

  const norm = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    target.current = { x: nx * 2 * strength, y: ny * 2 * strength };
  };

  return (
    <span
      ref={ref}
      onPointerMove={norm}
      onPointerLeave={() => {
        target.current = { x: 0, y: 0 };
      }}
      className={cn("relative inline-block will-change-transform", className)}
      style={{ transition: "transform .5s var(--ease-nb-out)" }}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- orbit ring */

export function OrbitRing({
  count = 14,
  radius = 96,
  duration = 14_000,
  reverse = false,
  dotSize = 2.5,
  className,
}: {
  count?: number;
  radius?: number;
  duration?: number;
  reverse?: boolean;
  dotSize?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("pointer-events-none absolute inset-0 grid place-items-center", className)}
      aria-hidden
    >
      <span
        className="relative block"
        style={{
          width: radius * 2,
          height: radius * 2,
          animation: `nb-orbit ${duration}ms linear infinite${reverse ? " reverse" : ""}`,
          willChange: "transform",
        }}
      >
        {Array.from({ length: count }).map((_, i) => {
          const a = (i / count) * 360;
          const bright = i % 4 === 0;
          return (
            <span
              key={i}
              className="absolute left-1/2 top-1/2 block rounded-full"
              style={{
                width: dotSize,
                height: dotSize,
                marginLeft: -dotSize / 2,
                marginTop: -dotSize / 2,
                background: bright ? "#FFD9E6" : "#FF2D78",
                opacity: bright ? 0.9 : 0.42,
                boxShadow: bright ? "0 0 8px 1px rgba(255,158,196,0.7)" : "none",
                transform: `rotate(${a}deg) translateY(-${radius}px)`,
              }}
            />
          );
        })}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------- page sweep */

/**
 * A light bar that crosses the content area whenever `trigger` changes. It is
 * what makes a hard page swap read as a deliberate move: the eye follows the
 * sweep and the new page is simply there by the time it lands.
 */
export function PageSweep({ trigger, rtl = false }: { trigger: string; rtl?: boolean }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(true);
    const id = window.setTimeout(() => setOn(false), 620);
    return () => window.clearTimeout(id);
  }, [trigger]);

  if (!on) return null;
  return (
    <span
      key={trigger}
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
      aria-hidden
    >
      <span
        className="absolute inset-y-0 w-2/5"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,158,196,0.07) 35%, rgba(255,45,120,0.12) 60%, transparent)",
          animation: `nb-sweep-across 560ms var(--ease-nb) both`,
          transform: rtl ? "scaleX(-1)" : undefined,
        }}
      />
    </span>
  );
}

/* ----------------------------------------------------------------- float */

/** A gentle continuous bob. Amplitude is deliberately tiny. */
export function Float({
  children,
  amp = 4,
  duration = 6000,
  delay = 0,
  className,
}: {
  children: ReactNode;
  amp?: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-block", className)}
      style={
        {
          animation: `nb-float ${duration}ms ease-in-out ${delay}ms infinite`,
          "--nb-float-amp": `${amp}px`,
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}
