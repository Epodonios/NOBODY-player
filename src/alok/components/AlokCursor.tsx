// ── NOBODY ALOK · "reticle" cursor ───────────────────────────────────────────
// A purpose-built cursor for the neon-core face — NOT a copy of Cinema's.
// Anatomy (three fixed layers, refs + one rAF loop, zero per-frame renders):
//
//   dot     — a hard accent pixel with a hot core that rides the pointer 1:1.
//   cross   — a thin mono crosshair (＋) that lags slightly; over interactive
//             targets it rotates 45° and morphs into the center of a bracket.
//   bracket — four corner brackets [ ] that fade in around interactive
//             targets ("lock-on"), spring to text-caret over text fields,
//             and contract on press (fire).
//
// The native cursor is hidden at document level via body[data-custom-cursor]
// (shared bus in src/cursorShared.ts) so no sheet/portal/veil leaks the OS
// arrow back in. Auto-off: coarse pointers, reduced-motion, Settings toggle.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCursorActive } from "../../cursorShared";

const INTERACTIVE = 'button, a, [role="button"], input, select, textarea, summary, label, [role="slider"], .na-t-btn, .na-icon-btn, .na-dock-btn, .na-orbit-btn, .na-state-chip';
const TEXTFIELD = 'input[type="text"], input[type="search"], input[type="email"], input[type="password"], input[type="number"], textarea, [contenteditable="true"]';

export function AlokCursor() {
  const active = useCursorActive("alok");
  const dotRef = useRef<HTMLDivElement>(null);
  const crossRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const dot = dotRef.current;
    const cross = crossRef.current;
    const bracket = bracketRef.current;
    if (!dot || !cross || !bracket) return;

    let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    let cx = tx, cy = ty; // cross lags a touch (weapon-grade smoothing)
    let visible = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX; ty = e.clientY;
      if (!visible) {
        cx = tx; cy = ty;
        visible = true;
        dot.style.opacity = "1";
        cross.style.opacity = "1";
        bracket.style.opacity = "1";
      }
      const target = e.target as HTMLElement | null;
      const it = target?.closest?.(INTERACTIVE) as HTMLElement | null;
      const tf = target?.closest?.(TEXTFIELD) as HTMLElement | null;
      const pressed = e.buttons > 0;
      const state = tf ? "text" : it ? (pressed ? "down" : "lock") : pressed ? "down" : "";
      cross.dataset.state = state;
      bracket.dataset.state = state;
    };

    const onLeave = (e: PointerEvent) => {
      if (!e.relatedTarget) {
        visible = false;
        dot.style.opacity = "0";
        cross.style.opacity = "0";
        bracket.style.opacity = "0";
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      cx += (tx - cx) * 0.42;
      cy += (ty - cy) * 0.42;
      dot.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      cross.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      bracket.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [active]);

  if (!active) return null;

  // Body-level portal: visuals must float above every sheet and the AppSwitch
  // veil (z-200), otherwise the cursor vanishes mid-switch.
  return createPortal(
    <>
      <div ref={bracketRef} aria-hidden className="na-cursor-bracket" style={{ opacity: 0 }}>
        <i /><i /><i /><i />
      </div>
      <div ref={crossRef} aria-hidden className="na-cursor-cross" style={{ opacity: 0 }}>
        <i /><i />
      </div>
      <div ref={dotRef} aria-hidden className="na-cursor-dot" style={{ opacity: 0 }} />
    </>,
    document.body,
  );
}
