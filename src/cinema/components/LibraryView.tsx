// ── NOBODY · Library view — rêve category board (V1.2.0) ─────────────────────
// The Library opens as a board of square ambient tiles — one per category
// (All Songs · Folders · Subfolders · Albums · Album Artists · Artists ·
// Years · Play Queue · Most Played · Longest · Favorites). Each tile is a
// frosted badge + dark glass name/count chips over a per-category accent
// gradient (pure color-mix(--accent) CSS → the whole board re-harmonizes
// live when the dynamic accent-from-cover theme moves).
//
// Behaviour: an empty library always shows the full 11-tile hub (zeroed
// counts) plus the import hero; once content exists the Library opens
// directly into the LAST view, persisted in localStorage under
// "nobody-cinema-lib-view" as { cat: LibraryCategoryId, group: string|null }.
// The hub itself is reachable via the "← Back · Categories" control and is
// intentionally NOT persisted. Group categories (folders/subfolders/albums/
// albumArtists/artists/years) drill one level into their track list.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Album,
  ArrowLeft,
  Calendar,
  Disc3,
  Flame,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Heart,
  Hourglass,
  ImagePlus,
  Import,
  ListMusic,
  Loader2,
  MicVocal,
  Music2,
  RotateCw,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { LIKED_ID, useLibrary } from "../store/library";
import { useUi, uiApi } from "../store/ui";
import { useT } from "../lib/useT";
import { db } from "../lib/db";
import { fetchArtistCover } from "../lib/covers";
import { importFiles, importViaFilesPicker, importViaFolderPicker, pickFiles } from "../lib/importer";
import { useFolderManager, type FolderInfo } from "../lib/folderManager";
import { loadDemoPack } from "../lib/demoPack";
import {
  LIBRARY_CATEGORIES,
  albumArtistGroups,
  albumGroups,
  artistGroups,
  favoriteTracks,
  folderGroups,
  longestTracks,
  mostPlayedTracks,
  subfolderGroups,
  totalDuration,
  yearGroups,
  type TrackGroup,
} from "../lib/libraryIndex";
import { TrackList, type ListItem } from "./TrackList";
import { CoverArt } from "./CoverArt";
import { SelectMenu } from "./SelectMenu";
import { fmtTime } from "../lib/utils";
import type { LibraryCategoryId, Track } from "../types";

type SortKey = "imported" | "title" | "artist" | "duration";
type TFn = (k: string) => string;

// ── static category metadata ─────────────────────────────────────────────────

const TRACK_CATS = new Set<LibraryCategoryId>(["songs", "queue", "mostPlayed", "longest", "favorites"]);
type GroupCat = "folders" | "subfolders" | "albums" | "albumArtists" | "artists" | "years";
const GROUP_CATS = new Set<LibraryCategoryId>(["folders", "subfolders", "albums", "albumArtists", "artists", "years"]);
/** Group categories whose TrackGroup.path is a real path/album list worth
 *  showing as a chip (albums/artists/years paths are just count strings). */
const PATH_CATS = new Set<LibraryCategoryId>(["folders", "subfolders", "albumArtists"]);

const CAT_ICONS: Record<LibraryCategoryId, LucideIcon> = {
  songs: Music2,
  folders: Folder,
  subfolders: FolderTree,
  albums: Disc3,
  albumArtists: Album,
  artists: MicVocal,
  years: Calendar,
  queue: ListMusic,
  mostPlayed: Flame,
  longest: Hourglass,
  favorites: Heart,
};

const CAT_LABEL: Record<LibraryCategoryId, (t: TFn) => string> = {
  songs: (t) => t("lbAllSongs"),
  folders: (t) => t("lbFolders"),
  subfolders: (t) => t("lbSubfolders"),
  albums: (t) => t("lbAlbums"),
  albumArtists: (t) => t("lbAlbumArtists"),
  artists: (t) => t("lbArtists"),
  years: (t) => t("lbYears"),
  queue: (t) => t("lbQueue"),
  mostPlayed: (t) => t("lbMostPlayed"),
  longest: (t) => t("lbLongest"),
  favorites: (t) => t("lbFavorites"),
};

const SORT_CMP: Record<SortKey, (a: Track, b: Track) => number> = {
  imported: (a, b) => a.importedAt - b.importedAt,
  title: (a, b) => a.title.localeCompare(b.title),
  artist: (a, b) => a.artist.localeCompare(b.artist),
  duration: (a, b) => b.duration - a.duration,
};

const sortTracks = (list: Track[], sort: SortKey): Track[] => [...list].sort(SORT_CMP[sort]);

// ── view persistence ("nobody-cinema-lib-view") ──────────────────────────────

interface LibView {
  cat: LibraryCategoryId;
  group: string | null;
}

const LIB_VIEW_KEY = "nobody-cinema-lib-view";

function loadLibView(): LibView {
  try {
    const raw = localStorage.getItem(LIB_VIEW_KEY);
    if (!raw) return { cat: "songs", group: null };
    const parsed = JSON.parse(raw) as Partial<LibView> | null;
    if (parsed && LIBRARY_CATEGORIES.includes(parsed.cat as LibraryCategoryId)) {
      return { cat: parsed.cat as LibraryCategoryId, group: typeof parsed.group === "string" ? parsed.group : null };
    }
  } catch {
    /* corrupt blob — fall through to the default */
  }
  return { cat: "songs", group: null };
}

function saveLibView(v: LibView) {
  try {
    localStorage.setItem(LIB_VIEW_KEY, JSON.stringify(v));
  } catch {
    /* storage full — persistence is best-effort */
  }
}

// ── derived category data ────────────────────────────────────────────────────

interface CatDatum {
  /** headline number for the tile chip (tracks / groups / queue length…) */
  count: number;
  /** the tile's small sub-chip text (count, or duration for Longest) */
  sub: string;
  /** representative track whose cover paints the tile's ambient media */
  repId: string | null;
  /** search-filtered content (track categories) */
  tracks: Track[];
  /** search-filtered content (group categories) */
  groups: TrackGroup[];
  /** seconds across the whole (unfiltered) category */
  duration: number;
  /** total plays (Most Played only) */
  plays: number;
}

export function LibraryView() {
  const t = useT();
  const tracks = useLibrary((s) => s.tracks);
  const order = useLibrary((s) => s.order);
  const playCounts = useLibrary((s) => s.playCounts);
  // Reactive key for favoriteTracks(): the selector reads the store
  // imperatively, so subscribing to the liked list keeps the memo live.
  const likedIds = useLibrary((s) => s.playlists.find((p) => p.id === LIKED_ID)?.trackIds);
  const queueIds = useUi((s) => s.queueIds);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("imported");
  const [demoBusy, setDemoBusy] = useState(false);
  // Last-used library view — restored on mount, persisted on every navigation.
  const [view, setViewState] = useState<LibView>(loadLibView);
  // The Categories hub is a transient surface and is never persisted.
  const [atHub, setAtHub] = useState(false);

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

  const all = useMemo(() => order.map((id) => tracks[id]).filter(Boolean) as Track[], [order, tracks]);

  const baseGroups = useMemo<Record<GroupCat, TrackGroup[]>>(
    () => ({
      folders: folderGroups(all),
      subfolders: subfolderGroups(all),
      albums: albumGroups(all, t("unknownAlbum")),
      albumArtists: albumArtistGroups(all, t("unknownArtist")),
      artists: artistGroups(all, t("unknownArtist")),
      years: yearGroups(all, t("lbUnknownYear")),
    }),
    [all, t]
  );

  // Reactive mirror of queueTracks(): driven by the subscribed queue ids so
  // the tile count and the queue view update live while music plays.
  const queueList = useMemo(() => queueIds.map((id) => tracks[id]).filter(Boolean) as Track[], [queueIds, tracks]);

  const favorites = useMemo(() => favoriteTracks(all), [all, likedIds]); // likedIds = reactive key

  const mostPlayed = useMemo(() => {
    const list = mostPlayedTracks(all);
    return { list, plays: list.reduce((a, tr) => a + (playCounts[tr.id] || 0), 0) };
  }, [all, playCounts]);

  const longest = useMemo(() => longestTracks(all), [all]);

  const catData = useMemo<Record<LibraryCategoryId, CatDatum>>(() => {
    const needle = q.trim().toLowerCase();
    const hitTr = (tr: Track) => !needle || `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(needle);
    const hitGr = (g: TrackGroup) => !needle || `${g.label} ${g.path ?? ""}`.toLowerCase().includes(needle);

    const trackCat = (list: Track[], headline: number, sub: string, plays = 0): CatDatum => {
      const filtered = list.filter(hitTr);
      return {
        count: headline,
        sub,
        repId: list[0]?.id ?? null,
        tracks: filtered,
        groups: [],
        duration: totalDuration(filtered),
        plays,
      };
    };
    const groupCat = (groups: TrackGroup[]): CatDatum => {
      const filtered = groups.filter(hitGr);
      return {
        count: groups.length,
        sub: String(groups.length),
        repId: groups[0]?.tracks[0]?.id ?? null,
        tracks: [],
        groups: filtered,
        duration: totalDuration(groups.flatMap((g) => g.tracks)),
        plays: 0,
      };
    };

    return {
      songs: trackCat(sortTracks(all, sort), all.length, String(all.length)),
      folders: groupCat(baseGroups.folders),
      subfolders: groupCat(baseGroups.subfolders),
      albums: groupCat(baseGroups.albums),
      albumArtists: groupCat(baseGroups.albumArtists),
      artists: groupCat(baseGroups.artists),
      years: groupCat(baseGroups.years),
      queue: trackCat(queueList, queueList.length, String(queueList.length)),
      mostPlayed: trackCat(mostPlayed.list, mostPlayed.list.length, String(mostPlayed.list.length), mostPlayed.plays),
      longest: trackCat(longest, all.length, fmtTime(totalDuration(all))),
      favorites: trackCat(sortTracks(favorites, sort), favorites.length, String(favorites.length)),
    };
  }, [all, q, sort, baseGroups, queueList, mostPlayed, longest, favorites]);

  // Drill-down target — resolved against the UNfiltered groups so searching
  // inside a drill never bounces the user back to the category root.
  const drillGroup = useMemo(() => {
    if (!view.group || !GROUP_CATS.has(view.cat)) return null;
    return baseGroups[view.cat as GroupCat]?.find((g) => g.key === view.group) ?? null;
  }, [view.cat, view.group, baseGroups]);

  const drillTracks = useMemo(() => {
    if (!drillGroup) return [];
    const needle = q.trim().toLowerCase();
    const list = needle
      ? drillGroup.tracks.filter((tr) => `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(needle))
      : drillGroup.tracks;
    return sortTracks(list, sort);
  }, [drillGroup, q, sort]);

  // ── navigation ─────────────────────────────────────────────────────────────
  const openCat = (cat: LibraryCategoryId) => {
    setAtHub(false);
    const next: LibView = { cat, group: null };
    setViewState(next);
    saveLibView(next);
  };
  const openGroup = (cat: LibraryCategoryId, group: string) => {
    setAtHub(false);
    const next: LibView = { cat, group };
    setViewState(next);
    saveLibView(next);
  };
  const goHub = () => setAtHub(true);
  const goBack = () => {
    if (!atHub && view.group && drillGroup) openCat(view.cat);
    else goHub();
  };

  // ── import flows (V1.2.0 desktop pipeline — kept 1:1) ──────────────────────
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

  const doDemo = async () => {
    setDemoBusy(true);
    try {
      const n = await loadDemoPack(t as any);
      if (n) uiApi.toast(`${n} ${t("addedToLibrary")}`, "success");
    } finally {
      setDemoBusy(false);
    }
  };

  // ── folder management flows (task 30 — phrased with the fm* keys) ────────
  const doAddFolderManaged = async () => {
    if (fm.busy) return;
    const res = await fm.add(t("importing"));
    if (res === null) {
      // no FSA picker in this runtime — same fallback as the header button
      uiApi.toast(t("folderFallback"), "info");
      const files = await pickFiles(true, true);
      if (files.length) await importFiles(files, undefined, t("importing"));
      return;
    }
    if (res.added) uiApi.toast(t("fmAdded").replace("{{n}}", String(res.added)), "success");
  };

  const doRescanFolder = async (path: string) => {
    if (fm.busy) return;
    setFmPending({ path, kind: "rescan" });
    try {
      await fm.rescan(path);
      uiApi.toast(t("fmRescanDone"), "success");
    } finally {
      setFmPending(null);
    }
  };

  const doRemoveFolder = async (f: FolderInfo) => {
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

  // ── artist-cover batch fetch (task 41 — the ARTISTS board button) ──────
  const [arBusy, setArBusy] = useState(false);
  const [arProg, setArProg] = useState({ done: 0, total: 0 });
  // refresh token: bumped when the batch stored ≥1 cover so ArtistTileArt
  // re-pulls the (now non-empty) artist-covers store
  const [arTick, setArTick] = useState(0);

  const doFetchArtistCovers = async () => {
    if (arBusy) return;
    // the artist names currently on the board, deduped; "Unknown Artist"
    // has nothing worth searching for
    const names = [...new Set(catData.artists.groups.map((g) => g.label))].filter(
      (n) => n && n !== t("unknownArtist")
    );
    setArBusy(true);
    setArProg({ done: 0, total: names.length });
    let stored = 0;
    try {
      // sequential (concurrency 1) — gentle on the iTunes endpoint
      for (const name of names) {
        try {
          const have = await db.getArtistCover(name).catch(() => null);
          if (!have) {
            const blob = await fetchArtistCover(name);
            if (blob) {
              await db.putArtistCover(name, blob).catch(() => undefined);
              stored++;
            }
          }
        } catch {
          /* one artist failing never kills the batch */
        }
        setArProg((p) => ({ ...p, done: p.done + 1 }));
      }
    } finally {
      setArBusy(false);
      if (stored > 0) {
        uiApi.toast(t("arFetchDone"), "success");
        setArTick((v) => v + 1); // tiles re-pull their art
      } else {
        uiApi.toast(t("arFetchZero"), "info");
      }
    }
  };

  // ── render decision ────────────────────────────────────────────────────────
  const showHub = atHub || all.length === 0;
  const isTrackCat = TRACK_CATS.has(view.cat);
  const needle = q.trim().toLowerCase();

  const hubTiles = useMemo(
    () => LIBRARY_CATEGORIES.map((cat) => ({ cat, icon: CAT_ICONS[cat], label: CAT_LABEL[cat](t), data: catData[cat] })),
    [catData, t]
  );
  const visibleHubTiles = needle ? hubTiles.filter((x) => x.label.toLowerCase().includes(needle)) : hubTiles;

  const items = useMemo<ListItem[]>(() => {
    const list = isTrackCat ? catData[view.cat].tracks : drillTracks;
    return list.map((tr) => ({ type: "row" as const, track: tr }));
  }, [isTrackCat, view.cat, catData, drillTracks]);
  const playIds = useMemo(() => items.flatMap((i) => (i.type === "row" ? [i.track.id] : [])), [items]);

  const emptyMsg = needle ? t("noMatches") : view.cat === "queue" ? t("lbEmptyQueue") : t("lbNothingHere");

  // Managed-folder board data (Folders category): bridge/mirror folders with
  // actions, plus any browse-only groups the manager doesn't cover (unfiled
  // batch imports etc.) — both respect the header search.
  const fmData = useMemo(() => {
    const managedPaths = new Set(fm.folders.map((f) => f.path));
    const leftoversAll = baseGroups.folders.filter((g) => !managedPaths.has(g.key));
    const hit = (s: string) => !needle || s.toLowerCase().includes(needle);
    return {
      shown: fm.folders.filter((f) => hit(`${f.name} ${f.path}`)),
      leftovers: leftoversAll.filter((g) => hit(`${g.label} ${g.path ?? ""}`)),
      total: fm.folders.length + leftoversAll.length,
    };
  }, [fm.folders, baseGroups.folders, needle]);

  return (
    <div className="flex h-full flex-col">
      {/* ── header (kept: wordmark · title · totals · search · sort · imports) ── */}
      <header className="flex flex-wrap items-end justify-between gap-4 px-6 pb-5 pt-7 lg:px-10">
        <div>
          <div className="t-faint mb-1.5 flex items-center gap-2 text-[9.5px] uppercase tracking-[0.34em]">
            <Disc3 size={11} className="t-accent" aria-hidden />
            NOBODY · rêve
          </div>
          <h1 className="dream-title font-display text-[clamp(2rem,4.5vw,3.2rem)] font-semibold leading-none tracking-tight">
            {t("navLibrary")}
          </h1>
          <div className="mt-3 flex items-center gap-2">
            <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] t-mut">
              <span className="tnum font-semibold t-accent">{all.length}</span> {t("tracksCount")}
            </span>
            {all.length > 0 && (
              <span className="glass tnum flex items-center rounded-full px-3 py-1 text-[11px] t-mut">
                {fmtTime(totalDuration(all))}
              </span>
            )}
            {mostPlayed.plays > 0 && (
              <span className="glass hidden items-center rounded-full px-3 py-1 text-[11px] t-mut sm:flex">
                {t("lbPlays").replace("{{n}}", String(mostPlayed.plays))}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="glass group relative rounded-full transition-shadow focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)]">
            <Search size={14} className="t-faint pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-[var(--accent)]" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("searchPlaceholder")}
              type="search"
              className="w-[200px] border-0 bg-transparent py-2 ps-9 pe-3 text-[13px] focus:outline-none sm:w-[230px]"
              style={{ background: "transparent", border: "none" }}
            />
          </div>
          {/* app-drawn listbox (a native <select> opened the Windows OS dropdown) */}
          <div className="glass rounded-full">
            <SelectMenu
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              ariaLabel="sort"
              options={[
                { value: "imported", label: t("sortImported") },
                { value: "title", label: t("sortTitle") },
                { value: "artist", label: t("sortArtist") },
                { value: "duration", label: t("sortDuration") },
              ]}
            />
          </div>
          {/* ARTISTS board only (task 41): batch-download the artists' covers */}
          {!showHub && view.cat === "artists" && !drillGroup && (
            <button
              type="button"
              className="glass t-mut nc-ar-fetch flex items-center gap-2 rounded-full px-4 py-2 text-[13px] transition-all hover:text-[var(--fg)] hover:-translate-y-px"
              onClick={() => void doFetchArtistCovers()}
              disabled={arBusy}
              aria-label={arBusy ? `${t("arFetching")} ${arProg.done}/${arProg.total}` : t("arFetchCovers")}
            >
              {arBusy ? <Loader2 size={14} className="nc-spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />}
              <span className="hidden sm:inline">
                {arBusy ? `${t("arFetching")} ${arProg.done}/${arProg.total}` : t("arFetchCovers")}
              </span>
            </button>
          )}
          <ActionBtn onClick={doImportFiles} icon={<Import size={14} aria-hidden />} label={t("importFiles")} />
          <ActionBtn onClick={doImportFolder} icon={<FolderOpen size={14} aria-hidden />} label={t("importFolder")} primary />
        </div>
      </header>

      {showHub ? (
        /* ── the category board ─────────────────────────────────────────── */
        <div className="min-h-0 flex-1 overflow-y-auto">
          {all.length === 0 && (
            <HubHero onImport={doImportFiles} onFolder={doImportFolder} onDemo={doDemo} demoBusy={demoBusy} />
          )}
          <div className="px-6 lg:px-10">
            <div className="nc-lib-eyebrow mb-4">
              <span className="t-faint text-[10px] uppercase tracking-[0.22em]">{t("lbCategories")}</span>
              <span aria-hidden className="nc-lib-eyebrow-rule" />
              <span className="t-faint tnum text-[10px]">{visibleHubTiles.length}</span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3.5 pb-28 sm:grid-cols-[repeat(auto-fill,minmax(205px,1fr))] sm:gap-4 xl:grid-cols-[repeat(auto-fill,minmax(244px,1fr))] xl:gap-5">
              {visibleHubTiles.map((tile, i) => (
                <CatTile
                  key={tile.cat}
                  index={i}
                  cat={tile.cat}
                  icon={tile.icon}
                  label={tile.label}
                  sub={tile.data.sub}
                  repId={tile.data.repId}
                  active={atHub && view.cat === tile.cat}
                  onOpen={() => openCat(tile.cat)}
                />
              ))}
            </div>
            {needle && visibleHubTiles.length === 0 && (
              <p className="t-mut pb-28 text-center text-[13px]">{t("noMatches")}</p>
            )}
          </div>
        </div>
      ) : isTrackCat ? (
        /* ── track categories: songs / queue / mostPlayed / longest / favorites ── */
        <>
          <SlimHeader
            onBack={goBack}
            backDest={t("lbCategories")}
            icon={CAT_ICONS[view.cat]}
            title={CAT_LABEL[view.cat](t)}
            countText={`${catData[view.cat].count} ${t("tracksCount")}`}
            duration={catData[view.cat].duration}
            plays={view.cat === "mostPlayed" ? catData.mostPlayed.plays : undefined}
          />
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-28 lg:px-8">
            {items.length === 0 ? (
              <EmptyNote icon={CAT_ICONS[view.cat]} msg={emptyMsg} />
            ) : (
              <TrackList items={items} playIds={playIds} />
            )}
          </div>
        </>
      ) : drillGroup ? (
        /* ── drilled group: the group's track list ────────────────────────── */
        <>
          <SlimHeader
            onBack={goBack}
            backDest={CAT_LABEL[view.cat](t)}
            icon={CAT_ICONS[view.cat]}
            title={drillGroup.label}
            countText={`${drillGroup.tracks.length} ${t("tracksCount")}`}
            duration={totalDuration(drillGroup.tracks)}
            path={drillGroup.path}
          />
          <div className="flex min-h-0 flex-1 flex-col px-4 pb-28 lg:px-8">
            {items.length === 0 ? (
              <EmptyNote icon={CAT_ICONS[view.cat]} msg={needle ? t("noMatches") : t("lbNothingHere")} />
            ) : (
              <TrackList items={items} playIds={playIds} />
            )}
          </div>
        </>
      ) : view.cat === "folders" ? (
        /* ── FOLDERS category: managed-folder board (task 30) — each managed
              folder is a card with rescan/remove + an add-folder chip; groups
              the manager doesn't cover (unfiled imports) stay browsable below ── */
        <>
          <SlimHeader
            onBack={goBack}
            backDest={t("lbCategories")}
            icon={CAT_ICONS.folders}
            title={CAT_LABEL.folders(t)}
            countText={String(fmData.total)}
            duration={catData.folders.duration}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-28 lg:px-10">
            <div className="nc-lib-eyebrow mb-3">
              <span className="t-faint text-[10px] uppercase tracking-[0.22em]">{t("fmFoldersTitle")}</span>
              <span aria-hidden className="nc-lib-eyebrow-rule" />
              <span className="t-faint tnum text-[10px]">{fmData.shown.length}</span>
            </div>
            {fmData.shown.length === 0 && fmData.leftovers.length === 0 && (
              <p className="t-mut mt-1 text-[12.5px]">{t("fmNoFolders")}</p>
            )}
            <div className="nc-fm-grid">
              {fmData.shown.map((f) => (
                <FolderCard
                  key={f.path}
                  info={f}
                  busy={fm.busy === f.path}
                  pendingKind={fmPending?.path === f.path ? fmPending.kind : null}
                  armed={fmConfirm === f.path}
                  drillable={baseGroups.folders.some((g) => g.key === f.path)}
                  anyBusy={fm.busy !== null}
                  onOpen={() => {
                    const g = baseGroups.folders.find((x) => x.key === f.path);
                    if (g) openGroup("folders", g.key);
                  }}
                  onRescan={() => void doRescanFolder(f.path)}
                  onRemove={() => void doRemoveFolder(f)}
                  onArm={() => armFmConfirm(f.path)}
                />
              ))}
              <button
                type="button"
                className="nc-fm-add"
                onClick={() => void doAddFolderManaged()}
                disabled={fm.busy !== null}
                aria-label={t("fmAddFolder")}
              >
                {fm.busy === "__add__" ? (
                  <Loader2 size={15} className="nc-spin" aria-hidden />
                ) : (
                  <FolderPlus size={15} aria-hidden />
                )}
                <span>{fm.busy === "__add__" ? "…" : t("fmAddFolder")}</span>
              </button>
            </div>
            {fmData.leftovers.length > 0 && (
              <div className="mt-7 grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:gap-3.5 xl:grid-cols-[repeat(auto-fill,minmax(198px,1fr))] xl:gap-4">
                {fmData.leftovers.map((g, i) => (
                  <GroupTile
                    key={g.key}
                    index={i}
                    cat="folders"
                    icon={Folder}
                    label={g.label}
                    count={g.tracks.length}
                    path={g.path}
                    repId={g.tracks[0]?.id ?? null}
                    onOpen={() => openGroup("folders", g.key)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* ── group categories: folders / subfolders / albums / … as small tiles ── */
        <>
          <SlimHeader
            onBack={goBack}
            backDest={t("lbCategories")}
            icon={CAT_ICONS[view.cat]}
            title={CAT_LABEL[view.cat](t)}
            countText={String(catData[view.cat].count)}
            duration={catData[view.cat].duration}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-6 lg:px-10">
            {catData[view.cat].groups.length === 0 ? (
              <div className="flex min-h-full flex-col px-2 pb-28">
                <EmptyNote icon={CAT_ICONS[view.cat]} msg={needle ? t("noMatches") : t("lbNothingHere")} />
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3 pb-28 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] sm:gap-3.5 xl:grid-cols-[repeat(auto-fill,minmax(198px,1fr))] xl:gap-4">
                {catData[view.cat].groups.map((g, i) => (
                  <GroupTile
                    key={g.key}
                    index={i}
                    cat={view.cat}
                    icon={CAT_ICONS[view.cat]}
                    label={g.label}
                    count={g.tracks.length}
                    path={PATH_CATS.has(view.cat) ? g.path : undefined}
                    repId={g.tracks[0]?.id ?? null}
                    artistName={view.cat === "artists" || view.cat === "albumArtists" ? g.label : undefined}
                    artToken={arTick}
                    onOpen={() => openGroup(view.cat, g.key)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── hub tile ─────────────────────────────────────────────────────────────────

function CatTile({
  index,
  cat,
  icon: Icon,
  label,
  sub,
  repId,
  active,
  onOpen,
}: {
  index: number;
  cat: LibraryCategoryId;
  icon: LucideIcon;
  label: string;
  sub: string;
  repId: string | null;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <motion.button
      type="button"
      className="nc-cat aspect-square"
      data-cat={cat}
      data-active={active ? "true" : undefined}
      aria-label={`${label} · ${sub}`}
      onClick={onOpen}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.045, 0.5), type: "spring", stiffness: 220, damping: 24 }}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.97 }}
    >
      <span aria-hidden className="nc-cat-grad" />
      {repId ? (
        <span aria-hidden className="nc-cat-media">
          <CoverArt trackId={repId} rounded="rounded-none" />
        </span>
      ) : (
        <Icon aria-hidden className="nc-cat-ghost" strokeWidth={1.1} />
      )}
      <span aria-hidden className="nc-cat-scrim" />
      <span className="nc-cat-content">
        <span className="nc-cat-badge">
          <Icon size={18} strokeWidth={1.9} aria-hidden />
        </span>
        <span className="nc-cat-spacer" />
        <span className="nc-cat-chips">
          <span className="nc-cat-chip">{label}</span>
          <span className="nc-cat-chip sub">
            <span className="tnum">{sub}</span>
          </span>
        </span>
      </span>
      <span aria-hidden className="nc-cat-line" />
    </motion.button>
  );
}

// ── artist tile art (task 41 — stored artist covers over the track fallback) ─
// Module-level object-URL cache keyed by artist name + refresh token: the
// batch job bumps the token after storing covers, which invalidates every
// entry (stale URLs revoked on the next pull) and makes the tiles re-read
// from IndexedDB. URLs live for the session — one per artist, revoked only
// when replaced, so re-entering the board is instant and leak-free.

const artistArtUrls = new Map<string, { token: number; url: string }>();

function ArtistTileArt({
  name,
  fallbackTrackId,
  token,
}: {
  name: string;
  fallbackTrackId: string | null;
  token: number;
}) {
  // Cache hits resolve DURING RENDER (the module Map is the shared source of
  // truth — a tile remounting on a re-visited board paints instantly); only
  // real IndexedDB fetches touch state, and those land in async callbacks,
  // never synchronously inside the effect body.
  const cacheHit = artistArtUrls.get(name);
  const [fetched, setFetched] = useState<{ name: string; token: number; url: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const hit = artistArtUrls.get(name);
      if (hit && hit.token === token) return; // already shown via render-derive
      try {
        const blob = await db.getArtistCover(name).catch(() => null);
        if (!alive || !blob) return;
        const stale = artistArtUrls.get(name);
        if (stale) URL.revokeObjectURL(stale.url);
        const u = URL.createObjectURL(blob);
        artistArtUrls.set(name, { token, url: u });
        setFetched({ name, token, url: u });
      } catch {
        /* IndexedDB hiccup → the fallback cover stays up */
      }
    })();
    return () => {
      alive = false;
    };
  }, [name, token]);
  const url =
    cacheHit && cacheHit.token === token
      ? cacheHit.url
      : fetched && fetched.name === name && fetched.token === token
        ? fetched.url
        : null;
  if (url) {
    return <img src={url} alt="" draggable={false} className="nc-ar-art h-full w-full select-none object-cover" />;
  }
  return fallbackTrackId ? <CoverArt trackId={fallbackTrackId} rounded="rounded-none" /> : null;
}

// ── group tile (one level under a group category) ────────────────────────────

function GroupTile({
  index,
  cat,
  icon: Icon,
  label,
  count,
  path,
  repId,
  artistName,
  artToken,
  onOpen,
}: {
  index: number;
  cat: LibraryCategoryId;
  icon: LucideIcon;
  label: string;
  count: number;
  path?: string;
  repId: string | null;
  /** set on artist boards: prefer the stored artist cover over the
   *  representative track cover (task 41). */
  artistName?: string;
  artToken?: number;
  onOpen: () => void;
}) {
  const t = useT();
  const countText = t("tracksInGroup").replace("{{n}}", String(count));
  return (
    <motion.button
      type="button"
      className="nc-cat sm aspect-square"
      data-cat={cat}
      aria-label={`${label} · ${path ?? countText}`}
      onClick={onOpen}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.028, 0.4), type: "spring", stiffness: 240, damping: 26 }}
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.97 }}
    >
      <span aria-hidden className="nc-cat-grad" />
      {repId || artistName ? (
        <span aria-hidden className="nc-cat-media">
          {artistName ? (
            <ArtistTileArt name={artistName} fallbackTrackId={repId} token={artToken ?? 0} />
          ) : (
            <CoverArt trackId={repId} rounded="rounded-none" />
          )}
        </span>
      ) : (
        <Icon aria-hidden className="nc-cat-ghost" strokeWidth={1.1} />
      )}
      <span aria-hidden className="nc-cat-scrim" />
      <span className="nc-cat-content">
        <span className="nc-cat-badge">
          <Icon size={15} strokeWidth={1.9} aria-hidden />
        </span>
        <span className="nc-cat-spacer" />
        <span className="nc-cat-chips">
          <span className="nc-cat-chip">
            <span className="nc-chip-label">{label}</span>
          </span>
          {path && (
            <span className="nc-cat-chip sub" dir="ltr" title={path}>
              <span className="nc-chip-label">{path}</span>
            </span>
          )}
          <span className="nc-cat-chip sub">
            <span className="tnum">{countText}</span>
          </span>
        </span>
      </span>
      <span aria-hidden className="nc-cat-line" />
    </motion.button>
  );
}

// ── slim content header ──────────────────────────────────────────────────────

function SlimHeader({
  onBack,
  backDest,
  icon: Icon,
  title,
  countText,
  duration,
  plays,
  path,
}: {
  onBack: () => void;
  backDest: string;
  icon: LucideIcon;
  title: string;
  countText: string;
  duration: number;
  plays?: number;
  path?: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 pb-4 pt-1 lg:px-10">
      <button
        type="button"
        onClick={onBack}
        className="nc-lib-back glass t-mut flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] hover:text-[var(--fg)]"
      >
        <ArrowLeft size={14} className="nc-flip" aria-hidden />
        {t("lbBack")}
        <span aria-hidden className="t-faint">
          ·
        </span>
        <span className="t-faint">{backDest}</span>
      </button>
      <span aria-hidden className="nc-lib-ring-icon">
        <Icon size={16} strokeWidth={1.8} />
      </span>
      <h2 className="font-display text-[clamp(1.25rem,2.4vw,1.7rem)] font-semibold italic leading-none tracking-tight">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <span className="glass flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] t-mut">
          <span className="tnum font-semibold t-accent">{countText}</span>
        </span>
        {duration > 0 && (
          <span className="glass tnum flex items-center rounded-full px-3 py-1 text-[11px] t-mut">{fmtTime(duration)}</span>
        )}
        {plays !== undefined && plays > 0 && (
          <span className="glass flex items-center rounded-full px-3 py-1 text-[11px] t-mut">
            {t("lbPlays").replace("{{n}}", String(plays))}
          </span>
        )}
        {path && (
          <span className="glass t-mut inline-block max-w-[260px] truncate rounded-full px-3 py-1 text-[11px]" dir="ltr" title={path}>
            {path}
          </span>
        )}
      </div>
    </div>
  );
}

// ── empty note ───────────────────────────────────────────────────────────────

function EmptyNote({ icon: Icon, msg }: { icon: LucideIcon; msg: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <Icon size={44} strokeWidth={1} className="t-faint opacity-50" aria-hidden />
      <p className="t-mut text-[13.5px]">{msg}</p>
    </div>
  );
}

function ActionBtn({ onClick, icon, label, primary }: { onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? "bg-accent flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-transform hover:scale-[1.04] active:scale-95"
          : "glass t-mut flex items-center gap-2 rounded-full px-4 py-2 text-[13px] transition-all hover:text-[var(--fg)] hover:-translate-y-px"
      }
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// ── empty-library hero (kept from the rêve gallery, slimmed for the board) ───

function HubHero({
  onImport,
  onFolder,
  onDemo,
  demoBusy,
}: {
  onImport: () => void;
  onFolder: () => void;
  onDemo: () => void;
  demoBusy: boolean;
}) {
  const t = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
      className="relative mx-auto max-w-xl px-6 pb-8 pt-4 text-center"
    >
      {/* orbit rings behind the wordmark */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-6 mx-auto flex h-[210px] w-[210px] items-center justify-center opacity-60">
        {[150, 198].map((s) => (
          <div
            key={s}
            className="spin-slow absolute rounded-full border border-dashed"
            style={{ width: s, height: s, borderColor: "color-mix(in srgb, var(--accent) 22%, transparent)" }}
          />
        ))}
      </div>
      <div className="outline-text relative font-display text-[clamp(2.4rem,7vw,4.4rem)] font-bold italic leading-none tracking-tight">
        NOBODY
      </div>
      <h2 className="relative mt-3 font-display text-xl italic">{t("emptyTitle")}</h2>
      <p className="t-mut relative mx-auto mt-2 max-w-md text-[13px] leading-relaxed">{t("emptyHint")}</p>
      <div className="relative mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onImport}
          className="bg-accent flex items-center gap-2 rounded-full px-5 py-3 text-[14px] font-semibold transition-transform hover:scale-[1.04] active:scale-95"
        >
          <Import size={16} aria-hidden /> {t("importFiles")}
        </button>
        <button
          type="button"
          onClick={onFolder}
          className="glass flex items-center gap-2 rounded-full px-5 py-3 text-[14px] transition-transform hover:scale-[1.04] active:scale-95"
        >
          <FolderOpen size={16} aria-hidden /> {t("importFolder")}
        </button>
      </div>
      <button
        type="button"
        onClick={onDemo}
        disabled={demoBusy}
        className="t-accent relative mx-auto mt-4 flex items-center gap-2 text-[12.5px] underline-offset-4 hover:underline disabled:opacity-50"
      >
        <Sparkles size={13} aria-hidden className={demoBusy ? "spin-slow" : ""} />
        {demoBusy ? "…" : t("emptyDemo")}
      </button>
    </motion.div>
  );
}

// ── managed-folder card (task 30 — Folders category board) ──────────────────
// One managed folder as a dark-glass chip card: folder icon + name + track
// count chip, a rescan (↻) and a remove (✕) icon button. Remove is two-tap:
// first tap arms a danger "confirm?" state (~2.5s), second tap removes. The
// busy folder spins the button of the running operation.

function FolderCard({
  info,
  busy,
  pendingKind,
  armed,
  drillable,
  anyBusy,
  onOpen,
  onRescan,
  onRemove,
  onArm,
}: {
  info: FolderInfo;
  busy: boolean;
  pendingKind: "rescan" | "remove" | null;
  armed: boolean;
  drillable: boolean;
  anyBusy: boolean;
  onOpen: () => void;
  onRescan: () => void;
  onRemove: () => void;
  onArm: () => void;
}) {
  const t = useT();
  const countText = t("tracksInGroup").replace("{{n}}", String(info.trackCount));
  return (
    <div className="nc-fm-card" data-busy={busy || undefined}>
      <button
        type="button"
        className="nc-fm-main"
        onClick={onOpen}
        disabled={!drillable || busy}
        aria-label={drillable ? `${info.name} · ${countText}` : info.name}
        title={info.path}
      >
        <span aria-hidden className="nc-fm-icon">
          <Folder size={15} strokeWidth={1.9} />
        </span>
        <span className="nc-fm-meta">
          <span className="nc-fm-name">{info.name}</span>
          <span className="nc-fm-path" dir="ltr">
            {info.path}
          </span>
        </span>
        <span className="nc-cat-chip sub nc-fm-count">
          <span className="tnum">{countText}</span>
        </span>
      </button>
      <span className="nc-fm-acts">
        <button
          type="button"
          className="nc-fm-btn"
          onClick={onRescan}
          disabled={anyBusy}
          aria-label={`${t("fmRescan")}: ${info.name}`}
          title={t("fmRescan")}
        >
          {pendingKind === "rescan" ? (
            <Loader2 size={14} className="nc-spin" aria-hidden />
          ) : (
            <RotateCw size={14} aria-hidden />
          )}
        </button>
        <button
          type="button"
          className="nc-fm-btn"
          data-danger={armed || undefined}
          onClick={armed ? onRemove : onArm}
          disabled={anyBusy}
          aria-label={armed ? `${t("fmConfirmRemove")} — ${info.name}` : `${t("fmRemoveFolder")}: ${info.name}`}
          title={armed ? t("fmRemoveConfirm") : t("fmRemoveFolder")}
        >
          {pendingKind === "remove" ? (
            <Loader2 size={14} className="nc-spin" aria-hidden />
          ) : armed ? (
            <span className="nc-fm-sure">{t("fmConfirmRemove")}</span>
          ) : (
            <X size={14} aria-hidden />
          )}
        </button>
      </span>
    </div>
  );
}
