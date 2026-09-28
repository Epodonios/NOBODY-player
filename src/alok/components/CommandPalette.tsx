// ── NOBODY ALOK · command palette (Ctrl+K) ───────────────────────────────────
// A mono, keyboard-first launcher: every transport command, surface, view,
// import flow, online fetch and face switch, plus fuzzy track search. ↑↓ to
// move, ⏎ to run, Esc to close.

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Heart, Dices, Text,
  Wand2, Layers, Zap, Palette, LayoutGrid, History, ListMusic, Settings2,
  Upload, FolderOpen, Sparkles, Image as ImageIcon, Monitor, Clapperboard,
  BookOpen, Search, ArrowDownToLine,
} from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary } from "../../cinema/store/library";
import { useUi } from "../../cinema/store/ui";
import { useSettings } from "../../cinema/store/settings";
import { useT } from "../../cinema/lib/useT";
import { startSmartFetch, useSmartFetch } from "../../cinema/lib/smartFetch";
import { importViaPicker, importViaFolder } from "../lib/importActions";
import { useAlokT } from "../lib/i18n";
import { switchUiMode } from "../../uiMode";
import { useAlokUi, type AlokView } from "../store/alokUi";

interface Cmd {
  id: string;
  group: "actions" | "tracks";
  label: string;
  hint?: string;
  icon?: any;
  run: () => void;
}

export function CommandPalette() {
  const t = useT();
  const tt = useAlokT(); // ALOK-only labels (Transfer Bay) resolve here first
  const show = useAlokUi((s) => s.showCmd);
  const setShow = useAlokUi((s) => s.setShowCmd);
  const toggleView = useAlokUi((s) => s.toggleView);
  const closePanel = useAlokUi((s) => s.closePanel);
  const tracks = useLibrary((s) => s.tracks);
  const order = useLibrary((s) => s.order);
  const currentId = useUi((s) => s.currentId);
  const isPlaying = useUi((s) => s.isPlaying);
  const shuffle = useUi((s) => s.shuffle);
  const repeat = useUi((s) => s.repeat);
  const lang = useSettings((s) => s.lang);
  const theme = useSettings((s) => s.alokTheme ?? "void");

  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // fresh state each open + focus the input
  useEffect(() => {
    if (show) {
      setQ("");
      setSel(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [show]);

  const actions = useMemo<Cmd[]>(() => {
    const close = () => setShow(false);
    const openView = (v: AlokView) => { closePanel(); toggleView(v); close(); };
    const fetchBoth = async (mode: "lyrics" | "covers") => {
      const s = useSmartFetch.getState();
      if (s.running) return;
      s.setMode(mode);
      s.setScope("all");
      s.setSkipExisting(true);
      void startSmartFetch(t);
    };
    return [
      { id: "toggle", group: "actions", label: isPlaying ? t("pause") : t("play"), hint: "Space", icon: isPlaying ? Pause : Play, run: () => { engine.toggle(); close(); } },
      { id: "next", group: "actions", label: t("next"), hint: "N", icon: SkipForward, run: () => { engine.next(); close(); } },
      { id: "prev", group: "actions", label: t("previous"), hint: "P", icon: SkipBack, run: () => { engine.prev(); close(); } },
      { id: "shuffle", group: "actions", label: t("shuffle"), hint: shuffle ? "ON" : "OFF", icon: Shuffle, run: () => { engine.setShuffle(!shuffle); close(); } },
      { id: "repeat", group: "actions", label: repeat === "one" ? t("repeatOne") : t("repeat"), hint: repeat.toUpperCase(), icon: Repeat, run: () => { engine.cycleRepeat(); close(); } },
      { id: "random", group: "actions", label: t("alShuffleAll"), icon: Dices, run: () => { const ids = [...order]; if (!ids.length) return; engine.setQueue(ids, ids[Math.floor(Math.random() * ids.length)], true); close(); } },
      { id: "like", group: "actions", label: t("like"), icon: Heart, run: () => { if (currentId) useLibrary.getState().toggleLike(currentId); close(); } },
      { id: "lyrics", group: "actions", label: t("alLyrics"), icon: Text, run: () => { toggleLyrics(); close(); } },
      { id: "aura", group: "actions", label: t("alAura"), icon: Wand2, run: () => { useAlokUi.getState().setShowAura(true); close(); } },
      { id: "queue", group: "actions", label: t("alQueue"), icon: Layers, run: () => { toggleQueue(); close(); } },
      { id: "fx", group: "actions", label: t("alFx"), icon: Zap, run: () => { toggleFx(); close(); } },
      { id: "mood", group: "actions", label: t("alMood"), icon: Palette, run: () => { toggleMood(); close(); } },
      { id: "v-library", group: "actions", label: t("alLibrary"), icon: LayoutGrid, run: () => openView("library") },
      { id: "v-liked", group: "actions", label: t("alLiked"), icon: Heart, run: () => openView("liked") },
      { id: "v-recents", group: "actions", label: t("alRecents"), icon: History, run: () => openView("recents") },
      { id: "v-playlists", group: "actions", label: t("alPlaylists"), icon: ListMusic, run: () => openView("playlists") },
      { id: "v-settings", group: "actions", label: t("alSettings"), icon: Settings2, run: () => openView("settings") },
      { id: "v-downloads", group: "actions", label: tt("alDownloads"), icon: ArrowDownToLine, run: () => openView("downloads") },
      { id: "imp-files", group: "actions", label: t("importFiles"), icon: Upload, run: () => { close(); void importViaPicker(t); } },
      { id: "imp-folder", group: "actions", label: t("importFolder"), icon: FolderOpen, run: () => { close(); void importViaFolder(t); } },
      { id: "f-lyrics", group: "actions", label: t("fetchLyricsNow"), icon: Sparkles, run: () => { close(); void fetchBoth("lyrics"); } },
      { id: "f-covers", group: "actions", label: t("alFetchCovers"), icon: ImageIcon, run: () => { close(); void fetchBoth("covers"); } },
      { id: "face-classic", group: "actions", label: `${t("stInterface")}: ${t("uiClassic")}`, icon: Monitor, run: () => { close(); void switchUiMode("classic"); } },
      { id: "face-cinema", group: "actions", label: `${t("stInterface")}: ${t("uiCinema")}`, icon: Clapperboard, run: () => { close(); void switchUiMode("cinema"); } },
      { id: "face-eela", group: "actions", label: `${t("stInterface")}: ${t("uiEela")}`, icon: BookOpen, run: () => { close(); void switchUiMode("eela"); } },
      { id: "th-void", group: "actions", label: `${t("stTheme")}: ${t("alThemeVoid")}`, icon: Palette, hint: theme === "void" ? "✓" : undefined, run: () => { useSettings.getState().set("alokTheme", "void"); close(); } },
      { id: "th-graphite", group: "actions", label: `${t("stTheme")}: ${t("alThemeGraphite")}`, icon: Palette, hint: theme === "graphite" ? "✓" : undefined, run: () => { useSettings.getState().set("alokTheme", "graphite"); close(); } },
    ];
    // local helpers keep the array literal terse
    function toggleLyrics() { const s = useAlokUi.getState(); s.setShowLyrics(!s.showLyrics); }
    function toggleQueue() { const s = useAlokUi.getState(); s.setShowQueue(!s.showQueue); }
    function toggleFx() { const s = useAlokUi.getState(); s.setShowFx(!s.showFx); }
    function toggleMood() { const s = useAlokUi.getState(); s.setShowMood(!s.showMood); }
  }, [t, tt, isPlaying, shuffle, repeat, order, currentId, lang, theme, setShow, toggleView, closePanel]);

  const trackCmds = useMemo<Cmd[]>(() => {
    const needle = q.trim().toLowerCase();
    const pool = order.map((id) => tracks[id]).filter(Boolean) as any[];
    const matched = needle
      ? pool.filter((tr) => `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(needle))
      : pool;
    return matched.slice(0, 40).map((tr) => ({
      id: `t-${tr.id}`,
      group: "tracks" as const,
      label: tr.title,
      hint: tr.artist,
      icon: Music,
      run: () => { engine.setQueue(matched.map((x: any) => x.id), tr.id, true); setShow(false); },
    }));
  }, [q, order, tracks, setShow]);

  const items = useMemo(() => [...actions, ...trackCmds], [actions, trackCmds]);
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return items;
    return items.filter((c) => c.group === "tracks" || `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(needle));
  }, [items, needle]);

  // clamp selection when the list shrinks
  useEffect(() => { if (sel >= filtered.length) setSel(Math.max(0, filtered.length - 1)); }, [filtered.length, sel]);

  // keep the selection visible
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-sel="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const runAt = (i: number) => {
    const cmd = filtered[i];
    if (!cmd) return;
    cmd.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => (filtered.length ? (s + 1) % filtered.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => (filtered.length ? (s - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      runAt(sel);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShow(false);
    }
  };

  let lastGroup = "";

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            className="na-cmd-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShow(false)}
            aria-hidden
          />
          <motion.div
            className="na-cmd"
            role="dialog"
            aria-label={t("alCmd")}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--na-line-soft)" }}>
              <Search size={15} style={{ marginInlineStart: 16, color: "var(--na-faint)", flex: "none" }} aria-hidden />
              <input
                ref={inputRef}
                className="na-cmd-input"
                style={{ borderBottom: "none" }}
                value={q}
                onChange={(e) => { setQ(e.target.value); setSel(0); }}
                onKeyDown={onKeyDown}
                placeholder={t("alCmdPlaceholder")}
                aria-label={t("alCmd")}
              />
            </div>
            <div className="na-cmd-list na-scroll" ref={listRef}>
              {filtered.length === 0 && (
                <div className="na-cmd-group" style={{ paddingBlock: 18 }}>{t("noMatches")}</div>
              )}
              {filtered.map((c, i) => {
                const head = c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                const Icon = c.icon;
                return (
                  <div key={c.id}>
                    {head === "actions" && <div className="na-cmd-group">{t("alCmdActions")}</div>}
                    {head === "tracks" && <div className="na-cmd-group">{t("alCmdTracks")}</div>}
                    <button
                      className="na-cmd-item"
                      data-sel={i === sel}
                      onMouseEnter={() => setSel(i)}
                      onClick={() => runAt(i)}
                    >
                      {Icon && <Icon size={15} aria-hidden />}
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                      {c.hint && <small>{c.hint}</small>}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* small local icon for track rows (avoids another import name clash) */
function Music() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
}
