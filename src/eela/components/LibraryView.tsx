// ── NOBODY EELA · Library · "The Index" (V1.2.0) ─────────────────────────────
// The library as a PRINTED SONGBOOK: the 11 categories are index entries on a
// paper page — serif chapter titles, dotted leaders, roman ordinals and live
// counts in thin teal rings, laid out in a two-column book grid (one column
// on mobile). Chapters open as sub-pages: track chapters reuse the paper
// track table inside a card, group chapters are index entries again and drill
// one level deep (folders even show their subfolders as a sub-index).
// Deliberately the visual OPPOSITE of the cinematic tile grid — rows on
// paper, no tile in sight. All data flows through the shared NOBODY library
// store / engine via src/cinema/lib/libraryIndex.ts.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, ChevronLeft, Disc3,
  Folder, FolderOpen, FolderTree, Heart, Hourglass, ListMusic, ListPlus,
  Loader2, Music2, Search, TrendingUp, Upload, User, Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLibrary, LIKED_ID } from "../../cinema/store/library";
import { useUi, uiApi } from "../../cinema/store/ui";
import { useSettings } from "../../cinema/store/settings";
import { useT } from "../../cinema/lib/useT";
import { importFiles, importViaFilesPicker, importViaFolderPicker, pickFiles } from "../../cinema/lib/importer";
import { useFolderManager, type FolderInfo } from "../../cinema/lib/folderManager";
import { engine } from "../../cinema/lib/engine";
import { CoverArt } from "../../cinema/components/CoverArt";
import { SelectMenu } from "../../cinema/components/SelectMenu";
import { fmtTime } from "../../cinema/lib/utils";
import type { LibraryCategoryId, Track } from "../../cinema/types";
import {
  LIBRARY_CATEGORIES,
  albumArtistGroups, albumGroups, artistGroups, favoriteTracks, folderGroups,
  longestTracks, mostPlayedTracks, subfolderGroups, subfoldersUnder,
  totalDuration, tracksInDir, yearGroups,
  type TrackGroup,
} from "../../cinema/lib/libraryIndex";

type SortKey = "recent" | "imported" | "title" | "artist";

interface LibViewState {
  cat: LibraryCategoryId;
  group: string | null;
}

const LS_KEY = "nobody-eela-lib-view"; // SEPARATE key from the cinematic library
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];

const CAT_I18N: Record<LibraryCategoryId, string> = {
  songs: "lbAllSongs",
  folders: "lbFolders",
  subfolders: "lbSubfolders",
  albums: "lbAlbums",
  albumArtists: "lbAlbumArtists",
  artists: "lbArtists",
  years: "lbYears",
  queue: "lbQueue",
  mostPlayed: "lbMostPlayed",
  longest: "lbLongest",
  favorites: "lbFavorites",
};

const CAT_ICON: Record<LibraryCategoryId, LucideIcon> = {
  songs: Music2,
  folders: Folder,
  subfolders: FolderTree,
  albums: Disc3,
  albumArtists: Users,
  artists: User,
  years: CalendarDays,
  queue: ListMusic,
  mostPlayed: TrendingUp,
  longest: Hourglass,
  favorites: Heart,
};

/** Group categories whose entries carry a path/albums note under the title. */
const NOTE_CATS = new Set<LibraryCategoryId>(["folders", "subfolders", "albumArtists"]);

interface IndexItem {
  key: string;
  label: string;
  ordinal: string;
  count: number;
  open: () => void;
  note?: string;
  dur?: string;
  icon?: LucideIcon;
}

function loadLibView(): LibViewState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { cat: "songs", group: null };
    const p = JSON.parse(raw) as Partial<LibViewState>;
    const cat = LIBRARY_CATEGORIES.includes(p.cat as LibraryCategoryId)
      ? (p.cat as LibraryCategoryId)
      : "songs";
    return { cat, group: typeof p.group === "string" && p.group ? p.group : null };
  } catch {
    return { cat: "songs", group: null };
  }
}

export function LibraryView() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const rtl = lang === "fa";
  const num = (n: number) => (lang === "fa" ? n.toLocaleString("fa-IR") : String(n));

  const tracks = useLibrary((s) => s.tracks);
  const order = useLibrary((s) => s.order);
  const recents = useLibrary((s) => s.recents);
  const playlists = useLibrary((s) => s.playlists);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const playCounts = useLibrary((s) => s.playCounts);
  const currentId = useUi((s) => s.currentId);
  const queueIds = useUi((s) => s.queueIds);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("imported");
  const [view, setView] = useState<LibViewState>(loadLibView);
  // the Index page itself is NOT persisted (contract = { cat, group } only);
  // with content the app always re-lands on the persisted chapter.
  const [atIndex, setAtIndex] = useState(false);

  // ── persistence contract: "nobody-eela-lib-view" = { cat, group } ──
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(view));
    } catch {
      /* storage unavailable (private mode) — the UI still works */
    }
  }, [view]);

  // ── managed folders (task 30) — bridge-subscribed snapshot + mutations ──
  const fm = useFolderManager();
  // two-tap remove confirm: the armed folder path (auto-disarms after 2.5s)
  const [fmConfirm, setFmConfirm] = useState<string | null>(null);
  const fmConfirmTimer = useRef<number | null>(null);
  const [fmPending, setFmPending] = useState<{ path: string; kind: "rescan" | "remove" } | null>(null);
  useEffect(
    () => () => {
      if (fmConfirmTimer.current) window.clearTimeout(fmConfirmTimer.current);
    },
    []
  );
  const armFmConfirm = (path: string | null) => {
    setFmConfirm(path);
    if (fmConfirmTimer.current) window.clearTimeout(fmConfirmTimer.current);
    if (path) fmConfirmTimer.current = window.setTimeout(() => setFmConfirm(null), 2500);
  };

  const openCat = (cat: LibraryCategoryId) => {
    setView({ cat, group: null });
    setAtIndex(false);
  };
  const openGroup = (key: string) => setView((v) => ({ ...v, group: key }));
  const backFromGroup = () => setView((v) => ({ ...v, group: null }));
  const goIndex = () => setAtIndex(true);

  // ── shared library data (same store as cinema / classic / alok) ──
  const all = useMemo(() => order.map((id) => tracks[id]).filter(Boolean) as Track[], [order, tracks]);
  const likedIds = useMemo(
    () => new Set(playlists.find((p) => p.id === LIKED_ID)?.trackIds ?? []),
    [playlists]
  );

  // live queue — reactive mirror of libraryIndex.queueTracks() (useUi.queueIds
  // → library tracks) so the Queue chapter + its index count update live.
  const queueList = useMemo(
    () => queueIds.map((id) => tracks[id]).filter(Boolean) as Track[],
    [queueIds, tracks]
  );

  // most played — helper reads playCounts from the store; the .plays mapping
  // keeps the subscribed playCounts in the dependency chain (live recompute).
  const mostPlayedList = useMemo(
    () => mostPlayedTracks(all).map((tr) => ({ track: tr, plays: playCounts[tr.id] || 0 })),
    [all, playCounts]
  );
  const playsMap = useMemo(
    () => new Map(mostPlayedList.map((x) => [x.track.id, x.plays])),
    [mostPlayedList]
  );
  const totalPlays = useMemo(() => mostPlayedList.reduce((a, x) => a + x.plays, 0), [mostPlayedList]);

  // favorites — helper + the subscribed liked set keeps the memo consistent
  const favList = useMemo(
    () => favoriteTracks(all).filter((tr) => likedIds.has(tr.id)),
    [all, likedIds]
  );

  // group sizes for the index counts (same selectors the chapters use)
  const groupCounts = useMemo(
    () => ({
      folders: folderGroups(all).length,
      subfolders: subfolderGroups(all).length,
      albums: albumGroups(all, t("unknownAlbum")).length,
      albumArtists: albumArtistGroups(all, t("unknownArtist")).length,
      artists: artistGroups(all, t("unknownArtist")).length,
      years: yearGroups(all, t("lbUnknownYear")).length,
    }),
    [all, t]
  );

  const counts = useMemo<Record<LibraryCategoryId, number>>(
    () => ({
      songs: all.length,
      folders: groupCounts.folders,
      subfolders: groupCounts.subfolders,
      albums: groupCounts.albums,
      albumArtists: groupCounts.albumArtists,
      artists: groupCounts.artists,
      years: groupCounts.years,
      queue: queueList.length,
      mostPlayed: mostPlayedList.length,
      longest: all.length,
      favorites: favList.length,
    }),
    [all, groupCounts, queueList, mostPlayedList, favList]
  );

  // ── chapter resolution ────────────────────────────────────────────────
  const groupsForCat = useMemo<TrackGroup[] | null>(() => {
    switch (view.cat) {
      case "folders":
        return folderGroups(all);
      case "subfolders":
        return subfolderGroups(all);
      case "albums":
        return albumGroups(all, t("unknownAlbum"));
      case "albumArtists":
        return albumArtistGroups(all, t("unknownArtist"));
      case "artists":
        return artistGroups(all, t("unknownArtist"));
      case "years":
        return yearGroups(all, t("lbUnknownYear"));
      default:
        return null;
    }
  }, [view.cat, all, t]);

  // the drilled group (one level) — folders resolve from the path itself
  const drilled = useMemo<TrackGroup | null>(() => {
    if (!view.group || view.cat === "folders") return null;
    return groupsForCat?.find((g) => g.key === view.group) ?? null;
  }, [view.group, view.cat, groupsForCat]);

  // folder drill = child folders (sub-index) + tracks directly in the folder
  const folderKids = useMemo(
    () => (view.cat === "folders" && view.group ? subfoldersUnder(all, view.group) : null),
    [view.cat, view.group, all]
  );
  const folderDirect = useMemo(
    () => (view.cat === "folders" && view.group ? tracksInDir(all, view.group) : []),
    [view.cat, view.group, all]
  );

  const needle = q.trim().toLowerCase();

  // managed folders, filtered by the header search like every other chapter
  const fmFoldersShown = useMemo(() => {
    if (!needle) return fm.folders;
    return fm.folders.filter((f) => `${f.name} ${f.path}`.toLowerCase().includes(needle));
  }, [fm.folders, needle]);

  // flat track list of the current chapter (pre-sort)
  const chapterTracks = useMemo<Track[]>(() => {
    let list: Track[];
    switch (view.cat) {
      case "queue":
        list = queueList;
        break;
      case "mostPlayed":
        list = mostPlayedList.map((x) => x.track);
        break;
      case "longest":
        list = longestTracks(all);
        break;
      case "favorites":
        list = favList;
        break;
      default:
        list = all;
        break;
    }
    if (!needle) return list;
    return list.filter((tr) => `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(needle));
  }, [view.cat, queueList, mostPlayedList, all, favList, needle]);

  // group list of the current chapter (search filters groups by label/path)
  const chapterGroups = useMemo<TrackGroup[] | null>(() => {
    if (!groupsForCat) return null;
    if (!needle) return groupsForCat;
    return groupsForCat.filter(
      (g) => g.label.toLowerCase().includes(needle) || (g.path ?? "").toLowerCase().includes(needle)
    );
  }, [groupsForCat, needle]);

  // folders chapter — groups NOT covered by the managed list stay as plain
  // ledger entries (unfiled batch imports etc.)
  const fmLeftoverItems = useMemo<IndexItem[]>(() => {
    if (view.cat !== "folders" || !chapterGroups) return [];
    const managedPaths = new Set(fm.folders.map((f) => f.path));
    return chapterGroups
      .filter((g) => !managedPaths.has(g.key))
      .map((g, i) => ({
        key: g.key,
        label: g.label,
        note: g.path,
        ordinal: `${num(i + 1)}.`,
        count: g.tracks.length,
        dur: fmtTime(totalDuration(g.tracks)),
        open: () => openGroup(g.key),
      }));
  }, [view.cat, chapterGroups, fm.folders]);

  // drill-down base list (group's own tracks / direct folder tracks)
  const drillBase = useMemo<Track[] | null>(() => {
    if (!view.group) return null;
    if (view.cat === "folders") return folderDirect;
    return drilled?.tracks ?? null;
  }, [view.group, view.cat, folderDirect, drilled]);

  // sort — kept from the previous library (recent / imported / title / artist);
  // applies to All Songs, Favorites and every drill-down list. The identity
  // chapters keep their intrinsic order: queue = listen order, most played =
  // play count, longest = duration.
  const sortApplies = Boolean(view.group) || view.cat === "songs" || view.cat === "favorites";
  const sortCmp = useMemo(() => {
    const recentRank = new Map(recents.map((r, i) => [r.trackId, i]));
    const cmp: Record<SortKey, (a: Track, b: Track) => number> = {
      recent: (a, b) => (recentRank.get(a.id) ?? Infinity) - (recentRank.get(b.id) ?? Infinity),
      imported: (a, b) => b.importedAt - a.importedAt,
      title: (a, b) => a.title.localeCompare(b.title),
      artist: (a, b) => a.artist.localeCompare(b.artist),
    };
    return cmp[sort];
  }, [sort, recents]);

  const drillTracks = useMemo<Track[] | null>(() => {
    if (!drillBase) return null;
    const filtered = needle
      ? drillBase.filter((tr) => `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(needle))
      : drillBase;
    return [...filtered].sort(sortCmp);
  }, [drillBase, needle, sortCmp]);

  const chapterView = useMemo<Track[]>(() => {
    if (view.group) return [];
    if (!sortApplies) return chapterTracks;
    return [...chapterTracks].sort(sortCmp);
  }, [view.group, sortApplies, chapterTracks, sortCmp]);

  const directIds = useMemo(() => (drillTracks ?? []).map((tr) => tr.id), [drillTracks]);
  const playIds = useMemo(
    () => (view.group ? directIds : chapterView.map((tr) => tr.id)),
    [view.group, directIds, chapterView]
  );

  // chapter scope (pre-search) for the count/duration chips
  const scopeList = useMemo<Track[]>(() => {
    if (view.group) {
      if (view.cat === "folders") return folderDirect;
      return drilled?.tracks ?? [];
    }
    switch (view.cat) {
      case "queue":
        return queueList;
      case "mostPlayed":
        return mostPlayedList.map((x) => x.track);
      case "favorites":
        return favList;
      default:
        return all;
    }
  }, [view.group, view.cat, folderDirect, drilled, queueList, mostPlayedList, favList, all]);

  const hasContent = all.length > 0;
  const CatIcon = CAT_ICON[view.cat];
  const BackIcon = rtl ? ArrowRight : ArrowLeft;
  const chapterTitle = view.group
    ? view.cat === "folders"
      ? view.group.split(/[\\/]/).pop() || view.group
      : drilled?.label ?? view.group
    : t(CAT_I18N[view.cat]);
  const chapterNote = view.group
    ? view.cat === "folders"
      ? view.group
      : NOTE_CATS.has(view.cat)
        ? drilled?.path
        : undefined
    : undefined;

  // ── index entry rows (the book index) ───────────────────────────────────
  const renderIndexRows = (items: IndexItem[], sub: boolean) => (
    <div className="ne-ix-grid" data-sub={sub}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          className="ne-ix-row"
          data-sub={sub}
          onClick={it.open}
          aria-label={`${it.label} — ${num(it.count)}`}
        >
          <span className="ne-ix-ordinal" aria-hidden>
            {it.ordinal}
          </span>
          <span className="ne-ix-namewrap">
            <span className="ne-ix-name">{it.label}</span>
            {it.note ? (
              <span className="ne-ix-note" dir="ltr">
                {it.note}
              </span>
            ) : null}
          </span>
          <span className="ne-ix-leader" aria-hidden />
          <span className="ne-ix-count">{num(it.count)}</span>
          {it.dur ? <span className="ne-ix-dur">{it.dur}</span> : null}
          {it.icon ? (
            <span className="ne-ix-glyph" aria-hidden>
              <it.icon size={sub ? 11 : 13} strokeWidth={1.75} />
            </span>
          ) : null}
          <span className="ne-ix-arrow" aria-hidden>
            {rtl ? <ChevronLeft size={14} strokeWidth={2} /> : <ArrowUpRight size={14} strokeWidth={2} />}
          </span>
        </button>
      ))}
    </div>
  );

  // roman-numbered chapters of the Index (rebuilt per render — 11 rows)
  const indexItems: IndexItem[] = LIBRARY_CATEGORIES.map((id, i) => ({
    key: id,
    label: t(CAT_I18N[id]),
    ordinal: `${ROMAN[i]}.`,
    count: counts[id],
    icon: CAT_ICON[id],
    open: () => openCat(id),
  }));

  // group chapters — groups are index entries again (serif title + leader +
  // count + duration), numbered in oldstyle numerals
  const groupItems: IndexItem[] = (chapterGroups ?? []).map((g, i) => ({
    key: g.key,
    label: g.label,
    note: NOTE_CATS.has(view.cat) ? g.path : undefined,
    ordinal: `${num(i + 1)}.`,
    count: g.tracks.length,
    dur: fmtTime(totalDuration(g.tracks)),
    open: () => openGroup(g.key),
  }));

  // folder drill — subfolders under the opened folder as a sub-index
  const kidItems: IndexItem[] = (folderKids ?? [])
    .filter(
      (k) =>
        !needle ||
        k.label.toLowerCase().includes(needle) ||
        (k.path ?? "").toLowerCase().includes(needle)
    )
    .map((k, i) => ({
      key: k.key,
      label: k.label,
      note: k.path,
      ordinal: `${num(i + 1)}.`,
      count: k.tracks.length,
      dur: fmtTime(totalDuration(k.tracks)),
      open: () => openGroup(k.key),
    }));

  // ── paper track table (row markup carried over from the V1.1 library) ──
  const renderRow = (tr: Track, ids: string[], showPlays: boolean) => {
    const playing = tr.id === currentId;
    const liked = likedIds.has(tr.id);
    return (
      <div
        key={tr.id}
        className="ne-track-row"
        data-playing={playing}
        onClick={() => engine.setQueue(ids, tr.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter") engine.setQueue(ids, tr.id);
        }}
        aria-label={`${tr.title} — ${tr.artist}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-[42px] w-[42px] shrink-0 overflow-hidden rounded-[10px] shadow-sm">
            <CoverArt trackId={tr.id} rounded="rounded-[10px]" />
          </div>
          <div className="min-w-0">
            <div className="ne-track-title">{tr.title}</div>
            <div className="ne-track-artist">{tr.artist}</div>
          </div>
        </div>
        <div className="ne-track-album">
          {showPlays
            ? t("lbPlays").replace("{{n}}", num(playsMap.get(tr.id) ?? 0))
            : tr.album || t("unknownAlbum")}
        </div>
        <div className="ne-track-time">{fmtTime(tr.duration)}</div>
        <div className="ne-track-acts" onClick={(e) => e.stopPropagation()}>
          <button
            className="ne-icon-btn !w-8 !h-8"
            data-on={liked}
            onClick={() => toggleLike(tr.id)}
            title={t("like")}
            aria-label={`${t("like")}: ${tr.title}`}
          >
            <Heart size={14} fill={liked ? "currentColor" : "none"} />
          </button>
          <button
            className="ne-icon-btn !w-8 !h-8"
            onClick={() => {
              engine.addToQueue(tr.id);
              uiApi.toast(`${tr.title} — ${t("addToQueue")}`, "info");
            }}
            title={t("addToQueue")}
            aria-label={`${t("addToQueue")}: ${tr.title}`}
          >
            <ListPlus size={15} />
          </button>
        </div>
      </div>
    );
  };

  const renderCard = (list: Track[], ids: string[], showPlays: boolean) => (
    <div className="ne-card w-full p-1.5 sm:p-2">{list.map((tr) => renderRow(tr, ids, showPlays))}</div>
  );

  const renderEmptyNote = (title: string, hint?: string) => (
    <div className="ne-ix-empty">
      <div className="ne-display">{title}</div>
      {hint ? <p>{hint}</p> : null}
    </div>
  );

  // ── managed-folder ledger flows (task 30 — phrased with the fm* keys) ────
  const fmAnyBusy = fm.busy !== null;

  const doFmAdd = async () => {
    if (fm.busy) return;
    const res = await fm.add(t("importing"));
    if (res === null) {
      // no FSA picker in this runtime — same fallback as the toolbar button
      uiApi.toast(t("folderFallback"), "info");
      const files = await pickFiles(true, true);
      if (files.length) await importFiles(files, undefined, t("importing"));
      return;
    }
    if (res.added) uiApi.toast(t("fmAdded").replace("{{n}}", String(res.added)), "success");
  };

  const doFmRescan = async (f: FolderInfo) => {
    if (fm.busy) return;
    setFmPending({ path: f.path, kind: "rescan" });
    try {
      await fm.rescan(f.path);
      uiApi.toast(t("fmRescanDone"), "success");
    } finally {
      setFmPending(null);
    }
  };

  const doFmRemove = async (f: FolderInfo) => {
    if (fm.busy) return;
    armFmConfirm(null);
    setFmPending({ path: f.path, kind: "remove" });
    try {
      // engine keeps a playing track from this folder alive — safe to await
      await fm.remove(f.path);
      uiApi.toast(t("fmRemoved").replace("{{name}}", f.name), "info");
    } finally {
      setFmPending(null);
    }
  };

  // the "Add folder" ledger row (always the last row of the folders chapter)
  const renderFmAddRow = () => (
    <button
      type="button"
      className="ne-fm-add"
      onClick={() => void doFmAdd()}
      disabled={fmAnyBusy}
      aria-label={t("fmAddFolder")}
    >
      {fm.busy === "__add__" ? (
        <Loader2 size={14} className="edc-spin" aria-hidden />
      ) : (
        <FolderOpen size={14} aria-hidden />
      )}
      <span className="ne-fm-add-label">{fm.busy === "__add__" ? "…" : t("fmAddFolder")}</span>
      <span className="ne-ix-leader" aria-hidden />
      <span className="ne-fm-add-plus" aria-hidden>
        +
      </span>
    </button>
  );

  // Folders chapter root: each managed folder as a ledger row — serif name
  // (opens the folder's sub-index), dotted leader, live track count, and
  // small ink rescan/remove text buttons with the two-tap confirm.
  const renderFolderLedger = () => {
    const managed = fmFoldersShown;
    const leftovers = fmLeftoverItems;
    return (
      <>
        {managed.length === 0 && leftovers.length === 0
          ? renderEmptyNote(needle ? t("noMatches") : t("fmNoFolders"))
          : null}
        {(managed.length > 0 || leftovers.length > 0) && (
          <div className="ne-eyebrow mb-2">{t("fmFoldersTitle")}</div>
        )}
        {managed.length === 0 && leftovers.length > 0 && (
          <p className="ne-fm-none">{t("fmNoFolders")}</p>
        )}
        {managed.length > 0 && (
          <div className="ne-fm-ledger">
            {managed.map((f, i) => {
              const rowBusy = fm.busy === f.path;
              const armed = fmConfirm === f.path;
              const pending = fmPending?.path === f.path ? fmPending.kind : null;
              return (
                <div key={f.path} className="ne-fm-row" data-busy={rowBusy || undefined}>
                  <span className="ne-ix-ordinal" aria-hidden>
                    {num(i + 1)}.
                  </span>
                  <button
                    type="button"
                    className="ne-fm-name"
                    onClick={() => openGroup(f.path)}
                    disabled={rowBusy}
                    title={f.path}
                    aria-label={`${f.name} — ${num(f.trackCount)}`}
                  >
                    {f.name}
                  </button>
                  <span className="ne-ix-leader" aria-hidden />
                  <span className="ne-ix-count">{num(f.trackCount)}</span>
                  <span className="ne-fm-acts">
                    <button
                      type="button"
                      className="ne-fm-act"
                      onClick={() => void doFmRescan(f)}
                      disabled={fmAnyBusy}
                      aria-label={`${t("fmRescan")}: ${f.name}`}
                      title={t("fmRescan")}
                    >
                      {pending === "rescan" ? (
                        <Loader2 size={12} className="edc-spin" aria-hidden />
                      ) : (
                        t("fmRescan")
                      )}
                    </button>
                    <button
                      type="button"
                      className="ne-fm-act"
                      data-danger={armed || undefined}
                      onClick={armed ? () => void doFmRemove(f) : () => armFmConfirm(f.path)}
                      disabled={fmAnyBusy}
                      aria-label={armed ? `${t("fmConfirmRemove")} — ${f.name}` : `${t("fmRemoveFolder")}: ${f.name}`}
                      title={armed ? t("fmRemoveConfirm") : t("fmRemoveFolder")}
                    >
                      {pending === "remove" ? (
                        <Loader2 size={12} className="edc-spin" aria-hidden />
                      ) : armed ? (
                        t("fmConfirmRemove")
                      ) : (
                        t("fmRemoveFolder")
                      )}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {leftovers.length > 0 && <div className="mt-6">{renderIndexRows(leftovers, true)}</div>}
        {renderFmAddRow()}
      </>
    );
  };

  // ── chapter content ─────────────────────────────────────────────────────
  const chapterContent = (() => {
    // drilled into a group — one level deep
    if (view.group) {
      if (view.cat === "folders") {
        const kids = kidItems;
        const direct = drillTracks ?? [];
        if (!kids.length && direct.length === 0) {
          return renderEmptyNote(needle ? t("noMatches") : t("lbNothingHere"));
        }
        return (
          <>
            {kids.length > 0 && (
              <section className="mb-7">
                <div className="ne-eyebrow mb-2">{t("lbSubfolders")}</div>
                {renderIndexRows(kids, true)}
              </section>
            )}
            {direct.length > 0 ? renderCard(direct, directIds, false) : null}
          </>
        );
      }
      const list = drillTracks ?? [];
      if (!list.length) return renderEmptyNote(needle ? t("noMatches") : t("lbNothingHere"));
      return renderCard(list, directIds, false);
    }
    // group chapters — groups rendered as index entries again
    if (chapterGroups) {
      // Folders chapter → managed-folder ledger (task 30)
      if (view.cat === "folders") return renderFolderLedger();
      if (!chapterGroups.length) return renderEmptyNote(needle ? t("noMatches") : t("lbNothingHere"));
      return renderIndexRows(groupItems, true);
    }
    // flat track chapters
    const flat = chapterView;
    if (!flat.length) {
      return renderEmptyNote(
        needle ? t("noMatches") : view.cat === "queue" ? t("lbEmptyQueue") : t("lbNothingHere")
      );
    }
    return renderCard(flat, playIds, view.cat === "mostPlayed");
  })();

  const doImportFiles = async () => {
    /* V1.2.0: native dialog + real-path pipeline in the desktop app. */
    const res = await importViaFilesPicker(t("importing"));
    if (res.added) uiApi.toast(`${res.added} ${t("addedToLibrary")}${res.skipped ? ` · ${res.skipped} ${t("alreadyInLibrary")}` : ""}`, "success");
  };

  const doImportFolder = async () => {
    /* V1.2.0: native folder dialog + real-path pipeline in the desktop app. */
    const res = await importViaFolderPicker(t("importing"));
    if (res === null) {
      uiApi.toast(t("folderFallback"), "info");
      const files = await pickFiles(true, true);
      if (files.length) await importFiles(files, undefined, t("importing"));
      return;
    }
    if (res.added) uiApi.toast(`${res.added} ${t("addedToLibrary")}${res.skipped ? ` · ${res.skipped} ${t("alreadyInLibrary")}` : ""}`, "success");
  };

  // ── toolbar: search + (where meaningful) sort + import — all preserved ──
  const toolbar = (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--faint)]" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("searchPlaceholder")}
          type="search"
          className="ne-input w-[210px] ps-9"
          aria-label={t("searchPlaceholder")}
        />
      </div>
      {sortApplies && (
        <div className="ne-input ne-input-plain">
          <SelectMenu
            value={sort}
            onChange={(v) => setSort(v as SortKey)}
            ariaLabel="sort"
            options={[
              { value: "recent", label: t("recentlyPlayed") },
              { value: "imported", label: t("sortImported") },
              { value: "title", label: t("sortTitle") },
              { value: "artist", label: t("sortArtist") },
            ]}
          />
        </div>
      )}
      <div className="flex-1" />
      <button className="ne-btn ne-btn-primary" onClick={doImportFiles}>
        <Upload size={13} />
        <span className="hidden sm:inline">{t("importFiles")}</span>
      </button>
      <button className="ne-btn" onClick={doImportFolder}>
        <FolderOpen size={13} />
        <span className="hidden sm:inline">{t("importFolder")}</span>
      </button>
    </div>
  );

  // ── page: the Index ─────────────────────────────────────────────────────
  const indexPage = (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-5 pb-1 pt-[86px] sm:px-8 lg:px-12">
        <div className="ne-ix-col mx-auto">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="ne-eyebrow mb-1.5">NOBODY · {t("lbCategories")}</div>
              <h1 className="ne-display ne-h1">{t("navLibrary")}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2 pb-1.5">
              <button className="ne-btn ne-btn-primary" onClick={doImportFiles}>
                <Upload size={13} />
                <span className="hidden sm:inline">{t("importFiles")}</span>
              </button>
              <button className="ne-btn" onClick={doImportFolder}>
                <FolderOpen size={13} />
                <span className="hidden sm:inline">{t("importFolder")}</span>
              </button>
            </div>
          </div>
          {/* old-book double rule under the masthead */}
          <div className="ne-ix-rule mt-4" aria-hidden />
        </div>
      </header>

      <div className="ne-scroll min-h-0 flex-1 px-5 pb-[120px] pt-5 sm:px-8 lg:px-12">
        <div className="ne-ix-col mx-auto">
          {!hasContent && (
            <div className="mb-6 text-center">
              <div className="ne-display text-[52px] font-bold italic leading-none text-[var(--faint)]" aria-hidden>
                NOBODY
              </div>
              <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-[var(--mut)]">{t("emptyHint")}</p>
            </div>
          )}

          <nav aria-label={t("lbCategories")}>{renderIndexRows(indexItems, false)}</nav>

          {/* colophon — the printed footnote line */}
          <div className="ne-ix-colophon">
            {num(LIBRARY_CATEGORIES.length)} {t("lbCategories")} — {num(all.length)} {t("tracksCount")}
            <span aria-hidden> · </span>
            {fmtTime(totalDuration(all))}
          </div>
        </div>
      </div>
    </div>
  );

  // ── page: a chapter ─────────────────────────────────────────────────────
  const chapterPage = (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-5 pb-1 pt-[86px] sm:px-8 lg:px-12" style={{ overflow: "visible" }}>
        <div className="ne-ix-col mx-auto">
          <button
            className="ne-ix-back"
            onClick={view.group ? backFromGroup : goIndex}
            aria-label={t("lbBack")}
          >
            <BackIcon size={13} strokeWidth={2} />
            <span className="ne-display italic">{t("lbBack")}</span>
            <span className="ne-ix-back-dest">· {t("lbCategories")}</span>
          </button>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            <span className="ne-ix-badge" aria-hidden>
              <CatIcon size={19} strokeWidth={1.6} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="ne-display ne-ix-h2 truncate">{chapterTitle}</h1>
              {chapterNote ? (
                <div className="ne-ix-note mt-0.5" dir="ltr">
                  {chapterNote}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="ne-chip">
                  <span className="ne-ix-num">{num(scopeList.length)}</span>
                  {t("tracksCount")}
                </span>
                <span className="ne-chip">
                  <span className="ne-ix-num">{fmtTime(totalDuration(scopeList))}</span>
                </span>
                {view.cat === "mostPlayed" && !view.group && (
                  <span className="ne-chip">
                    <span className="ne-ix-num">{num(totalPlays)}</span>
                    {t("lbPlays").replace("{{n}}", "").trim()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {toolbar}

          <div className="ne-ix-rule mt-4" aria-hidden />
        </div>
      </header>

      <div className="ne-scroll min-h-0 flex-1 px-3 pb-[120px] pt-4 sm:px-6 lg:px-10">
        <div className="mx-auto w-full max-w-[1000px]">{chapterContent}</div>
      </div>
    </div>
  );

  // empty library → always the Index (counts zeroed + import CTA);
  // with content → the Index only when the user asked for it, else the
  // persisted chapter.
  return !hasContent || atIndex ? indexPage : chapterPage;
}
