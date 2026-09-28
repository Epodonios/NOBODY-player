// ── NOBODY EELA · "ink" cursor ───────────────────────────────────────────────
// EELA previously had NO custom cursor at all — the Windows arrow floated
// over the paper UI (reported bug). This is a purpose-built paper-face
// cursor: a small ink dot riding the pointer 1:1 with a hairline ink ring
// lagging behind like a pen stroke; over interactive targets the ring
// tightens and tips with the accent ink, over text fields it becomes a
// slim pen-nib caret, and on press it contracts like ink pressed to paper.
//
// The native cursor is hidden at document level via body[data-custom-cursor]
// (shared bus in src/cursorShared.ts). Auto-off: coarse pointers,
// reduced-motion, the shared Settings toggle.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCursorActive } from "../../cursorShared";

const INTERACTIVE = 'button, a, [role="button"], input, select, textarea, summary, label, [role="slider"], .ne-track-row, .ne-slider, .ne-chip, .ne-btn';
const TEXTFIELD = 'input[type="text"], input[type="search"], input[type="email"], input[type="password"], input[type="number"], textarea, [contenteditable="true"]';

export function EelaCursor() {
  const active = useCursorActive("eela");
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let tx = window.innerWidth / 2, ty = window.innerHeight / 2;
    let rx = tx, ry = ty;
    let visible = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX; ty = e.clientY;
      if (!visible) {
        rx = tx; ry = ty;
        visible = true;
        dot.style.opacity = "1";
        ring.style.opacity = "1";
      }
      const target = e.target as HTMLElement | null;
      const it = target?.closest?.(INTERACTIVE) as HTMLElement | null;
      const tf = target?.closest?.(TEXTFIELD) as HTMLElement | null;
      const pressed = e.buttons > 0;
      const state = tf ? "text" : it ? (pressed ? "down" : "hover") : pressed ? "down" : "";
      ring.dataset.state = state;
    };

    const onLeave = (e: PointerEvent) => {
      if (!e.relatedTarget) {
        visible = false;
        dot.style.opacity = "0";
        ring.style.opacity = "0";
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      rx += (tx - rx) * 0.22;
      ry += (ty - ry) * 0.22;
      dot.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
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
      <div ref={ringRef} aria-hidden className="ne-cursor-ring" style={{ opacity: 0 }} />
      <div ref={dotRef} aria-hidden className="ne-cursor-dot" style={{ opacity: 0 }} />
    </>,
    document.body,
  );
}
