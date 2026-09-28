// ── NOBODY for Web — app shell ───────────────────────────────────────────────
// Companion to the Windows desktop app. Local-first: user files live in
// IndexedDB, settings in localStorage. No accounts, no tracking, no cloud.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Import } from "lucide-react";
import { engine } from "./lib/engine";
import { db } from "./lib/db";
import { extractAccent, paletteFor } from "./lib/covers";
import { importDropped } from "./lib/importer";
import { getBridge } from "./lib/desktopBridge";
import { UI_SWITCH_EVENT, readUiHandoff, clearUiHandoff, getUiMode } from "../uiMode";
import { useLibrary } from "./store/library";
import { useUi, uiApi } from "./store/ui";
import { useSettings, applyDocumentSettings, applyAccent } from "./store/settings";
import { useT } from "./lib/useT";
import { useSupportNudge } from "../nudge";
import { TopBar } from "./components/TopBar";
import { DreamField } from "./components/DreamField";
import { PlayerBar } from "./components/PlayerBar";
import { NowPlaying } from "./components/NowPlaying";
import { QueueSheet } from "./components/QueueSheet";
import { AmbientMode } from "./components/AmbientMode";
import { SmartFetchPanel } from "./components/SmartFetchPanel";
import { Toasts } from "./components/Toasts";
import { LibraryView } from "./components/LibraryView";
import { PlaylistsView } from "./components/PlaylistsView";
import { AboutView } from "./components/AboutView";
import { SupportView } from "./components/SupportView";
import { SettingsView } from "./components/SettingsView";
import { FxSheet } from "./components/FxSheet";
import { CommandPalette } from "./components/CommandPalette";
import { MiniLyrics } from "./components/MiniLyrics";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { SupportPopup } from "./components/SupportPopup";
import { initMediaSession } from "./lib/mediaSession";

const bootGuard = { done: false };

export default function App() {
  const t = useT();
  const view = useUi((s) => s.view);
  const theme = useSettings((s) => s.theme);
  const lang = useSettings((s) => s.lang);
  const accentFromCover = useSettings((s) => s.accentFromCover);
  const currentId = useUi((s) => s.currentId);
  const isPlaying = useUi((s) => s.isPlaying);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const dragging = useUi((s) => s.draggingFiles);
  const setDragging = useUi((s) => s.setDraggingFiles);
  // support nudge gates (V1.4.0 request #2): the dreamy glass card never
  // competes with the now-playing stage, the queue sheet or ambient mode —
  // while an overlay is up it simply waits in state and slips in after.
  const showNowPlaying = useUi((s) => s.showNowPlaying);
  const showQueue = useUi((s) => s.showQueue);
  const ambient = useUi((s) => s.ambient);
  const { nudge, dismiss } = useSupportNudge("cinema");
  const showNudge = !!nudge && !ambient && !showNowPlaying && !showQueue;
  const dragDepth = useRef(0);
  const [booted, setBooted] = useState(false);

  // ── document settings (theme / lang / dir) ──
  useEffect(() => {
    applyDocumentSettings({ theme, lang } as any);
  }, [theme, lang]);

  // ── hydrate library, then quietly resume last session (paused) ──
  useEffect(() => {
    if (bootGuard.done) { setBooted(true); return; }
    bootGuard.done = true;
    let alive = true;
    engine.applyPersistedAudioPrefs();
    (async () => {
      await useLibrary.getState().hydrate();
      if (!alive) return;
      const resumedId = await engine.restoreResume();
      if (!alive) return;
      setBooted(true);
      if (resumedId) uiApi.toast(t("resumeRestored"), "info");
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── dynamic accent from current cover ──
  useEffect(() => {
    if (!accentFromCover || !track) {
      applyAccent(null);
      return;
    }
    let alive = true;
    (async () => {
      let accent = track.accent;
      if (!accent) {
        const blob = track.hasCover ? await db.getCover(track.id) : null;
        if (blob) accent = await extractAccent(blob, track.id);
        else accent = `hsl(${paletteFor(track.id).h1} 68% 58%)`;
        if (alive && accent) useLibrary.getState().patchTrack(track.id, { accent });
      }
      if (alive && accent) applyAccent(accent);
    })();
    return () => { alive = false; };
  }, [track?.id, track?.accent, accentFromCover, track]);

  // ── classic-bridge: captureHandoff/pause now live at MODULE level in
  // cinema/lib/engine.ts (window.__NOBODY_CINEMA__) — the component-level
  // exposure here was deleted because its unmount cleanup removed the bridge
  // entirely (reported bug: switching back to Classic stopped the music).
  // The handoff CONSUMER stays below.

  // Continue classic playback when switching over (paused at the exact spot;
  // resumes only when it was actually playing and the gesture still allows).
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
      // A handoff at/after the end means the track had finished — restore from
      // the top (paused) instead of clamping to the last half-second.
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
    // Boot-time consume ONLY when cinema is the active UI — a stale handoff
    // must never start playback inside the hidden pane (single-source rule).
    if (getUiMode() === "cinema") void consume();
    const onSwitch = (e: Event) => {
      if ((e as CustomEvent).detail?.to === "cinema") void consume();
    };
    window.addEventListener(UI_SWITCH_EVENT, onSwitch);
    return () => window.removeEventListener(UI_SWITCH_EVENT, onSwitch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror classic-side library changes (import/fetch/scan) into cinema live.
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    let scheduled = 0;
    const un = bridge.subscribe(() => {
      window.clearTimeout(scheduled);
      scheduled = window.setTimeout(() => {
        void useLibrary.getState().rehydrateTracks().then(() => {
          // QA: classic re-imports its folders ASYNC at boot — when we boot
          // straight into a engine-driven UI the first restoreResume() ran
          // against an empty mirror and deferred; retry now that it filled.
          if (getUiMode() !== "classic") engine.retryDeferredResume();
        });
      }, 250);
    });
    return () => { window.clearTimeout(scheduled); un(); };
  }, []);

  // ── window-level drag & drop import (only while cinema is active) ──
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const active = () => getUiMode() === "cinema";
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ── keyboard transport (guarded when typing) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // single-owner rule: only the ACTIVE ui may respond to global keys —
      // all panes stay mounted, so unguarded listeners would double-toggle
      if (getUiMode() !== "cinema") return;
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        const ui = useUi.getState();
        ui.setShowPalette(!ui.showPalette);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        const ui = useUi.getState();
        ui.setShowFx(!ui.showFx);
        return;
      }
      if (typing) return;
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        const ui = useUi.getState();
        ui.setShowShortcuts(!ui.showShortcuts);
        return;
      }
      if (e.code === "Space") { e.preventDefault(); engine.toggle(); }
      else if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) engine.seek(engine.audio.currentTime + 5);
      else if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) engine.seek(engine.audio.currentTime - 5);
      else if (e.key === "n" || e.key === "N") engine.next();
      else if (e.key === "p" || e.key === "P") engine.prev();
      else if (e.key === "Escape") {
        const ui = useUi.getState();
        if (ui.showPalette) ui.setShowPalette(false);
        else if (ui.showFx) ui.setShowFx(false);
        else if (ui.showShortcuts) ui.setShowShortcuts(false);
        else if (ui.ambient) ui.setAmbient(false);
        else if (ui.showQueue) ui.setShowQueue(false);
        else if (ui.showNowPlaying) ui.setShowNowPlaying(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── OS media keys / lockscreen controls ──
  useEffect(() => initMediaSession(), []);

  return (
    <div
      id="nc-root"
      className="nc-root grain relative h-[100dvh] overflow-hidden"
      data-playing={isPlaying ? "true" : "false"}
    >
      {/* the living aurora behind everything */}
      <DreamField />

      <TopBar />

      <main className="relative z-10 h-full pt-[58px]">
        <div className="relative h-full overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="h-full"
            >
              {view === "library" && <LibraryView />}
              {view === "playlists" && <PlaylistsView />}
              {view === "about" && <AboutView />}
              {view === "support" && <SupportView />}
              {view === "settings" && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </div>
        {/* content dissolves into mist as it rises toward the floating islands */}
        <div aria-hidden className="nc-mist" />
      </main>

      <PlayerBar />
      <MiniLyrics />
      <NowPlaying />
      <QueueSheet />
      <FxSheet />
      <CommandPalette />
      <ShortcutsDialog />
      <SmartFetchPanel />
      <AmbientMode />
      <Toasts />

      {/* support nudge — the dreamy glass ask (V1.4.0 request #2). Mounted only
          when the shared scheduler has a live nudge AND the page is clear of
          overlays; ✕ / Escape dissolve it. */}
      <AnimatePresence>
        {showNudge && nudge && (
          <SupportPopup key={nudge.kind} kind={nudge.kind} dismiss={dismiss} />
        )}
      </AnimatePresence>

      {/* drop overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[85] flex items-center justify-center backdrop-blur-sm"
            style={{ background: "color-mix(in srgb, var(--bg) 72%, transparent)" }}
          >
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              className="glass flex flex-col items-center gap-4 rounded-3xl border-2 border-dashed px-14 py-12 text-center"
              style={{ borderColor: "var(--accent)" }}
            >
              <Import size={34} className="t-accent" />
              <div className="font-display text-3xl italic">{t("dropHint")}</div>
              <div className="t-mut text-[13px]">{t("dropSub")}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* boot veil — the dream assembles */}
      <AnimatePresence>
        {!booted && (
          <motion.div
            exit={{ opacity: 0, transition: { duration: 0.7 } }}
            className="fixed inset-0 z-[95] flex flex-col items-center justify-center overflow-hidden"
            style={{ background: "var(--bg)" }}
          >
            <DreamField strong />
            <div className="relative font-display text-5xl font-bold italic tracking-tight" aria-label="NOBODY">
              {"NOBODY".split("").map((ch, i) => (
                <motion.span
                  key={i}
                  className="inline-block"
                  initial={{ opacity: 0, y: 22, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.1 + i * 0.06, type: "spring", stiffness: 190, damping: 20 }}
                >
                  {ch}
                </motion.span>
              ))}
            </div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="t-mut relative mt-3 text-[11px] tracking-[0.35em]"
            >
              {t("credit")}
            </motion.div>
            <div className="relative mt-9 h-[2px] w-44 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
              <motion.div
                className="h-full w-1/3 rounded-full"
                style={{ background: "linear-gradient(90deg, transparent, var(--accent), transparent)" }}
                initial={{ x: "-100%" }}
                animate={{ x: "260%" }}
                transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

