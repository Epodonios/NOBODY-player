// ── NOBODY EELA · pointer-driven slider (progress / volume) ─────────────────
// The fractional value is written imperatively as --ne-frac on the container
// so per-frame playback progress never flows through React state. Click or
// drag anywhere on the track to seek / set volume.

import { useEffect, useRef } from "react";
import { clamp } from "../../cinema/lib/utils";

interface Props {
  /** Live fraction source (called every rAF while mounted). */
  getFrac: () => number;
  /** Called with the fraction the user picked (click or drag end). */
  onSeek: (frac: number) => void;
  /** Live-update during drag (optional). */
  onPreview?: (frac: number) => void;
  className?: string;
  label?: string;
}

export function EelaSlider({ getFrac, onSeek, onPreview, className, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const el = ref.current!;
    let raf = 0;
    const tick = () => {
      const frac = Number.isFinite(getFrac()) ? clamp(getFrac(), 0, 1) : 0;
      el.style.setProperty("--ne-frac", String(frac));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fracFromEvent = (e: PointerEvent | React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    const rtl = getComputedStyle(ref.current!).direction === "rtl";
    const x = (e.clientX - rect.left) / Math.max(1, rect.width);
    return clamp(rtl ? 1 - x : x, 0, 1);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    ref.current!.setPointerCapture(e.pointerId);
    const frac = fracFromEvent(e);
    onPreview?.(frac);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    onPreview?.(fracFromEvent(e));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    try { ref.current!.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    onSeek(fracFromEvent(e));
  };

  return (
    <div
      ref={ref}
      className={`ne-slider ${className ?? ""}`}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onSeek(clamp(getFrac() + 0.05, 0, 1)); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onSeek(clamp(getFrac() - 0.05, 0, 1)); }
      }}
    >
      <div className="ne-slider-track">
        <div className="ne-slider-fill" />
      </div>
      <div className="ne-slider-dot" />
    </div>
  );
}
