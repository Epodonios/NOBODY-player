// ── NOBODY ALOK · panel (dock views) ─────────────────────────────────────────
// A large hairline-framed panel that slides up from the bottom edge while the
// core shrinks (pure transform/opacity). One panel at a time: Library, Liked,
// Recents, Playlists, Settings. Esc or × closes (App owns the Esc key).
// v2: toolbar stats + shuffle-all, action headers on Liked/Recents, a full
// settings page (lyrics size, whisper, idle dim, glow, online fetch, keys).

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Plus, FolderOpen, Upload, X, Dices, Play, Trash2, Sparkles, ImageIcon, RotateCw, Loader2 } from "lucide-react";
import { useLibrary } from "../../cinema/store/library";
import { useUi, uiApi } from "../../cinema/store/ui";
import { useSettings } from "../../cinema/store/settings";
import { useT } from "../../cinema/lib/useT";
import { LANGS } from "../../cinema/i18n";
import { switchUiMode, useUiMode } from "../../uiMode";
import { engine } from "../../cinema/lib/engine";
import { startSmartFetch, useSmartFetch } from "../../cinema/lib/smartFetch";
import { useAlokUi, type AlokView } from "../store/alokUi";
import { useAlokT } from "../lib/i18n";
import { DownloadsView } from "./DownloadsView";
import { TrackRow } from "./TrackRow";
import { importViaPicker, importViaFolder } from "../lib/importActions";
import { useFolderManager, type FolderInfo } from "../../cinema/lib/folderManager";
import { importFiles, pickFiles } from "../../cinema/lib/importer";
import { CONTACT, DONATE_DIRECT, DONATE_WALLETS, copyText } from "../../supportInfo";
import type { Lang, Track } from "../../cinema/types";

/* view titles resolve through the ALOK dict first, then the shared core dict */
const TITLES: Record<AlokView, string> = {
  library: "alLibrary",
  liked: "alLiked",
  recents: "alRecents",
  playlists: "alPlaylists",
  settings: "alSettings",
  downloads: "alDownloads",
};

export function Panel() {
  const t = useT();
  const tt = useAlokT();
  const view = useAlokUi((s) => s.view);
  const closePanel = useAlokUi((s) => s.closePanel);
  const title = view ? tt(TITLES[view]) : "";

  return (
    <AnimatePresence>
      {view && (
        <>
          {/* click-catcher (transparent — the stage stays visible) */}
          <motion.div
            className="na-panel-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closePanel}
            aria-hidden
          />
          <motion.div
            className="na-panel"
            role="dialog"
            aria-label={title}
            initial={{ y: 90, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 90, opacity: 0 }}
            transition={{ duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="na-panel-head">
              <div className="na-eyebrow">{title}</div>
              <button className="na-panel-x" onClick={closePanel} title={t("close")} aria-label={t("close")}>
                <X size={15} />
              </button>
            </div>
            <div className="na-panel-body na-scroll">
              {view === "library" && <LibraryPanel />}
              {view === "liked" && <LikedPanel />}
              {view === "recents" && <RecentsPanel />}
              {view === "playlists" && <PlaylistsPanel />}
              {view === "settings" && <SettingsPanel />}
              {view === "downloads" && <DownloadsView />}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── shared: list header with play-all / shuffle actions ─────────────────── */

function ListActions({ ids, extra }: { ids: string[]; extra?: React.ReactNode }) {
  const t = useT();
  if (ids.length === 0 && !extra) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-2 pb-1 pt-3">
      {ids.length > 0 && (
        <button className="na-btn na-btn-primary" onClick={() => engine.setQueue(ids, ids[0], true)}>
          <Play size={13} /> {t("alPlayAll")}
        </button>
      )}
      {ids.length > 0 && (
        <button
          className="na-btn"
          onClick={() => engine.setQueue(ids, ids[Math.floor(Math.random() * ids.length)], true)}
          title={t("alShuffleAll")}
        >
          <Dices size={13} /> {t("alShuffleAll")}
        </button>
      )}
      {extra}
    </div>
  );
}

/* ── Library ─────────────────────────────────────────────────────────────── */

type SortKey = "recent" | "title" | "artist";

function LibraryPanel() {
  const t = useT();
  const tracks = useLibrary((s) => s.tracks);
  const order = useLibrary((s) => s.order);
  const recents = useLibrary((s) => s.recents);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  const list = useMemo(() => {
    let all: Track[] = order.map((id) => tracks[id]).filter(Boolean) as Track[];
    const needle = q.trim().toLowerCase();
    if (needle) all = all.filter((tr) => `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(needle));
    const rank = new Map(recents.map((r, i) => [r.trackId, i]));
    const cmp: Record<SortKey, (a: Track, b: Track) => number> = {
      recent: (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
      title: (a, b) => a.title.localeCompare(b.title),
      artist: (a, b) => a.artist.localeCompare(b.artist),
    };
    return [...all].sort(cmp[sort]);
  }, [order, tracks, q, sort, recents]);

  const playIds = useMemo(() => list.map((tr) => tr.id), [list]);
  const totalMin = Math.round(order.reduce((acc, id) => acc + (tracks[id]?.duration ?? 0), 0) / 60);

  if (order.length === 0) {
    return (
      <div className="flex h-full flex-col px-6 pb-8 pt-4">
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="na-mono text-[12px] tracking-[0.3em] text-[var(--na-faint)]">{t("alNoTracks")}</div>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button className="na-btn na-btn-primary" onClick={() => void importViaPicker(t)}>
              <Upload size={14} /> {t("importFiles")}
            </button>
            <button className="na-btn" onClick={() => void importViaFolder(t)}>
              <FolderOpen size={14} /> {t("importFolder")}
            </button>
          </div>
        </div>
        {/* task 30 — manage folders even with an empty library */}
        <FoldersSection />
      </div>
    );
  }

  return (
    <>
      <div className="na-toolbar">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--na-faint)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("alSearch")}
            type="search"
            className="na-input w-[200px] ps-9"
            aria-label={t("alSearch")}
          />
        </div>
        <div className="na-seg" role="group" aria-label="sort">
          {(["recent", "title", "artist"] as SortKey[]).map((k) => (
            <button
              key={k}
              className="na-seg-btn"
              data-on={sort === k}
              onClick={() => setSort(k)}
            >
              {k === "recent" ? t("recentlyPlayed") : k === "title" ? t("sortTitle") : t("sortArtist")}
            </button>
          ))}
        </div>
        {/* mono library stat */}
        <span className="na-mono ms-auto text-[10px] tracking-[0.14em] text-[var(--na-faint)]" style={{ fontSize: 10 }}>
          {order.length} {t("songs")} · {totalMin} {t("alMin")}
        </span>
        <button
          className="na-btn"
          onClick={() => order.length && engine.setQueue([...order], order[Math.floor(Math.random() * order.length)], true)}
          title={t("alShuffleAll")}
        >
          <Dices size={13} /> {t("alShuffleAll")}
        </button>
      </div>
      {/* task 30 — ruled MANAGED FOLDERS section above the track list */}
      <FoldersSection />
      <div className="px-2.5 pb-6">
        {list.length === 0 && (
          <div className="p-8 text-center text-[12.5px] text-[var(--na-mut)]">{t("noMatches")}</div>
        )}
        {list.map((tr) => (
          <TrackRow key={tr.id} track={tr} playIds={playIds} />
        ))}
      </div>
    </>
  );
}

/* ── Managed folders (task 30 — ruled FOLDERS section of the library) ──────
 * Every managed folder (bridge list ∪ mirror folders) as a ruled row: mono
 * uppercase name, right-aligned track count, [↻] / [✕] glyph buttons. Remove
 * is two-tap (✕ → "SURE?" danger label, ~2.5s) — no window.confirm. The busy
 * folder spins the button of its running operation. Also reachable with an
 * empty library so a lone empty folder can still be inspected / removed.   */

type FmPending = { path: string; kind: "rescan" | "remove" } | null;

function FoldersSection() {
  const t = useT();
  const tt = useAlokT();
  const { folders, add, remove, rescan, busy } = useFolderManager();
  const [confirmPath, setConfirmPath] = useState<string | null>(null);
  const confirmTimer = useRef<number | null>(null);
  const [pending, setPending] = useState<FmPending>(null);

  useEffect(
    () => () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    },
    []
  );
  const arm = (path: string | null) => {
    setConfirmPath(path);
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    if (path) confirmTimer.current = window.setTimeout(() => setConfirmPath(null), 2500);
  };

  const anyBusy = busy !== null;

  const onAdd = async () => {
    if (busy) return;
    const res = await add(t("importing"));
    if (res === null) {
      // no FSA picker in this runtime — same fallback as the dock action
      uiApi.toast(t("folderFallback"), "info");
      const files = await pickFiles(true, true);
      if (files.length) await importFiles(files, undefined, t("importing"));
      return;
    }
    if (res.added) uiApi.toast(tt("alFmAdded").replace("{{n}}", String(res.added)), "success");
  };

  const onRescan = async (f: FolderInfo) => {
    if (busy) return;
    setPending({ path: f.path, kind: "rescan" });
    try {
      await rescan(f.path);
      uiApi.toast(tt("alFmRescanDone"), "success");
    } finally {
      setPending(null);
    }
  };

  const onRemove = async (f: FolderInfo) => {
    if (busy) return;
    arm(null);
    setPending({ path: f.path, kind: "remove" });
    try {
      // engine keeps a playing track from this folder alive — safe to await
      await remove(f.path);
      uiApi.toast(tt("alFmRemoved").replace("{{name}}", f.name), "info");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="na-fm" aria-label={tt("alFmTitle")}>
      <div className="na-fm-head">
        <span className="na-fm-title">{tt("alFmTitle")}</span>
        <span className="na-fm-rule" aria-hidden />
        <span className="na-mono na-fm-total">{folders.length}</span>
      </div>
      <div className="na-fm-rows">
        {folders.length === 0 && <div className="na-fm-none">{tt("alFmNoFolders")}</div>}
        {folders.map((f) => {
          const armed = confirmPath === f.path;
          const rowBusy = busy === f.path;
          const kind = pending?.path === f.path ? pending.kind : null;
          return (
            <div key={f.path} className="na-fm-row" data-busy={rowBusy || undefined}>
              <span className="na-fm-name" title={f.path}>
                {f.name}
              </span>
              <span className="na-fm-leader" aria-hidden />
              <span className="na-mono na-fm-count">{f.trackCount}</span>
              <button
                type="button"
                className="na-fm-glyph"
                onClick={() => void onRescan(f)}
                disabled={anyBusy}
                aria-label={`${tt("alFmRescan")}: ${f.name}`}
                title={tt("alFmRescan")}
              >
                {kind === "rescan" ? <Loader2 size={13} className="na-fm-spin" /> : <RotateCw size={13} />}
              </button>
              <button
                type="button"
                className="na-fm-glyph"
                data-danger={armed || undefined}
                onClick={armed ? () => void onRemove(f) : () => arm(f.path)}
                disabled={anyBusy}
                aria-label={armed ? `${tt("alFmSure")} — ${f.name}` : `${tt("alFmRemove")}: ${f.name}`}
                title={armed ? tt("alFmSure") : tt("alFmRemove")}
              >
                {kind === "remove" ? (
                  <Loader2 size={13} className="na-fm-spin" />
                ) : armed ? (
                  <span className="na-fm-sure">{tt("alFmSure")}</span>
                ) : (
                  <X size={13} />
                )}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="na-fm-add"
          onClick={() => void onAdd()}
          disabled={anyBusy}
          aria-label={tt("alFmAdd")}
        >
          {busy === "__add__" ? <Loader2 size={13} className="na-fm-spin" /> : <Plus size={13} />}
          <span>{busy === "__add__" ? "…" : tt("alFmAdd")}</span>
        </button>
      </div>
    </section>
  );
}

/* ── Liked ───────────────────────────────────────────────────────────────── */

function LikedPanel() {
  const t = useT();
  const tracks = useLibrary((s) => s.tracks);
  const playlists = useLibrary((s) => s.playlists);
  const liked = playlists.find((p) => p.id === "liked");
  const list = useMemo(
    () => (liked?.trackIds ?? []).map((id) => tracks[id]).filter(Boolean) as Track[],
    [liked, tracks]
  );
  const playIds = useMemo(() => list.map((tr) => tr.id), [list]);

  if (!list.length) {
    return <PanelEmpty text={t("alNoTracks")} />;
  }
  return (
    <div className="px-2.5 pb-6">
      <ListActions ids={playIds} />
      {list.map((tr) => (
        <TrackRow key={tr.id} track={tr} playIds={playIds} />
      ))}
    </div>
  );
}

/* ── Recents ─────────────────────────────────────────────────────────────── */

function RecentsPanel() {
  const t = useT();
  const tracks = useLibrary((s) => s.tracks);
  const recents = useLibrary((s) => s.recents);
  const clearRecents = useLibrary((s) => s.clearRecents);
  const list = useMemo(
    () => recents.map((r) => tracks[r.trackId]).filter(Boolean) as Track[],
    [recents, tracks]
  );
  const playIds = useMemo(() => list.map((tr) => tr.id), [list]);

  if (!list.length) {
    return <PanelEmpty text={t("alNoTracks")} />;
  }
  return (
    <div className="px-2.5 pb-6">
      <ListActions
        ids={playIds}
        extra={
          <button className="na-btn" onClick={clearRecents} title={t("alClearRecents")}>
            <Trash2 size={13} /> {t("alClearRecents")}
          </button>
        }
      />
      {list.map((tr) => (
        <TrackRow key={tr.id} track={tr} playIds={playIds} />
      ))}
    </div>
  );
}

/* ── Playlists ───────────────────────────────────────────────────────────── */

function PlaylistsPanel() {
  const t = useT();
  const playlists = useLibrary((s) => s.playlists);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const currentId = useUi((s) => s.currentId);
  const [name, setName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const userLists = playlists.filter((p) => p.id !== "liked");
  const open = userLists.find((p) => p.id === openId) ?? null;

  if (open) return <PlaylistDetail playlistId={open.id} onBack={() => setOpenId(null)} />;

  return (
    <div className="px-4 pb-8 pt-4">
      {/* create */}
      <div className="mb-4 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              setOpenId(createPlaylist(name.trim()));
              setName("");
            }
          }}
          placeholder={t("alNewPlaylist")}
          className="na-input flex-1"
          aria-label={t("alNewPlaylist")}
        />
        <button
          className="na-btn"
          disabled={!name.trim()}
          onClick={() => {
            if (!name.trim()) return;
            setOpenId(createPlaylist(name.trim()));
            setName("");
          }}
        >
          <Plus size={14} /> {t("alCreatePlaylist")}
        </button>
      </div>

      {userLists.length === 0 && <PanelEmpty text={t("emptyPlaylist")} />}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {userLists.map((p) => (
          <button
            key={p.id}
            className="na-face-card"
            onClick={() => setOpenId(p.id)}
            aria-label={p.name}
          >
            <b>{p.name}</b>
            <small>{p.trackIds.length} {t("songs")} →</small>
          </button>
        ))}
      </div>

      {currentId && userLists.length > 0 && (
        <div className="na-mono mt-5 text-[10px] tracking-[0.2em] text-[var(--na-faint)]" style={{ letterSpacing: "0.2em" }}>
          {t("alAddCurrent")} →
        </div>
      )}
    </div>
  );
}

function PlaylistDetail({ playlistId, onBack }: { playlistId: string; onBack: () => void }) {
  const t = useT();
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === playlistId));
  const tracks = useLibrary((s) => s.tracks);
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);
  const currentId = useUi((s) => s.currentId);

  const list = useMemo(
    () => (playlist?.trackIds ?? []).map((id) => tracks[id]).filter(Boolean) as Track[],
    [playlist, tracks]
  );
  const playIds = useMemo(() => list.map((tr) => tr.id), [list]);

  if (!playlist) return null;
  return (
    <div className="px-2.5 pb-6 pt-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 px-2">
        <button className="na-btn" onClick={onBack} title={t("back")}>
          ← {t("alPlaylists")}
        </button>
        <div className="na-panel-title flex-1 truncate">{playlist.name}</div>
        {playIds.length > 0 && (
          <button className="na-btn na-btn-primary" onClick={() => engine.setQueue(playIds, playIds[0], true)}>
            ▶ {t("alPlayAll")}
          </button>
        )}
        {currentId && (
          <button
            className="na-btn"
            onClick={() => addToPlaylist(playlist.id, currentId)}
            title={t("alAddCurrent")}
          >
            <Plus size={13} /> {t("alAddCurrent")}
          </button>
        )}
        <button
          className="na-icon-btn"
          onClick={() => {
            deletePlaylist(playlist.id);
            onBack();
          }}
          title={t("delete")}
          aria-label={t("delete")}
        >
          <X size={14} />
        </button>
      </div>
      {list.length === 0 && <PanelEmpty text={t("emptyPlaylist")} />}
      {list.map((tr) => (
        <TrackRow
          key={tr.id}
          track={tr}
          playIds={playIds}
          onRemove={() => removeFromPlaylist(playlist.id, tr.id)}
          removeTitle={t("removeFromPlaylist")}
        />
      ))}
    </div>
  );
}

/* ── Settings ────────────────────────────────────────────────────────────── */

const KEY_ROWS: [string, string][] = [
  ["Space", "alCmdPlay"],
  ["← →", "alCmdSeek"],
  ["↑ ↓", "alCmdVol"],
  ["N / P", "alCmdNext"],
  ["M", "alCmdMute"],
  ["L", "alCmdLike"],
  ["Q / F", "alCmdQF"],
  ["Ctrl K", "alCmdPalette"],
  ["Esc", "alCmdEsc"],
];

function SettingsPanel() {
  const t = useT();
  const s = useSettings();
  const uiMode = useUiMode();
  const fetchState = useSmartFetch();
  const [, force] = useState(0);

  const faces: { id: "classic" | "cinema" | "eela" | "alok"; label: string; sub: string }[] = [
    { id: "classic", label: t("uiClassic"), sub: t("uiClassicSub") },
    { id: "cinema", label: t("uiCinema"), sub: t("uiCinemaSub") },
    { id: "eela", label: t("uiEela"), sub: t("uiEelaSub") },
    { id: "alok", label: t("uiAlok"), sub: t("uiAlokSub") },
  ];

  const runFetch = async (mode: "lyrics" | "covers") => {
    const sf = useSmartFetch.getState();
    if (sf.running) return;
    sf.setMode(mode);
    sf.setScope("all");
    sf.setSkipExisting(true);
    await startSmartFetch(t);
    force((n) => n + 1);
  };

  const lyrScale = s.lyricsSize ?? 1;

  return (
    <div className="px-5 pb-8 pt-4">
      {/* language */}
      <div className="na-setting-row" style={{ paddingInline: 0 }}>
        <span className="na-setting-label">{t("stLanguage")}</span>
        <div className="na-seg" role="group" aria-label={t("stLanguage")}>
          {LANGS.map((l) => (
            <button
              key={l.id}
              className="na-seg-btn"
              data-on={s.lang === l.id}
              onClick={() => s.set("lang", l.id as Lang)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* interface — the ONLY home of face switching */}
      <div className="na-setting-row flex-col items-stretch" style={{ paddingInline: 0 }}>
        <div className="mb-2.5">
          <span className="na-setting-label">{t("stInterface")}</span>
          <div className="na-mono mt-0.5 text-[10px]" style={{ fontSize: 10, color: "var(--na-faint)" }}>
            {t("stInterfaceSub")}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {faces.map((f) => {
            const active = uiMode === f.id;
            return (
              <button
                key={f.id}
                className="na-face-card"
                data-on={active}
                disabled={active}
                onClick={() => switchUiMode(f.id)}
                aria-pressed={active}
                title={f.sub}
              >
                <b>{active ? `✓ ${f.label}` : f.label}</b>
                <small>{f.sub}</small>
              </button>
            );
          })}
        </div>
      </div>

      {/* theme — ALOK's own (void / graphite) */}
      <div className="na-setting-row" style={{ paddingInline: 0 }}>
        <span className="na-setting-label">{t("stTheme")}</span>
        <div className="na-seg" role="group" aria-label={t("stTheme")}>
          <button className="na-seg-btn" data-on={(s.alokTheme ?? "void") === "void"} onClick={() => s.set("alokTheme", "void")}>
            {t("alThemeVoid")}
          </button>
          <button className="na-seg-btn" data-on={s.alokTheme === "graphite"} onClick={() => s.set("alokTheme", "graphite")}>
            {t("alThemeGraphite")}
          </button>
        </div>
      </div>

      {/* accent from cover */}
      <div className="na-setting-row" style={{ paddingInline: 0 }}>
        <div>
          <span className="na-setting-label">{t("stAccent")}</span>
          <div className="mt-0.5 text-[10px]" style={{ fontSize: 10, color: "var(--na-faint)" }}>
            {t("stAccentSub")}
          </div>
        </div>
        <Switch on={s.accentFromCover} onToggle={() => s.set("accentFromCover", !s.accentFromCover)} label={t("stAccent")} />
      </div>

      {/* reactive glow */}
      <div className="na-setting-row" style={{ paddingInline: 0 }}>
        <div>
          <span className="na-setting-label">{t("alGlow")}</span>
          <div className="mt-0.5 text-[10px]" style={{ fontSize: 10, color: "var(--na-faint)" }}>
            {t("alGlowSub")}
          </div>
        </div>
        <Switch on={s.alokGlow ?? true} onToggle={() => s.set("alokGlow", !(s.alokGlow ?? true))} label={t("alGlow")} />
      </div>

      {/* idle dim */}
      <div className="na-setting-row" style={{ paddingInline: 0 }}>
        <div>
          <span className="na-setting-label">{t("alIdleDim")}</span>
          <div className="mt-0.5 text-[10px]" style={{ fontSize: 10, color: "var(--na-faint)" }}>
            {t("alIdleDimSub")}
          </div>
        </div>
        <Switch on={s.alokIdleDim ?? true} onToggle={() => s.set("alokIdleDim", !(s.alokIdleDim ?? true))} label={t("alIdleDim")} />
      </div>

      {/* lyric whisper */}
      <div className="na-setting-row" style={{ paddingInline: 0 }}>
        <div>
          <span className="na-setting-label">{t("stMiniLyrics")}</span>
          <div className="mt-0.5 text-[10px]" style={{ fontSize: 10, color: "var(--na-faint)" }}>
            {t("stMiniLyricsSub")}
          </div>
        </div>
        <Switch on={s.miniLyrics ?? true} onToggle={() => s.set("miniLyrics", !(s.miniLyrics ?? true))} label={t("stMiniLyrics")} />
      </div>

      {/* lyrics text size (shared with cinema/EELA lyrics) */}
      <div className="na-setting-row flex-col items-stretch" style={{ paddingInline: 0 }}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="na-setting-label">{t("stLyricsSize")}</span>
          <span className="na-mono text-[10.5px] text-[var(--na-mut)]" style={{ fontSize: 10.5 }}>
            {Math.round(lyrScale * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={0.85}
          max={1.5}
          step={0.05}
          value={lyrScale}
          onChange={(e) => s.set("lyricsSize", Number(e.target.value))}
          className="na-range w-full"
          style={{ ["--na-val" as any]: `${Math.round(((lyrScale - 0.85) / 0.65) * 100)}%` }}
          aria-label={t("stLyricsSize")}
        />
      </div>

      {/* online fetch (library-wide) */}
      <div className="na-setting-row flex-col items-stretch" style={{ paddingInline: 0 }}>
        <div className="mb-2.5">
          <span className="na-setting-label">{t("smartFetch")}</span>
          <div className="mt-0.5 text-[10px]" style={{ fontSize: 10, color: "var(--na-faint)" }}>
            {fetchState.running
              ? `${fetchState.done} / ${fetchState.items.length}`
              : t("smartFetchSub")}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="na-btn" disabled={fetchState.running} onClick={() => void runFetch("lyrics")}>
            <Sparkles size={13} /> {t("fetchLyricsNow")}
          </button>
          <button className="na-btn" disabled={fetchState.running} onClick={() => void runFetch("covers")}>
            <ImageIcon size={13} /> {t("alFetchCovers")}
          </button>
        </div>
      </div>

      {/* keyboard shortcuts */}
      <div className="na-setting-row flex-col items-stretch" style={{ paddingInline: 0 }}>
        <div className="mb-3">
          <span className="na-setting-label">{t("alShortcuts")}</span>
        </div>
        <div className="na-keys">
          {KEY_ROWS.map(([k, key]) => (
            <div key={k} className="contents">
              <span className="na-key">{k}</span>
              <small>{t(key as any)}</small>
            </div>
          ))}
        </div>
      </div>

      {/* contact — creator points (CONTACT = single source of truth) */}
      <div className="na-setting-row flex-col items-stretch" style={{ paddingInline: 0 }}>
        <ContactSection />
      </div>

      {/* support — donation wallets + direct portal (classic donate data) */}
      <div className="na-setting-row flex-col items-stretch" style={{ paddingInline: 0 }}>
        <SupportSection />
      </div>

      {/* about + dedication */}
      <div className="na-setting-row flex-col items-stretch" style={{ paddingInline: 0, borderBottom: "none" }}>
        <div className="na-mono text-[10px] leading-relaxed" style={{ fontSize: 10, color: "var(--na-faint)" }}>
          {t("alAbout")}
        </div>
        <Dedication />
        <div className="na-mono na-stamp" style={{ fontSize: 9.5, letterSpacing: "0.24em", color: "var(--na-faint)" }}>
          NOBODY · ALOK
        </div>
      </div>
    </div>
  );
}

/* ── settings: contact / support / dedication ───────────────────────── */

/* ALOK-first lookup with a defensive EN fallback — the RU dictionary agent
   owns the new alContactTitle / alSupportTitle / alCopied keys, so a missing
   (or not yet translated) key must fall back instead of printing its raw name */
function useCt() {
  const at = useAlokT();
  return (k: string, fb: string): string => {
    const v = at(k);
    return !v || v === k ? fb : v;
  };
}

const shortAddr = (a: string) => (a.length > 10 ? `${a.slice(0, 10)}…` : a);

function ContactSection() {
  const ctt = useCt();
  const rows: { id: string; label: string; value: string; href: string }[] = [
    { id: "email", label: "EMAIL", value: CONTACT.email, href: `mailto:${CONTACT.email}` },
    { id: "telegram", label: "TELEGRAM", value: CONTACT.telegramHandle, href: CONTACT.telegramHref },
    { id: "github", label: "GITHUB", value: CONTACT.githubHandle, href: CONTACT.githubHref },
  ];
  return (
    <section className="na-ct" aria-label={ctt("alContactTitle", "CONTACT")}>
      <div className="na-ct-head">
        <span className="na-ct-title">{ctt("alContactTitle", "CONTACT")}</span>
        <span className="na-ct-rule" aria-hidden />
      </div>
      {rows.map((r) => (
        <a key={r.id} className="na-ct-row" href={r.href} target="_blank" rel="noreferrer">
          <span className="na-ct-label">{r.label}</span>
          <span className="na-ct-leader" aria-hidden />
          <span className="na-ct-value" dir="ltr">{r.value}</span>
          <span className="na-ct-go" aria-hidden>↗</span>
        </a>
      ))}
      {/* Instagram has no page yet — an inert row with a COMING SOON chip */}
      <div className="na-ct-row na-ct-row-inert" aria-disabled="true">
        <span className="na-ct-label">INSTAGRAM</span>
        <span className="na-ct-leader" aria-hidden />
        <span className="na-ct-value" dir="ltr">{CONTACT.instagramHandle}</span>
        <span className="na-ct-chip">{ctt("alComingSoon", "COMING SOON")}</span>
      </div>
    </section>
  );
}

function SupportSection() {
  const ctt = useCt();
  const copy = async (code: string, address: string) => {
    const ok = await copyText(address);
    uiApi.toast(`${code} — ${ctt("alCopied", "Copied")}`, ok ? "success" : "info");
  };
  return (
    <section className="na-ct" aria-label={ctt("alSupportTitle", "SUPPORT")}>
      <div className="na-ct-head">
        <span className="na-ct-title">{ctt("alSupportTitle", "SUPPORT")}</span>
        <span className="na-ct-rule" aria-hidden />
      </div>
      {DONATE_WALLETS.map((w) => (
        <div key={w.code} className="na-ct-row">
          <span className="na-ct-label">{w.code} · {w.network}</span>
          <span className="na-ct-leader" aria-hidden />
          <span className="na-ct-value na-ct-addr" dir="ltr" title={w.address}>{shortAddr(w.address)}</span>
          <button
            type="button"
            className="na-ct-copy"
            onClick={() => void copy(w.code, w.address)}
            aria-label={`${w.code} ${w.network} — ${ctt("supportCopy", "Copy")}`}
            title={ctt("supportCopy", "Copy")}
          >
            COPY
          </button>
        </div>
      ))}
      <a className="na-ct-row" href={DONATE_DIRECT.href} target="_blank" rel="noreferrer">
        <span className="na-ct-label">REYMIT</span>
        <span className="na-ct-leader" aria-hidden />
        <span className="na-ct-go" aria-hidden>↗</span>
      </a>
    </section>
  );
}

function Dedication() {
  const ctt = useCt();
  return (
    <div className="na-ded">
      <div className="na-ded-block">
        <p className="na-ded-p">
          {ctt(
            "fromNobodyBody",
            "To everyone who presses play in the dark — thank you for letting me hold your music. I am no one in particular; I am whoever your songs need me to be. Treat them well, and I will keep time for you, always.",
          )}
        </p>
        <div className="na-ded-sign">— NOBODY</div>
      </div>
      <div className="na-ded-block">
        <p className="na-ded-p">
          {ctt(
            "fromCreatorBody",
            "I built NOBODY because my collection deserved a home as beautiful as the records themselves — a quiet room where covers, lyrics and mood matter as much as the play button. If it ever feels like yours, then it is.",
          )}
        </p>
        <div className="na-ded-sign">— EPODONIOS</div>
      </div>
    </div>
  );
}

/* small labeled switch (keeps the settings rows terse) */
function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <span
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={0}
      className="na-switch"
      data-on={on}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
    />
  );
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function PanelEmpty({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center px-8 text-center">
      <div className="na-mono text-[11px]" style={{ fontSize: 11, letterSpacing: "0.26em", color: "var(--na-faint)" }}>
        {text}
      </div>
    </div>
  );
}
