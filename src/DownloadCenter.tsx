/* ————————————————— DOWNLOAD CENTER (sidebar page) —————————————————
   A single, organized workspace for EVERY lyric (.lrc) and cover-art
   download in NOBODY — merges the per-folder sync modals into one advanced,
   batch-first page:

     • Two organized sections (tabs): Lyrics (LRC) · Cover Art
     • Library-wide stats, folder scoping, text search, status filter chips
     • Checkbox selection (all / none / invert) with selection-aware batches
     • Worker-pool batches (3× lyrics, 2× covers) with live progress, stop,
       retry-failed and per-track status chips
     • Manual search modals: pick from real LRCLIB / iTunes / Deezer
       candidates with previews, then apply in-app and/or save the file
     • Works everywhere: desktop saves next to the audio file
       (Song.lrc / Song.jpg); the web build streams a normal browser download
     • Options (skip-existing, auto-apply, save-to-disk) persist in
       localStorage; unmount-safe (in-flight batches stop cleanly)

   Deliberately reuses the app's existing helpers (fetchLrclibLyrics,
   findCoverArtUrl, saveLrcFile, saveCoverImage, managed blob registry) so
   behavior matches the per-folder sync flows exactly. */

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronLeft,
  Disc3,
  Download,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  Music,
  Play,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createManagedBlobUrl } from "./blobRegistry";
import {
  downloadCoverArt,
  findCoverArtUrl,
  searchCoverArtCandidates,
  type CoverCandidate,
} from "./coverart";
import { isDesktopRuntime, saveCoverImage, saveLrcFile } from "./desktopLibrary";
import type { TranslationDictionary } from "./i18n";
import { parseLrc, previewFromSynced } from "./lrc";
import { checkLrclibConnection, fetchLrclibLyrics, searchLrclibLyrics, type LrclibResult } from "./lrclib";
import type { Language, LyricLine, Track } from "./types";

type DlTab = "lyrics" | "cover";

type DlStatus = "idle" | "queued" | "searching" | "done" | "not-found" | "instrumental" | "error" | "skipped";

type RowMeta = {
  status: DlStatus;
  kind?: "synced" | "plain";
  applied?: boolean;
  savedToDisk?: boolean;
};

type Options = {
  skipExisting: boolean;
  autoApply: boolean;
  saveToDisk: boolean;
};

type StatusFilter = "all" | "done" | "not-found" | "instrumental" | "error" | "skipped" | "idle";

const ALL_SCOPE = "__ALL__";
const OPTIONS_KEY = "nobody.download-center.v1";
const LYRICS_CONCURRENCY = 3;
const COVER_CONCURRENCY = 2;

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const DEFAULT_OPTIONS: Options = {
  skipExisting: true,
  autoApply: true,
  saveToDisk: isDesktopRuntime(),
};

function loadOptions(): Options {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    return { ...DEFAULT_OPTIONS, ...(JSON.parse(raw) as Partial<Options>) };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "track"
  );
}

/** Triggers a normal browser download (web / preview builds). The blob URL is
 *  always revoked — a tiny self-contained registry for one-shot downloads. */
function browserDownload(data: Uint8Array | string, filename: string, mime: string) {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: mime })
      : new Blob([data as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 8000);
}

const STATUS_ICONS: Record<DlStatus, typeof Info> = {
  idle: Info,
  queued: Download,
  searching: Loader2,
  done: CheckCircle2,
  "not-found": AlertCircle,
  instrumental: Info,
  error: AlertCircle,
  skipped: X,
};

/* ————————————————— small building blocks ————————————————— */

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button type="button" className="dl-opt-row" onClick={onChange} role="switch" aria-checked={checked}>
      <span className="dl-opt-text">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className={`dl-opt-switch ${checked ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
}

const StatCard = memo(function StatCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Music;
  value: number | string;
  label: string;
  tone: "accent" | "ok" | "warn" | "info";
}) {
  return (
    <div className={`dl-stat dl-stat-${tone}`}>
      <Icon size={17} strokeWidth={1.75} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
});

/* ————————————————— track row ————————————————— */

type DlRowProps = {
  track: Track;
  meta: RowMeta | undefined;
  selected: boolean;
  tab: DlTab;
  labels: DlLabels;
  onToggle: (id: number) => void;
  onFetch: (id: number) => void;
  onManual: (track: Track) => void;
  onPlay: (id: number) => void;
};

const DlRow = memo(function DlRow({
  track,
  meta,
  selected,
  tab,
  labels,
  onToggle,
  onFetch,
  onManual,
  onPlay,
}: DlRowProps) {
  const status = meta?.status ?? "idle";
  const StatusIcon = STATUS_ICONS[status];
  const busy = status === "searching" || status === "queued";
  const hasRealContent =
    tab === "lyrics"
      ? !track.isFallbackLyric && track.lyrics.length > 1
      : !track.isFallbackCover;

  return (
    <div className={`dl-row ${selected ? "selected" : ""} ${busy ? "busy" : ""}`} role="listitem">
      <button
        type="button"
        className={`dl-cb ${selected ? "on" : ""}`}
        onClick={() => onToggle(track.id)}
        aria-pressed={selected}
        aria-label={labels.select}
      >
        {selected ? <Check size={12} strokeWidth={3} /> : null}
      </button>

      <button type="button" className="dl-thumb" onClick={() => onPlay(track.id)} aria-label={labels.play} title={labels.play}>
        <img src={track.cover} alt="" loading="lazy" />
        <span className="dl-thumb-hover">
          <Play size={13} />
        </span>
      </button>

      <div className="dl-meta" dir="ltr">
        <strong>{track.title}</strong>
        <small>
          {track.artist}
          {track.album ? ` — ${track.album}` : ""}
        </small>
      </div>

      <span className="dl-year" dir="ltr">
        {track.year || "—"}
      </span>
      <span className="dl-dur" dir="ltr">
        {track.durationLabel}
      </span>

      <span className={`dl-status st-${status}`}>
        <StatusIcon size={13} className={status === "searching" ? "dl-spin" : undefined} />
        <span>{labels.status[status]}</span>
        {status === "done" && meta?.kind === "plain" ? <em className="dl-kind-tag">plain</em> : null}
        {status === "done" && meta?.savedToDisk ? <Download size={11} className="dl-mini-flag" /> : null}
        {status === "done" && meta?.applied ? <Check size={11} className="dl-mini-flag" /> : null}
      </span>

      <div className="dl-row-actions">
        {hasRealContent ? <span className="dl-have-flag">{tab === "lyrics" ? "LRC" : "IMG"}</span> : null}
        <button type="button" className="dl-iconbtn" onClick={() => onFetch(track.id)} aria-label={labels.fetch} title={labels.fetch} disabled={busy}>
          {busy ? <Loader2 size={14} className="dl-spin" /> : <Download size={14} />}
        </button>
        <button type="button" className="dl-iconbtn" onClick={() => onManual(track)} aria-label={labels.manual} title={labels.manual}>
          <Search size={14} />
        </button>
      </div>
    </div>
  );
});

/* ————————————————— manual lyrics search modal ————————————————— */

function LyricsSearchModal({
  track,
  lang,
  labels,
  close,
  onLyricsFetched,
  saveLyricsFile,
}: {
  track: Track;
  lang: Language;
  labels: DlLabels;
  close: () => void;
  onLyricsFetched: (trackId: number, lyrics: LyricLine[], sourceLabel: string) => void;
  saveLyricsFile: (track: Track, content: string) => Promise<boolean>;
}) {
  const [artist, setArtist] = useState(track.artist);
  const [title, setTitle] = useState(track.title);
  const [results, setResults] = useState<LrclibResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setResults(null);
    setExpanded(null);
    try {
      const found = await searchLrclibLyrics({ trackName: title.trim(), artistName: artist.trim() });
      setResults(found);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [artist, title]);

  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyCandidate = (candidate: LrclibResult) => {
    if (!candidate.syncedLyrics) return;
    onLyricsFetched(track.id, parseLrc(candidate.syncedLyrics), "LRCLIB.net");
    close();
  };

  const saveCandidate = async (candidate: LrclibResult) => {
    const content = candidate.syncedLyrics || candidate.plainLyrics || "";
    if (!content) return;
    const ok = await saveLyricsFile(track, content);
    if (ok) {
      setSavedId(candidate.id);
      window.setTimeout(() => setSavedId(null), 2200);
    }
  };

  const durationMatch = (candidate: LrclibResult) =>
    candidate.duration > 0 && track.duration > 0 && Math.abs(candidate.duration - track.duration) <= 3;

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.div
        className="dl-modal-card"
        initial={{ scale: 0.94, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dl-modal-head">
          <div className="dl-modal-title">
            <FileText size={18} />
            <div>
              <h3>{labels.manualLyricsTitle}</h3>
              <small dir="ltr">
                {track.title} — {track.artist}
              </small>
            </div>
          </div>
          <button type="button" className="dl-iconbtn" onClick={close} aria-label={labels.close}>
            <X size={15} />
          </button>
        </div>

        <div className="dl-query-grid" dir="ltr">
          <label>
            <span>{labels.queryTitle}</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} spellCheck={false} />
          </label>
          <label>
            <span>{labels.queryArtist}</span>
            <input value={artist} onChange={(event) => setArtist(event.target.value)} spellCheck={false} />
          </label>
          <button type="button" className="dl-primary" onClick={() => void runSearch()} disabled={loading}>
            {loading ? <Loader2 size={14} className="dl-spin" /> : <Search size={14} />}
            {labels.searchBtn}
          </button>
        </div>

        <div className="dl-candidates">
          {loading ? (
            <div className="dl-cand-empty">
              <Loader2 size={20} className="dl-spin" />
              <span>{labels.searching}</span>
            </div>
          ) : !results ? null : results.length === 0 ? (
            <div className="dl-cand-empty">
              <AlertCircle size={20} />
              <span>{labels.noResults}</span>
            </div>
          ) : (
            results.map((candidate) => (
              <div key={candidate.id} className={`dl-cand ${expanded === candidate.id ? "open" : ""}`}>
                <button type="button" className="dl-cand-head" onClick={() => setExpanded(expanded === candidate.id ? null : candidate.id)}>
                  <div className="dl-cand-names" dir="ltr">
                    <strong>{candidate.trackName}</strong>
                    <small>
                      {candidate.artistName}
                      {candidate.albumName ? ` — ${candidate.albumName}` : ""}
                    </small>
                  </div>
                  <div className="dl-cand-badges" dir="ltr">
                    {durationMatch(candidate) ? <em className="dl-badge ok">{labels.exactDur}</em> : null}
                    {candidate.syncedLyrics ? <em className="dl-badge acc">{labels.synced}</em> : null}
                    {candidate.plainLyrics ? <em className="dl-badge">{labels.plain}</em> : null}
                    {candidate.instrumental ? <em className="dl-badge info">{labels.instrumental}</em> : null}
                  </div>
                  <ChevronLeft size={15} className="dl-caret" style={{ transform: expanded === candidate.id ? "rotate(-90deg)" : "rotate(180deg)" }} />
                </button>
                {expanded === candidate.id ? (
                  <div className="dl-cand-body" dir="ltr">
                    <pre>
                      {candidate.syncedLyrics
                        ? previewFromSynced(candidate.syncedLyrics, 8).join("\n")
                        : (candidate.plainLyrics || "").split(/\r?\n/).slice(0, 8).join("\n")}
                    </pre>
                    <div className="dl-cand-actions">
                      {candidate.syncedLyrics ? (
                        <button type="button" className="dl-primary" onClick={() => applyCandidate(candidate)}>
                          <CheckCircle2 size={14} />
                          {labels.applyToApp}
                        </button>
                      ) : null}
                      <button type="button" className="dl-ghost" onClick={() => void saveCandidate(candidate)}>
                        {savedId === candidate.id ? <Check size={14} /> : <Download size={14} />}
                        {savedId === candidate.id ? labels.savedFile : labels.saveFile}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <p className="dl-modal-note">
          {lang === "fa"
            ? "«فقط لیریک‌های هم‌زمان‌شده (Synced) به پخش‌کننده اعمال می‌شوند؛ نسخه‌ی ساده به‌صورت فایل .lrc ذخیره می‌شود.»"
            : lang === "tr"
              ? "Yalnızca senkronize sözler oynatıcıya uygulanır; düz metin .lrc dosyası olarak kaydedilir."
              : lang === "ru"
                ? "В плеер применяются только синхронные тексты; простой текст сохраняется как файл .lrc."
                : "Only synced lyrics are applied to the player; plain text is saved as an .lrc file."}
        </p>
      </motion.div>
    </motion.div>
  );
}

/* ————————————————— manual cover search modal ————————————————— */

function CoverSearchModal({
  track,
  labels,
  close,
  onCoverFetched,
  saveCoverFile,
}: {
  track: Track;
  labels: DlLabels;
  close: () => void;
  onCoverFetched: (trackId: number, coverUrl: string) => void;
  saveCoverFile: (track: Track, bytes: Uint8Array, ext: string) => Promise<boolean>;
}) {
  const [candidates, setCandidates] = useState<CoverCandidate[] | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [working, setWorking] = useState<"apply" | "save" | null>(null);
  const [doneFlash, setDoneFlash] = useState<"applied" | "saved" | null>(null);

  useEffect(() => {
    let alive = true;
    searchCoverArtCandidates(track.artist, track.title)
      .then((found) => {
        if (!alive) return;
        setCandidates(found);
        setSelectedUrl(found[0]?.url ?? null);
      })
      .catch(() => {
        if (alive) setCandidates([]);
      });
    return () => {
      alive = false;
    };
  }, [track.artist, track.title]);

  const applyCandidate = async () => {
    if (!selectedUrl) return;
    setWorking("apply");
    try {
      const downloaded = await downloadCoverArt(selectedUrl);
      if (downloaded) {
        const objectUrl = createManagedBlobUrl(
          new Blob([downloaded.bytes as unknown as BlobPart], { type: `image/${downloaded.ext}` }),
        );
        onCoverFetched(track.id, objectUrl);
        setDoneFlash("applied");
        window.setTimeout(() => close(), 900);
        return;
      }
    } finally {
      setWorking(null);
    }
    setDoneFlash(null);
  };

  const saveCandidate = async () => {
    if (!selectedUrl) return;
    setWorking("save");
    try {
      const downloaded = await downloadCoverArt(selectedUrl);
      if (downloaded) {
        const ok = await saveCoverFile(track, downloaded.bytes, downloaded.ext);
        if (ok) {
          setDoneFlash("saved");
          window.setTimeout(() => setDoneFlash(null), 2200);
        }
      }
    } finally {
      setWorking(null);
    }
  };

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.div
        className="dl-modal-card wide"
        initial={{ scale: 0.94, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dl-modal-head">
          <div className="dl-modal-title">
            <ImageIcon size={18} />
            <div>
              <h3>{labels.manualCoverTitle}</h3>
              <small dir="ltr">
                {track.title} — {track.artist}
              </small>
            </div>
          </div>
          <button type="button" className="dl-iconbtn" onClick={close} aria-label={labels.close}>
            <X size={15} />
          </button>
        </div>

        <div className="dl-cover-grid">
          {!candidates ? (
            <div className="dl-cand-empty">
              <Loader2 size={20} className="dl-spin" />
              <span>{labels.searching}</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="dl-cand-empty">
              <AlertCircle size={20} />
              <span>{labels.noResults}</span>
            </div>
          ) : (
            candidates.map((candidate) => (
              <button
                key={candidate.url}
                type="button"
                className={`dl-cover-cell ${selectedUrl === candidate.url ? "picked" : ""}`}
                onClick={() => setSelectedUrl(candidate.url)}
                aria-pressed={selectedUrl === candidate.url}
              >
                <img src={candidate.thumbUrl} alt="" loading="lazy" />
                <span className="dl-cover-src">{candidate.source}</span>
                {selectedUrl === candidate.url ? (
                  <span className="dl-cover-check">
                    <Check size={13} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>

        {selectedUrl ? (
          <div className="dl-cover-preview" dir="ltr">
            <img src={selectedUrl} alt="" />
          </div>
        ) : null}

        <div className="dl-cand-actions center">
          <button type="button" className="dl-primary" onClick={() => void applyCandidate()} disabled={!selectedUrl || working !== null}>
            {working === "apply" ? <Loader2 size={14} className="dl-spin" /> : <CheckCircle2 size={14} />}
            {doneFlash === "applied" ? labels.appliedApp : labels.applyToApp}
          </button>
          <button type="button" className="dl-ghost" onClick={() => void saveCandidate()} disabled={!selectedUrl || working !== null}>
            {working === "save" ? <Loader2 size={14} className="dl-spin" /> : <Download size={14} />}
            {doneFlash === "saved" ? labels.savedFile : labels.saveFile}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ————————————————— labels (fa / tr / en) ————————————————— */

export type DlLabels = {
  select: string;
  play: string;
  fetch: string;
  manual: string;
  close: string;
  manualLyricsTitle: string;
  manualCoverTitle: string;
  queryTitle: string;
  queryArtist: string;
  searchBtn: string;
  searching: string;
  noResults: string;
  exactDur: string;
  synced: string;
  plain: string;
  instrumental: string;
  applyToApp: string;
  appliedApp: string;
  saveFile: string;
  savedFile: string;
  status: Record<DlStatus, string>;
};

function buildLabels(lang: Language): DlLabels {
  const fa = lang === "fa";
  const tr = lang === "tr";
  const ru = lang === "ru";
  return {
    select: fa ? "انتخاب" : tr ? "Seçim" : ru ? "Выбрать" : "Select",
    play: fa ? "پخش این آهنگ" : tr ? "Bu şarkıyı çal" : ru ? "Играть этот трек" : "Play this track",
    fetch: fa ? "دانلود هوشمند" : tr ? "Akıllı indir" : ru ? "Умная загрузка" : "Smart download",
    manual: fa ? "جست‌وجوی دستی" : tr ? "Manuel ara" : ru ? "Ручной поиск" : "Manual search",
    close: fa ? "بستن" : tr ? "Kapat" : ru ? "Закрыть" : "Close",
    manualLyricsTitle: fa ? "جست‌وجوی دستی لیریک" : tr ? "Manuel söz arama" : ru ? "Ручной поиск текста" : "Manual lyrics search",
    manualCoverTitle: fa ? "انتخاب دستی کاور" : tr ? "Manuel kapak seçimi" : ru ? "Ручной выбор обложки" : "Manual cover picker",
    queryTitle: fa ? "نام ترانه" : tr ? "Şarkı adı" : ru ? "Название трека" : "Track name",
    queryArtist: fa ? "نام خواننده" : tr ? "Sanatçı" : ru ? "Исполнитель" : "Artist",
    searchBtn: fa ? "جست‌وجو" : tr ? "Ara" : ru ? "Искать" : "Search",
    searching: fa ? "در حال جست‌وجو…" : tr ? "Aranıyor…" : ru ? "Ищу…" : "Searching…",
    noResults: fa ? "نتیجه‌ای پیدا نشد" : tr ? "Sonuç bulunamadı" : ru ? "Ничего не найдено" : "No results found",
    exactDur: fa ? "هم‌اندازه" : tr ? "süre eşleşti" : ru ? "точная длительность" : "exact duration",
    synced: fa ? "هم‌زمان" : tr ? "senkron" : ru ? "синхронно" : "synced",
    plain: fa ? "ساده" : tr ? "düz" : ru ? "простой" : "plain",
    instrumental: fa ? "بی‌کلام" : tr ? "enstrümantal" : ru ? "инструментал" : "instrumental",
    applyToApp: fa ? "اعمال در پخش‌کننده" : tr ? "Oynatıcıya uygula" : ru ? "Применить в плеере" : "Apply to player",
    appliedApp: fa ? "اعمال شد ✓" : tr ? "Uygulandı ✓" : ru ? "Применено ✓" : "Applied ✓",
    saveFile: fa ? "ذخیره فایل" : tr ? "Dosyayı kaydet" : ru ? "Сохранить файл" : "Save file",
    savedFile: fa ? "ذخیره شد ✓" : tr ? "Kaydedildi ✓" : ru ? "Сохранено ✓" : "Saved ✓",
    status: {
      idle: fa ? "بی‌تغییر" : tr ? "bekliyor" : ru ? "без изменений" : "untouched",
      queued: fa ? "در صف" : tr ? "kuyrukta" : ru ? "в очереди" : "queued",
      searching: fa ? "در حال جست‌وجو" : tr ? "aranıyor" : ru ? "ищу" : "searching",
      done: fa ? "انجام شد" : tr ? "tamam" : ru ? "готово" : "done",
      "not-found": fa ? "پیدا نشد" : tr ? "bulunamadı" : ru ? "не найдено" : "not found",
      instrumental: fa ? "بی‌کلام" : tr ? "enstrümantal" : ru ? "инструментал" : "instrumental",
      error: fa ? "خطا" : tr ? "hata" : ru ? "ошибка" : "error",
      skipped: fa ? "رد شد" : tr ? "atlandı" : ru ? "пропущено" : "skipped",
    },
  };
}

/* ————————————————— the page ————————————————— */

export default function DownloadCenter({
  tracks,
  dict,
  lang,
  onLyricsFetched,
  onCoverFetched,
  onPlayTrack,
}: {
  tracks: Track[];
  dict: TranslationDictionary;
  lang: Language;
  onLyricsFetched: (trackId: number, lyrics: LyricLine[], sourceLabel: string) => void;
  onCoverFetched: (trackId: number, coverUrl: string) => void;
  onPlayTrack: (trackId: number) => void;
}) {
  void dict;
  const [tab, setTab] = useState<DlTab>("lyrics");
  const [scope, setScope] = useState<string>(ALL_SCOPE);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [lrcMeta, setLrcMeta] = useState<Record<number, RowMeta>>({});
  const [coverMeta, setCoverMeta] = useState<Record<number, RowMeta>>({});
  const [runningTab, setRunningTab] = useState<DlTab | null>(null);
  const [options, setOptions] = useState<Options>(loadOptions);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [conn, setConn] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [manualLyricsTrack, setManualLyricsTrack] = useState<Track | null>(null);
  const [manualCoverTrack, setManualCoverTrack] = useState<Track | null>(null);

  const stopRef = useRef(false);
  const optionsRef = useRef(options);
  const tracksRef = useRef(tracks);
  const handlersRef = useRef({ onLyricsFetched, onCoverFetched });
  const optionsMenuRef = useRef<HTMLDivElement | null>(null);
  const scopeMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    optionsRef.current = options;
    try {
      localStorage.setItem(OPTIONS_KEY, JSON.stringify(options));
    } catch {
      /* storage unavailable — options stay session-only */
    }
  }, [options]);

  useEffect(() => {
    tracksRef.current = tracks;
    handlersRef.current = { onLyricsFetched, onCoverFetched };
  });

  useEffect(
    () => () => {
      stopRef.current = true;
    },
    [],
  );

  useEffect(() => {
    if (!scopeOpen && !optionsOpen) return;
    const onOutside = (event: MouseEvent) => {
      if (scopeOpen && scopeMenuRef.current && !scopeMenuRef.current.contains(event.target as Node)) setScopeOpen(false);
      if (optionsOpen && optionsMenuRef.current && !optionsMenuRef.current.contains(event.target as Node)) setOptionsOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [scopeOpen, optionsOpen]);

  const labels = useMemo(() => buildLabels(lang), [lang]);

  const metaMap = tab === "lyrics" ? lrcMeta : coverMeta;
  const setMeta = tab === "lyrics" ? setLrcMeta : setCoverMeta;

  const folderScopes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of tracks) {
      if (item.folderPath && !seen.has(item.folderPath)) {
        seen.set(item.folderPath, item.folderPath.split(/[\\/]/).filter(Boolean).pop() || item.folderPath);
      }
    }
    return Array.from(seen.entries());
  }, [tracks]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tracks.filter((item) => {
      if (scope !== ALL_SCOPE && item.folderPath !== scope) return false;
      if (needle && !`${item.title} ${item.artist} ${item.album}`.toLowerCase().includes(needle)) return false;
      if (statusFilter !== "all") {
        const status = metaMap[item.id]?.status ?? "idle";
        if (status !== statusFilter) return false;
      }
      return true;
    });
  }, [tracks, scope, query, statusFilter, metaMap]);

  const counts = useMemo(() => {
    const values = Object.values(metaMap);
    return {
      done: values.filter((v) => v.status === "done").length,
      "not-found": values.filter((v) => v.status === "not-found").length,
      instrumental: values.filter((v) => v.status === "instrumental").length,
      error: values.filter((v) => v.status === "error").length,
      skipped: values.filter((v) => v.status === "skipped").length,
      idle: Math.max(0, filtered.length - values.filter((v) => v.status !== "idle").length),
    } as Record<StatusFilter, number>;
  }, [metaMap, filtered.length]);

  const libraryStats = useMemo(
    () => ({
      total: tracks.length,
      realLyrics: tracks.filter((item) => !item.isFallbackLyric && item.lyrics.length > 1).length,
      realCovers: tracks.filter((item) => !item.isFallbackCover).length,
      missing: tracks.filter(
        (item) =>
          (item.isFallbackLyric || item.lyrics.length <= 1) &&
          item.isFallbackCover,
      ).length,
    }),
    [tracks],
  );

  /* ——— selection ——— */
  const toggleSel = useCallback((id: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => setSelected(new Set(filtered.map((item) => item.id))), [filtered]);
  const selectNone = useCallback(() => setSelected(new Set()), []);
  const selectInvert = useCallback(
    () => setSelected(new Set(filtered.filter((item) => !selected.has(item.id)).map((item) => item.id))),
    [filtered, selected],
  );

  /* ——— file saving helpers ——— */
  const saveLyricsFile = useCallback(async (track: Track, content: string): Promise<boolean> => {
    const opts = optionsRef.current;
    if (!opts.saveToDisk) return false;
    if (isDesktopRuntime() && track.sourcePath) {
      try {
        await saveLrcFile(track.sourcePath, content);
        return true;
      } catch {
        /* fall through to the browser download */
      }
    }
    browserDownload(content, `${sanitizeFilename(`${track.artist} - ${track.title}`)}.lrc`, "text/plain;charset=utf-8");
    await sleep(450); // browsers throttle bursts of programmatic downloads
    return true;
  }, []);

  const saveCoverFile = useCallback(async (track: Track, bytes: Uint8Array, ext: string): Promise<boolean> => {
    const opts = optionsRef.current;
    if (!opts.saveToDisk) return false;
    if (isDesktopRuntime() && track.sourcePath) {
      try {
        await saveCoverImage(track.sourcePath, bytes, ext);
        return true;
      } catch {
        /* fall through to the browser download */
      }
    }
    browserDownload(bytes, `${sanitizeFilename(`${track.artist} - ${track.title}`)}.${ext}`, `image/${ext}`);
    await sleep(450);
    return true;
  }, []);

  /* ——— per-track processors ——— */

  const processLyricsTrack = useCallback(
    async (item: Track) => {
      const opts = optionsRef.current;
      setLrcMeta((current) => ({
        ...current,
        [item.id]: { ...(current[item.id] ?? { status: "idle" }), status: "searching" },
      }));
      try {
        const result = await fetchLrclibLyrics({
          trackName: item.title,
          artistName: item.artist,
          albumName: item.album,
          duration: item.duration,
        });
        if (!result) {
          setLrcMeta((current) => ({ ...current, [item.id]: { status: "not-found" } }));
          return;
        }
        if (result.syncedLyrics) {
          const savedToDisk = await saveLyricsFile(item, result.syncedLyrics);
          if (opts.autoApply) handlersRef.current.onLyricsFetched(item.id, parseLrc(result.syncedLyrics), "LRCLIB.net");
          setLrcMeta((current) => ({
            ...current,
            [item.id]: { status: "done", kind: "synced", applied: opts.autoApply, savedToDisk },
          }));
          return;
        }
        if (result.instrumental && !result.plainLyrics) {
          setLrcMeta((current) => ({ ...current, [item.id]: { status: "instrumental" } }));
          return;
        }
        if (result.plainLyrics) {
          const savedToDisk = await saveLyricsFile(item, result.plainLyrics);
          setLrcMeta((current) => ({
            ...current,
            [item.id]: { status: "done", kind: "plain", applied: false, savedToDisk },
          }));
          return;
        }
        setLrcMeta((current) => ({ ...current, [item.id]: { status: "not-found" } }));
      } catch {
        setLrcMeta((current) => ({ ...current, [item.id]: { status: "error" } }));
      }
    },
    [saveLyricsFile],
  );

  const processCoverTrack = useCallback(
    async (item: Track) => {
      const opts = optionsRef.current;
      setCoverMeta((current) => ({
        ...current,
        [item.id]: { ...(current[item.id] ?? { status: "idle" }), status: "searching" },
      }));
      try {
        const url = await findCoverArtUrl(item.artist, item.title);
        if (!url) {
          setCoverMeta((current) => ({ ...current, [item.id]: { status: "not-found" } }));
          return;
        }
        const downloaded = await downloadCoverArt(url);
        if (!downloaded) {
          setCoverMeta((current) => ({ ...current, [item.id]: { status: "error" } }));
          return;
        }
        const savedToDisk = await saveCoverFile(item, downloaded.bytes, downloaded.ext);
        let applied = false;
        if (opts.autoApply) {
          const objectUrl = createManagedBlobUrl(
            new Blob([downloaded.bytes as unknown as BlobPart], { type: `image/${downloaded.ext}` }),
          );
          handlersRef.current.onCoverFetched(item.id, objectUrl);
          applied = true;
        }
        setCoverMeta((current) => ({
          ...current,
          [item.id]: { status: "done", applied, savedToDisk },
        }));
      } catch {
        setCoverMeta((current) => ({ ...current, [item.id]: { status: "error" } }));
      }
    },
    [saveCoverFile],
  );

  /* ——— batch runner ——— */

  const startBatch = useCallback(
    async (which: DlTab, itemsOverride?: Track[]) => {
      if (runningTab !== null) return;
      const source = itemsOverride ?? (selected.size ? filtered.filter((item) => selected.has(item.id)) : filtered);
      if (!source.length) return;
      const opts = optionsRef.current;
      const queue: Track[] = [];
      for (const item of source) {
        const alreadyHas =
          which === "lyrics"
            ? !item.isFallbackLyric && item.lyrics.length > 1
            : !item.isFallbackCover;
        if (opts.skipExisting && alreadyHas) {
          const setter = which === "lyrics" ? setLrcMeta : setCoverMeta;
          setter((current) => ({ ...current, [item.id]: { status: "skipped" } }));
          continue;
        }
        queue.push(item);
      }
      if (!queue.length) return;

      stopRef.current = false;
      setRunningTab(which);
      const process = which === "lyrics" ? processLyricsTrack : processCoverTrack;
      const concurrency = Math.min(which === "lyrics" ? LYRICS_CONCURRENCY : COVER_CONCURRENCY, queue.length);
      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length) {
          if (stopRef.current) return;
          const item = queue[cursor++];
          await process(item);
        }
      };
      await Promise.all(Array.from({ length: concurrency }, worker));
      setRunningTab(null);
    },
    [runningTab, selected, filtered, processLyricsTrack, processCoverTrack],
  );

  const stopBatch = useCallback(() => {
    stopRef.current = true;
    setRunningTab(null);
  }, []);

  const retryFailed = useCallback(() => {
    const failed = filtered.filter((item) => {
      const status = metaMap[item.id]?.status;
      return status === "error" || status === "not-found";
    });
    if (failed.length) void startBatch(tab, failed);
  }, [filtered, metaMap, startBatch, tab]);

  const clearStatuses = useCallback(() => {
    setMeta({});
  }, [setMeta]);

  const runConnectionCheck = useCallback(async () => {
    setConn("checking");
    const ok = await checkLrclibConnection();
    setConn(ok ? "ok" : "fail");
    window.setTimeout(() => setConn("idle"), 4000);
  }, []);

  const fetchOne = useCallback(
    (id: number) => {
      const item = tracksRef.current.find((track) => track.id === id);
      if (!item) return;
      void startBatch(tab, [item]);
    },
    [startBatch, tab],
  );

  const openManual = useCallback((track: Track) => {
    if (tab === "lyrics") setManualLyricsTrack(track);
    else setManualCoverTrack(track);
  }, [tab]);

  const playTrack = useCallback((id: number) => onPlayTrack(id), [onPlayTrack]);

  /* ——— derived UI numbers ——— */
  const processedCount = useMemo(
    () => Object.values(metaMap).filter((meta) => meta.status !== "idle").length,
    [metaMap],
  );
  const progressPct = Math.min(100, Math.round((processedCount / Math.max(1, filtered.length)) * 100));
  const isRunning = runningTab !== null;

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (counts.done) parts.push(`${counts.done} ✓`);
    if (counts["not-found"]) parts.push(`${counts["not-found"]} ✗`);
    if (counts.instrumental) parts.push(`${counts.instrumental} ♪`);
    if (counts.error) parts.push(`${counts.error} !`);
    if (counts.skipped) parts.push(`${counts.skipped} »`);
    return parts.length
      ? lang === "fa"
        ? `نتیجه: ${parts.join(" · ")}`
        : `${parts.join(" · ")}`
      : lang === "fa"
        ? "آماده دانلود"
        : lang === "tr"
          ? "İndirmeye hazır"
          : lang === "ru"
            ? "Готов к загрузке"
            : "Ready to download";
  }, [counts, lang]);

  const scopeLabel =
    scope === ALL_SCOPE
      ? lang === "fa"
        ? "همه کتابخانه"
        : lang === "tr"
          ? "Tüm kütüphane"
          : lang === "ru"
            ? "Вся библиотека"
            : "Whole library"
      : folderScopes.find(([path]) => path === scope)?.[1] || scope;

  const localText = {
    title: lang === "fa" ? "مرکز دانلود" : lang === "tr" ? "İndirme Merkezi" : lang === "ru" ? "Центр загрузок" : "Download Center",
    subtitle:
      lang === "fa"
        ? "متن ترانه و کاور آلبوم، همه در یک کارگاه سازمان‌یافته"
        : lang === "tr"
          ? "Şarkı sözleri ve albüm kapakları tek bir düzenli çalışma alanında"
          : lang === "ru"
            ? "Тексты песен и обложки альбомов — в одном упорядоченном рабочем пространстве"
            : "Lyrics & cover art, organized in one advanced workspace",
    tabLyrics: lang === "fa" ? "متن ترانه (LRC)" : lang === "tr" ? "Şarkı Sözü (LRC)" : lang === "ru" ? "Текст песни (LRC)" : "Lyrics (LRC)",
    tabCover: lang === "fa" ? "کاور آلبوم" : lang === "tr" ? "Albüm Kapağı" : lang === "ru" ? "Обложка альбома" : "Cover Art",
    statTotal: lang === "fa" ? "آهنگ" : lang === "tr" ? "şarkı" : lang === "ru" ? "треков" : "tracks",
    statLyrics: lang === "fa" ? "لیریک واقعی" : lang === "tr" ? "gerçek söz" : lang === "ru" ? "с текстом" : "real lyrics",
    statCovers: lang === "fa" ? "کاور واقعی" : lang === "tr" ? "gerçek kapak" : lang === "ru" ? "с обложкой" : "real covers",
    statMissing: lang === "fa" ? "فاقد هر دو" : lang === "tr" ? "ikisi de yok" : lang === "ru" ? "без обоих" : "missing both",
    scopeAll: lang === "fa" ? "همه کتابخانه" : lang === "tr" ? "Tüm kütüphane" : lang === "ru" ? "Вся библиотека" : "Whole library",
    searchPh: lang === "fa" ? "جست‌وجوی عنوان / خواننده / آلبوم…" : lang === "tr" ? "Başlık / sanatçı / albüm ara…" : lang === "ru" ? "Поиск по названию / исполнителю / альбому…" : "Search title / artist / album…",
    selectedLabel: (n: number) =>
      lang === "fa" ? `${n} انتخاب شده` : lang === "tr" ? `${n} seçili` : lang === "ru" ? `${n} выбрано` : `${n} selected`,
    all: lang === "fa" ? "همه" : lang === "tr" ? "Tümü" : lang === "ru" ? "Все" : "All",
    none: lang === "fa" ? "هیچ" : lang === "tr" ? "Hiçbiri" : lang === "ru" ? "Ничего" : "None",
    invert: lang === "fa" ? "معکوس" : lang === "tr" ? "Ters" : lang === "ru" ? "Инвертировать" : "Invert",
    filterAll: lang === "fa" ? "همه" : lang === "tr" ? "Hepsi" : lang === "ru" ? "Все" : "All",
    filterIdle: lang === "fa" ? "جدید" : lang === "tr" ? "yeni" : lang === "ru" ? "свежие" : "fresh",
    start: lang === "fa" ? "شروع دانلود گروهی" : lang === "tr" ? "Toplu indirmeyi başlat" : lang === "ru" ? "Начать пакетную загрузку" : "Start batch download",
    restart: lang === "fa" ? "شروع دوباره" : lang === "tr" ? "Yeniden başlat" : lang === "ru" ? "Заново" : "Restart",
    stop: lang === "fa" ? "توقف" : lang === "tr" ? "Durdur" : lang === "ru" ? "Стоп" : "Stop",
    retry: lang === "fa" ? "تلاش مجدد ناموفق‌ها" : lang === "tr" ? "Başarısızları tekrarla" : lang === "ru" ? "Повторить неудачные" : "Retry failed",
    clear: lang === "fa" ? "پاک کردن وضعیت‌ها" : lang === "tr" ? "Durumları temizle" : lang === "ru" ? "Очистить статусы" : "Clear statuses",
    options: lang === "fa" ? "تنظیمات دانلود" : lang === "tr" ? "İndirme ayarları" : lang === "ru" ? "Параметры загрузки" : "Download options",
    optSkip: lang === "fa" ? "رد کردن موارد موجود" : lang === "tr" ? "Olanları atla" : lang === "ru" ? "Пропускать существующие" : "Skip existing",
    optSkipHint:
      lang === "fa"
        ? tab === "lyrics"
          ? "آهنگ‌هایی که از قبل لیریک واقعی دارند دانلود نمی‌شوند"
          : "آهنگ‌هایی که کاور واقعی دارند دانلود نمی‌شوند"
        : tab === "lyrics"
          ? lang === "ru"
            ? "Треки, у которых уже есть реальный текст, не скачиваются"
            : "Tracks that already have real lyrics are skipped"
          : lang === "ru"
            ? "Треки, у которых уже есть реальная обложка, не скачиваются"
            : "Tracks that already have real artwork are skipped",
    optApply: lang === "fa" ? "اعمال خودکار در پخش‌کننده" : lang === "tr" ? "Oynatıcıya otomatik uygula" : lang === "ru" ? "Автоматически применять в плеере" : "Auto-apply to player",
    optApplyHint: lang === "fa" ? "نتیجه بلافاصله در کتابخانه و صفحه پخش دیده می‌شود" : lang === "tr" ? "Sonuç anında kitaplıkta görünür" : lang === "ru" ? "Результаты сразу видны в библиотеке и в плеере" : "Results appear instantly in the library and player",
    optSave: lang === "fa" ? "ذخیره فایل روی دیسک" : lang === "tr" ? "Dosyayı diske kaydet" : lang === "ru" ? "Сохранять файлы на диск" : "Save files to disk",
    optSaveHint:
      isDesktopRuntime()
        ? lang === "fa"
          ? "کنار همان فایل صوتی ذخیره می‌شود (Song.lrc / Song.jpg)"
          : lang === "ru"
            ? "Сохраняется рядом с аудиофайлом (Song.lrc / Song.jpg)"
            : "Saved next to the audio file (Song.lrc / Song.jpg)"
        : lang === "fa"
          ? "در این حالت وب، فایل‌ها با دانلود مرورگر ذخیره می‌شوند"
          : lang === "ru"
            ? "В веб-версии файлы скачиваются браузером"
            : "In this web build, files arrive as browser downloads",
    emptyLibrary: lang === "fa" ? "کتابخانه خالی است" : lang === "tr" ? "Kitaplık boş" : lang === "ru" ? "Библиотека пуста" : "The library is empty",
    emptyLibraryHint:
      lang === "fa"
        ? "از بخش کتابخانه چند آهنگ اضافه کن تا دانلود لیریک و کاور را اینجا شروع کنی"
        : lang === "tr"
          ? "İndirmeye başlamak için kitaplığa şarkı ekleyin"
          : lang === "ru"
            ? "Добавьте несколько треков на странице «Библиотека», чтобы начать загрузку текстов и обложек"
            : "Import some tracks from the Library page to start downloading lyrics and covers",
    emptyFiltered: lang === "fa" ? "با این فیلترها آهنگی پیدا نشد" : lang === "tr" ? "Bu filtrelerle şarkı yok" : lang === "ru" ? "С этими фильтрами треков нет" : "No tracks match these filters",
    healthCheck: lang === "fa" ? "تست اتصال LRCLIB" : lang === "tr" ? "LRCLIB bağlantı testi" : lang === "ru" ? "Проверка соединения с LRCLIB" : "LRCLIB connection check",
    connOk: lang === "fa" ? "متصل" : lang === "tr" ? "bağlı" : lang === "ru" ? "на связи" : "online",
    connFail: lang === "fa" ? "قطع" : lang === "tr" ? "bağlantı yok" : lang === "ru" ? "нет связи" : "offline",
    tracksUnit: (n: number) =>
      lang === "fa"
        ? `${n} آهنگ`
        : lang === "tr"
          ? `${n} şarkı`
          : lang === "ru"
            ? `${n} ${n % 10 === 1 && n % 100 !== 11 ? "трек" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "трека" : "треков"}`
            : `${n} track${n === 1 ? "" : "s"}`,
  };

  return (
    <div className="dl-center">
      {/* ——— hero ——— */}
      <div className="dl-hero">
        <div className="dl-hero-icon">
          <Download size={22} strokeWidth={1.75} />
        </div>
        <div className="dl-hero-text">
          <h2>{localText.title}</h2>
          <p>{localText.subtitle}</p>
          <div className="dl-providers" dir="ltr">
            <span>
              <Sparkles size={11} /> LRCLIB.net
            </span>
            <span>
              <Sparkles size={11} /> iTunes
            </span>
            <span>
              <Sparkles size={11} /> Deezer
            </span>
          </div>
        </div>
        <button type="button" className={`dl-ghost dl-conn ${conn === "ok" ? "ok" : conn === "fail" ? "fail" : ""}`} onClick={() => void runConnectionCheck()}>
          {conn === "checking" ? <Loader2 size={14} className="dl-spin" /> : conn === "ok" ? <CheckCircle2 size={14} /> : conn === "fail" ? <AlertCircle size={14} /> : <Sparkles size={14} />}
          {conn === "ok" ? localText.connOk : conn === "fail" ? localText.connFail : localText.healthCheck}
        </button>
      </div>

      {/* ——— library stats ——— */}
      <div className="dl-stats">
        <StatCard icon={Music} tone="accent" value={libraryStats.total} label={localText.statTotal} />
        <StatCard icon={FileText} tone="ok" value={libraryStats.realLyrics} label={localText.statLyrics} />
        <StatCard icon={Disc3} tone="info" value={libraryStats.realCovers} label={localText.statCovers} />
        <StatCard icon={AlertCircle} tone="warn" value={libraryStats.missing} label={localText.statMissing} />
      </div>

      {tracks.length === 0 ? (
        <div className="dl-empty">
          <Music size={34} strokeWidth={1.5} />
          <strong>{localText.emptyLibrary}</strong>
          <span>{localText.emptyLibraryHint}</span>
        </div>
      ) : (
        <>
          {/* ——— tabs ——— */}
          <div className="dl-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "lyrics"} className={tab === "lyrics" ? "active" : ""} onClick={() => setTab("lyrics")}>
              <FileText size={16} />
              {localText.tabLyrics}
              {counts.done && tab === "lyrics" ? <b>{counts.done}</b> : null}
            </button>
            <button type="button" role="tab" aria-selected={tab === "cover"} className={tab === "cover" ? "active" : ""} onClick={() => setTab("cover")}>
              <ImageIcon size={16} />
              {localText.tabCover}
              {counts.done && tab === "cover" ? <b>{counts.done}</b> : null}
            </button>
          </div>

          {/* ——— toolbar ——— */}
          <div className="dl-toolbar">
            <div className="dl-scope-wrap" ref={scopeMenuRef}>
              <button type="button" className="dl-scope-btn" onClick={() => setScopeOpen((v) => !v)} aria-expanded={scopeOpen}>
                <span>{scopeLabel}</span>
                <ChevronLeft size={14} style={{ transform: scopeOpen ? "rotate(-90deg)" : "rotate(180deg)" }} />
              </button>
              {scopeOpen ? (
                <div className="dl-scope-menu" role="listbox">
                  <button type="button" className={scope === ALL_SCOPE ? "active" : ""} onClick={() => { setScope(ALL_SCOPE); setScopeOpen(false); }}>
                    {localText.scopeAll}
                  </button>
                  {folderScopes.map(([path, name]) => (
                    <button key={path} type="button" className={scope === path ? "active" : ""} onClick={() => { setScope(path); setScopeOpen(false); }}>
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="dl-search">
              <Search size={14} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={localText.searchPh} spellCheck={false} />
              {query ? (
                <button type="button" onClick={() => setQuery("")} aria-label={labels.close}>
                  <X size={12} />
                </button>
              ) : null}
            </label>

            <div className="dl-selbox">
              <button type="button" className="dl-mini" onClick={selectAll}>{localText.all}</button>
              <button type="button" className="dl-mini" onClick={selectNone}>{localText.none}</button>
              <button type="button" className="dl-mini" onClick={selectInvert}>{localText.invert}</button>
              <em dir="auto">{localText.selectedLabel(selected.size)}</em>
            </div>

            <div className="dl-chips" role="group" aria-label="status filter">
              {(["all", "done", "not-found", "instrumental", "error", "skipped", "idle"] as StatusFilter[]).map((key) => (
                <button key={key} type="button" className={`dl-chip f-${key} ${statusFilter === key ? "active" : ""}`} onClick={() => setStatusFilter(key)}>
                  {key === "all" ? localText.filterAll : key === "idle" ? localText.filterIdle : labels.status[key]}
                  <b>{key === "all" ? filtered.length : counts[key]}</b>
                </button>
              ))}
            </div>

            <div className="dl-scope-wrap" ref={optionsMenuRef}>
              <button type="button" className={`dl-scope-btn ${optionsOpen ? "open" : ""}`} onClick={() => setOptionsOpen((v) => !v)} aria-expanded={optionsOpen} aria-label={localText.options}>
                <Settings size={14} />
              </button>
              {optionsOpen ? (
                <div className="dl-scope-menu dl-options-menu">
                  <ToggleRow
                    label={localText.optSkip}
                    hint={localText.optSkipHint}
                    checked={options.skipExisting}
                    onChange={() => setOptions((v) => ({ ...v, skipExisting: !v.skipExisting }))}
                  />
                  <ToggleRow
                    label={localText.optApply}
                    hint={localText.optApplyHint}
                    checked={options.autoApply}
                    onChange={() => setOptions((v) => ({ ...v, autoApply: !v.autoApply }))}
                  />
                  <ToggleRow
                    label={localText.optSave}
                    hint={localText.optSaveHint}
                    checked={options.saveToDisk}
                    onChange={() => setOptions((v) => ({ ...v, saveToDisk: !v.saveToDisk }))}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {/* ——— action bar ——— */}
          <div className="dl-actionbar">
            {isRunning ? (
              <button type="button" className="dl-stop" onClick={stopBatch}>
                <X size={15} />
                {localText.stop}
              </button>
            ) : (
              <button type="button" className="dl-primary dl-start" onClick={() => void startBatch(tab)} disabled={!filtered.length}>
                <Download size={15} />
                {processedCount > 0 ? localText.restart : localText.start}
              </button>
            )}
            <button type="button" className="dl-ghost" onClick={retryFailed} disabled={isRunning}>
              <RefreshCw size={14} />
              {localText.retry}
            </button>
            <button type="button" className="dl-ghost" onClick={clearStatuses} disabled={isRunning}>
              <X size={14} />
              {localText.clear}
            </button>
            <span className="dl-count" dir="auto">
              {localText.tracksUnit(filtered.length)}
              {selected.size ? ` · ${localText.selectedLabel(selected.size)}` : ""}
            </span>
            <div className="dl-progress" aria-hidden>
              <div className="dl-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="dl-summary" dir="auto" aria-live="polite">
              {isRunning ? <Loader2 size={13} className="dl-spin" /> : null}
              {summary}
            </span>
          </div>

          {/* ——— track list ——— */}
          <div className="dl-list" role="list">
            {filtered.length === 0 ? (
              <div className="dl-empty small">
                <Info size={26} strokeWidth={1.5} />
                <span>{localText.emptyFiltered}</span>
              </div>
            ) : (
              filtered.map((item) => (
                <DlRow
                  key={item.id}
                  track={item}
                  meta={metaMap[item.id]}
                  selected={selected.has(item.id)}
                  tab={tab}
                  labels={labels}
                  onToggle={toggleSel}
                  onFetch={fetchOne}
                  onManual={openManual}
                  onPlay={playTrack}
                />
              ))
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {manualLyricsTrack ? (
          <LyricsSearchModal
            track={manualLyricsTrack}
            lang={lang}
            labels={labels}
            close={() => setManualLyricsTrack(null)}
            onLyricsFetched={handlersRef.current.onLyricsFetched}
            saveLyricsFile={saveLyricsFile}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {manualCoverTrack ? (
          <CoverSearchModal
            track={manualCoverTrack}
            labels={labels}
            close={() => setManualCoverTrack(null)}
            onCoverFetched={handlersRef.current.onCoverFetched}
            saveCoverFile={saveCoverFile}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
