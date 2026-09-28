// ── NOBODY · command palette (Ctrl+K) ────────────────────────────────────────
// One glass surface to reach everything: search tracks and playlists, or run
// actions (transport, overlays, theme, language). Full keyboard navigation.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Play, ListEnd, ListPlus, Heart, ListMusic, Shuffle, Repeat, Repeat1,
  MicVocal, Moon, Settings, Sparkles, SlidersHorizontal, Languages, Info, Keyboard, Palette,
} from "lucide-react";
import { engine } from "../lib/engine";
import { useUi, uiApi } from "../store/ui";
import { useLibrary, LIKED_ID } from "../store/library";
import { useSettings } from "../store/settings";
import { useT } from "../lib/useT";
import { fmtTime } from "../lib/utils";
import { CoverArt } from "./CoverArt";
import { cn } from "../utils/cn";
import type { Lang } from "../types";

interface Row {
  id: string;
  kind: "track" | "playlist" | "action";
  title: string;
  sub?: string;
  duration?: number;
  keywords?: string;
  run: () => void;
}

export function CommandPalette() {
  const t = useT();
  const show = useUi((s) => s.showPalette);
  const setShow = useUi((s) => s.setShowPalette);
  const settings = useSettings();
  const library = useLibrary();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [show]);

  const rows = useMemo<Row[]>(() => {
    const query = q.trim().toLowerCase();
    const out: Row[] = [];

    // actions
    const actions: Row[] = [
      { id: "a-shuffle", kind: "action", title: t("shuffle"), sub: t("cmdAction"), keywords: "shuffle random", run: () => engine.setShuffle(!useUi.getState().shuffle) },
      { id: "a-repeat", kind: "action", title: t("repeat"), sub: t("cmdAction"), keywords: "repeat loop", run: () => engine.cycleRepeat() },
      { id: "a-np", kind: "action", title: t("nowPlaying"), sub: t("cmdAction"), keywords: "now playing expand", run: () => { useUi.getState().setShowNowPlaying(true); } },
      { id: "a-lyrics", kind: "action", title: t("lyrics"), sub: t("cmdAction"), keywords: "lyrics words", run: () => { useUi.getState().setNpTab("lyrics"); useUi.getState().setShowNowPlaying(true); } },
      { id: "a-queue", kind: "action", title: t("queue"), sub: t("cmdAction"), keywords: "queue up next", run: () => useUi.getState().setShowQueue(true) },
      { id: "a-fx", kind: "action", title: t("fxTitle"), sub: t("cmdAction"), keywords: "equalizer speed sleep fx", run: () => useUi.getState().setShowFx(true) },
      { id: "a-fetch", kind: "action", title: t("dlOpen"), sub: t("cmdAction"), keywords: "smart fetch cover lyrics download", run: () => useUi.getState().setShowSmartFetch(true) },
      { id: "a-ambient", kind: "action", title: t("enterAmbient"), sub: t("cmdAction"), keywords: "ambient full", run: () => useUi.getState().setAmbient(true, true) },
      { id: "a-theme", kind: "action", title: `${t("stTheme")}: ${settings.theme === "dark" ? t("stLight") : t("stDark")}`, sub: t("cmdAction"), keywords: "theme dark light", run: () => settings.set("theme", settings.theme === "dark" ? "light" : "dark") },
      { id: "a-lang", kind: "action", title: `${t("stLanguage")}: ${settings.lang === "fa" ? "English" : "فارسی"}`, sub: t("cmdAction"), keywords: "language fa en", run: () => settings.set("lang", (settings.lang === "fa" ? "en" : "fa") as Lang) },
      { id: "a-settings", kind: "action", title: t("navSettings"), sub: t("cmdAction"), keywords: "settings", run: () => useUi.getState().setView("settings") },
      { id: "a-library", kind: "action", title: t("navLibrary"), sub: t("cmdAction"), keywords: "library", run: () => useUi.getState().setView("library") },
      { id: "a-playlists", kind: "action", title: t("navPlaylists"), sub: t("cmdAction"), keywords: "playlists", run: () => useUi.getState().setView("playlists") },
      { id: "a-about", kind: "action", title: t("navAbout"), sub: t("cmdAction"), keywords: "about", run: () => useUi.getState().setView("about") },
      { id: "a-keys", kind: "action", title: t("keysTitle"), sub: t("cmdAction"), keywords: "shortcuts keys help", run: () => useUi.getState().setShowShortcuts(true) },
    ];
    const liked = library.playlists.find((p) => p.id === LIKED_ID);

    const tracks: Row[] = Object.values(library.tracks).map((tr) => ({
      id: `t-${tr.id}`,
      kind: "track" as const,
      title: tr.title,
      sub: `${tr.artist}${tr.album !== "Unknown Album" ? ` — ${tr.album}` : ""}`,
      duration: tr.duration,
      keywords: `${tr.artist} ${tr.album} ${tr.fileName}`,
      run: (mode?: "play" | "next" | "queue") => {
        const ids = Object.keys(library.tracks);
        if (mode === "next") { engine.addToQueue(tr.id, true); uiApi.toast(`${t("playNext")} · ${tr.title}`, "success"); }
        else if (mode === "queue") { engine.addToQueue(tr.id); uiApi.toast(`${t("addToQueue")} · ${tr.title}`, "success"); }
        else engine.setQueue(ids, tr.id, true);
      },
    }));

    const playlists: Row[] = library.playlists
      .filter((p) => !p.system)
      .map((p) => ({
        id: `p-${p.id}`,
        kind: "playlist" as const,
        title: p.name,
        sub: `${p.trackIds.length} ${t("songs")}`,
        keywords: "playlist",
        run: () => { if (p.trackIds.length) engine.setQueue(p.trackIds, p.trackIds[0], true); },
      }));
    if (liked && liked.trackIds.length) {
      playlists.unshift({
        id: `p-${LIKED_ID}`,
        kind: "playlist",
        title: t("likedSongs"),
        sub: `${liked.trackIds.length} ${t("songs")}`,
        keywords: "liked favorites",
        run: () => engine.setQueue(liked.trackIds, liked.trackIds[0], true),
      });
    }

    const filter = (r: Row) =>
      !query || r.title.toLowerCase().includes(query) || (r.sub ?? "").toLowerCase().includes(query) || (r.keywords ?? "").toLowerCase().includes(query);

    if (query) {
      const tr = tracks.filter(filter).slice(0, 8);
      const pl = playlists.filter(filter).slice(0, 3);
      const ac = actions.filter(filter).slice(0, 6);
      out.push(...tr, ...pl, ...ac);
    } else {
      // default: recent-ish tracks + liked + key actions
      out.push(
        ...tracks.slice(0, 6),
        ...playlists.slice(0, 2),
        actions[2], actions[3], actions[5], actions[8]
      );
    }
    return out;
  }, [q, library.tracks, library.playlists, settings, t]);

  // keep selection in range + scroll into view
  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, rows.length - 1)));
  }, [rows.length]);
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const r = rows[sel];
      if (!r) return;
      setShow(false);
      if (r.kind === "track") (r.run as unknown as (mode?: string) => void)();
      else r.run();
    } else if (e.key === "Tab" && rows[sel]?.kind === "track") {
      e.preventDefault();
      (rows[sel].run as unknown as (mode?: string) => void)("next");
    }
  };

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[2px]"
            onClick={() => setShow(false)}
          />
          <motion.div
            role="dialog"
            aria-label={t("cmdTitle")}
            initial={{ opacity: 0, y: -14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="glass fixed inset-x-0 top-[12vh] z-[71] mx-auto flex max-h-[70vh] w-[min(620px,94vw)] flex-col overflow-hidden rounded-[22px]"
            onKeyDown={onKey}
          >
            <div className="flex items-center gap-3 border-b px-4 py-3.5" style={{ borderColor: "var(--line)" }}>
              <Search size={16} className="t-faint shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => { setQ(e.target.value); setSel(0); }}
                placeholder={t("cmdPlaceholder")}
                className="h-8 flex-1 bg-transparent text-[14px] outline-none"
                style={{ border: "none", padding: 0 }}
                aria-label={t("cmdTitle")}
              />
              <kbd className="t-faint rounded-md border px-1.5 py-0.5 text-[10px]" style={{ borderColor: "var(--line2)" }}>Esc</kbd>
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
              {rows.length === 0 && <div className="t-mut px-4 py-8 text-center text-[13px]">{t("noMatches")}</div>}
              {rows.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => { setShow(false); r.run(); }}
                  onMouseEnter={() => setSel(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-start transition-colors",
                    i === sel ? "bg-[var(--card2)]" : "hover:bg-[var(--card)]"
                  )}
                >
                  {r.kind === "track" ? (
                    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                      <CoverArt trackId={r.id.slice(2)} />
                    </span>
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
                      {rowIcon(r.id, t)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold leading-tight">{r.title}</span>
                    <span className="t-mut block truncate text-[11px] leading-tight">{r.sub}</span>
                  </span>
                  {r.kind === "track" && (
                    <>
                      {r.duration ? <span className="tnum t-faint text-[10.5px]">{fmtTime(r.duration)}</span> : null}
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label={t("playNext")}
                        onClick={(e) => { e.stopPropagation(); setShow(false); (r.run as unknown as (mode?: string) => void)("next"); }}
                        className="t-faint hidden rounded-full p-1.5 transition-colors hover:bg-white/10 hover:text-[var(--fg)] sm:block"
                      >
                        <ListPlus size={13} />
                      </span>
                    </>
                  )}
                </button>
              ))}
            </div>

            <div className="t-faint flex items-center gap-4 border-t px-4 py-2 text-[10px]" style={{ borderColor: "var(--line)" }}>
              <span>↑↓ {t("cmdNav")}</span>
              <span>⏎ {t("play")}</span>
              <span className="hidden sm:inline">Tab {t("playNext")}</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function rowIcon(id: string, t: (k: string) => string) {
  const cls = "t-accent";
  switch (id) {
    case "a-shuffle": return <Shuffle size={14} className={cls} />;
    case "a-repeat": return useUi.getState().repeat === "one" ? <Repeat1 size={14} className={cls} /> : <Repeat size={14} className={cls} />;
    case "a-np": return <Play size={14} className={cls} />;
    case "a-lyrics": return <MicVocal size={14} className={cls} />;
    case "a-queue": return <ListMusic size={14} className={cls} />;
    case "a-fx": return <SlidersHorizontal size={14} className={cls} />;
    case "a-fetch": return <Sparkles size={14} className={cls} />;
    case "a-ambient": return <Moon size={14} className={cls} />;
    case "a-theme": return <Palette size={14} className={cls} />;
    case "a-lang": return <Languages size={14} className={cls} />;
    case "a-settings": return <Settings size={14} className={cls} />;
    case "a-library": return <ListEnd size={14} className={cls} />;
    case "a-playlists": return <ListMusic size={14} className={cls} />;
    case "a-about": return <Info size={14} className={cls} />;
    case "a-keys": return <Keyboard size={14} className={cls} />;
    case `p-${LIKED_ID}`: return <Heart size={14} className={cls} />;
    default: return <ListMusic size={14} className={cls} />;
  }
  void t;
}
