// ── NOBODY ALOK · app shell ──────────────────────────────────────────────────
// The radial neon-core face of NOBODY. Shares the library store, settings
// store and audio engine with Cinema/EELA (module singletons), so switching
// cinema ⇄ eela ⇄ alok is seamless — playback just continues. Only Classic ⇄
// alok hands playback over through the localStorage handoff blob.
//
// Everything window-level (drag&drop, keyboard) is GUARDED by the active
// ui-mode so the mounted panes never double-handle. Cinema owns boot resume
// (restoreResume) — this face never calls it.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Import } from "lucide-react";
import { engine } from "../cinema/lib/engine";
import { extractAccent } from "../cinema/lib/covers";
import { importDropped } from "../cinema/lib/importer";
import { db } from "../cinema/lib/db";
import { useLibrary } from "../cinema/store/library";
import { useSettings } from "../cinema/store/settings";
import { useUi, uiApi } from "../cinema/store/ui";
import { useT } from "../cinema/lib/useT";
import { clamp } from "../cinema/lib/utils";
import { UI_SWITCH_EVENT, readUiHandoff, clearUiHandoff, getUiMode } from "../uiMode";
import { useSupportNudge } from "../nudge";
import { useAlokUi, useAlokAccent } from "./store/alokUi";
import { Header } from "./components/Header";
import { Core } from "./components/Core";
import { LeftDock } from "./components/LeftDock";
import { RightOrbit } from "./components/RightOrbit";
import { Panel } from "./components/Panel";
import { LyricsSheet } from "./components/LyricsSheet";
import { QueueSheet } from "./components/QueueSheet";
import { FxSheet } from "./components/FxSheet";
import { MoodSheet } from "./components/MoodSheet";
import { CommandPalette } from "./components/CommandPalette";
import { InfoCard } from "./components/InfoCard";
import { SupportPopup } from "./components/SupportPopup";
import { Aura } from "./components/Aura";
import { Toaster } from "./components/Toaster";
import "./index.css";

const alokBootGuard = { done: false };

export default function AlokApp() {
  const t = useT();
  const view = useAlokUi((s) => s.view);
  const theme = useSettings((s) => s.alokTheme ?? "void");
  const lang = useSettings((s) => s.lang);
  const ringMode = useSettings((s) => s.alokRing ?? "cover");
  const accentFromCover = useSettings((s) => s.accentFromCover);
  const currentId = useUi((s) => s.currentId);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const dragging = useAlokUi((s) => s.dragging);
  const setDragging = useAlokUi((s) => s.setDragging);
  const setAccent = useAlokAccent((s) => s.setAccent);
  const accent = useAlokAccent((s) => s.accent);
  const dragDepth = useRef(0);
  const [booted, setBooted] = useState(() => alokBootGuard.done);
  // shared support-nudge scheduler — the "TRANSMISSION" card renders itself
  // only while the pure hub is up (the popup re-checks overlays + idle-dim)
  const { nudge, dismiss } = useSupportNudge("alok");

  // ── document settings for THIS pane (theme / lang / dir on #na-root) ──
  useEffect(() => {
    const root = document.getElementById("na-root");
    if (!root) return;
    root.dataset.naTheme = theme;
    root.lang = lang;
    root.dir = lang === "fa" ? "rtl" : "ltr";
  }, [theme, lang]);

  // library hydration (cinema owns boot resume — we only make sure the data
  // is readable even if this face is the one that boots first)
  useEffect(() => {
    if (!useLibrary.getState().hydrated) void useLibrary.getState().hydrate();
  }, []);

  // soft dark entrance on first boot (StrictMode-safe module guard)
  // BUG FIX (ALOK rendered a pure-black screen): under StrictMode the double
  // mount scheduled the fade timeout, the first cleanup CLEARED it, and the
  // second mount early-returned on the guard — setBooted(true) never ran, so
  // the opaque #0a0a0c boot overlay stayed at z-95 forever. Remounts (the new
  // single-active-pane shell mounts ALOK on switch) now clear the overlay
  // immediately when the guard says the entrance already played.
  useEffect(() => {
    if (alokBootGuard.done) {
      // StrictMode remount (or pane re-entry): the entrance already played —
      // clear the overlay asynchronously (no sync setState inside the effect).
      const id = window.setTimeout(() => setBooted(true), 0);
      return () => window.clearTimeout(id);
    }
    alokBootGuard.done = true;
    const id = window.setTimeout(() => setBooted(true), 550);
    return () => window.clearTimeout(id);
  }, []);

  // ── accent: cover-derived (only in "cover" ring mode) → --na-accent ──
  useEffect(() => {
    const root = document.getElementById("na-root");
    if (!root) return;
    if (ringMode !== "cover" || !accentFromCover || !track) {
      root.style.removeProperty("--na-accent");
      setAccent("");
      return;
    }
    let alive = true;
    (async () => {
      let nextAccent = track.accent;
      if (!nextAccent) {
        const blob = track.hasCover ? await db.getCover(track.id) : null;
        if (blob) nextAccent = await extractAccent(blob, track.id);
        if (alive && nextAccent) useLibrary.getState().patchTrack(track.id, { accent: nextAccent });
      }
      if (alive && nextAccent) {
        root.style.setProperty("--na-accent", nextAccent);
        setAccent(nextAccent);
      }
    })();
    return () => { alive = false; };
  }, [ringMode, accentFromCover, track?.id, track?.accent, track?.hasCover, track]);

  // ── marker so debugging tools can see ALOK is alive (engine answers too) ──
  useEffect(() => {
    const w = globalThis as any;
    w.__NOBODY_ALOK__ = { viaEngine: true };
    return () => { delete w.__NOBODY_ALOK__; };
  }, []);

  // ── consume playback handoffs coming from Classic ──
  useEffect(() => {
    const consume = async () => {
      const handoff = readUiHandoff("classic");
      if (!handoff) return;
      clearUiHandoff();
      if (!useLibrary.getState().hydrated) await useLibrary.getState().hydrate();
      const id = handoff.trackId;
      if (!id || !useLibrary.getState().tracks[id]) return;
      engine.setVolume(handoff.volume ?? 0.9);
      // QA fix: hand over the FULL listen order — a single-track queue made
      // playback die at the end of the current song after a UI switch.
      engine.setQueue(handoff.queueIds?.length ? handoff.queueIds : [id], id, false);
      const rawPosition = Number(handoff.position) || 0;
      const seekOnce = () => {
        const a = engine.audio;
        if (isFinite(a.duration) && a.duration > 0) {
          const dur = a.duration;
          const pos = rawPosition >= dur - 0.5 ? 0 : rawPosition;
          a.currentTime = Math.max(0, Math.min(pos, Math.max(0, dur - 0.4)));
          engine.pushState();
          return true;
        }
        return false;
      };
      if (!seekOnce()) {
        const onMeta = () => {
          if (seekOnce()) engine.audio.removeEventListener("loadedmetadata", onMeta);
        };
        engine.audio.addEventListener("loadedmetadata", onMeta);
      }
      if (handoff.isPlaying && engine.audio.currentTime < (isFinite(engine.audio.duration) ? engine.audio.duration - 0.5 : Infinity)) {
        void engine.play();
      }
      uiApi.toast(t("resumeRestored"), "info");
    };
    if (getUiMode() === "alok") void consume();
    const onSwitch = (e: Event) => {
      if ((e as CustomEvent).detail?.to === "alok") void consume();
    };
    window.addEventListener(UI_SWITCH_EVENT, onSwitch);
    return () => window.removeEventListener(UI_SWITCH_EVENT, onSwitch);
  }, []);

  // ── window drag & drop import (only while ALOK is the active UI) ──
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const active = () => getUiMode() === "alok";
    const onEnter = (e: DragEvent) => {
      if (!active() || !hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => { if (active() && hasFiles(e)) e.preventDefault(); };
    const onLeave = (e: DragEvent) => {
      if (!active() || !hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!active() || !hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const dt = e.dataTransfer!;
      const res = await importDropped(dt.items, dt.files, t("importing"));
      if (res.added || res.skipped) {
        uiApi.toast(
          `${res.added} ${t("addedToLibrary")}${res.skipped ? ` · ${res.skipped} ${t("alreadyInLibrary")}` : ""}`,
          res.added ? "success" : "info"
        );
      }
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [lang]);

  // ── keyboard transport (only while ALOK is the active UI) ──
  // Esc closes the topmost overlay: cmd > aura > fx > mood > lyrics > queue >
  // info > panel. Ctrl/⌘+K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (getUiMode() !== "alok") return;
      // palette shortcut wins even while typing in a field
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useAlokUi.getState().setShowCmd(true);
        return;
      }
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing) return;
      const ui = useAlokUi.getState();
      if (e.code === "Space") {
        // let a focused button handle its own Space activation (no double toggle)
        if (el && el.tagName === "BUTTON") return;
        e.preventDefault();
        engine.toggle();
      } else if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) {
        engine.seek(engine.audio.currentTime + 5);
      } else if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) {
        engine.seek(engine.audio.currentTime - 5);
      } else if (e.key === "ArrowUp" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        engine.setVolume(clamp(engine.volume + 0.05, 0, 1));
      } else if (e.key === "ArrowDown" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        engine.setVolume(clamp(engine.volume - 0.05, 0, 1));
      } else if (e.key === "n" || e.key === "N") {
        engine.next();
      } else if (e.key === "p" || e.key === "P") {
        engine.prev();
      } else if (e.key === "m" || e.key === "M") {
        engine.audio.muted = !engine.audio.muted;
      } else if (e.key === "l" || e.key === "L") {
        const id = useUi.getState().currentId;
        if (id) useLibrary.getState().toggleLike(id);
      } else if (e.key === "q" || e.key === "Q") {
        ui.setShowQueue(!ui.showQueue);
      } else if (e.key === "f" || e.key === "F") {
        ui.setShowFx(!ui.showFx);
      } else if (e.key === "Escape") {
        ui.closeTop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── scroll-wheel volume on the pure hub (never while a surface is open) ──
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (getUiMode() !== "alok") return;
      const ui = useAlokUi.getState();
      if (ui.view !== null || ui.showCmd || ui.showAura || ui.showFx || ui.showMood || ui.showLyrics || ui.showQueue || ui.showInfo) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest(".na-scroll, .na-sheet, .na-panel, .na-cmd, .na-info, .na-pop")) return;
      engine.setVolume(clamp(engine.volume + (e.deltaY < 0 ? 0.05 : -0.05), 0, 1));
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  // ── idle dim: the chrome fades away when the hub plays untouched ──
  const idleDim = useSettings((s) => s.alokIdleDim ?? true);
  useEffect(() => {
    const root = document.getElementById("na-root");
    if (!idleDim) { root?.removeAttribute("data-idle"); return; }
    const IDLE_MS = 24000;
    let timer = 0;
    const anySurface = () => {
      const ui = useAlokUi.getState();
      return ui.view !== null || ui.showCmd || ui.showAura || ui.showFx || ui.showMood || ui.showLyrics || ui.showQueue || ui.showInfo || ui.dragging;
    };
    const arm = () => {
      window.clearTimeout(timer);
      if (anySurface()) { root?.removeAttribute("data-idle"); return; }
      timer = window.setTimeout(() => {
        if (!anySurface() && getUiMode() === "alok") root?.setAttribute("data-idle", "true");
      }, IDLE_MS);
    };
    const wake = () => {
      root?.removeAttribute("data-idle");
      arm();
    };
    arm();
    const unsub = useAlokUi.subscribe(arm);
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake, { passive: true });
    window.addEventListener("wheel", wake, { passive: true });
    return () => {
      window.clearTimeout(timer);
      unsub();
      root?.removeAttribute("data-idle");
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake);
    };
  }, [idleDim]);

  const panelOpen = view !== null;

  return (
    <div id="na-root" data-na-theme={theme}>
      {/* layered stage: hairline frames + grain + grid + vignette */}
      <div className="na-frames" aria-hidden />
      <div className="na-grain" aria-hidden />

      <Header />

      {/* the core — shrinks + lifts while the panel is open (transform only) */}
      <motion.div
        className="na-core-stage"
        animate={panelOpen ? { scale: 0.82, y: -28 } : { scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ willChange: "transform" }}
      >
        <Core accent={accent} />
      </motion.div>

      <LeftDock />
      <RightOrbit accent={accent} />
      <Panel />

      <LyricsSheet />
      <QueueSheet />
      <MoodSheet />
      <FxSheet />
      <CommandPalette />
      <InfoCard />
      <Aura accent={accent} />
      <Toaster />

      {/* support nudge — suppressed while any surface is open or idle-dimmed */}
      <SupportPopup nudge={nudge} dismiss={dismiss} />

      {/* drop overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="na-drop"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="na-drop-card"
            >
              <Import size={28} style={{ color: "var(--na-accent)" }} aria-hidden />
              <div className="na-mono">{t("alDropHint")}</div>
              <small>{t("dropSub")}</small>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* boot fade */}
      <AnimatePresence>
        {!booted && (
          <motion.div
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            className="pointer-events-none fixed inset-0 z-[95]"
            style={{ background: "#0a0a0c" }}
            aria-hidden
          />
        )}
      </AnimatePresence>
    </div>
  );
}
