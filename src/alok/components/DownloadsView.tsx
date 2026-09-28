// ── NOBODY ALOK · transfer bay (download center) ─────────────────────────────
// Full classic Download Center parity, rebuilt in the ALOK instrument-panel
// language: a batch queue of ruled rows with mono status glyphs, a thin ruled
// progress bar with mono counters, reticle checkboxes and hairline readouts.
//
// Data layer is the UNIFIED engine (src/cinema/lib/smartFetch.ts):
//   startSmartFetch / cancelSmartFetch / retryItem / fetchOneLyrics /
//   fetchOneCover / setOptions / searchLyricsCandidates /
//   searchCoverCandidates / applyLyricsCandidate / applyCoverCandidate /
//   lrclibHealthCheck / saveAudioFileFor. Terminal statuses land in a
//   per-mode view ledger ("lyrics" / "covers" keep separate ledgers, like the
//   classic page) and transient queued/searching states stream straight off
//   the engine store. Scope is passed as an OBJECT spec so concurrent panels
//   never clobber each other.
//
// Manual pickers mirror the classic modals: editable artist/title/album/
// duration query, candidate list with exact ±3s / synced / plain /
// instrumental badges, preview, APPLY (in-app) and SAVE (sidecar file).

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownToLine,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleStop,
  Download,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Music,
  RefreshCw,
  ScanSearch,
  Search,
  X,
} from "lucide-react";
import { useLibrary } from "../../cinema/store/library";
import { uiApi } from "../../cinema/store/ui";
import { engine } from "../../cinema/lib/engine";
import { db } from "../../cinema/lib/db";
import { useT } from "../../cinema/lib/useT";
import { fmtTime } from "../../cinema/lib/utils";
import { CoverArt } from "../../cinema/components/CoverArt";
import { getBridge, sourcePathFromSourceUrl } from "../../cinema/lib/desktopBridge";
import { useFolderManager } from "../../cinema/lib/folderManager";
import {
  applyCoverCandidate,
  applyLyricsCandidate,
  cancelSmartFetch,
  fetchOneCover,
  fetchOneLyrics,
  lrclibHealthCheck,
  retryItem,
  saveAudioFileFor,
  searchCoverCandidates,
  searchLyricsCandidates,
  startSmartFetch,
  useSmartFetch,
} from "../../cinema/lib/smartFetch";
import { saveCoverImage, saveLrcFile } from "../../desktopLibrary";
import { downloadCoverArt } from "../../coverart";
import type { LrclibResult } from "../../lrclib";
import type { CoverCandidate } from "../../coverart";
import type { Track } from "../../cinema/types";
import { useAlokT } from "../lib/i18n";

type DlStatus = "idle" | "queued" | "searching" | "done" | "notfound" | "instrumental" | "error" | "skipped";
type DlFilter = DlStatus | "all";
type DlMode = "lyrics" | "covers";

interface DlMeta {
  status: DlStatus;
  kind?: "synced" | "plain";
}

const STATUS_GLYPH: Record<DlStatus, string> = {
  idle: "·",
  queued: "…",
  searching: "◐",
  done: "✓",
  notfound: "×",
  instrumental: "♪",
  error: "!",
  skipped: "»",
};

const STATUS_KEY: Record<DlStatus, string> = {
  idle: "alDlStIdle",
  queued: "alDlStQueued",
  searching: "alDlStSearching",
  done: "alDlStDone",
  notfound: "alDlStNotFound",
  instrumental: "alDlStInstrumental",
  error: "alDlStError",
  skipped: "alDlStSkipped",
};

const FILTERS: DlFilter[] = ["all", "idle", "queued", "searching", "done", "notfound", "instrumental", "error", "skipped"];
const ZERO_COUNTS: Record<DlStatus, number> = { idle: 0, queued: 0, searching: 0, done: 0, notfound: 0, instrumental: 0, error: 0, skipped: 0 };

const hasRealLyrics = (t: Track) => Boolean(t.syncedLyrics?.length || t.plainLyrics);
const hasRealCover = (t: Track) => t.hasCover && !t.isPlaceholderCover;

function sanitizeName(name: string): string {
  return (
    (name || "nobody")
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "nobody"
  );
}

/** Pure-web fallback for "save to disk": blob + anchor download. */
function anchorDownload(data: Blob | string, filename: string, mime = "application/octet-stream") {
  try {
    const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeName(filename);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch {
    /* best-effort */
  }
}

/** Serialized .lrc text from parsed synced lines ([mm:ss.xx] text). */
function toLrcText(lines: { t: number; text: string }[]): string {
  return lines
    .map((l) => {
      const sec = Math.max(0, l.t);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      return `[${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}]${l.text}`;
    })
    .join("\n");
}

/** Real absolute path of the track's audio (null in pure-web). */
function audioSrcPath(trackId: string): string | null {
  return sourcePathFromSourceUrl(getBridge()?.resolveSource(trackId) ?? null);
}

/* ═════════════════════════════════════════════════════════════════════════ */

export function DownloadsView() {
  const t = useT();
  const tt = useAlokT();
  const tracksMap = useLibrary((s) => s.tracks);
  const order = useLibrary((s) => s.order);
  const { folders } = useFolderManager();

  // engine store (shared with cinema/EELA — one queue, one truth)
  const mode = useSmartFetch((s) => s.mode);
  const items = useSmartFetch((s) => s.items);
  const running = useSmartFetch((s) => s.running);
  const doneCount = useSmartFetch((s) => s.done);
  const skipExisting = useSmartFetch((s) => s.skipExisting);
  const autoApply = useSmartFetch((s) => s.autoApply);
  const saveToDisk = useSmartFetch((s) => s.saveToDisk);
  const setMode = useSmartFetch((s) => s.setMode);
  const setOptions = useSmartFetch((s) => s.setOptions);

  const [scope, setScope] = useState<string>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<DlFilter>("all");
  const [lrcMeta, setLrcMeta] = useState<Record<string, DlMeta>>({});
  const [coverMeta, setCoverMeta] = useState<Record<string, DlMeta>>({});
  const [manualTrack, setManualTrack] = useState<Track | null>(null);
  const [health, setHealth] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => order.map((id) => tracksMap[id]).filter(Boolean) as Track[], [order, tracksMap]);
  const meta = mode === "lyrics" ? lrcMeta : coverMeta;

  /* ── engine → ledger: terminal statuses land in the mode's ledger ── */
  useEffect(() => {
    if (!items.length) return;
    const setM = mode === "lyrics" ? setLrcMeta : setCoverMeta;
    setM((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const it of items) {
        const mapped: DlStatus | null =
          it.status === "saved"
            ? "done"
            : it.status === "notfound"
              ? "notfound"
              : it.status === "error"
                ? "error"
                : it.status === "instrumental"
                  ? "instrumental"
                  : null;
        if (!mapped) continue;
        const kind = it.detail === "plain" ? ("plain" as const) : undefined;
        const cur = next[it.trackId];
        if (cur && cur.status === mapped && (cur.kind ?? undefined) === kind) continue;
        next[it.trackId] = { status: mapped, kind: kind ?? cur?.kind };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [items, mode]);

  /* ── live statuses: terminal ledger first, then the engine's stream ── */
  const engineById = useMemo(() => {
    const m = new Map<string, (typeof items)[number]>();
    for (const it of items) m.set(it.trackId, it);
    return m;
  }, [items]);

  const statusMap = useMemo(() => {
    const map = new Map<string, DlStatus>();
    for (const tr of all) {
      const term = meta[tr.id];
      if (term) {
        map.set(tr.id, term.status);
        continue;
      }
      const it = engineById.get(tr.id);
      map.set(tr.id, running && it && (it.status === "waiting" || it.status === "searching") ? (it.status === "waiting" ? "queued" : "searching") : "idle");
    }
    return map;
  }, [all, meta, engineById, running]);

  const scoped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(
      (tr) =>
        (scope === "all" || tr.folderPath === scope) &&
        (!needle || `${tr.title} ${tr.artist} ${tr.album}`.toLowerCase().includes(needle)),
    );
  }, [all, scope, q]);

  const counts = useMemo(() => {
    const c = { ...ZERO_COUNTS };
    for (const tr of scoped) c[statusMap.get(tr.id) ?? "idle"]++;
    return c;
  }, [scoped, statusMap]);

  const filtered = useMemo(
    () => (filter === "all" ? scoped : scoped.filter((tr) => (statusMap.get(tr.id) ?? "idle") === filter)),
    [scoped, filter, statusMap],
  );

  const stats = useMemo(() => {
    const list = scope === "all" ? all : all.filter((tr) => tr.folderPath === scope);
    const withData = list.filter((tr) => (mode === "lyrics" ? hasRealLyrics(tr) : hasRealCover(tr))).length;
    return { total: list.length, with: withData, missing: list.length - withData };
  }, [all, scope, mode]);

  const playIds = useMemo(() => filtered.map((tr) => tr.id), [filtered]);

  /* ── selection ── */
  const toggleSel = useCallback((id: string) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selAll = useCallback(() => setSel(new Set(filtered.map((tr) => tr.id))), [filtered]);
  const selNone = useCallback(() => setSel(new Set()), []);
  const selInvert = useCallback(
    () => setSel(new Set(filtered.filter((tr) => !sel.has(tr.id)).map((tr) => tr.id))),
    [filtered, sel],
  );

  /* ── scope popover: close on outside click ── */
  useEffect(() => {
    if (!scopeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (scopeRef.current && !scopeRef.current.contains(e.target as Node)) setScopeOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [scopeOpen]);

  /* ── actions ── */
  const clearRows = useCallback(
    (ids: string[], setM: (fn: (prev: Record<string, DlMeta>) => Record<string, DlMeta>) => void) => {
      setM((prev) => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
    },
    [],
  );

  const startBatch = useCallback(async () => {
    const sf = useSmartFetch.getState();
    if (sf.running) return;
    const source = sel.size ? filtered.filter((tr) => sel.has(tr.id)) : filtered;
    if (!source.length) return;
    const eligible: string[] = [];
    const skippedMarks: Record<string, DlMeta> = {};
    for (const tr of source) {
      const has = mode === "lyrics" ? hasRealLyrics(tr) : hasRealCover(tr);
      if (sf.skipExisting && has) skippedMarks[tr.id] = { status: "skipped" };
      else eligible.push(tr.id);
    }
    const setM = mode === "lyrics" ? setLrcMeta : setCoverMeta;
    setM((prev) => {
      const next = { ...prev };
      for (const id of eligible) delete next[id]; // a re-run resets old terminal marks
      return { ...next, ...skippedMarks };
    });
    if (!eligible.length) {
      uiApi.toast(tt("alDlAllSkipped"), "info");
      return;
    }
    sf.setMode(mode);
    const res = await startSmartFetch(t, { mode, scope: { trackIds: eligible } });
    if (res === "empty") uiApi.toast(tt("alDlAllSkipped"), "info");
  }, [filtered, sel, mode, t, tt]);

  const stopBatch = useCallback(() => cancelSmartFetch(), []);

  const retryFailed = useCallback(() => {
    if (running) return;
    const failed = scoped.filter((tr) => {
      const s = meta[tr.id]?.status;
      return s === "error" || s === "notfound";
    });
    if (!failed.length) return;
    clearRows(
      failed.map((tr) => tr.id),
      mode === "lyrics" ? setLrcMeta : setCoverMeta,
    );
    void startSmartFetch(t, { mode, scope: { trackIds: failed.map((tr) => tr.id) } });
  }, [running, scoped, meta, mode, t, clearRows]);

  const clearLedger = useCallback(() => {
    if (running) return;
    setLrcMeta({});
    setCoverMeta({});
    useSmartFetch.setState({ items: [], done: 0, summaryShown: false });
  }, [running]);

  const fetchNow = useCallback(
    async (tr: Track) => {
      if (running) return;
      const setM = mode === "lyrics" ? setLrcMeta : setCoverMeta;
      setM((prev) => ({ ...prev, [tr.id]: { status: "searching" } }));
      const ok = mode === "lyrics" ? await fetchOneLyrics(tr.id) : await fetchOneCover(tr.id);
      setM((prev) => ({ ...prev, [tr.id]: ok ? { status: "done" } : { status: "notfound" } }));
    },
    [running, mode],
  );

  const retryRow = useCallback(
    (tr: Track) => {
      if (running) return;
      const it = engineById.get(tr.id);
      if (it && (it.status === "error" || it.status === "notfound")) {
        // engine-tracked row: clear the ledger mark and let the engine re-run it
        clearRows([tr.id], mode === "lyrics" ? setLrcMeta : setCoverMeta);
        void retryItem(tr.id);
      } else {
        void fetchNow(tr);
      }
    },
    [running, engineById, mode, clearRows, fetchNow],
  );

  const openManual = useCallback((tr: Track) => setManualTrack(tr), []);
  const closeManual = useCallback(
    (applied?: boolean) => {
      if (applied && manualTrack) {
        const setM = mode === "lyrics" ? setLrcMeta : setCoverMeta;
        setM((prev) => ({ ...prev, [manualTrack.id]: { status: "done" } }));
      }
      setManualTrack(null);
    },
    [manualTrack, mode],
  );

  const saveLrc = useCallback(
    async (tr: Track) => {
      const content = tr.syncedLyrics?.length ? toLrcText(tr.syncedLyrics) : tr.plainLyrics || "";
      if (!content) return;
      const srcPath = audioSrcPath(tr.id);
      if (srcPath) {
        try {
          await saveLrcFile(srcPath, content);
          uiApi.toast(`${tr.title} — ${tt("alDlSaved")}`, "success");
          return;
        } catch {
          /* fall through to the browser download */
        }
      }
      anchorDownload(content, `${sanitizeName(`${tr.artist} - ${tr.title}`)}.lrc`, "text/plain; charset=utf-8");
      uiApi.toast(`${tr.title} — ${tt("alDlSaved")}`, "success");
    },
    [tt],
  );

  const saveCover = useCallback(
    async (tr: Track) => {
      const blob = await db.getCover(tr.id).catch(() => undefined);
      if (!blob) {
        uiApi.toast(tt("alDlSaveFail"), "error");
        return;
      }
      const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
      const srcPath = audioSrcPath(tr.id);
      if (srcPath) {
        try {
          const bytes = new Uint8Array(await blob.arrayBuffer());
          await saveCoverImage(srcPath, bytes, ext);
          uiApi.toast(`${tr.title} — ${tt("alDlSaved")}`, "success");
          return;
        } catch {
          /* fall through to the browser download */
        }
      }
      anchorDownload(blob, `${sanitizeName(`${tr.artist} - ${tr.title}`)}.${ext}`);
      uiApi.toast(`${tr.title} — ${tt("alDlSaved")}`, "success");
    },
    [tt],
  );

  const saveAudio = useCallback(
    async (tr: Track) => {
      const ok = await saveAudioFileFor(tr.id);
      uiApi.toast(ok ? `${tr.title} — ${tt("alDlSaved")}` : tt("alDlSaveFail"), ok ? "success" : "error");
    },
    [tt],
  );

  const runHealth = useCallback(async () => {
    if (health === "checking") return;
    setHealth("checking");
    const ok = await lrclibHealthCheck();
    setHealth(ok ? "ok" : "fail");
    window.setTimeout(() => setHealth((v) => (v === "ok" || v === "fail" ? "idle" : v)), 4000);
  }, [health]);

  /* ── derived readouts ── */
  const queueTotal = items.length;
  const pct = queueTotal ? Math.min(100, Math.round((doneCount / queueTotal) * 100)) : 0;

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (counts.done) parts.push(`✓ ${counts.done}`);
    if (counts.notfound) parts.push(`× ${counts.notfound}`);
    if (counts.instrumental) parts.push(`♪ ${counts.instrumental}`);
    if (counts.error) parts.push(`! ${counts.error}`);
    if (counts.skipped) parts.push(`» ${counts.skipped}`);
    return parts.join(" · ");
  }, [counts]);

  const scopeLabel =
    scope === "all"
      ? tt("alDlScopeAll")
      : (folders.find((f) => f.path === scope)?.name ?? scope);

  /* ── empty library ── */
  if (all.length === 0) {
    return (
      <div className="na-dl-empty">
        <span className="na-dl-reticle" aria-hidden />
        <div className="na-mono" style={{ fontSize: 11, letterSpacing: "0.3em", color: "var(--na-faint)" }}>
          {tt("alDlEmpty")}
        </div>
        <small>{tt("alDlEmptyHint")}</small>
      </div>
    );
  }

  return (
    <div className="na-dl">
      {/* ── ruled stats readout + LRCLIB health ── */}
      <div className="na-dl-stats">
        <span className="na-dl-reticle na-dl-reticle-sm" aria-hidden />
        <div className="na-dl-stat">
          <b className="na-mono" dir="ltr">{stats.total}</b>
          <small>{tt("alDlTotal")}</small>
        </div>
        <div className="na-dl-stat">
          <b className="na-mono" dir="ltr">{stats.with}</b>
          <small>{tt("alDlWith")}</small>
        </div>
        <div className="na-dl-stat na-dl-stat-missing">
          <b className="na-mono" dir="ltr">{stats.missing}</b>
          <small>{tt("alDlMissing")}</small>
        </div>
        <button
          type="button"
          className="na-dl-health na-mono"
          onClick={() => void runHealth()}
          data-ok={health === "ok"}
          data-fail={health === "fail"}
          title={tt("alDlHealth")}
        >
          <i className="na-dl-health-dot" aria-hidden />
          {health === "checking" ? (
            <LoaderCircle size={12} className="na-dl-spin" aria-hidden />
          ) : null}
          {health === "ok" ? tt("alDlOnline") : health === "fail" ? tt("alDlOffline") : tt("alDlHealth")}
        </button>
      </div>

      {/* ── toolbar: mode / scope / filter ── */}
      <div className="na-dl-toolbar">
        <div className="na-seg" role="tablist" aria-label={tt("alDlBay")}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "lyrics"}
            className="na-seg-btn"
            data-on={mode === "lyrics"}
            disabled={running}
            onClick={() => setMode("lyrics")}
          >
            <FileText size={12} aria-hidden /> {tt("alDlModeLyrics")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "covers"}
            className="na-seg-btn"
            data-on={mode === "covers"}
            disabled={running}
            onClick={() => setMode("covers")}
          >
            <ImageIcon size={12} aria-hidden /> {tt("alDlModeCovers")}
          </button>
        </div>

        <div className="na-dl-scope-wrap" ref={scopeRef}>
          <button
            type="button"
            className="na-dl-scope-btn na-mono"
            onClick={() => setScopeOpen((v) => !v)}
            aria-expanded={scopeOpen}
            aria-label={tt("alDlScope")}
            title={tt("alDlScope")}
          >
            <span dir="auto" className="na-dl-scope-label">{scopeLabel}</span>
            <ChevronDown size={12} style={{ transform: scopeOpen ? "rotate(180deg)" : undefined, transition: "transform .2s" }} aria-hidden />
          </button>
          {scopeOpen && (
            <div className="na-dl-menu na-scroll" role="listbox" aria-label={tt("alDlScope")}>
              <button
                type="button"
                className="na-dl-menu-item"
                data-on={scope === "all"}
                onClick={() => {
                  setScope("all");
                  setScopeOpen(false);
                }}
              >
                <span dir="auto">{tt("alDlScopeAll")}</span>
                <b className="na-mono" dir="ltr">{all.length}</b>
              </button>
              {folders.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className="na-dl-menu-item"
                  data-on={scope === f.path}
                  onClick={() => {
                    setScope(f.path);
                    setScopeOpen(false);
                  }}
                >
                  <span dir="auto">{f.name}</span>
                  <b className="na-mono" dir="ltr">{f.trackCount}</b>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <Search size={13} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--na-faint)]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tt("alDlSearchPh")}
            type="search"
            className="na-input w-[190px] ps-9"
            aria-label={tt("alDlSearchPh")}
          />
        </div>
      </div>

      {/* ── status chips + selection ── */}
      <div className="na-dl-chips">
        <div className="na-dl-chips-row" role="group" aria-label="status filter">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className="na-dl-chip na-mono"
              data-on={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "all"
                ? tt("alDlFilterAll")
                : f === "idle"
                  ? tt("alDlStIdle")
                  : tt(STATUS_KEY[f as DlStatus])}
              <b dir="ltr">{f === "all" ? scoped.length : counts[f as DlStatus]}</b>
            </button>
          ))}
        </div>
        <div className="na-dl-selbox">
          <button type="button" className="na-dl-mini na-mono" onClick={selAll}>{tt("alDlAll")}</button>
          <button type="button" className="na-dl-mini na-mono" onClick={selNone}>{tt("alDlNone")}</button>
          <button type="button" className="na-dl-mini na-mono" onClick={selInvert}>{tt("alDlInvert")}</button>
          <em className="na-mono" dir="auto">
            {sel.size} {tt("alDlSelected")}
          </em>
        </div>
      </div>

      {/* ── options (engine setOptions — persisted) ── */}
      <div className="na-dl-opts">
        <span className="na-dl-opts-label">{tt("alDlOptions")}</span>
        <OptSwitch
          label={tt("alDlOptSkip")}
          hint={tt("alDlOptSkipHint")}
          on={skipExisting}
          onToggle={() => setOptions({ skipExisting: !skipExisting })}
        />
        <OptSwitch
          label={tt("alDlOptAuto")}
          hint={tt("alDlOptAutoHint")}
          on={autoApply}
          onToggle={() => setOptions({ autoApply: !autoApply })}
        />
        <OptSwitch
          label={tt("alDlOptSave")}
          hint={tt("alDlOptSaveHint")}
          on={saveToDisk}
          onToggle={() => setOptions({ saveToDisk: !saveToDisk })}
        />
      </div>

      {/* ── action bar: start/stop · retry · reset · ruled progress ── */}
      <div className="na-dl-actions">
        {running ? (
          <button type="button" className="na-btn na-dl-stop" onClick={stopBatch}>
            <CircleStop size={14} /> {tt("alDlStop")}
          </button>
        ) : (
          <button type="button" className="na-btn na-btn-primary" onClick={() => void startBatch()} disabled={!filtered.length}>
            <ArrowDownToLine size={14} /> {tt("alDlStart")}
          </button>
        )}
        <button type="button" className="na-btn" onClick={retryFailed} disabled={running}>
          <RefreshCw size={13} /> {tt("alDlRetryFailed")}
        </button>
        <button type="button" className="na-btn" onClick={clearLedger} disabled={running}>
          <X size={13} /> {tt("alDlClear")}
        </button>
        <div className="na-dl-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-hidden>
          <i style={{ width: `${pct}%` }} />
        </div>
        <span className="na-dl-count na-mono" dir="ltr" aria-live="polite">
          {running ? <LoaderCircle size={11} className="na-dl-spin" aria-hidden /> : null}
          {String(doneCount).padStart(2, "0")}/{String(queueTotal).padStart(2, "0")} · {pct}%
        </span>
        <span className="na-dl-summary na-mono" dir="ltr">
          {summary || tt("alDlReady")}
        </span>
      </div>

      {/* ── the batch queue: ruled rows ── */}
      <div className="na-dl-list" role="list">
        {filtered.length === 0 ? (
          <div className="na-dl-nomatch na-mono">{tt("alDlNoMatch")}</div>
        ) : (
          filtered.map((tr) => (
            <DlRow
              key={tr.id}
              tr={tr}
              mode={mode}
              status={statusMap.get(tr.id) ?? "idle"}
              kind={meta[tr.id]?.kind}
              selected={sel.has(tr.id)}
              running={running}
              playIds={playIds}
              tt={tt}
              t={t}
              onToggle={toggleSel}
              onPlay={(ids, id, autoplay) => engine.setQueue(ids, id, autoplay)}
              onFetchNow={(track) => void fetchNow(track)}
              onRetry={retryRow}
              onManual={openManual}
              onSaveLrc={(track) => void saveLrc(track)}
              onSaveCover={(track) => void saveCover(track)}
              onSaveAudio={(track) => void saveAudio(track)}
            />
          ))
        )}
      </div>

      {/* ── manual pickers ── */}
      <AnimatePresence>
        {manualTrack && mode === "lyrics" && (
          <ManualLyricsSheet key="lrc" track={manualTrack} tt={tt} onClose={closeManual} />
        )}
        {manualTrack && mode === "covers" && (
          <ManualCoverSheet key="cov" track={manualTrack} tt={tt} onClose={closeManual} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════════════ */

/* small labeled switch (reuses the .na-switch atom, compact variant) */
function OptSwitch({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <span className="na-dl-opt" title={hint}>
      <span className="na-dl-opt-label">{label}</span>
      <span
        role="switch"
        aria-checked={on}
        aria-label={label}
        tabIndex={0}
        className="na-switch"
        data-on={on}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onToggle();
        }}
      />
    </span>
  );
}

/* ── the ruled queue row ─────────────────────────────────────────────────── */

interface DlRowProps {
  tr: Track;
  mode: DlMode;
  status: DlStatus;
  kind?: "synced" | "plain";
  selected: boolean;
  running: boolean;
  playIds: string[];
  tt: (k: string) => string;
  t: (k: string) => string;
  onToggle: (id: string) => void;
  onPlay: (ids: string[], id: string, play: boolean) => void;
  onFetchNow: (tr: Track) => void;
  onRetry: (tr: Track) => void;
  onManual: (tr: Track) => void;
  onSaveLrc: (tr: Track) => void;
  onSaveCover: (tr: Track) => void;
  onSaveAudio: (tr: Track) => void;
}

const DlRow = memo(function DlRow({
  tr,
  mode,
  status,
  kind,
  selected,
  running,
  playIds,
  tt,
  t,
  onToggle,
  onPlay,
  onFetchNow,
  onRetry,
  onManual,
  onSaveLrc,
  onSaveCover,
  onSaveAudio,
}: DlRowProps) {
  const busy = status === "searching" || status === "queued";
  const retryable = status === "error" || status === "notfound";
  const canSaveLrc = mode === "lyrics" && hasRealLyrics(tr);
  const canSaveCover = mode === "covers" && hasRealCover(tr);

  return (
    <div className="na-dl-row" role="listitem" data-status={status} data-sel={selected}>
      <button
        type="button"
        className="na-dl-cb"
        role="checkbox"
        aria-checked={selected}
        aria-label={`${tt("alDlSelect")}: ${tr.title}`}
        title={tt("alDlSelect")}
        onClick={() => onToggle(tr.id)}
      >
        {selected ? <CircleCheck size={11} strokeWidth={2.5} aria-hidden /> : null}
      </button>

      <button
        type="button"
        className="na-dl-thumb"
        onClick={() => onPlay(playIds, tr.id, true)}
        title={t("play")}
        aria-label={`${t("play")}: ${tr.title}`}
      >
        <CoverArt trackId={tr.id} rounded="rounded-full" />
      </button>

      <span className="na-dl-meta">
        <span className="na-dl-title" dir="auto">{tr.title}</span>
        <span className="na-dl-sub" dir="auto">
          {tr.artist}
          {tr.album && tr.album !== "Unknown Album" ? ` — ${tr.album}` : ""}
        </span>
      </span>

      <span className="na-dl-time na-mono" dir="ltr">{fmtTime(tr.duration)}</span>

      <span className="na-dl-status na-mono" dir="ltr" data-status={status}>
        <i className="na-dl-glyph" aria-hidden>
          {busy ? <LoaderCircle size={12} className="na-dl-spin" /> : STATUS_GLYPH[status]}
        </i>
        <em>{tt(STATUS_KEY[status])}</em>
        {status === "done" && kind === "plain" ? <b className="na-dl-kind">{tt("alDlPlain")}</b> : null}
      </span>

      <span className="na-dl-acts">
        {canSaveLrc && (
          <button type="button" className="na-icon-btn" onClick={() => onSaveLrc(tr)} title={tt("alDlSaveLrc")} aria-label={`${tt("alDlSaveLrc")}: ${tr.title}`}>
            <FileText size={13} />
          </button>
        )}
        {canSaveCover && (
          <button type="button" className="na-icon-btn" onClick={() => onSaveCover(tr)} title={tt("alDlSaveImg")} aria-label={`${tt("alDlSaveImg")}: ${tr.title}`}>
            <ImageIcon size={13} />
          </button>
        )}
        <button type="button" className="na-icon-btn" onClick={() => onSaveAudio(tr)} title={tt("alDlSaveAudio")} aria-label={`${tt("alDlSaveAudio")}: ${tr.title}`}>
          <Music size={13} />
        </button>
        <button
          type="button"
          className="na-icon-btn"
          onClick={() => onFetchNow(tr)}
          disabled={busy || running}
          title={tt("alDlFetchNow")}
          aria-label={`${tt("alDlFetchNow")}: ${tr.title}`}
        >
          <Download size={13} />
        </button>
        <button
          type="button"
          className="na-icon-btn"
          onClick={() => onRetry(tr)}
          disabled={running || !retryable}
          title={tt("alDlRetry")}
          aria-label={`${tt("alDlRetry")}: ${tr.title}`}
        >
          <RefreshCw size={13} />
        </button>
        <button
          type="button"
          className="na-icon-btn"
          onClick={() => onManual(tr)}
          title={tt("alDlManual")}
          aria-label={`${tt("alDlManual")}: ${tr.title}`}
        >
          <ScanSearch size={13} />
        </button>
      </span>
    </div>
  );
});

/* ═════════════════════════════════════════════════════════════════════════ */

/* shared manual-picker shell: centered modal above the panel */
function ManualShell({
  title,
  track,
  tt,
  onClose,
  children,
  footer,
}: {
  title: string;
  track: Track;
  tt: (k: string) => string;
  onClose: (applied?: boolean) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // capture-phase Esc: this sheet closes first, the panel stays open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <>
      <motion.div
        className="na-dl-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => onClose()}
        aria-hidden
      />
      <motion.div
        className="na-dl-modal"
        role="dialog"
        aria-label={title}
        initial={{ opacity: 0, y: 16, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.99 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="na-dl-modal-head">
          <span className="na-dl-modal-title na-mono">{title}</span>
          <span className="na-dl-modal-sub" dir="auto">
            {track.title} — {track.artist}
          </span>
          <button type="button" className="na-panel-x" onClick={() => onClose()} aria-label={tt("close")} title="Esc">
            <X size={15} />
          </button>
        </div>
        <div className="na-dl-modal-body na-scroll">{children}</div>
        {footer ? <div className="na-dl-modal-foot">{footer}</div> : null}
      </motion.div>
    </>
  );
}

/* ── manual lyrics search sheet ──────────────────────────────────────────── */

function ManualLyricsSheet({
  track,
  tt,
  onClose,
}: {
  track: Track;
  tt: (k: string) => string;
  onClose: (applied?: boolean) => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [album, setAlbum] = useState(track.album && track.album !== "Unknown Album" ? track.album : "");
  const [dur, setDur] = useState(track.duration ? String(Math.round(track.duration)) : "");
  const [results, setResults] = useState<LrclibResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setResults(null);
    setOpenId(null);
    try {
      const found = await searchLyricsCandidates({
        track_name: title.trim(),
        artist_name: artist.trim(),
        album_name: album.trim() || undefined,
        duration: Number(dur) > 0 ? Number(dur) : undefined,
      });
      setResults(found);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [title, artist, album, dur]);

  useEffect(() => {
    void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const durMatch = (c: LrclibResult) => c.duration > 0 && track.duration > 0 && Math.abs(c.duration - track.duration) <= 3;

  const applyCandidate = async (c: LrclibResult) => {
    setBusyId(c.id);
    const ok = await applyLyricsCandidate(track.id, c);
    setBusyId(null);
    if (ok) {
      uiApi.toast(`${track.title} — ${tt("alDlApplied")}`, "success");
      onClose(true);
    } else {
      uiApi.toast(tt("alDlSaveFail"), "error");
    }
  };

  const saveCandidate = async (c: LrclibResult) => {
    const content = c.syncedLyrics || c.plainLyrics || "";
    if (!content) return;
    let ok = false;
    const srcPath = audioSrcPath(track.id);
    if (srcPath) {
      try {
        await saveLrcFile(srcPath, content);
        ok = true;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      anchorDownload(content, `${sanitizeName(`${artist || track.artist} - ${title || track.title}`)}.lrc`, "text/plain; charset=utf-8");
      ok = true;
    }
    if (ok) {
      setSavedId(c.id);
      window.setTimeout(() => setSavedId((v) => (v === c.id ? null : v)), 2200);
    }
  };

  return (
    <ManualShell title={tt("alDlManualLyrics")} track={track} tt={tt} onClose={onClose}>
      {/* editable query */}
      <div className="na-dl-query">
        <label className="na-dl-field">
          <span className="na-mono">{tt("alDlQTitle")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} spellCheck={false} dir="auto" />
        </label>
        <label className="na-dl-field">
          <span className="na-mono">{tt("alDlQArtist")}</span>
          <input value={artist} onChange={(e) => setArtist(e.target.value)} spellCheck={false} dir="auto" />
        </label>
        <label className="na-dl-field">
          <span className="na-mono">{tt("alDlQAlbum")}</span>
          <input value={album} onChange={(e) => setAlbum(e.target.value)} spellCheck={false} dir="auto" />
        </label>
        <label className="na-dl-field na-dl-field-sm">
          <span className="na-mono">{tt("alDlQDur")}</span>
          <input
            value={dur}
            onChange={(e) => setDur(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            spellCheck={false}
            dir="ltr"
            className="na-mono"
          />
        </label>
        <button type="button" className="na-btn na-btn-primary na-dl-search-btn" onClick={() => void runSearch()} disabled={loading}>
          {loading ? <LoaderCircle size={13} className="na-dl-spin" aria-hidden /> : <Search size={13} aria-hidden />}
          {tt("alDlSearchBtn")}
        </button>
      </div>

      {/* candidates */}
      {loading ? (
        <div className="na-dl-cand-empty na-mono">
          <LoaderCircle size={16} className="na-dl-spin" aria-hidden /> {tt("alDlSearching")}
        </div>
      ) : results && results.length === 0 ? (
        <div className="na-dl-cand-empty na-mono">
          <CircleAlert size={16} aria-hidden /> {tt("alDlNoResults")}
        </div>
      ) : (
        results?.map((c) => (
          <div key={c.id} className="na-dl-cand" data-open={openId === c.id}>
            <button
              type="button"
              className="na-dl-cand-head"
              onClick={() => setOpenId(openId === c.id ? null : c.id)}
              aria-expanded={openId === c.id}
            >
              <span className="na-dl-cand-names" dir="ltr">
                <strong>{c.trackName}</strong>
                <small>
                  {c.artistName}
                  {c.albumName ? ` — ${c.albumName}` : ""}
                </small>
              </span>
              <span className="na-dl-cand-badges" dir="ltr">
                {durMatch(c) && <em className="na-dl-badge" data-tone="acc">{tt("alDlExact")}</em>}
                {c.syncedLyrics && <em className="na-dl-badge" data-tone="acc">{tt("alDlSynced")}</em>}
                {c.plainLyrics && <em className="na-dl-badge">{tt("alDlPlain")}</em>}
                {c.instrumental && <em className="na-dl-badge">{tt("alDlStInstrumental")}</em>}
              </span>
              <span className="na-dl-cand-dur na-mono" dir="ltr">
                {c.duration > 0 ? fmtTime(c.duration) : "—"}
              </span>
              <ChevronDown
                size={13}
                aria-hidden
                style={{ transform: openId === c.id ? "rotate(180deg)" : undefined, transition: "transform .2s", color: "var(--na-faint)" }}
              />
            </button>
            {openId === c.id && (
              <div className="na-dl-cand-body" dir="ltr">
                <pre className="na-mono">
                  {c.syncedLyrics
                    ? c.syncedLyrics.split(/\r?\n/).slice(0, 8).join("\n")
                    : (c.plainLyrics || "").split(/\r?\n/).slice(0, 8).join("\n")}
                </pre>
                <div className="na-dl-cand-actions">
                  <button
                    type="button"
                    className="na-btn na-btn-primary"
                    onClick={() => void applyCandidate(c)}
                    disabled={busyId === c.id}
                  >
                    {busyId === c.id ? <LoaderCircle size={13} className="na-dl-spin" aria-hidden /> : <CircleCheck size={13} aria-hidden />}
                    {tt("alDlApply")}
                  </button>
                  <button type="button" className="na-btn" onClick={() => void saveCandidate(c)}>
                    {savedId === c.id ? <CircleCheck size={13} aria-hidden /> : <Download size={13} aria-hidden />}
                    {savedId === c.id ? tt("alDlSaved") : tt("alDlSaveFile")}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      <p className="na-dl-note na-mono" dir="auto">{tt("alDlLyricsNote")}</p>
    </ManualShell>
  );
}

/* ── manual cover picker sheet ───────────────────────────────────────────── */

function ManualCoverSheet({
  track,
  tt,
  onClose,
}: {
  track: Track;
  tt: (k: string) => string;
  onClose: (applied?: boolean) => void;
}) {
  const [cands, setCands] = useState<CoverCandidate[] | null>(null);
  const [picked, setPicked] = useState<CoverCandidate | null>(null);
  const [working, setWorking] = useState<null | "apply" | "save">(null);
  const [flash, setFlash] = useState<null | "save">(null);

  useEffect(() => {
    let alive = true;
    searchCoverCandidates(track.artist, track.title)
      .then((found) => {
        if (!alive) return;
        setCands(found);
        setPicked(found[0] ?? null);
      })
      .catch(() => {
        if (alive) setCands([]);
      });
    return () => {
      alive = false;
    };
  }, [track.artist, track.title]);

  const applyCandidate = async () => {
    if (!picked) return;
    setWorking("apply");
    const ok = await applyCoverCandidate(track.id, picked);
    setWorking(null);
    if (ok) {
      uiApi.toast(`${track.title} — ${tt("alDlApplied")}`, "success");
      onClose(true);
    } else {
      uiApi.toast(tt("alDlSaveFail"), "error");
    }
  };

  const saveCandidate = async () => {
    if (!picked) return;
    setWorking("save");
    let ok = false;
    try {
      const art = await downloadCoverArt(picked.url);
      if (art && art.bytes.byteLength > 1000) {
        const srcPath = audioSrcPath(track.id);
        if (srcPath) {
          try {
            await saveCoverImage(srcPath, art.bytes, art.ext);
            ok = true;
          } catch {
            ok = false;
          }
        }
        if (!ok) {
          anchorDownload(
            new Blob([art.bytes as unknown as BlobPart], { type: `image/${art.ext}` }),
            `${sanitizeName(`${track.artist} - ${track.title}`)}.${art.ext}`,
          );
          ok = true;
        }
      }
    } catch {
      ok = false;
    }
    setWorking(null);
    if (ok) {
      setFlash("save");
      window.setTimeout(() => setFlash(null), 2200);
    } else {
      uiApi.toast(tt("alDlSaveFail"), "error");
    }
  };

  return (
    <ManualShell title={tt("alDlManualCover")} track={track} tt={tt} onClose={onClose}>
      {!cands ? (
        <div className="na-dl-cand-empty na-mono">
          <LoaderCircle size={16} className="na-dl-spin" aria-hidden /> {tt("alDlSearching")}
        </div>
      ) : cands.length === 0 ? (
        <div className="na-dl-cand-empty na-mono">
          <CircleAlert size={16} aria-hidden /> {tt("alDlNoResults")}
        </div>
      ) : (
        <div className="na-dl-grid" role="listbox" aria-label={tt("alDlManualCover")}>
          {cands.map((c) => (
            <button
              key={c.url}
              type="button"
              className="na-dl-cell"
              role="option"
              aria-selected={picked?.url === c.url}
              data-on={picked?.url === c.url}
              onClick={() => setPicked(c)}
            >
              <img src={c.thumbUrl} alt="" loading="lazy" />
              <span className="na-dl-cell-src na-mono" dir="ltr">{c.source}</span>
              {picked?.url === c.url && <i className="na-dl-cell-check" aria-hidden />}
            </button>
          ))}
        </div>
      )}

      {picked && (
        <div className="na-dl-preview" dir="ltr">
          <img src={picked.url} alt="" />
          {picked.albumName ? (
            <span className="na-dl-preview-sub na-mono" dir="auto">{picked.albumName}</span>
          ) : null}
        </div>
      )}

      <div className="na-dl-cand-actions na-dl-cand-actions-center">
        <button type="button" className="na-btn na-btn-primary" onClick={() => void applyCandidate()} disabled={!picked || working !== null}>
          {working === "apply" ? <LoaderCircle size={13} className="na-dl-spin" aria-hidden /> : <CircleCheck size={13} aria-hidden />}
          {tt("alDlApply")}
        </button>
        <button type="button" className="na-btn" onClick={() => void saveCandidate()} disabled={!picked || working !== null}>
          {working === "save" ? <LoaderCircle size={13} className="na-dl-spin" aria-hidden /> : <Download size={13} aria-hidden />}
          {flash === "save" ? tt("alDlSaved") : tt("alDlSaveFile")}
        </button>
      </div>
    </ManualShell>
  );
}
