// ── NOBODY EELA · queue popover ──────────────────────────────────────────────
// Small paper sheet anchored above the dock: the live queue with jump / clear.

import { AnimatePresence, motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary } from "../../cinema/store/library";
import { useUi } from "../../cinema/store/ui";
import { useEelaUi } from "../store/eelaUi";
import { useT } from "../../cinema/lib/useT";
import { CoverArt } from "../../cinema/components/CoverArt";
import { fmtTime } from "../../cinema/lib/utils";

export function QueueSheet() {
  const t = useT();
  const show = useEelaUi((s) => s.showQueue);
  const setShow = useEelaUi((s) => s.setShowQueue);
  const queueIds = useUi((s) => s.queueIds);
  const queueIndex = useUi((s) => s.queueIndex);
  const tracks = useLibrary((s) => s.tracks);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="ne-pop"
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-label={t("queue")}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--line2)" }}>
            <div className="text-[12px] font-semibold">
              {t("upNext")} <span className="tnum text-[var(--faint)]">· {queueIds.length}</span>
            </div>
            <button
              className="ne-icon-btn !w-7 !h-7"
              onClick={() => { engine.clearQueue(); setShow(false); }}
              title={t("clearQueue")}
              aria-label={t("clearQueue")}
            >
              <Trash2 size={13} />
            </button>
          </div>

          <div className="ne-scroll min-h-0 flex-1 p-2">
            {queueIds.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-[var(--mut)]">{t("queueEmpty")}</div>
            ) : (
              queueIds.map((id, i) => {
                const tr = tracks[id];
                if (!tr) return null;
                const active = i === queueIndex;
                return (
                  <button
                    key={`${id}-${i}`}
                    className="flex w-full items-center gap-2.5 rounded-[11px] px-2 py-1.5 text-start transition-colors hover:bg-[var(--card2)]"
                    style={active ? { background: "color-mix(in srgb, var(--accent) 11%, transparent)" } : undefined}
                    onClick={() => engine.jumpTo(i)}
                  >
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[7px]">
                      <CoverArt trackId={id} rounded="rounded-[7px]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium" style={active ? { color: "var(--accent-ink)" } : undefined}>
                        {tr.title}
                      </div>
                      <div className="truncate text-[10px] text-[var(--mut)]">{tr.artist}</div>
                    </div>
                    <span className="tnum text-[10px] text-[var(--mut)]">{fmtTime(tr.duration)}</span>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
