// ── NOBODY Cinema · rêve cursor ──────────────────────────────────────────────
// A custom two-part cursor for the Cinema UI: an accent dot that rides the
// pointer and a softly-lagging ring that breathes, grows over interactive
// elements, morphs into a caret over text fields and contracts on press.
// Everything runs on refs + one rAF loop — zero React re-renders per frame.
//
// QA fix: the native cursor is now hidden at DOCUMENT level via
// body[data-custom-cursor] (see src/cursorShared.ts) — the old per-root
// scoping let the Windows cursor leak over portals, sheets, the command
// palette and veils. This component now only draws the visuals.

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useCursorActive } from "../../cursorShared";

const INTERACTIVE = 'button, a, [role="button"], input, select, textarea, summary, .slider-hit, label, [data-cursor="pointer"]';
const TEXTFIELD = 'input[type="text"], input[type="search"], input[type="email"], input[type="password"], input[type="number"], textarea, [contenteditable="true"]';

export function CinemaCursor() {
  const active = useCursorActive("cinema");
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let tx = window.innerWidth / 2, ty = window.innerHeight / 2; // target
    let dx = tx, dy = ty, rx = tx, ry = ty; // dot / ring eased
    let visible = false;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX; ty = e.clientY;
      if (!visible) {
        // first appearance: snap both parts so they don't fly across the screen
        dx = rx = tx; dy = ry = ty;
        visible = true;
        dot.style.opacity = "1";
        ring.style.opacity = "1";
      }
      const t = e.target as HTMLElement | null;
      const it = t?.closest?.(INTERACTIVE) as HTMLElement | null;
      const tf = t?.closest?.(TEXTFIELD) as HTMLElement | null;
      const pressed = e.buttons > 0;
      ring.dataset.state = tf ? "text" : it ? (pressed ? "down" : "hover") : pressed ? "down" : "";
    };

    const onLeave = (e: PointerEvent) => {
      if (!e.relatedTarget) {
        visible = false;
        dot.style.opacity = "0";
        ring.style.opacity = "0";
      }
    };

    const onDown = () => { ring.dataset.state = "down"; };
    const onUp = () => { ring.dataset.state = ""; };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      dx += (tx - dx) * 0.6;
      dy += (ty - dy) * 0.6;
      rx += (tx - rx) * 0.16;
      ry += (ty - ry) * 0.16;
      dot.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [active]);

  if (!active) return null;

  // Body-level portal: the visuals must float above every sheet, overlay and
  // the AppSwitch veil (z-200) — otherwise the cursor vanishes mid-switch.
  return createPortal(
    <>
      <div
        ref={ringRef}
        aria-hidden
        className="nc-cursor-ring"
        style={{ opacity: 0 }}
      />
      <div
        ref={dotRef}
        aria-hidden
        className="nc-cursor-dot"
        style={{ opacity: 0 }}
      />
    </>,
    document.body,
  );
}
