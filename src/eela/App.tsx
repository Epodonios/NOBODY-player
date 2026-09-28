// ── NOBODY EELA · app shell ──────────────────────────────────────────────────
// The paper-light face of NOBODY. Shares the library store, settings store and
// audio engine with Cinema (module singletons), so switching Cinema ⇄ EELA is
// seamless — playback just continues. Only Classic ⇄ EELA hands playback over
// through the localStorage handoff blob.
//
// Everything window-level (drag&drop, keyboard, media keys via cinema) is
// GUARDED by the active ui-mode so the two mounted panes never double-handle.

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
import { UI_SWITCH_EVENT, readUiHandoff, clearUiHandoff, getUiMode } from "../uiMode";
import { useSupportNudge } from "../nudge";
import { useEelaUi } from "./store/eelaUi";
import { TopNav } from "./components/TopNav";
import { LibraryView } from "./components/LibraryView";
import { DownloadsView } from "./components/DownloadsView";
import { PlaylistsView } from "./components/PlaylistsView";
import { SupportView } from "./components/SupportView";
import { AboutView } from "./components/AboutView";
import { SettingsView } from "./components/SettingsView";
import { PlayerBar } from "./components/PlayerBar";
import { NowPlaying } from "./components/NowPlaying";
import { QueueSheet } from "./components/QueueSheet";
import { AmbientFullscreen } from "./components/AmbientFullscreen";
import { Toaster } from "./components/Toaster";
import { SupportNudgeCard } from "./components/SupportNudge";

const eelaBootGuard = { done: false };

export default function EelaApp() {
  const t = useT();
  const view = useEelaUi((s) => s.view);
  const theme = useSettings((s) => s.eelaTheme ?? "light");
  const lang = useSettings((s) => s.lang);
  const accentFromCover = useSettings((s) => s.accentFromCover);
  const currentId = useUi((s) => s.currentId);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const dragging = useEelaUi((s) => s.dragging);
  const setDragging = useEelaUi((s) => s.setDragging);
  // overlay gates for the support nudge (V1.4.0 request #2): the bookmark
  // never competes with the queue sheet, NowPlaying or the ambient stage
  const showNp = useEelaUi((s) => s.showNp);
  const showAmbient = useEelaUi((s) => s.showAmbient);
  const showQueue = useEelaUi((s) => s.showQueue);
  const { nudge, dismiss } = useSupportNudge("eela");
  const showNudge = !!nudge && !showAmbient && !showQueue && !showNp;
  const dragDepth = useRef(0);
  const [booted, setBooted] = useState(false);

  // ── document settings for THIS pane (theme / lang / dir on #ne-root) ──
  useEffect(() => {
    const root = document.getElementById("ne-root");
    if (!root) return;
    root.dataset.neTheme = theme;
    root.lang = lang;
    root.dir = lang === "fa" ? "rtl" : "ltr";
  }, [theme, lang]);

  // soft paper entrance on first boot
  useEffect(() => {
    if (eelaBootGuard.done) { setBooted(true); return; }
    eelaBootGuard.done = true;
    const id = window.setTimeout(() => setBooted(true), 550);
    return () => window.clearTimeout(id);
  }, []);

  // ── dynamic accent from current cover (scoped to #ne-root) ──
  useEffect(() => {
    const root = document.getElementById("ne-root");
    if (!root) return;
    if (!accentFromCover || !track) {
      root.style.removeProperty("--accent");
      return;
    }
    let alive = true;
    (async () => {
      let accent = track.accent;
      if (!accent) {
        const blob = track.hasCover ? await db.getCover(track.id) : null;
        if (blob) accent = await extractAccent(blob, track.id);
        if (alive && accent) useLibrary.getState().patchTrack(track.id, { accent });
      }
      if (alive && accent) root.style.setProperty("--accent", accent);
    })();
    return () => { alive = false; };
  }, [track?.id, track?.accent, accentFromCover, track]);

  // ── classic bridge: EELA answers for the shared engine too ──
  // (cinema already exposes __NOBODY_CINEMA__; we only add a marker so
  //  debugging tools can see EELA is alive — playback routing is identical.)
  useEffect(() => {
    const w = globalThis as any;
    w.__NOBODY_EELA__ = { viaEngine: true };
    return () => { delete w.__NOBODY_EELA__; };
  }, []);

  // library hydration (same guarantee as ALOK: the data must be readable even
  // if EELA is the face that boots first — V1.3.0 fix: booting straight into
  // EELA showed an EMPTY library because hydrate only ran inside the handoff
  // consumer, i.e. it needed a Classic→EELA switch to ever fill the Library,
  // Download Center and Queue).
  useEffect(() => {
    if (!useLibrary.getState().hydrated) void useLibrary.getState().hydrate();
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
    if (getUiMode() === "eela") void consume();
    const onSwitch = (e: Event) => {
      if ((e as CustomEvent).detail?.to === "eela") void consume();
    };
    window.addEventListener(UI_SWITCH_EVENT, onSwitch);
    return () => window.removeEventListener(UI_SWITCH_EVENT, onSwitch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── window drag & drop import (only while EELA is the active UI) ──
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const active = () => getUiMode() === "eela";
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

  // ── keyboard transport (only while EELA is the active UI) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (getUiMode() !== "eela") return;
      const el = e.target as HTMLElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing) return;
      const ui = useEelaUi.getState();
      if (e.code === "Space") { e.preventDefault(); engine.toggle(); }
      else if (e.key === "ArrowRight" && !e.metaKey && !e.ctrlKey) engine.seek(engine.audio.currentTime + 5);
      else if (e.key === "ArrowLeft" && !e.metaKey && !e.ctrlKey) engine.seek(engine.audio.currentTime - 5);
      else if (e.key === "n" || e.key === "N") engine.next();
      else if (e.key === "p" || e.key === "P") engine.prev();
      else if (e.key === "Escape") {
        if (ui.showAmbient) ui.setShowAmbient(false);
        else if (ui.showQueue) ui.setShowQueue(false);
        else if (ui.showNp) ui.setShowNp(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div id="ne-root" data-ne-theme={theme}>
      <TopNav />

      <main className="relative h-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            className="ne-view-enter h-full"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === "library" && <LibraryView />}
            {view === "playlists" && <PlaylistsView />}
            {view === "downloads" && <DownloadsView />}
            {view === "support" && <SupportView />}
            {view === "about" && <AboutView />}
            {view === "settings" && <SettingsView />}
          </motion.div>
        </AnimatePresence>
      </main>

      <PlayerBar />
      <QueueSheet />
      <NowPlaying />
      <AmbientFullscreen />
      <Toaster />

      {/* support nudge — the ex libris bookmark (V1.4.0 request #2). Mounted
          only when the shared scheduler has a live nudge AND the page is
          clear of overlays; while an overlay is up it simply waits in state
          and slips in once the page is free again. */}
      <AnimatePresence>
        {showNudge && nudge && (
          <SupportNudgeCard key={nudge.kind} kind={nudge.kind} dismiss={dismiss} />
        )}
      </AnimatePresence>

      {/* drop overlay */}
      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center"
            style={{ background: "color-mix(in srgb, var(--bg) 78%, transparent)" }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              className="ne-card flex flex-col items-center gap-3 border-2 border-dashed px-12 py-10 text-center"
              style={{ borderColor: "var(--accent)" }}
            >
              <Import size={30} style={{ color: "var(--accent-ink)" }} />
              <div className="ne-display text-[22px] italic">{t("dropHint")}</div>
              <div className="text-[12px] text-[var(--mut)]">{t("dropSub")}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* boot fade */}
      <AnimatePresence>
        {!booted && (
          <motion.div
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            className="fixed inset-0 z-[95]"
            style={{ background: "var(--bg)" }}
            aria-hidden
          />
        )}
      </AnimatePresence>
    </div>
  );
}
