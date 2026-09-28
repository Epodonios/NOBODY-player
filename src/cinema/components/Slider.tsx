// ── Slider — pointer-driven scrubber that writes CSS vars via refs only ─────

import { useCallback, useRef } from "react";
import { clamp } from "../lib/utils";
import { cn } from "../utils/cn";

interface Props {
  /** 0..1 external position; owner updates via setFrac (not React state). */
  getFrac: () => number;
  onSeek: (frac: number) => void;
  className?: string;
  height?: number;
  strokeColor?: string;
  label: string;
}

/** Exposes a fill knob whose position is written directly to style. */
export function Slider({ getFrac, onSeek, className, height = 5, label }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const write = useCallback((frac: number) => {
    const f = clamp(frac, 0, 1);
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${f})`;
    if (knobRef.current) knobRef.current.style.insetInlineStart = `${f * 100}%`;
  }, []);

  const fromEvent = (e: React.PointerEvent) => {
    const el = trackRef.current!;
    const rect = el.getBoundingClientRect();
    // the dual-UI document may carry a different dir on <html>; trust the
    // nearest explicit dir scope (the cinema root sets it on #nc-root)
    const rtl = !!el.closest('[dir="rtl"]');
    const x = e.clientX - rect.left;
    const f = x / rect.width;
    return rtl ? 1 - f : f;
  };

  const onDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const f = fromEvent(e);
    write(f);
    onSeek(f);
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging.current) write(fromEvent(e));
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const f = fromEvent(e);
    write(f);
    onSeek(f);
  };

  // keep an imperative refresh loop? No — owner calls write via stored ref.
  // Expose via data attribute for the owner:
  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onKeyDown={(e) => {
        const f = getFrac();
        if (e.key === "ArrowRight") { write(f + 0.05); onSeek(f + 0.05); }
        if (e.key === "ArrowLeft") { write(f - 0.05); onSeek(f - 0.05); }
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className={cn("slider-hit group relative flex items-center", className)}
      style={{ height: Math.max(height + 14, 18) }}
      data-slider
    >
      <div
        className="relative w-full overflow-hidden rounded-full"
        style={{ height, background: "var(--line)", transition: "height .18s ease" }}
      >
        <div
          ref={fillRef}
          className="absolute inset-y-0 start-0 w-full origin-left rtl:origin-right"
          style={{ background: "var(--accent)", transform: "scaleX(0)", transition: "transform .05s linear" }}
        />
      </div>
      <div
        ref={knobRef}
        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 rtl:translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "var(--fg)", insetInlineStart: 0 }}
      />
    </div>
  );
}

/** Helper an owner uses to drive the slider from its own rAF loop. */
export function writeSlider(container: HTMLElement | null, frac: number) {
  if (!container) return;
  const fill = container.querySelector<HTMLElement>("[data-slider] > div > div");
  const knob = container.querySelectorAll<HTMLElement>("[data-slider] > div")[1];
  const f = clamp(frac, 0, 1);
  if (fill) fill.style.transform = `scaleX(${f})`;
  if (knob) knob.style.insetInlineStart = `${f * 100}%`;
}
