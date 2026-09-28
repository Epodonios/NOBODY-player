import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
// NOBODY Cinema design system — MUST be imported (it was dropped when the
// companion's main.tsx was merged away, which left the whole cinema UI
// unstyled: no theme vars, no fonts, no layout). Loaded after the classic
// stylesheet so cinema wins cascade ties inside its own .nc-root subtree.
import "./cinema/index.css";
import AppSwitch from "./AppSwitch";
import { isElectron, onElectronWindowState, installManualWindowDrag } from "./desktopWindow";
import { initDynamicCursor } from "./dynamicCursor";
import { installAppCloseHandler } from "./appClose";
import { installMediaKeyBridge } from "./mediaKeys";

// Electron migration: tag the runtime once, before any UI mounts, so the
// window-chrome CSS (rounded corners + app-drawn shadow under html.electron,
// drag regions) applies to ALL four UIs, and seed the maximize/fullscreen
// state that collapses those corners on maximized windows.
if (isElectron()) {
  document.documentElement.classList.add("electron");
  onElectronWindowState(() => undefined); // bootstraps data-electron-win
}

// V1.2.0 (Task 24-c): the ONE cursor system for all four faces — never-hand
// enforcement inside every UI surface + dynamic accent-tinted cursors for
// cinema/eela/alok (classic keeps its own SVG set). Idempotent singleton;
// purely cosmetic, so it must never block boot.
try {
  initDynamicCursor();
} catch {
  /* ignore — the OS cursor is an acceptable fallback */
}

// V1.4.0 (#6): every close path (✕ buttons, Alt+F4, taskbar) routes through
// the per-face close veil. Installed at root level once, UI-agnostic.
try {
  installAppCloseHandler();
} catch {
  /* ignore — worst case the window closes without the veil */
}

// V1.4.0 (#9): hardware media keys (⏯ ⏭ ⏮ ⏹) arrive from the main process
// via globalShortcut and are re-broadcast as a window CustomEvent here, so
// classic AND the shared engine can react even while minimized/unfocused.
try {
  installMediaKeyBridge();
} catch {
  /* ignore — media keys are best-effort */
}

// V1.4.0 (#5): manual pointer-capture window dragging replaces the OS
// -webkit-app-region drag strips (whose hit-test layer forced the Windows
// default cursor over the headers). Electron-only, idempotent.
if (isElectron()) {
  try {
    installManualWindowDrag();
  } catch {
    /* ignore — worst case the window cannot be dragged by its header */
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppSwitch />
  </StrictMode>
);
