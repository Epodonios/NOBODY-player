// ── NOBODY ALOK · queue sheet (right slide-in) ───────────────────────────────
// The live queue: current highlighted, click to jump, per-row remove, reorder
// (up/down on hover), clear all and a mono footer with total time.

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Trash2, X, ChevronUp, ChevronDown } from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary } from "../../cinema/store/library";
import { useUi } from "../../cinema/store/ui";
import { useAlokUi } from "../store/alokUi";
import { useT } from "../../cinema/lib/useT";
import { CoverArt } from "../../cinema/components/CoverArt";
import { fmtTime } from "../../cinema/lib/utils";

export function QueueSheet() {
  const t = useT();
  const show = useAlokUi((s) => s.showQueue);
  const setShow = useAlokUi((s) => s.setShowQueue);
  const queueIds = useUi((s) => s.queueIds);
  const queueIndex = useUi((s) => s.queueIndex);
  const tracks = useLibrary((s) => s.tracks);

  const totalSec = useMemo(
    () => queueIds.reduce((acc, id) => acc + (tracks[id]?.duration ?? 0), 0),
    [queueIds, tracks]
  );

  return (
    <AnimatePresence>
      {show && (
        <motion.aside
          className="na-sheet"
          role="dialog"
          aria-label={t("alQueue")}
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60 }}
          transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: "transform, opacity" }}
        >
          <div className="na-sheet-head">
            <div className="na-sheet-title">
              {t("alQueue")} · {queueIds.length}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                className="na-panel-x"
                onClick={() => { engine.clearQueue(); }}
                title={t("alClearQueue")}
                aria-label={t("alClearQueue")}
                disabled={queueIds.length === 0}
              >
                <Trash2 size={14} />
              </button>
              <button className="na-panel-x" onClick={() => setShow(false)} title={t("close")} aria-label={t("close")}>
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="na-sheet-body na-scroll p-2">
            {queueIds.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <div className="na-mono text-[11px] tracking-[0.2em] text-[var(--na-faint)]">{t("queueEmpty")}</div>
              </div>
            ) : (
              queueIds.map((id, i) => {
                const tr = tracks[id];
                if (!tr) return null;
                const activeRow = i === queueIndex;
                return (
                  <div
                    key={`${id}-${i}`}
                    className="na-row"
                    data-playing={activeRow}
                    role="button"
                    tabIndex={0}
                    onClick={() => engine.jumpTo(i)}
                    onKeyDown={(e) => { if (e.key === "Enter") engine.jumpTo(i); }}
                    aria-label={`${tr.title} — ${tr.artist}`}
                  >
                    <span className="na-row-main">
                      <span className="na-mono w-5 shrink-0 text-center text-[10px] text-[var(--na-faint)]" style={{ fontSize: 10 }}>
                        {activeRow ? "▶" : i + 1}
                      </span>
                      <span className="na-row-thumb">
                        <CoverArt trackId={id} rounded="rounded-full" />
                      </span>
                      <span className="na-row-titles">
                        <span className="na-row-title" style={{ display: "block" }}>{tr.title}</span>
                        <span className="na-row-sub" style={{ display: "block" }}>{tr.artist}</span>
                      </span>
                    </span>
                    <span className="na-row-acts" onClick={(e) => e.stopPropagation()}>
                      <span className="na-q-mv">
                        <button
                          onClick={() => engine.moveInQueue(i, -1)}
                          disabled={i === 0}
                          title={t("alMoveUp")}
                          aria-label={`${t("alMoveUp")}: ${tr.title}`}
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          onClick={() => engine.moveInQueue(i, 1)}
                          disabled={i === queueIds.length - 1}
                          title={t("alMoveDown")}
                          aria-label={`${t("alMoveDown")}: ${tr.title}`}
                        >
                          <ChevronDown size={13} />
                        </button>
                      </span>
                      <span className="na-row-time na-mono">{fmtTime(tr.duration)}</span>
                      <button
                        className="na-icon-btn"
                        onClick={() => engine.removeFromQueue(i)}
                        title={t("remove")}
                        aria-label={`${t("remove")}: ${tr.title}`}
                      >
                        <X size={14} />
                      </button>
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {queueIds.length > 0 && (
            <div className="na-q-foot" style={{ borderTop: "1px solid var(--na-line-soft)", flex: "none" }}>
              <span>{queueIds.length} {t("songs")}</span>
              <span>{fmtTime(totalSec)}</span>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
