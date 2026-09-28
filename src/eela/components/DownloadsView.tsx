// ── NOBODY EELA · Download Center — the acquisitions ledger ──────────────────
// Task 30: full parity with the classic Download Center (src/DownloadCenter.tsx),
// dressed in the paper-light EELA design language. The ledger metaphor:
//   • two chapters (I · Lyrics, II · Cover Art) as roman-numeral tabs
//   • a printed stat header line (total / with / missing)
//   • every track is a ledger row; statuses are small-caps stamps
//   • scope, text search, checkbox selection (all/none/invert), status chips
//   • options card (skipExisting / autoApply / saveToDisk → engine setOptions)
//   • Start / Stop / Retry-failed / Clear + a thin ink progress rule + summary
//   • manual lyrics & cover pickers, LRCLIB health check, .lrc/.jpg/audio export
// All fetching goes through the SHARED engine (src/cinema/lib/smartFetch.ts) —
// batches are dispatched with an explicit { trackIds } scope so the run never
// clobbers the store's own scope/mode (the ALOK fix), and item statuses are
// mirrored back into the ledger stamps live.

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileDown,
  HardDriveDownload,
  Image as ImageIcon,
  ImageDown,
  Info,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { uiApi } from "../../cinema/store/ui";
import { useLibrary } from "../../cinema/store/library";
import { useT } from "../../cinema/lib/useT";
import {
  applyCoverCandidate,
  applyLyricsCandidate,
  cancelSmartFetch,
  lrclibHealthCheck,
  saveAudioFileFor,
  searchCoverCandidates,
  searchLyricsCandidates,
  startSmartFetch,
  useSmartFetch,
} from "../../cinema/lib/smartFetch";
import { useFolderManager } from "../../cinema/lib/folderManager";
import { coverUrl } from "../../cinema/lib/covers";
import { db } from "../../cinema/lib/db";
import { getBridge, sourcePathFromSourceUrl } from "../../cinema/lib/desktopBridge";
import { fmtTime } from "../../cinema/lib/utils";
import { SelectMenu } from "../../cinema/components/SelectMenu";
import { engine } from "../../cinema/lib/engine";
import { downloadCoverArt, type CoverCandidate } from "../../coverart";
import { saveCoverImage, saveLrcFile } from "../../desktopLibrary";
import { previewFromSynced } from "../../lrc";
import type { LrcLine, Track } from "../../cinema/types";
import type { LrclibResult } from "../../lrclib";

/* ── ledger types ──────────────────────────────────────────────────────────── */

type DlTab = "lyrics" | "covers";

type DlStatus = "idle" | "queued" | "searching" | "done" | "not-found" | "instrumental" | "error" | "skipped";

type StatusFilter = "all" | DlStatus;

type RowMeta = {
  status: DlStatus;
  kind?: "synced" | "plain";
};

/** Engine FetchStatus → ledger stamp. `detail: "plain"` marks plain-text saves. */
function mapEngineStatus(status: string, detail?: string): RowMeta {
  switch (status) {
    case "waiting":
      return { status: "queued" };
    case "searching":
      return { status: "searching" };
    case "saved":
      return { status: "done", kind: detail === "plain" ? "plain" : "synced" };
    case "notfound":
      return { status: "not-found" };
    case "instrumental":
      return { status: "instrumental" };
    case "error":
      return { status: "error" };
    default:
      return { status: "idle" };
  }
}

/* ── small helpers ─────────────────────────────────────────────────────────── */

function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "track"
  );
}

/** Browser download for pure-web builds (sidecar writes need a real path). */
function browserDownload(data: Blob | string, filename: string, mime = "application/octet-stream") {
  try {
    const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
  } catch {
    /* best-effort */
  }
}

/** The audio's real absolute path via the classic bridge (null on pure web). */
function audioPathFor(trackId: string): string | null {
  return sourcePathFromSourceUrl(getBridge()?.resolveSource(trackId) ?? null);
}

/** Stored lyrics → plain .lrc text: synced keeps [mm:ss.xx] stamps. */
function lyricsToText(track: Track): string | null {
  if (track.syncedLyrics?.length) {
    const stamp = (sec: number) => {
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      const cs = Math.floor((sec - Math.floor(sec)) * 100);
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
    };
    return track.syncedLyrics
      .map((l: LrcLine) => `[${stamp(Math.max(0, l.t))}]${l.text ? " " + l.text : ""}`)
      .join("\n");
  }
  if (track.plainLyrics && track.plainLyrics.trim()) return track.plainLyrics.trim();
  return null;
}

const EXT_FOR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const STATUS_ORDER: StatusFilter[] = ["all", "idle", "queued", "searching", "done", "not-found", "instrumental", "error", "skipped"];

/* ── per-row cover thumbnail (object URL resolved once) ────────────────────── */

function useCoverSrc(trackId: string): string | null {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    coverUrl(trackId).then((u) => {
      if (!alive || !u) return;
      if (u.startsWith("blob:") || u.startsWith("http") || u.startsWith("app:") || u.startsWith("data:")) {
        setSrc(u); // managed/remote URL — not ours to revoke
      } else {
        made = u;
        setSrc(u);
      }
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [trackId]);
  return src;
}

/* ── ledger row ────────────────────────────────────────────────────────────── */

type RowProps = {
  track: Track;
  meta: RowMeta | undefined;
  selected: boolean;
  tab: DlTab;
  running: boolean;
  labels: {
    select: string;
    play: string;
    fetch: string;
    retry: string;
    manual: string;
    saveLyrics: string;
    saveCover: string;
    saveAudio: string;
    status: Record<DlStatus, string>;
  };
  saving: string | null;
  onToggle: (id: string) => void;
  onPlay: (track: Track) => void;
  onFetch: (track: Track) => void;
  onRetry: (track: Track) => void;
  onManual: (track: Track) => void;
  onSaveLyrics: (track: Track) => void;
  onSaveCover: (track: Track) => void;
  onSaveAudio: (track: Track) => void;
};

const DlRow = memo(function DlRow({
  track,
  meta,
  selected,
  tab,
  running,
  labels,
  saving,
  onToggle,
  onPlay,
  onFetch,
  onRetry,
  onManual,
  onSaveLyrics,
  onSaveCover,
  onSaveAudio,
}: RowProps) {
  const art = useCoverSrc(track.id);
  const status = meta?.status ?? "idle";
  const busy = status === "searching" || status === "queued";
  const hasReal =
    tab === "lyrics"
      ? Boolean(track.syncedLyrics?.length || track.plainLyrics)
      : track.hasCover && !track.isPlaceholderCover;

  return (
    <div className="edc-row" role="listitem" data-selected={selected} data-busy={busy}>
      <button
        type="button"
        className="edc-cb"
        onClick={() => onToggle(track.id)}
        aria-pressed={selected}
        aria-label={labels.select}
        title={labels.select}
      >
        {selected ? <Check size={11} strokeWidth={3} /> : null}
      </button>

      <button type="button" className="edc-thumb" onClick={() => onPlay(track)} aria-label={labels.play} title={labels.play}>
        {art ? (
          <img src={art} alt="" loading="lazy" />
        ) : (
          <span className="flex h-full w-full items-center justify-center" aria-hidden>
            <ImageIcon size={14} className="text-[var(--faint)]" />
          </span>
        )}
        <span className="edc-thumb-hover" aria-hidden>
          <Play size={13} />
        </span>
      </button>

      <div className="edc-meta">
        <div className="edc-meta-line">
          <span className="edc-meta-title">{track.title}</span>
          <span className="edc-leader" aria-hidden />
          <span className="edc-meta-dur">{fmtTime(track.duration || 0)}</span>
          {hasReal ? <span className="edc-have">{tab === "lyrics" ? "LRC" : "IMG"}</span> : null}
        </div>
        <div className="edc-meta-sub">
          {track.artist}
          {track.album && track.album !== "Unknown Album" ? ` — ${track.album}` : ""}
          {track.year ? ` · ${track.year}` : ""}
        </div>
      </div>

      <span className="edc-stamp" data-status={status} data-pulse={busy} aria-live="off">
        {labels.status[status]}
        {status === "done" && meta?.kind === "plain" ? <em style={{ fontStyle: "normal", textTransform: "none", letterSpacing: 0, opacity: 0.75 }}>· plain</em> : null}
      </span>

      <div className="edc-acts">
        <button type="button" className="ne-icon-btn" onClick={() => onFetch(track)} disabled={running || busy} aria-label={labels.fetch} title={labels.fetch}>
          <Download size={14} />
        </button>
        <button type="button" className="ne-icon-btn" onClick={() => onRetry(track)} disabled={running || busy} aria-label={labels.retry} title={labels.retry}>
          <RefreshCw size={13} />
        </button>
        <button type="button" className="ne-icon-btn" onClick={() => onManual(track)} aria-label={labels.manual} title={labels.manual}>
          <Search size={14} />
        </button>
        {tab === "lyrics" ? (
          <button type="button" className="ne-icon-btn hidden sm:inline-flex" onClick={() => onSaveLyrics(track)} disabled={saving !== null} aria-label={labels.saveLyrics} title={labels.saveLyrics}>
            {saving === "lyrics" ? <Loader2 size={13} className="edc-spin" /> : <FileDown size={14} />}
          </button>
        ) : (
          <button type="button" className="ne-icon-btn hidden sm:inline-flex" onClick={() => onSaveCover(track)} disabled={saving !== null} aria-label={labels.saveCover} title={labels.saveCover}>
            {saving === "cover" ? <Loader2 size={13} className="edc-spin" /> : <ImageDown size={14} />}
          </button>
        )}
        <button type="button" className="ne-icon-btn hidden sm:inline-flex" onClick={() => onSaveAudio(track)} disabled={saving !== null} aria-label={labels.saveAudio} title={labels.saveAudio}>
          {saving === "audio" ? <Loader2 size={13} className="edc-spin" /> : <HardDriveDownload size={14} />}
        </button>
      </div>
    </div>
  );
});

/* ── manual lyrics modal ───────────────────────────────────────────────────── */

function LyricsSearchModal({
  track,
  close,
  labels,
  note,
}: {
  track: Track;
  close: () => void;
  labels: {
    title: string;
    queryTitle: string;
    queryArtist: string;
    searchBtn: string;
    searching: string;
    noResults: string;
    exactDur: string;
    synced: string;
    plain: string;
    instrumental: string;
    apply: string;
    applied: string;
    saveFile: string;
    savedFile: string;
    close: string;
  };
  note: string;
}) {
  const [artist, setArtist] = useState(track.artist);
  const [title, setTitle] = useState(track.title);
  const [results, setResults] = useState<LrclibResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [appliedId, setAppliedId] = useState<number | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setResults(null);
    setExpanded(null);
    try {
      const found = await searchLyricsCandidates({
        track_name: title.trim(),
        artist_name: artist.trim(),
        album_name: track.album && track.album !== "Unknown Album" ? track.album : undefined,
        duration: track.duration || undefined,
      });
      setResults(found);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [artist, title, track.album, track.duration]);

  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const applyCandidate = async (candidate: LrclibResult) => {
    if (!candidate.syncedLyrics) return;
    const ok = await applyLyricsCandidate(track.id, candidate);
    if (ok) {
      setAppliedId(candidate.id);
      uiApi.toast(`${labels.applied} — ${track.title}`, "success");
      window.setTimeout(close, 850);
    } else {
      uiApi.toast(labels.noResults, "error");
    }
  };

  const saveCandidate = async (candidate: LrclibResult) => {
    const content = candidate.syncedLyrics || candidate.plainLyrics || "";
    if (!content) return;
    const srcPath = audioPathFor(track.id);
    let ok = false;
    if (srcPath) {
      try {
        await saveLrcFile(srcPath, content);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      browserDownload(content, `${sanitizeFilename(`${track.artist} - ${track.title}`)}.lrc`, "text/plain;charset=utf-8");
      ok = true;
    }
    if (ok) {
      setSavedId(candidate.id);
      uiApi.toast(`${labels.savedFile} — ${sanitizeFilename(`${track.artist} - ${track.title}`)}.lrc`, "success");
      window.setTimeout(() => setSavedId(null), 2200);
    }
  };

  const durationMatch = (candidate: LrclibResult) =>
    candidate.duration > 0 && track.duration > 0 && Math.abs(candidate.duration - track.duration) <= 3;

  return (
    <motion.div
      className="edc-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        className="ne-card edc-sheet"
        initial={{ scale: 0.95, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 10, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edc-sheet-head">
          <div className="min-w-0">
            <div className="ne-eyebrow mb-1">LRCLIB</div>
            <h3>{labels.title}</h3>
            <small dir="ltr">
              {track.title} — {track.artist}
            </small>
          </div>
          <button type="button" className="ne-icon-btn" onClick={close} aria-label={labels.close} title={labels.close}>
            <X size={15} />
          </button>
        </div>

        <div className="edc-sheet-body">
          <div className="edc-query" dir="ltr">
            <label>
              <span>{labels.queryTitle}</span>
              <input className="ne-input" value={title} onChange={(e) => setTitle(e.target.value)} spellCheck={false} />
            </label>
            <label>
              <span>{labels.queryArtist}</span>
              <input className="ne-input" value={artist} onChange={(e) => setArtist(e.target.value)} spellCheck={false} />
            </label>
            <button type="button" className="ne-btn ne-btn-primary" onClick={() => void runSearch()} disabled={loading}>
              {loading ? <Loader2 size={13} className="edc-spin" /> : <Search size={13} />}
              {labels.searchBtn}
            </button>
          </div>

          <div className="flex flex-col">
            {loading ? (
              <div className="edc-empty !py-10">
                <Loader2 size={20} className="edc-spin" />
                <span>{labels.searching}</span>
              </div>
            ) : results === null ? null : results.length === 0 ? (
              <div className="edc-empty !py-10">
                <AlertCircle size={20} />
                <span>{labels.noResults}</span>
              </div>
            ) : (
              results.map((candidate) => (
                <div key={candidate.id} className="edc-cand">
                  <button
                    type="button"
                    className="edc-cand-head"
                    onClick={() => setExpanded(expanded === candidate.id ? null : candidate.id)}
                    aria-expanded={expanded === candidate.id}
                  >
                    <span className="edc-cand-names" dir="ltr">
                      <strong>{candidate.trackName}</strong>
                      <small>
                        {candidate.artistName}
                        {candidate.albumName ? ` — ${candidate.albumName}` : ""}
                        {candidate.duration > 0 ? ` · ${fmtTime(candidate.duration)}` : ""}
                      </small>
                    </span>
                    <span className="edc-badges" dir="ltr">
                      {durationMatch(candidate) ? <em className="edc-badge" data-tone="ok">{labels.exactDur}</em> : null}
                      {candidate.syncedLyrics ? <em className="edc-badge" data-tone="acc">{labels.synced}</em> : null}
                      {candidate.plainLyrics ? <em className="edc-badge">{labels.plain}</em> : null}
                      {candidate.instrumental ? <em className="edc-badge" data-tone="info">{labels.instrumental}</em> : null}
                    </span>
                    <ChevronDown size={15} className="edc-caret" style={{ rotate: expanded === candidate.id ? "180deg" : "0deg" }} aria-hidden />
                  </button>
                  {expanded === candidate.id ? (
                    <div className="edc-cand-body">
                      <pre className="edc-preview" dir="ltr">
                        {candidate.syncedLyrics
                          ? previewFromSynced(candidate.syncedLyrics, 8).join("\n")
                          : (candidate.plainLyrics || "").split(/\r?\n/).slice(0, 8).join("\n")}
                      </pre>
                      <div className="edc-cand-actions">
                        {candidate.syncedLyrics ? (
                          <button type="button" className="ne-btn ne-btn-primary" onClick={() => void applyCandidate(candidate)}>
                            {appliedId === candidate.id ? <Check size={13} /> : <CheckCircle2 size={13} />}
                            {appliedId === candidate.id ? labels.applied : labels.apply}
                          </button>
                        ) : null}
                        <button type="button" className="ne-btn" onClick={() => void saveCandidate(candidate)}>
                          {savedId === candidate.id ? <Check size={13} /> : <Download size={13} />}
                          {savedId === candidate.id ? labels.savedFile : labels.saveFile}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <p className="edc-modal-note">{note}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── manual cover modal ────────────────────────────────────────────────────── */

function CoverSearchModal({
  track,
  close,
  labels,
}: {
  track: Track;
  close: () => void;
  labels: {
    title: string;
    searching: string;
    noResults: string;
    apply: string;
    applied: string;
    saveFile: string;
    savedFile: string;
    close: string;
  };
}) {
  const [candidates, setCandidates] = useState<CoverCandidate[] | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [working, setWorking] = useState<"apply" | "save" | null>(null);
  const [flash, setFlash] = useState<"applied" | "saved" | null>(null);

  useEffect(() => {
    let alive = true;
    searchCoverCandidates(track.artist, track.title)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const applyCandidate = async () => {
    const picked = candidates?.find((c) => c.url === selectedUrl);
    if (!picked) return;
    setWorking("apply");
    try {
      const ok = await applyCoverCandidate(track.id, picked);
      if (ok) {
        setFlash("applied");
        uiApi.toast(`${labels.applied} — ${track.title}`, "success");
        window.setTimeout(close, 850);
        return;
      }
    } finally {
      setWorking(null);
    }
    uiApi.toast(labels.noResults, "error");
  };

  const saveCandidate = async () => {
    if (!selectedUrl) return;
    setWorking("save");
    try {
      const art = await downloadCoverArt(selectedUrl);
      if (!art) return;
      const srcPath = audioPathFor(track.id);
      let ok = false;
      if (srcPath) {
        try {
          await saveCoverImage(srcPath, art.bytes, art.ext);
          ok = true;
        } catch {
          ok = false;
        }
      }
      if (!ok) {
        const type = art.ext === "png" ? "image/png" : art.ext === "webp" ? "image/webp" : "image/jpeg";
        browserDownload(new Blob([art.bytes as unknown as BlobPart], { type }), `${sanitizeFilename(`${track.artist} - ${track.title}`)}.${art.ext}`, type);
        ok = true;
      }
      if (ok) {
        setFlash("saved");
        uiApi.toast(`${labels.savedFile} — ${sanitizeFilename(`${track.artist} - ${track.title}`)}.${art.ext}`, "success");
        window.setTimeout(() => setFlash(null), 2200);
      }
    } finally {
      setWorking(null);
    }
  };

  return (
    <motion.div
      className="edc-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={close}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={labels.title}
        className="ne-card edc-sheet"
        data-wide="true"
        initial={{ scale: 0.95, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 10, opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edc-sheet-head">
          <div className="min-w-0">
            <div className="ne-eyebrow mb-1">iTUNES · DEEZER</div>
            <h3>{labels.title}</h3>
            <small dir="ltr">
              {track.title} — {track.artist}
            </small>
          </div>
          <button type="button" className="ne-icon-btn" onClick={close} aria-label={labels.close} title={labels.close}>
            <X size={15} />
          </button>
        </div>

        <div className="edc-sheet-body">
          {!candidates ? (
            <div className="edc-empty !py-10">
              <Loader2 size={20} className="edc-spin" />
              <span>{labels.searching}</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="edc-empty !py-10">
              <AlertCircle size={20} />
              <span>{labels.noResults}</span>
            </div>
          ) : (
            <div className="edc-cover-grid">
              {candidates.map((candidate) => (
                <button
                  key={candidate.url}
                  type="button"
                  className="edc-cover-cell"
                  data-picked={selectedUrl === candidate.url}
                  onClick={() => setSelectedUrl(candidate.url)}
                  aria-pressed={selectedUrl === candidate.url}
                  aria-label={`${candidate.source}${candidate.albumName ? ` — ${candidate.albumName}` : ""}`}
                >
                  <img src={candidate.thumbUrl} alt="" loading="lazy" />
                  <span className="edc-cover-src">{candidate.source}</span>
                  {selectedUrl === candidate.url ? (
                    <span className="edc-cover-check" aria-hidden>
                      <Check size={12} strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}

          {selectedUrl ? (
            <div className="edc-cover-preview" dir="ltr">
              <img src={selectedUrl} alt="" />
            </div>
          ) : null}

          <div className="edc-cand-actions center">
            <button type="button" className="ne-btn ne-btn-primary" onClick={() => void applyCandidate()} disabled={!selectedUrl || working !== null}>
              {working === "apply" ? <Loader2 size={13} className="edc-spin" /> : flash === "applied" ? <Check size={13} /> : <CheckCircle2 size={13} />}
              {flash === "applied" ? labels.applied : labels.apply}
            </button>
            <button type="button" className="ne-btn" onClick={() => void saveCandidate()} disabled={!selectedUrl || working !== null}>
              {working === "save" ? <Loader2 size={13} className="edc-spin" /> : <Download size={13} />}
              {flash === "saved" ? labels.savedFile : labels.saveFile}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── the view ──────────────────────────────────────────────────────────────── */

export function DownloadsView() {
  const t = useT();
  const tracks = useLibrary((s) => s.tracks);
  const order = useLibrary((s) => s.order);
  const sfRunning = useSmartFetch((s) => s.running);
  const sfItems = useSmartFetch((s) => s.items);
  const sfSkipExisting = useSmartFetch((s) => s.skipExisting);
  const sfAutoApply = useSmartFetch((s) => s.autoApply);
  const sfSaveToDisk = useSmartFetch((s) => s.saveToDisk);
  const setOptions = useSmartFetch((s) => s.setOptions);
  const { folders } = useFolderManager();

  const [tab, setTab] = useState<DlTab>("lyrics");
  const [scope, setScope] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [lyricsMeta, setLyricsMeta] = useState<Record<string, RowMeta>>({});
  const [coverMeta, setCoverMeta] = useState<Record<string, RowMeta>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [conn, setConn] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [manualLyricsTrack, setManualLyricsTrack] = useState<Track | null>(null);
  const [manualCoverTrack, setManualCoverTrack] = useState<Track | null>(null);

  /** Which meta map the in-flight engine run feeds (set when we dispatch). */
  const runModeRef = useRef<DlTab>("lyrics");

  /* Mirror engine item statuses into the active chapter's ledger, live. */
  useEffect(() => {
    if (!sfItems.length) return;
    const setter = runModeRef.current === "covers" ? setCoverMeta : setLyricsMeta;
    setter((cur) => {
      let changed = false;
      const next = { ...cur };
      for (const it of sfItems) {
        const mapped = mapEngineStatus(it.status, it.detail);
        const prev = next[it.trackId];
        if (!prev || prev.status !== mapped.status || prev.kind !== mapped.kind) {
          next[it.trackId] = mapped;
          changed = true;
        }
      }
      return changed ? next : cur;
    });
  }, [sfItems]);

  const library = useMemo(() => order.map((id) => tracks[id]).filter((tr): tr is Track => Boolean(tr)), [order, tracks]);

  const hasData = useCallback(
    (tr: Track, which: DlTab) =>
      which === "lyrics" ? Boolean(tr.syncedLyrics?.length || tr.plainLyrics) : tr.hasCover && !tr.isPlaceholderCover,
    [],
  );

  /* ── scope options (All + per-folder, with counts) ── */
  const scopeOptions = useMemo(
    () => [
      { value: "all", label: `${t("edcScopeAll")} — ${library.length}` },
      ...folders.map((f) => ({ value: f.path, label: `${f.name} — ${f.trackCount}` })),
    ],
    [folders, library.length, t],
  );

  /* ── scope + search filtering (before the status filter) ── */
  const inScope = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return library.filter((tr) => {
      if (scope !== "all" && tr.folderPath !== scope) return false;
      if (needle && !`${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [library, scope, query]);

  const metaMap = tab === "lyrics" ? lyricsMeta : coverMeta;

  /* ── status counts over the in-scope rows ── */
  const counts = useMemo(() => {
    const out = {} as Record<Exclude<StatusFilter, "all">, number>;
    for (const key of STATUS_ORDER) {
      if (key === "all") continue;
      (out as Record<string, number>)[key] = 0;
    }
    for (const tr of inScope) {
      const st = metaMap[tr.id]?.status ?? "idle";
      if (st in out) out[st as Exclude<StatusFilter, "all">]++;
    }
    return out;
  }, [inScope, metaMap]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? inScope : inScope.filter((tr) => (metaMap[tr.id]?.status ?? "idle") === statusFilter)),
    [inScope, statusFilter, metaMap],
  );

  /* ── printed stat header line (total / with / missing for the chapter) ── */
  const stats = useMemo(() => {
    const total = library.length;
    const withCount = library.filter((tr) => hasData(tr, tab)).length;
    return { total, withCount, missing: total - withCount };
  }, [library, hasData, tab]);

  /* ── selection ── */
  const toggleSel = useCallback((id: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectAll = useCallback(() => setSelected(new Set(filtered.map((tr) => tr.id))), [filtered]);
  const selectNone = useCallback(() => setSelected(new Set()), []);
  const selectInvert = useCallback(
    () => setSelected(new Set(filtered.filter((tr) => !selected.has(tr.id)).map((tr) => tr.id))),
    [filtered, selected],
  );

  /* ── batch dispatch — always through the shared engine ── */
  const runBatch = useCallback(
    async (which: DlTab, source: Track[], force = false) => {
      if (useSmartFetch.getState().running) return;
      const options = useSmartFetch.getState();
      const skip = force ? false : options.skipExisting;
      const queue: Track[] = [];
      const metaSetter = which === "lyrics" ? setLyricsMeta : setCoverMeta;
      for (const tr of source) {
        if (!force && skip && hasData(tr, which)) {
          metaSetter((cur) => ({ ...cur, [tr.id]: { status: "skipped" } }));
          continue;
        }
        queue.push(tr);
      }
      if (!queue.length) return;
      runModeRef.current = which;
      const res = await startSmartFetch(undefined, {
        mode: which,
        scope: { trackIds: queue.map((tr) => tr.id) },
        options: { skipExisting: skip, autoApply: options.autoApply, saveToDisk: options.saveToDisk },
      });
      if (res === "empty") uiApi.toast(t("sfNothing"), "info");
    },
    [hasData, t],
  );

  const startBatch = useCallback(() => {
    const source = selected.size ? filtered.filter((tr) => selected.has(tr.id)) : filtered;
    void runBatch(tab, source);
  }, [filtered, runBatch, selected, tab]);

  const stopBatch = useCallback(() => cancelSmartFetch(), []);

  const retryFailed = useCallback(() => {
    const failed = filtered.filter((tr) => {
      const st = metaMap[tr.id]?.status;
      return st === "error" || st === "not-found";
    });
    if (failed.length) void runBatch(tab, failed, true);
  }, [filtered, metaMap, runBatch, tab]);

  const clearStatuses = useCallback(() => {
    (tab === "lyrics" ? setLyricsMeta : setCoverMeta)({});
  }, [tab]);

  /* ── per-row actions ── */
  const fetchOne = useCallback(
    (tr: Track) => {
      void runBatch(tab, [tr]);
    },
    [runBatch, tab],
  );

  const retryOne = useCallback(
    (tr: Track) => {
      void runBatch(tab, [tr], true);
    },
    [runBatch, tab],
  );

  const playTrack = useCallback(
    (tr: Track) => {
      engine.setQueue(filtered.map((x) => x.id), tr.id);
    },
    [filtered],
  );

  const saveLyrics = useCallback(
    async (tr: Track) => {
      const text = lyricsToText(tr);
      if (!text) {
        uiApi.toast(t("notFoundToast"), "info");
        return;
      }
      setSaving("lyrics");
      try {
        const srcPath = audioPathFor(tr.id);
        let savedName = "";
        if (srcPath) {
          try {
            await saveLrcFile(srcPath, text);
            savedName = `${tr.title}.lrc`;
          } catch {
            savedName = "";
          }
        }
        if (!savedName) {
          const name = `${sanitizeFilename(`${tr.artist} - ${tr.title}`)}.lrc`;
          browserDownload(text, name, "text/plain;charset=utf-8");
          savedName = name;
        }
        uiApi.toast(`${t("dlSaved")} — ${savedName}`, "success");
      } finally {
        setSaving(null);
      }
    },
    [t],
  );

  const saveCover = useCallback(
    async (tr: Track) => {
      setSaving("cover");
      try {
        let blob = await db.getCover(tr.id).catch(() => undefined);
        if (!blob) {
          const u = await coverUrl(tr.id);
          if (u && !u.startsWith("data:")) blob = await fetch(u).then((r) => (r.ok ? r.blob() : undefined)).catch(() => undefined);
        }
        if (!blob) {
          uiApi.toast(t("notFoundToast"), "info");
          return;
        }
        const ext = EXT_FOR_MIME[blob.type] || "jpg";
        const srcPath = audioPathFor(tr.id);
        let savedName = "";
        if (srcPath) {
          try {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            await saveCoverImage(srcPath, bytes, ext);
            savedName = `${tr.title}.${ext}`;
          } catch {
            savedName = "";
          }
        }
        if (!savedName) {
          const name = `${sanitizeFilename(`${tr.artist} - ${tr.title}`)}.${ext}`;
          browserDownload(blob, name, blob.type);
          savedName = name;
        }
        uiApi.toast(`${t("dlSaved")} — ${savedName}`, "success");
      } finally {
        setSaving(null);
      }
    },
    [t],
  );

  const saveAudio = useCallback(
    async (tr: Track) => {
      setSaving("audio");
      try {
        const ok = await saveAudioFileFor(tr.id);
        uiApi.toast(ok ? `${t("dlSaved")} — ${tr.title}` : t("notFoundToast"), ok ? "success" : "info");
      } finally {
        setSaving(null);
      }
    },
    [t],
  );

  /* ── LRCLIB health check (inline note) ── */
  const runHealthCheck = useCallback(async () => {
    setConn("checking");
    const ok = await lrclibHealthCheck();
    setConn(ok ? "ok" : "fail");
    window.setTimeout(() => setConn("idle"), 4500);
  }, []);

  /* ── derived ledger numbers ── */
  const processed = useMemo(
    () => filtered.filter((tr) => (metaMap[tr.id]?.status ?? "idle") !== "idle").length,
    [filtered, metaMap],
  );
  const progressPct = Math.min(100, Math.round((processed / Math.max(1, filtered.length)) * 100));
  const doneCount = counts.done ?? 0;

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (counts.done) parts.push(`${counts.done} ✓`);
    if (counts["not-found"]) parts.push(`${counts["not-found"]} ✗`);
    if (counts.instrumental) parts.push(`${counts.instrumental} ♪`);
    if (counts.error) parts.push(`${counts.error} !`);
    if (counts.skipped) parts.push(`${counts.skipped} »`);
    return parts.length ? parts.join("  ·  ") : t("edcReady");
  }, [counts, t]);

  /* ── stamps vocabulary (engine-era keys reused where present) ── */
  const statusLabels: Record<DlStatus, string> = useMemo(
    () => ({
      idle: t("edcIdle"),
      queued: t("sfWaiting"),
      searching: t("sfSearching"),
      done: t("sfSaved"),
      "not-found": t("sfNotfound"),
      instrumental: t("sfInstrumental"),
      error: t("sfError"),
      skipped: t("edcSkipped"),
    }),
    [t],
  );

  const rowLabels = useMemo(
    () => ({
      select: t("edcSelectAll"),
      play: t("play"),
      fetch: t("edcFetchNow"),
      retry: t("sfRetry"),
      manual: t("dlManualSearch"),
      saveLyrics: t("edcSaveLyrics"),
      saveCover: t("dlSaveCover"),
      saveAudio: t("dlSaveAudio"),
      status: statusLabels,
    }),
    [statusLabels, t],
  );

  const interpolate = useCallback((template: string, n: number) => template.replace("{{n}}", String(n)), []);

  return (
    <div className="ne-scroll h-full">
      <div className="mx-auto max-w-[920px] px-5 pb-[150px] pt-[86px] sm:px-8">
        {/* masthead */}
        <div className="ne-eyebrow mb-1.5">NOBODY · LRCLIB · ITUNES · DEEZER</div>
        <h1 className="ne-display ne-h1 max-w-[560px] pb-2">{t("dlTitle")}</h1>
        <p className="max-w-[560px] text-[13px] leading-relaxed text-[var(--mut)]">{t("dlSub")}</p>

        {/* LRCLIB health check — printed footnote */}
        <div className="edc-health">
          <button type="button" className="ne-btn" onClick={() => void runHealthCheck()} disabled={conn === "checking"}>
            {conn === "checking" ? <Loader2 size={13} className="edc-spin" /> : conn === "ok" ? <CheckCircle2 size={13} /> : conn === "fail" ? <AlertCircle size={13} /> : <Sparkles size={13} />}
            {t("dlHealthCheck")}
          </button>
          {conn === "ok" || conn === "fail" ? (
            <span className="edc-health-note" data-ok={conn === "ok"} role="status">
              {conn === "ok" ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
              {conn === "ok" ? t("edcConnOk") : t("edcConnFail")}
            </span>
          ) : null}
        </div>

        {/* chapters — roman numerals */}
        <div className="edc-tabs" role="tablist" aria-label={t("dlTitle")}>
          <button type="button" role="tab" aria-selected={tab === "lyrics"} className="edc-tab" data-on={tab === "lyrics"} onClick={() => setTab("lyrics")}>
            <i aria-hidden>I.</i>
            <span className="ne-display">{t("edcLyricsTab")}</span>
            {tab === "lyrics" && doneCount > 0 ? <b>{doneCount}</b> : null}
          </button>
          <button type="button" role="tab" aria-selected={tab === "covers"} className="edc-tab" data-on={tab === "covers"} onClick={() => setTab("covers")}>
            <i aria-hidden>II.</i>
            <span className="ne-display">{t("edcCoversTab")}</span>
            {tab === "covers" && doneCount > 0 ? <b>{doneCount}</b> : null}
          </button>
        </div>

        {/* printed stat header line */}
        <div className="edc-ledger-head">
          <span>
            <b>{stats.total}</b> {t("edcStatTracks")}
          </span>
          <span className="edc-ledger-sep" aria-hidden>·</span>
          <span className="edc-ok">
            <b>{stats.withCount}</b> {tab === "lyrics" ? t("edcStatWithLyrics") : t("edcStatWithCovers")}
          </span>
          <span className="edc-ledger-sep" aria-hidden>·</span>
          <span className="edc-warn">
            <b>{stats.missing}</b> {tab === "lyrics" ? t("edcStatNoLyrics") : t("edcStatNoCovers")}
          </span>
          <span className="edc-leader" aria-hidden />
          <span className="tnum" dir="ltr">
            {t("dlDone").replace("{{done}}", String(processed)).replace("{{total}}", String(filtered.length))}
          </span>
        </div>

        {library.length === 0 ? (
          <div className="ne-card edc-empty mt-6">
            <Info size={30} strokeWidth={1.5} />
            <div className="ne-display">{t("edcEmptyLibrary")}</div>
            <span>{t("edcEmptyLibraryHint")}</span>
          </div>
        ) : (
          <>
            {/* toolbar */}
            <div className="edc-toolbar">
              <div className="ne-input ne-input-plain edc-scope">
                <SelectMenu value={scope} onChange={setScope} ariaLabel={t("sfScope")} options={scopeOptions} />
              </div>
              <label className="edc-search">
                <Search size={14} aria-hidden />
                <input
                  className="ne-input"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  spellCheck={false}
                  aria-label={t("searchPlaceholder")}
                />
                {query ? (
                  <button type="button" className="edc-search-clear" onClick={() => setQuery("")} aria-label={t("edcClose")}>
                    <X size={12} />
                  </button>
                ) : null}
              </label>
            </div>

            {/* selection + status filter chips */}
            <div className="edc-selrow">
              <button type="button" className="edc-mini" onClick={selectAll}>{t("edcSelectAll")}</button>
              <button type="button" className="edc-mini" onClick={selectNone}>{t("edcSelectNone")}</button>
              <button type="button" className="edc-mini" onClick={selectInvert}>{t("edcSelectInvert")}</button>
              {selected.size ? (
                <em className="edc-selnote" dir="auto">{interpolate(t("edcSelected"), selected.size)}</em>
              ) : null}
              <div className="edc-chips" role="group" aria-label={t("sfScope")}>
                {STATUS_ORDER.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="edc-chip"
                    data-on={statusFilter === key}
                    onClick={() => setStatusFilter(key)}
                    aria-pressed={statusFilter === key}
                  >
                    {key === "all" ? t("edcSelectAll") : statusLabels[key as DlStatus]}
                    <b>{key === "all" ? inScope.length : counts[key as Exclude<StatusFilter, "all">]}</b>
                  </button>
                ))}
              </div>
            </div>

            {/* action bar */}
            <div className="edc-actionbar">
              {sfRunning ? (
                <button type="button" className="ne-btn" onClick={stopBatch}>
                  <X size={14} />
                  {t("edcStop")}
                </button>
              ) : (
                <button type="button" className="ne-btn ne-btn-primary" onClick={startBatch} disabled={!filtered.length}>
                  <Download size={14} />
                  {processed > 0 ? t("edcRestart") : t("sfStart")}
                </button>
              )}
              <button type="button" className="ne-btn" onClick={retryFailed} disabled={sfRunning}>
                <RefreshCw size={13} />
                {t("dlRetryFailed")}
              </button>
              <button type="button" className="ne-btn" onClick={clearStatuses} disabled={sfRunning}>
                <X size={13} />
                {t("dlClear")}
              </button>
              <span className="edc-count" dir="auto">
                {interpolate(t("tracksInGroup"), filtered.length)}
                {selected.size ? ` · ${interpolate(t("edcSelected"), selected.size)}` : ""}
              </span>
              <div className="edc-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPct}>
                <div className="edc-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="edc-summary" dir="auto" aria-live="polite">
                {sfRunning ? <Loader2 size={12} className="edc-spin" /> : null}
                {summary}
              </span>
            </div>

            {/* options — a small settings card */}
            <div className="ne-card edc-optcard mt-4">
              <div className="flex items-center gap-2 py-2.5">
                <Settings2 size={13} style={{ color: "var(--accent-ink)" }} aria-hidden />
                <span className="ne-eyebrow !mb-0">{t("dlOptions")}</span>
              </div>
              <button type="button" className="edc-optrow" onClick={() => setOptions({ skipExisting: !sfSkipExisting })} role="switch" aria-checked={sfSkipExisting}>
                <span className="edc-opt-text">
                  <strong>{t("dlSkipExisting")}</strong>
                  <small>{t("edcOptSkipHint")}</small>
                </span>
                <span className="ne-switch" data-on={sfSkipExisting} aria-hidden />
              </button>
              <button type="button" className="edc-optrow" onClick={() => setOptions({ autoApply: !sfAutoApply })} role="switch" aria-checked={sfAutoApply}>
                <span className="edc-opt-text">
                  <strong>{t("dlAutoApply")}</strong>
                  <small>{t("edcOptApplyHint")}</small>
                </span>
                <span className="ne-switch" data-on={sfAutoApply} aria-hidden />
              </button>
              <button type="button" className="edc-optrow" onClick={() => setOptions({ saveToDisk: !sfSaveToDisk })} role="switch" aria-checked={sfSaveToDisk}>
                <span className="edc-opt-text">
                  <strong>{t("dlSaveToDisk")}</strong>
                  <small>{t("edcOptSaveHint")}</small>
                </span>
                <span className="ne-switch" data-on={sfSaveToDisk} aria-hidden />
              </button>
            </div>

            {/* ledger */}
            <div className="edc-list" role="list">
              {filtered.length === 0 ? (
                <div className="edc-empty">
                  <Info size={26} strokeWidth={1.5} />
                  <span>{t("edcEmptyFiltered")}</span>
                </div>
              ) : (
                filtered.map((tr) => (
                  <DlRow
                    key={tr.id}
                    track={tr}
                    meta={metaMap[tr.id]}
                    selected={selected.has(tr.id)}
                    tab={tab}
                    running={sfRunning}
                    labels={rowLabels}
                    saving={saving}
                    onToggle={toggleSel}
                    onPlay={playTrack}
                    onFetch={fetchOne}
                    onRetry={retryOne}
                    onManual={tab === "lyrics" ? setManualLyricsTrack : setManualCoverTrack}
                    onSaveLyrics={(x) => void saveLyrics(x)}
                    onSaveCover={(x) => void saveCover(x)}
                    onSaveAudio={(x) => void saveAudio(x)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {manualLyricsTrack ? (
          <LyricsSearchModal
            track={manualLyricsTrack}
            close={() => setManualLyricsTrack(null)}
            labels={{
              title: t("edcManualLyrics"),
              queryTitle: t("edcQueryTitle"),
              queryArtist: t("edcQueryArtist"),
              searchBtn: t("edcSearch"),
              searching: t("sfSearching"),
              noResults: t("dlNoCandidates"),
              exactDur: t("edcExactDur"),
              synced: t("dlSynced"),
              plain: t("dlPlain"),
              instrumental: t("sfInstrumental"),
              apply: t("dlApply"),
              applied: t("edcApplied"),
              saveFile: t("dlSaveFile"),
              savedFile: t("dlSaved"),
              close: t("edcClose"),
            }}
            note={t("edcModalNote")}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {manualCoverTrack ? (
          <CoverSearchModal
            track={manualCoverTrack}
            close={() => setManualCoverTrack(null)}
            labels={{
              title: t("edcManualCover"),
              searching: t("sfSearching"),
              noResults: t("dlNoCandidates"),
              apply: t("dlApply"),
              applied: t("edcApplied"),
              saveFile: t("dlSaveFile"),
              savedFile: t("dlSaved"),
              close: t("edcClose"),
            }}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
