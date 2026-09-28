// ── NOBODY Cinema · Download Center ──────────────────────────────────────────
// The Smart Fetch panel, rebuilt as the full classic Download Center:
//   • Lyrics / Covers tabs (engine mode)
//   • stat cards (total / with / missing for the active tab)
//   • folder scope (All + managed folders with track counts)
//   • text search + per-row checkboxes with all / none / invert
//   • live status filter chips (idle/queued/searching/done/not-found/
//     instrumental/error/skipped)
//   • options popover — skipExisting / autoApply / saveToDisk, persisted by
//     the engine via setOptions
//   • start / stop / retry-failed / clear + progress bar + summary + cancel,
//     with the minimized pill that keeps fetching while you browse
//   • per-row fetch-now / retry / manual search / save lyrics / save cover /
//     save audio
//   • manual LRCLIB lyric picker (editable query, badges, preview, apply, save
//     file) and manual iTunes+Deezer cover picker (grid, preview, apply, save)
//   • LRCLIB health check + empty-state guidance
// ALL fetching flows through lib/smartFetch.ts — zero endpoints here (engine
// parity with the classic src/DownloadCenter.tsx without duplicating it).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock,
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  MicVocal,
  Minus,
  Music,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";

import {
  applyCoverCandidate,
  applyLyricsCandidate,
  cancelSmartFetch,
  lrclibHealthCheck,
  retryItem,
  saveAudioFileFor,
  searchCoverCandidates,
  searchLyricsCandidates,
  startSmartFetch,
  useSmartFetch,
  type FetchMode,
  type SmartFetchRunOpts,
} from "../lib/smartFetch";
import { useFolderManager } from "../lib/folderManager";
import { SelectMenu } from "./SelectMenu";
import { CoverArt } from "./CoverArt";
import { db } from "../lib/db";
import { getBridge, sourcePathFromSourceUrl } from "../lib/desktopBridge";
import { saveCoverImage, saveLrcFile } from "../../desktopLibrary";
import { downloadCoverArt, type CoverCandidate } from "../../coverart";
import type { LrclibResult } from "../../lrclib";
import { useLibrary } from "../store/library";
import { uiApi } from "../store/ui";
import { useT } from "../lib/useT";
import { fmtTime } from "../lib/utils";
import { cn } from "../utils/cn";
import type { FetchStatus, Track } from "../types";

/* ── row-status model (classic DlStatus mapped onto engine FetchStatus) ───── */

type RowStatus =
  | "idle"
  | "queued"
  | "searching"
  | "done"
  | "notfound"
  | "instrumental"
  | "error"
  | "skipped";
type StatusFilter = "all" | RowStatus;

const ROW_STATUSES: StatusFilter[] = [
  "all",
  "queued",
  "searching",
  "done",
  "notfound",
  "instrumental",
  "error",
  "skipped",
  "idle",
];

const STATUS_ICON: Record<RowStatus, any> = {
  idle: CircleDashed,
  queued: Clock,
  searching: Loader2,
  done: Check,
  notfound: AlertCircle,
  instrumental: MicVocal,
  error: AlertTriangle,
  skipped: Minus,
};

function statusTone(s: RowStatus): "ok" | "warn" | "busy" | undefined {
  if (s === "done") return "ok";
  if (s === "error") return "warn";
  if (s === "searching" || s === "queued") return "busy";
  return undefined;
}

const hasRealLyrics = (tr: Track) => Boolean(tr.syncedLyrics?.length || tr.plainLyrics);
const hasRealCover = (tr: Track) => Boolean(tr.hasCover && !tr.isPlaceholderCover);

/* ── tiny local helpers (file saving fallbacks, previews) ─────────────────── */

const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

const fmtVars = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ""));

function sanitizeFilename(name: string): string {
  const clean = (name || "nobody")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return clean || "nobody";
}

const fileBase = (tr: Track) =>
  sanitizeFilename(tr.artist && tr.artist !== "Unknown Artist" ? `${tr.artist} - ${tr.title}` : tr.title);

function audioPathOf(trackId: string): string | null {
  try {
    return sourcePathFromSourceUrl(getBridge()?.resolveSource(trackId) ?? null);
  } catch {
    return null;
  }
}

/** Pure-web fallback for explicit saves: blob + anchor download. */
async function anchorDownload(data: Blob | string, filename: string, mime = "application/octet-stream") {
  try {
    const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFilename(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    await sleep(450); // browsers throttle bursts of programmatic downloads
  } catch {
    /* best-effort */
  }
}

/** Serialize parsed LRC lines back to .lrc text for sidecar / export saves. */
function lrcTextFromLines(lines: { t: number; text: string }[]): string {
  return lines
    .map((l) => {
      const m = Math.floor(l.t / 60);
      const s = Math.floor(l.t % 60);
      const cs = Math.round((l.t - Math.floor(l.t)) * 100);
      return `[${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}]${l.text}`;
    })
    .join("\n");
}

/** First N lines of raw LRC with timestamps stripped — candidate preview. */
function previewOf(raw: string, max = 8): string {
  return raw
    .split(/\r?\n/)
    .slice(0, max)
    .map((l) => l.replace(/^\s*\[\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?\]\s*/, "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Explicit "save lyrics file" (sidecar next to audio / anchor download). */
async function saveLyricsFileFor(track: Track, content: string, synced: boolean): Promise<boolean> {
  if (!content) return false;
  const srcPath = audioPathOf(track.id);
  if (srcPath) {
    try {
      await saveLrcFile(srcPath, content);
      return true;
    } catch {
      /* read-only folder → fall through to the browser download */
    }
  }
  await anchorDownload(content, `${fileBase(track)}.${synced ? "lrc" : "txt"}`, "text/plain; charset=utf-8");
  return true;
}

/** Explicit "save cover file" from a candidate URL (download → sidecar/anchor). */
async function saveCoverFileFor(track: Track, url: string): Promise<boolean> {
  const art = await downloadCoverArt(url).catch(() => null);
  if (!art || art.bytes.byteLength <= 1000) return false;
  const srcPath = audioPathOf(track.id);
  if (srcPath) {
    try {
      await saveCoverImage(srcPath, art.bytes, art.ext);
      return true;
    } catch {
      /* fall through */
    }
  }
  const type = art.ext === "png" ? "image/png" : art.ext === "webp" ? "image/webp" : "image/jpeg";
  await anchorDownload(
    new Blob([art.bytes as unknown as BlobPart], { type }),
    `${fileBase(track)}.${art.ext}`,
    type,
  );
  return true;
}

/** Explicit "save the CURRENT cover" (from the IDB blob store) to disk. */
async function saveCurrentCoverFor(track: Track): Promise<boolean> {
  const blob = await db.getCover(track.id).catch(() => undefined);
  if (!blob) return false;
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const srcPath = audioPathOf(track.id);
  if (srcPath) {
    try {
      await saveCoverImage(srcPath, new Uint8Array(await blob.arrayBuffer()), ext);
      return true;
    } catch {
      /* fall through */
    }
  }
  await anchorDownload(blob, `${fileBase(track)}.${ext}`, blob.type || "image/jpeg");
  return true;
}

/* ── track row ─────────────────────────────────────────────────────────────── */

interface RowLabels {
  select: string;
  fetch: string;
  retry: string;
  manual: string;
  saveLyrics: string;
  saveCover: string;
  saveAudio: string;
  plainTag: string;
  status: Record<RowStatus, string>;
}

type RowProps = {
  track: Track;
  status: RowStatus;
  detail?: string;
  selected: boolean;
  mode: FetchMode;
  running: boolean;
  saving: boolean;
  labels: RowLabels;
  onToggle: (id: string) => void;
  onFetch: (track: Track) => void;
  onManual: (track: Track) => void;
  onSave: (track: Track, kind: "lyrics" | "cover" | "audio") => void;
};

const DlRow = memo(function DlRow({
  track,
  status,
  detail,
  selected,
  mode,
  running,
  saving,
  labels,
  onToggle,
  onFetch,
  onManual,
  onSave,
}: RowProps) {
  const Icon = STATUS_ICON[status];
  const busy = status === "searching" || status === "queued";
  const tone = statusTone(status);

  return (
    <div role="listitem" data-sel={selected} className="nc-dl-row flex items-center gap-2.5 px-2.5 py-2">
      <button
        type="button"
        className="nc-dl-cb"
        data-on={selected}
        onClick={() => onToggle(track.id)}
        aria-pressed={selected}
        aria-label={labels.select}
      >
        {selected && <Check size={11} strokeWidth={3} />}
      </button>

      <CoverArt trackId={track.id} rounded="rounded-lg" className="h-9 w-9 shrink-0" alt={track.title} />

      <div className="min-w-0 flex-1">
        <div dir="auto" className="truncate text-[12px] font-medium leading-tight">
          {track.title}
        </div>
        <div dir="auto" className="t-faint truncate text-[10.5px] leading-tight">
          {track.artist}
          {track.album && track.album !== "Unknown Album" ? ` — ${track.album}` : ""}
        </div>
      </div>

      <span dir="ltr" className="tnum t-faint hidden shrink-0 text-[10.5px] sm:inline">
        {fmtTime(track.duration)}
      </span>

      <span className="nc-dl-status" data-tone={tone}>
        <Icon size={12} className={cn(status === "searching" && "nc-spin")} />
        <span className="hidden md:inline">{labels.status[status]}</span>
        {status === "done" && detail === "plain" && <em className="nc-dl-badge">{labels.plainTag}</em>}
      </span>

      <div className="flex shrink-0 items-center gap-0.5">
        {busy ? (
          <span className="nc-dl-iconbtn" aria-hidden>
            <Loader2 size={13} className="nc-spin" />
          </span>
        ) : (
          <button
            type="button"
            className="nc-dl-iconbtn"
            onClick={() => onFetch(track)}
            disabled={running}
            title={labels.fetch}
            aria-label={labels.fetch}
          >
            <Download size={13} />
          </button>
        )}
        <button type="button" className="nc-dl-iconbtn" onClick={() => onManual(track)} title={labels.manual} aria-label={labels.manual}>
          <Search size={13} />
        </button>
        {(status === "error" || status === "notfound") && (
          <button
            type="button"
            className="nc-dl-iconbtn"
            onClick={() => onFetch(track)}
            disabled={running}
            title={labels.retry}
            aria-label={labels.retry}
          >
            <RotateCcw size={13} />
          </button>
        )}
        {mode === "lyrics" && hasRealLyrics(track) && (
          <button
            type="button"
            className="nc-dl-iconbtn"
            onClick={() => onSave(track, "lyrics")}
            disabled={saving}
            title={labels.saveLyrics}
            aria-label={labels.saveLyrics}
          >
            {saving ? <Loader2 size={13} className="nc-spin" /> : <FileText size={13} />}
          </button>
        )}
        {mode === "covers" && hasRealCover(track) && (
          <button
            type="button"
            className="nc-dl-iconbtn"
            onClick={() => onSave(track, "cover")}
            disabled={saving}
            title={labels.saveCover}
            aria-label={labels.saveCover}
          >
            {saving ? <Loader2 size={13} className="nc-spin" /> : <ImageIcon size={13} />}
          </button>
        )}
        <button
          type="button"
          className="nc-dl-iconbtn"
          onClick={() => onSave(track, "audio")}
          disabled={saving}
          title={labels.saveAudio}
          aria-label={labels.saveAudio}
        >
          {saving ? <Loader2 size={13} className="nc-spin" /> : <Save size={13} />}
        </button>
      </div>
    </div>
  );
});

/* ── modal shell (shared glass card for both pickers) ─────────────────────── */

function ModalShell({
  title,
  sub,
  icon: Icon,
  close,
  wide,
  children,
}: {
  title: string;
  sub: string;
  icon: any;
  close: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  // Escape closes the picker (captured before the app-level shortcut chain)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [close]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/55"
        onClick={close}
      />
      <motion.div
        initial={{ scale: 0.95, y: 18, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 12, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className={cn(
          "glass relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-2xl",
          wide ? "max-w-[680px]" : "max-w-[540px]",
        )}
        style={{ borderColor: "var(--line2)", boxShadow: "var(--shadow)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="t-accent mt-0.5">
              <Icon size={17} />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-lg italic leading-tight">{title}</h3>
              <p dir="auto" className="t-faint truncate text-[11px]">
                {sub}
              </p>
            </div>
          </div>
          <button type="button" onClick={close} aria-label="close" className="t-mut rounded-full p-2 transition-colors hover:bg-[var(--card2)]">
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
      </motion.div>
    </div>
  );
}

/* ── manual lyrics picker (LRCLIB) ────────────────────────────────────────── */

function LyricsPickerModal({
  track,
  close,
  onApplied,
}: {
  track: Track;
  close: () => void;
  onApplied: (trackId: string, plain: boolean) => void;
}) {
  const t = useT();
  const [qTitle, setQTitle] = useState(track.title);
  const [qArtist, setQArtist] = useState(track.artist);
  const [qAlbum, setQAlbum] = useState(track.album && track.album !== "Unknown Album" ? track.album : "");
  const [qDur, setQDur] = useState(track.duration > 0 ? String(Math.round(track.duration)) : "");
  const [cands, setCands] = useState<LrclibResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<"applied" | "saved" | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setCands(null);
    setOpenId(null);
    try {
      const found = await searchLyricsCandidates({
        track_name: qTitle.trim(),
        artist_name: qArtist.trim(),
        album_name: qAlbum.trim() || undefined,
        duration: Number(qDur) > 0 ? Number(qDur) : undefined,
      });
      setCands(found);
    } catch {
      setCands([]);
    } finally {
      setLoading(false);
    }
  }, [qTitle, qArtist, qAlbum, qDur]);

  // auto-search once on open (editable fields + button re-run it)
  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const durMatch = (c: LrclibResult) =>
    c.duration > 0 && track.duration > 0 && Math.abs(c.duration - track.duration) <= 3;

  const apply = async (c: LrclibResult) => {
    setBusy(true);
    const ok = await applyLyricsCandidate(track.id, c);
    setBusy(false);
    if (ok) {
      setFlash("applied");
      onApplied(track.id, !c.syncedLyrics);
      window.setTimeout(close, 850);
    }
  };

  const saveFile = async (c: LrclibResult) => {
    const content = c.syncedLyrics || c.plainLyrics || "";
    if (!content) return;
    setBusy(true);
    const ok = await saveLyricsFileFor(track, content, Boolean(c.syncedLyrics));
    setBusy(false);
    if (ok) {
      setFlash("saved");
      window.setTimeout(() => setFlash(null), 2200);
    }
  };

  return (
    <ModalShell title={t("dlManualLyrics")} sub={`${track.title} — ${track.artist}`} icon={FileText} close={close}>
      {/* editable query */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="t-mut mb-1 block text-[10.5px]">{t("dlQueryTitle")}</span>
          <input type="text" dir="auto" className="w-full px-3 py-2 text-[12px]" value={qTitle} onChange={(e) => setQTitle(e.target.value)} spellCheck={false} />
        </label>
        <label className="block">
          <span className="t-mut mb-1 block text-[10.5px]">{t("dlQueryArtist")}</span>
          <input type="text" dir="auto" className="w-full px-3 py-2 text-[12px]" value={qArtist} onChange={(e) => setQArtist(e.target.value)} spellCheck={false} />
        </label>
        <label className="block">
          <span className="t-mut mb-1 block text-[10.5px]">{t("dlQueryAlbum")}</span>
          <input type="text" dir="auto" className="w-full px-3 py-2 text-[12px]" value={qAlbum} onChange={(e) => setQAlbum(e.target.value)} spellCheck={false} />
        </label>
        <label className="block">
          <span className="t-mut mb-1 block text-[10.5px]">{t("dlQueryDuration")}</span>
          <input type="text" dir="ltr" inputMode="numeric" className="tnum w-full px-3 py-2 text-[12px]" value={qDur} onChange={(e) => setQDur(e.target.value)} spellCheck={false} />
        </label>
      </div>
      <button
        type="button"
        onClick={() => void runSearch()}
        disabled={loading}
        className="bg-accent mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
      >
        {loading ? <Loader2 size={14} className="nc-spin" /> : <Search size={14} />}
        {t("dlSearchBtn")}
      </button>

      {/* candidates */}
      <div className="mt-3 space-y-1.5">
        {loading && (
          <div className="t-faint flex items-center justify-center gap-2 py-8 text-[12px]">
            <Loader2 size={16} className="nc-spin" /> {t("sfSearching")}…
          </div>
        )}
        {!loading && cands && cands.length === 0 && (
          <div className="t-faint flex flex-col items-center gap-2 py-8 text-center text-[12px]">
            <AlertCircle size={20} strokeWidth={1.4} />
            <span>{t("dlNoCandidates")}</span>
          </div>
        )}
        {!loading &&
          cands?.map((c) => {
            const open = openId === c.id;
            return (
              <div key={c.id} className="surface rounded-xl" style={{ borderColor: open ? "var(--line2)" : "var(--line)" }}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : c.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-start"
                >
                  <span className="min-w-0 flex-1">
                    <span dir="auto" className="block truncate text-[12px] font-semibold leading-tight">
                      {c.trackName}
                    </span>
                    <span dir="auto" className="t-faint block truncate text-[10.5px] leading-tight">
                      {c.artistName}
                      {c.albumName ? ` — ${c.albumName}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {durMatch(c) && <em className="nc-dl-badge" data-tone="ok">{t("dlExactDur")}</em>}
                    {c.syncedLyrics && <em className="nc-dl-badge" data-tone="ok">{t("dlSynced")}</em>}
                    {c.plainLyrics && <em className="nc-dl-badge">{t("dlPlain")}</em>}
                    {c.instrumental && <em className="nc-dl-badge" data-tone="info">{t("sfInstrumental")}</em>}
                  </span>
                  <ChevronDown size={14} className="t-faint shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
                </button>
                {open && (
                  <div className="border-t px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
                    <pre
                      dir="auto"
                      className="t-mut max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg px-3 py-2 text-[11px] leading-relaxed"
                      style={{ background: "var(--bg2)" }}
                    >
                      {c.syncedLyrics ? previewOf(c.syncedLyrics) : (c.plainLyrics || "").split(/\r?\n/).slice(0, 8).join("\n")}
                    </pre>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void apply(c)}
                        disabled={busy || (!c.syncedLyrics && !c.plainLyrics)}
                        className="bg-accent flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                      >
                        {busy ? <Loader2 size={13} className="nc-spin" /> : <CheckCircle2 size={13} />}
                        {flash === "applied" ? t("dlApplied") : t("dlApply")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveFile(c)}
                        disabled={busy}
                        className="surface flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[12px] font-semibold transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                      >
                        {flash === "saved" ? <Check size={13} /> : <Download size={13} />}
                        {flash === "saved" ? t("dlSavedFlash") : t("dlSaveFile")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <p className="t-faint mt-3 text-[10.5px] leading-snug">{t("edcModalNote")}</p>
    </ModalShell>
  );
}

/* ── manual cover picker (iTunes + Deezer) ────────────────────────────────── */

function CoverPickerModal({
  track,
  close,
  onApplied,
}: {
  track: Track;
  close: () => void;
  onApplied: (trackId: string) => void;
}) {
  const t = useT();
  const [cands, setCands] = useState<CoverCandidate[] | null>(null);
  const [selCand, setSelCand] = useState<CoverCandidate | null>(null);
  const [busy, setBusy] = useState<null | "apply" | "save">(null);
  const [flash, setFlash] = useState<null | "applied" | "saved">(null);

  useEffect(() => {
    let alive = true;
    searchCoverCandidates(track.artist, track.title)
      .then((found) => {
        if (!alive) return;
        setCands(found);
        setSelCand(found[0] ?? null);
      })
      .catch(() => {
        if (alive) setCands([]);
      });
    return () => {
      alive = false;
    };
  }, [track.artist, track.title]);

  const apply = async () => {
    if (!selCand) return;
    setBusy("apply");
    const ok = await applyCoverCandidate(track.id, selCand);
    setBusy(null);
    if (ok) {
      setFlash("applied");
      onApplied(track.id);
      window.setTimeout(close, 850);
    }
  };

  const saveFile = async () => {
    if (!selCand) return;
    setBusy("save");
    const ok = await saveCoverFileFor(track, selCand.url);
    setBusy(null);
    if (ok) {
      setFlash("saved");
      window.setTimeout(() => setFlash(null), 2200);
    }
  };

  return (
    <ModalShell title={t("dlManualCover")} sub={`${track.title} — ${track.artist}`} icon={ImageIcon} close={close} wide>
      {!cands && (
        <div className="t-faint flex items-center justify-center gap-2 py-10 text-[12px]">
          <Loader2 size={16} className="nc-spin" /> {t("sfSearching")}…
        </div>
      )}
      {cands && cands.length === 0 && (
        <div className="t-faint flex flex-col items-center gap-2 py-10 text-center text-[12px]">
          <AlertCircle size={20} strokeWidth={1.4} />
          <span>{t("dlNoCandidates")}</span>
        </div>
      )}
      {cands && cands.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {cands.map((c) => (
            <button
              key={c.url}
              type="button"
              className="nc-dl-cover-cell"
              data-picked={selCand?.url === c.url}
              onClick={() => setSelCand(c)}
              aria-pressed={selCand?.url === c.url}
              title={c.albumName || c.source}
            >
              <img src={c.thumbUrl} alt="" loading="lazy" className="aspect-square w-full object-cover" />
              <span className="t-faint absolute bottom-1 inline-block rounded-md bg-black/55 px-1.5 py-0.5 text-[8.5px] uppercase tracking-wider text-white/90" dir="ltr">
                {c.source}
              </span>
              {selCand?.url === c.url && (
                <span className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {selCand && (
        <div className="mt-3 flex justify-center">
          <img
            src={selCand.url}
            alt=""
            className="max-h-52 rounded-xl border object-contain"
            style={{ borderColor: "var(--line2)", background: "var(--bg2)" }}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void apply()}
          disabled={!selCand || busy !== null}
          className="bg-accent flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-50"
        >
          {busy === "apply" ? <Loader2 size={14} className="nc-spin" /> : <CheckCircle2 size={14} />}
          {flash === "applied" ? t("dlApplied") : t("dlApply")}
        </button>
        <button
          type="button"
          onClick={() => void saveFile()}
          disabled={!selCand || busy !== null}
          className="surface flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-semibold transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-50"
        >
          {busy === "save" ? <Loader2 size={14} className="nc-spin" /> : <Download size={14} />}
          {flash === "saved" ? t("dlSavedFlash") : t("dlSaveFile")}
        </button>
      </div>
    </ModalShell>
  );
}

/* ── the Download Center ──────────────────────────────────────────────────── */

export function SmartFetchPanel() {
  const t = useT();
  const sf = useSmartFetch();
  const order = useLibrary((s) => s.order);
  const tracksById = useLibrary((s) => s.tracks);
  const { folders } = useFolderManager();

  /* toolbar state */
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [optOpen, setOptOpen] = useState(false);
  const [conn, setConn] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [manualLyricsTrack, setManualLyricsTrack] = useState<Track | null>(null);
  const [manualCoverTrack, setManualCoverTrack] = useState<Track | null>(null);

  const optRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!optOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!optRef.current?.contains(e.target as Node)) setOptOpen(false);
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true });
  }, [optOpen]);

  /* derived library views */
  const allTracks = useMemo(
    () => order.map((id) => tracksById[id]).filter((tr): tr is Track => Boolean(tr)),
    [order, tracksById],
  );
  const itemByTrack = useMemo(() => new Map(sf.items.map((i) => [i.trackId, i])), [sf.items]);

  const scoped = useMemo(
    () => (sf.scope === "all" ? allTracks : allTracks.filter((tr) => tr.folderPath === sf.scope)),
    [allTracks, sf.scope],
  );

  const textFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((tr) => `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(q));
  }, [scoped, query]);

  /** Effective per-row status: engine item status wins, otherwise data on
   *  the track buckets it as "have data" (the engine would skip it) or idle. */
  const rowStatusOf = useCallback(
    (tr: Track): RowStatus => {
      const it = itemByTrack.get(tr.id);
      if (it) {
        if (it.status === "waiting") return "queued";
        if (it.status === "saved") return "done";
        if (it.status === "notfound") return "notfound";
        return it.status; // searching | error | instrumental
      }
      const has = sf.mode === "lyrics" ? hasRealLyrics(tr) : hasRealCover(tr);
      return has ? "skipped" : "idle";
    },
    [itemByTrack, sf.mode],
  );

  const filtered = useMemo(() => {
    if (statusFilter === "all") return textFiltered;
    return textFiltered.filter((tr) => rowStatusOf(tr) === statusFilter);
  }, [textFiltered, statusFilter, rowStatusOf]);

  const chipCounts = useMemo(() => {
    const c: Record<RowStatus, number> = {
      idle: 0, queued: 0, searching: 0, done: 0, notfound: 0, instrumental: 0, error: 0, skipped: 0,
    };
    for (const tr of textFiltered) c[rowStatusOf(tr)] += 1;
    return c;
  }, [textFiltered, rowStatusOf]);

  const stats = useMemo(() => {
    const total = allTracks.length;
    const withN = allTracks.reduce(
      (n, tr) => n + (sf.mode === "lyrics" ? (hasRealLyrics(tr) ? 1 : 0) : hasRealCover(tr) ? 1 : 0),
      0,
    );
    return { total, with: withN, missing: total - withN };
  }, [allTracks, sf.mode]);

  const runCounts = useMemo(() => {
    let saved = 0, notfound = 0, error = 0, instrumental = 0;
    for (const it of sf.items) {
      if (it.status === "saved") saved += 1;
      else if (it.status === "notfound") notfound += 1;
      else if (it.status === "error") error += 1;
      else if (it.status === "instrumental") instrumental += 1;
    }
    return { saved, notfound, error, instrumental };
  }, [sf.items]);

  const failedCount = runCounts.notfound + runCounts.error;
  const total = sf.items.length;
  const pct = Math.min(100, Math.round((sf.done / Math.max(1, total)) * 100));

  const summary = useMemo(() => {
    if (!total) return t("dlReady");
    const parts = [fmtVars(t("dlDone"), { done: sf.done, total })];
    if (runCounts.saved) parts.push(fmtVars(t("dlSumSaved"), { n: runCounts.saved }));
    if (runCounts.notfound) parts.push(fmtVars(t("dlSumNotFound"), { n: runCounts.notfound }));
    if (runCounts.instrumental) parts.push(fmtVars(t("dlSumInstr"), { n: runCounts.instrumental }));
    if (runCounts.error) parts.push(fmtVars(t("dlSumErrors"), { n: runCounts.error }));
    return parts.join(" · ");
  }, [total, sf.done, runCounts, t]);

  const labels = useMemo<RowLabels>(
    () => ({
      select: t("dlSelAll"),
      fetch: t("dlFetchNow"),
      retry: t("sfRetry"),
      manual: t("dlManualSearch"),
      saveLyrics: t("dlSaveTxt"),
      saveCover: t("dlSaveCover"),
      saveAudio: t("dlSaveAudio"),
      plainTag: t("dlPlain"),
      status: {
        idle: t("dlChipIdle"),
        queued: t("dlChipQueued"),
        searching: t("sfSearching"),
        done: t("dlChipDone"),
        notfound: t("sfNotfound"),
        instrumental: t("sfInstrumental"),
        error: t("sfError"),
        skipped: t("dlChipSkipped"),
      },
    }),
    [t],
  );

  /* ── selection ── */
  const toggleSel = useCallback((id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selAll = useCallback(() => setSelected(new Set(filtered.map((tr) => tr.id))), [filtered]);
  const selNone = useCallback(() => setSelected(new Set()), []);
  const selInvert = useCallback(
    () => setSelected(new Set(filtered.filter((tr) => !selected.has(tr.id)).map((tr) => tr.id))),
    [filtered, selected],
  );

  /* ── engine job controls ── */
  const start = useCallback(async () => {
    const ids = (selected.size ? filtered.filter((tr) => selected.has(tr.id)) : filtered).map((tr) => tr.id);
    const run: SmartFetchRunOpts = {
      mode: sf.mode,
      scope: { trackIds: ids },
      options: { skipExisting: sf.skipExisting, autoApply: sf.autoApply, saveToDisk: sf.saveToDisk },
    };
    const res = await startSmartFetch(undefined, run);
    if (res === "empty") uiApi.toast(t("sfNothing"), "info");
  }, [filtered, selected, sf.mode, sf.skipExisting, sf.autoApply, sf.saveToDisk, t]);

  const retryFailed = useCallback(async () => {
    const ids = sf.items
      .filter((i) => i.status === "error" || i.status === "notfound")
      .map((i) => i.trackId);
    if (!ids.length) return;
    await startSmartFetch(undefined, {
      mode: sf.mode,
      scope: { trackIds: ids },
      // an explicit retry must re-check tracks the skip-rule would exclude
      options: { skipExisting: false, autoApply: sf.autoApply, saveToDisk: sf.saveToDisk },
    });
  }, [sf.items, sf.mode, sf.autoApply, sf.saveToDisk]);

  const clearAll = useCallback(() => {
    useSmartFetch.setState({ items: [], done: 0 });
  }, []);

  const runHealth = useCallback(async () => {
    setConn("checking");
    const ok = await lrclibHealthCheck().catch(() => false);
    setConn(ok ? "ok" : "fail");
    window.setTimeout(() => setConn("idle"), 4000);
  }, []);

  /** Record a status back into the engine item list (manual apply/fetches). */
  const markItem = useCallback((trackId: string, status: FetchStatus, detail?: string) => {
    useSmartFetch.setState((s) => {
      if (s.items.some((i) => i.trackId === trackId)) {
        return {
          items: s.items.map((i) => (i.trackId === trackId ? { ...i, status, detail, gen: i.gen + 1 } : i)),
        };
      }
      const tr = useLibrary.getState().tracks[trackId];
      return {
        items: [...s.items, { trackId, title: tr?.title ?? "", artist: tr?.artist ?? "", status, detail, gen: 0 }],
      };
    });
  }, []);

  /** Per-row fetch-now: seed the engine item (so status is visible), then run
   *  the engine's single-item fetch through the exact same write path. */
  const fetchRow = useCallback(
    (tr: Track) => {
      useSmartFetch.setState((s) =>
        s.items.some((i) => i.trackId === tr.id)
          ? {}
          : { items: [...s.items, { trackId: tr.id, title: tr.title, artist: tr.artist, status: "waiting" as FetchStatus, gen: 0 }] },
      );
      void retryItem(tr.id);
    },
    [],
  );

  const openManual = useCallback(
    (tr: Track) => {
      if (sf.mode === "lyrics") setManualLyricsTrack(tr);
      else setManualCoverTrack(tr);
    },
    [sf.mode],
  );

  const saveRow = useCallback(
    async (tr: Track, kind: "lyrics" | "cover" | "audio") => {
      const key = `${tr.id}:${kind}`;
      if (savingKey) return;
      setSavingKey(key);
      try {
        let ok = false;
        if (kind === "audio") {
          ok = await saveAudioFileFor(tr.id);
        } else if (kind === "cover") {
          ok = await saveCurrentCoverFor(tr);
        } else {
          const content = tr.syncedLyrics?.length ? lrcTextFromLines(tr.syncedLyrics) : tr.plainLyrics || "";
          ok = await saveLyricsFileFor(tr, content, Boolean(tr.syncedLyrics?.length));
        }
        uiApi.toast(ok ? t("dlSavedFlash") : t("dlFailed"), ok ? "success" : "error");
      } finally {
        setSavingKey(null);
      }
    },
    [savingKey, t],
  );

  const scopeOptions = useMemo(
    () => [
      { value: "all", label: t("sfEverything") },
      ...folders.map((f) => ({ value: f.path, label: `${f.name} · ${f.trackCount}` })),
    ],
    [folders, t],
  );

  const closeSheet = useCallback(() => sf.setOpen(false), [sf.setOpen]);
  const minimizeSheet = useCallback(() => {
    sf.setOpen(false);
    sf.setMinimized(true);
  }, [sf.setOpen, sf.setMinimized]);

  return (
    <>
      {/* ── minimized progress pill — keeps working while you browse ── */}
      <AnimatePresence>
        {sf.minimized && sf.items.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onClick={() => {
              sf.setMinimized(false);
              sf.setOpen(true);
            }}
            className="fixed bottom-24 start-4 z-[58] flex items-center gap-3 rounded-full border px-4 py-2.5 text-[12px] backdrop-blur-xl"
            style={{ background: "var(--glass)", borderColor: "var(--line2)", boxShadow: "var(--shadow)" }}
          >
            <span className="relative flex h-4 w-4 items-center justify-center">
              <WandSparkles size={13} className="t-accent" />
              {sf.running && (
                <span
                  className="spin-slow absolute inset-0 rounded-full border-t"
                  style={{ borderColor: "var(--accent)", borderTopColor: "transparent", borderWidth: 1.5 }}
                />
              )}
            </span>
            <span className="t-mut">{t("sfMinimized")}</span>
            <span className="tnum font-semibold">
              {sf.done}
              <span className="t-faint">/{sf.items.length}</span>
            </span>
            <span className="h-1 w-14 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
              <span
                className="block h-full transition-all duration-500"
                style={{ width: `${(sf.done / Math.max(1, sf.items.length)) * 100}%`, background: "var(--accent)" }}
              />
            </span>
            <span
              role="button"
              tabIndex={0}
              aria-label={t("sfCancel")}
              onClick={(e) => {
                e.stopPropagation();
                cancelSmartFetch();
                sf.setMinimized(false);
              }}
              className="t-mut rounded-full p-1 hover:bg-white/10"
            >
              <Ban size={12} />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── the workspace sheet ── */}
      <AnimatePresence>
        {sf.open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[58] bg-black/50"
              onClick={closeSheet}
            />
            <div className="pointer-events-none fixed inset-0 z-[59] grid place-items-center p-2 sm:p-4">
              <motion.aside
                initial={{ y: 44, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 44, opacity: 0, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 240, damping: 28 }}
                role="dialog"
                aria-modal="true"
                aria-label={t("dlTitle")}
                className="glass pointer-events-auto flex h-[min(820px,94dvh)] w-[min(960px,98vw)] flex-col overflow-hidden rounded-2xl"
                style={{ borderColor: "var(--line2)", boxShadow: "var(--shadow)" }}
              >
                {/* head */}
                <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <WandSparkles size={17} className="t-accent" />
                      <span className="font-display text-xl italic">{t("dlTitle")}</span>
                    </div>
                    <p className="t-mut mt-1 max-w-[520px] text-[11.5px] leading-snug">{t("dlSub")}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {/* LRCLIB health check */}
                    <button
                      type="button"
                      onClick={() => void runHealth()}
                      disabled={conn === "checking"}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors",
                        conn === "ok" && "t-accent",
                        conn === "fail" && "text-red-400",
                        conn === "idle" && "t-mut",
                      )}
                      style={{ borderColor: conn === "ok" || conn === "fail" ? "currentColor" : "var(--line2)" }}
                      title={t("dlHealthCheck")}
                    >
                      {conn === "checking" ? (
                        <Loader2 size={13} className="nc-spin" />
                      ) : conn === "ok" ? (
                        <CheckCircle2 size={13} />
                      ) : conn === "fail" ? (
                        <AlertTriangle size={13} />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      <span className="hidden sm:inline">
                        {conn === "ok" ? t("dlHealthOk") : conn === "fail" ? t("dlHealthFail") : t("dlHealthCheck")}
                      </span>
                    </button>
                    <button type="button" onClick={minimizeSheet} title={t("sfMinimize")} aria-label={t("sfMinimize")} className="t-mut rounded-full p-2 transition-colors hover:bg-[var(--card2)]">
                      <Minus size={15} />
                    </button>
                    <button type="button" onClick={closeSheet} aria-label={t("close")} className="t-mut rounded-full p-2 transition-colors hover:bg-[var(--card2)]">
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {allTracks.length === 0 ? (
                  /* empty-library guidance */
                  <div className="t-faint flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
                    <Music size={34} strokeWidth={1.2} />
                    <div className="font-display text-xl italic">{t("dlEmptyTitle")}</div>
                    <p className="t-mut max-w-[340px] text-[12px] leading-relaxed">{t("dlEmptySub")}</p>
                  </div>
                ) : (
                  <>
                    {/* stat cards — total / with / missing for the active tab */}
                    <div className="grid grid-cols-3 gap-2 px-5">
                      <div className="nc-dl-stat">
                        <Music size={16} className="t-accent shrink-0" strokeWidth={1.75} />
                        <div className="min-w-0">
                          <strong className="tnum">{stats.total}</strong>
                          <span className="block truncate">{t("dlStatTotal")}</span>
                        </div>
                      </div>
                      <div className="nc-dl-stat">
                        {sf.mode === "lyrics" ? (
                          <FileText size={16} className="t-accent shrink-0" strokeWidth={1.75} />
                        ) : (
                          <ImageIcon size={16} className="t-accent shrink-0" strokeWidth={1.75} />
                        )}
                        <div className="min-w-0">
                          <strong className="tnum">{stats.with}</strong>
                          <span className="block truncate">{sf.mode === "lyrics" ? t("dlStatWithLyrics") : t("dlStatWithCovers")}</span>
                        </div>
                      </div>
                      <div className="nc-dl-stat">
                        <AlertCircle size={16} className="shrink-0 text-red-400" strokeWidth={1.75} />
                        <div className="min-w-0">
                          <strong className="tnum">{stats.missing}</strong>
                          <span className="block truncate">{sf.mode === "lyrics" ? t("dlStatMissingLyrics") : t("dlStatMissingCovers")}</span>
                        </div>
                      </div>
                    </div>

                    {/* tabs — engine mode */}
                    <div role="tablist" className="grid grid-cols-2 gap-2 px-5 pt-3">
                      {(["lyrics", "covers"] as const).map((m) => (
                        <button
                          key={m}
                          role="tab"
                          aria-selected={sf.mode === m}
                          onClick={() => sf.setMode(m)}
                          disabled={sf.running}
                          title={m === "lyrics" ? t("sfLyricsSub") : t("sfCoversSub")}
                          className={cn(
                            "flex items-center justify-center gap-2 rounded-xl border py-2 text-[12.5px] font-semibold transition-all disabled:opacity-60",
                            sf.mode === m ? "accent-ring" : "",
                          )}
                          style={{
                            borderColor: sf.mode === m ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "var(--line)",
                            background: sf.mode === m ? "var(--card)" : "transparent",
                          }}
                        >
                          {m === "lyrics" ? <MicVocal size={14} className="t-accent" /> : <ImageIcon size={14} className="t-accent" />}
                          {m === "lyrics" ? t("sfLyrics") : t("sfCovers")}
                          {sf.mode === m && chipCounts.done > 0 && (
                            <b className="tnum rounded-full px-1.5 text-[10px]" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }}>
                              {chipCounts.done}
                            </b>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* toolbar row 1 — scope + search + options */}
                    <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
                      <div className="min-w-[170px] flex-[2] rounded-lg border px-1 py-0.5" style={{ borderColor: "var(--line)" }}>
                        <SelectMenu
                          value={sf.scope}
                          onChange={(v) => sf.setScope(v)}
                          ariaLabel={t("sfScope")}
                          options={scopeOptions}
                        />
                      </div>
                      <label className="flex min-w-[150px] flex-[3] items-center gap-2 rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--line)" }}>
                        <Search size={13} className="t-faint shrink-0" />
                        <input
                          type="text"
                          dir="auto"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder={t("searchPlaceholder")}
                          spellCheck={false}
                          className="w-full border-0 bg-transparent text-[12px]"
                          style={{ background: "transparent", border: "none" }}
                        />
                        {query && (
                          <button type="button" onClick={() => setQuery("")} aria-label={t("close")} className="t-faint shrink-0">
                            <X size={12} />
                          </button>
                        )}
                      </label>
                      <div className="relative" ref={optRef}>
                        <button
                          type="button"
                          onClick={() => setOptOpen((v) => !v)}
                          aria-expanded={optOpen}
                          aria-label={t("dlOptions")}
                          title={t("dlOptions")}
                          className={cn("nc-dl-iconbtn border", optOpen && "t-accent")}
                          style={{ borderColor: optOpen ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "var(--line)" }}
                        >
                          <Settings2 size={14} />
                        </button>
                        {optOpen && (
                          <div className="nc-dl-menu" role="group" aria-label={t("dlOptions")}>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={sf.skipExisting}
                              className="nc-dl-optrow"
                              onClick={() => sf.setOptions({ skipExisting: !sf.skipExisting })}
                            >
                              <span>
                                {t("dlSkipExisting")}
                                <small>{t("sfSkip")}</small>
                              </span>
                              <span className="switch" data-on={sf.skipExisting} aria-hidden />
                            </button>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={sf.autoApply}
                              className="nc-dl-optrow"
                              onClick={() => sf.setOptions({ autoApply: !sf.autoApply })}
                            >
                              <span>{t("dlAutoApply")}</span>
                              <span className="switch" data-on={sf.autoApply} aria-hidden />
                            </button>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={sf.saveToDisk}
                              className="nc-dl-optrow"
                              onClick={() => sf.setOptions({ saveToDisk: !sf.saveToDisk })}
                            >
                              <span>{t("dlSaveToDisk")}</span>
                              <span className="switch" data-on={sf.saveToDisk} aria-hidden />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* toolbar row 2 — selection + status chips */}
                    <div className="flex flex-wrap items-center gap-1.5 px-5 pt-2.5">
                      <span className="me-1 flex items-center gap-1">
                        <button type="button" onClick={selAll} className="nc-dl-chip">{t("dlSelAll")}</button>
                        <button type="button" onClick={selNone} className="nc-dl-chip">{t("dlSelNone")}</button>
                        <button type="button" onClick={selInvert} className="nc-dl-chip">{t("dlSelInvert")}</button>
                      </span>
                      {selected.size > 0 && (
                        <em className="nc-dl-badge me-1" data-tone="ok" dir="auto">
                          {fmtVars(t("dlSelCount"), { n: selected.size })}
                        </em>
                      )}
                      {ROW_STATUSES.map((key) => (
                        <button
                          key={key}
                          type="button"
                          className="nc-dl-chip"
                          data-active={statusFilter === key}
                          onClick={() => setStatusFilter(key)}
                          aria-pressed={statusFilter === key}
                        >
                          {key === "all" ? t("dlSelAll") : labels.status[key as RowStatus]}
                          <b className="tnum">{key === "all" ? textFiltered.length : chipCounts[key as RowStatus]}</b>
                        </button>
                      ))}
                    </div>

                    {/* action bar — start/stop/retry-failed/clear + progress + summary */}
                    <div className="flex flex-wrap items-center gap-2 px-5 pt-3">
                      {sf.running ? (
                        <button
                          type="button"
                          onClick={cancelSmartFetch}
                          className="surface flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-transform hover:scale-[1.02]"
                        >
                          <Ban size={14} /> {t("dlStop")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void start()}
                          disabled={!filtered.length}
                          className="bg-accent flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-semibold transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                        >
                          <WandSparkles size={14} /> {runCounts.saved + failedCount > 0 ? t("dlRestart") : t("sfStart")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void retryFailed()}
                        disabled={sf.running || failedCount === 0}
                        className="surface flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition-transform hover:scale-[1.02] disabled:opacity-40"
                        title={t("dlRetryFailed")}
                      >
                        <RotateCcw size={13} /> <span className="hidden sm:inline">{t("dlRetryFailed")}</span>
                        {failedCount > 0 && <b className="tnum text-[10.5px]" style={{ color: "var(--accent)" }}>{failedCount}</b>}
                      </button>
                      <button
                        type="button"
                        onClick={clearAll}
                        disabled={sf.running || total === 0}
                        className="t-mut flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold transition-colors hover:bg-[var(--card2)] hover:text-[var(--fg)] disabled:opacity-40"
                        title={t("dlClear")}
                      >
                        <X size={13} /> <span className="hidden sm:inline">{t("dlClear")}</span>
                      </button>

                      <div className="flex min-w-[140px] flex-1 items-center gap-2">
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, background: "var(--accent)" }}
                          />
                        </div>
                        <span className="tnum t-faint shrink-0 text-[10.5px]">{pct}%</span>
                      </div>
                      <span dir="auto" aria-live="polite" className="t-mut flex items-center gap-1.5 text-[11px]">
                        {sf.running && <Loader2 size={12} className="nc-spin t-accent" />}
                        {summary}
                      </span>
                    </div>

                    {/* track list */}
                    <div
                      role="list"
                      className="mt-3 min-h-0 flex-1 overflow-y-auto border-t px-2.5 py-2"
                      style={{ borderColor: "var(--line)" }}
                    >
                      {filtered.length === 0 ? (
                        <div className="t-faint flex h-full flex-col items-center justify-center gap-2 text-center text-[12px]">
                          <Search size={20} strokeWidth={1.4} />
                          <span className="max-w-[260px]">{t("dlNoMatch")}</span>
                        </div>
                      ) : (
                        filtered.map((tr) => {
                          const it = itemByTrack.get(tr.id);
                          return (
                            <DlRow
                              key={tr.id}
                              track={tr}
                              status={rowStatusOf(tr)}
                              detail={it?.detail}
                              selected={selected.has(tr.id)}
                              mode={sf.mode}
                              running={sf.running}
                              saving={savingKey?.startsWith(`${tr.id}:`) ?? false}
                              labels={labels}
                              onToggle={toggleSel}
                              onFetch={fetchRow}
                              onManual={openManual}
                              onSave={saveRow}
                            />
                          );
                        })
                      )}
                    </div>
                  </>
                )}
              </motion.aside>
            </div>

            {/* manual pickers */}
            <AnimatePresence>
              {manualLyricsTrack && (
                <LyricsPickerModal
                  key={manualLyricsTrack.id}
                  track={manualLyricsTrack}
                  close={() => setManualLyricsTrack(null)}
                  onApplied={(id, plain) => markItem(id, "saved", plain ? "plain" : undefined)}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {manualCoverTrack && (
                <CoverPickerModal
                  key={manualCoverTrack.id}
                  track={manualCoverTrack}
                  close={() => setManualCoverTrack(null)}
                  onApplied={(id) => markItem(id, "saved")}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
