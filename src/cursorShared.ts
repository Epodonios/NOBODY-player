// ── NOBODY · shared custom-cursor activation bus ─────────────────────────────
// One module owns "is a custom cursor driving the pointer right now?" so the
// native cursor can be hidden at DOCUMENT level (body[data-custom-cursor]).
// Document-level hiding is what fixes the reported bug where the OS cursor
// leaked back in over portals, sheets, veils and scrollbar gutters — the old
// per-root `#nc-root[data-cursor]` scoping only covered each pane's subtree.
//
// Rules (all must hold):
//   • the given UI mode is the ACTIVE pane (classic has its own OS cursor)
//   • the user did not turn the custom cursor off in Settings
//   • the pointer is fine (mouse) — touch devices keep native behavior
//   • prefers-reduced-motion is off
//
// Each UI's cursor component (CinemaCursor / EelaCursor / AlokCursor) renders
// its own visuals and calls `useCursorActive(mode)`; exactly one can be active.

import { useEffect, useState } from "react";
import { useSettings } from "./cinema/store/settings";
import { getUiMode, UI_SWITCH_EVENT, type UiMode } from "./uiMode";

export type CursorMode = Exclude<UiMode, "classic">;

/** Read the three environment gates once + live via matchMedia listeners. */
function useEnvironmentAllows(): boolean {
  const [allows, setAllows] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  });
  useEffect(() => {
    const mq = window.matchMedia("(pointer: fine)");
    const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setAllows(mq.matches && !rm.matches);
    update();
    mq.addEventListener?.("change", update);
    rm.addEventListener?.("change", update);
    return () => {
      mq.removeEventListener?.("change", update);
      rm.removeEventListener?.("change", update);
    };
  }, []);
  return allows;
}

/** Live "is this pane the active UI" (follows the root-level switch event). */
function usePaneActive(mode: CursorMode): boolean {
  const [active, setActive] = useState(() => getUiMode() === mode);
  useEffect(() => {
    const sync = () => setActive(getUiMode() === mode);
    sync();
    window.addEventListener(UI_SWITCH_EVENT, sync);
    return () => window.removeEventListener(UI_SWITCH_EVENT, sync);
  }, [mode]);
  return active;
}

/**
 * Shared activation hook. Returns true when THIS mode's cursor should draw
 * and the document-wide `cursor: none` should hold. Also maintains
 * `body[data-custom-cursor="<mode>"]` so plain CSS can hide the OS cursor
 * everywhere (sheets, portals, veils, palette — outside any pane root).
 */
export function useCursorActive(mode: CursorMode): boolean {
  const settingOn = useSettings((s) => s.customCursor !== false);
  const envAllows = useEnvironmentAllows();
  const paneActive = usePaneActive(mode);
  const active = settingOn && envAllows && paneActive;

  useEffect(() => {
    // Re-evaluate when any of the inputs change; also re-check the mode on
    // every switch event (the paneActive state updates in the same tick, but
    // order is not guaranteed across panes — last writer wins correctly).
    const apply = () => {
      const isOwner = active && getUiMode() === mode;
      const current = document.body.getAttribute("data-custom-cursor");
      if (isOwner) {
        if (current !== mode) document.body.setAttribute("data-custom-cursor", mode);
      } else if (current === mode) {
        document.body.removeAttribute("data-custom-cursor");
      }
    };
    apply();
    window.addEventListener(UI_SWITCH_EVENT, apply);
    return () => {
      window.removeEventListener(UI_SWITCH_EVENT, apply);
      // Unmount hygiene: only clear if WE own the attribute.
      if (document.body.getAttribute("data-custom-cursor") === mode) {
        document.body.removeAttribute("data-custom-cursor");
      }
    };
  }, [active, mode]);

  return active;
}
