// ── NOBODY · Up Next queue sheet ─────────────────────────────────────────────

import { motion, AnimatePresence } from "framer-motion";
import { GripVertical, ListX, X } from "lucide-react";
import { engine } from "../lib/engine";
import { useUi } from "../store/ui";
import { useLibrary } from "../store/library";
import { useT } from "../lib/useT";
import { fmtTime } from "../lib/utils";
import { CoverArt } from "./CoverArt";
import { cn } from "../utils/cn";

export function QueueSheet() {
  const t = useT();
  const show = useUi((s) => s.showQueue);
  const setShow = useUi((s) => s.setShowQueue);
  // cinema's dir lives on #nc-root, not <html> (dual-UI document)
  const isRtl = typeof document !== "undefined" && !!document.getElementById("nc-root")?.closest('[dir="rtl"]');
  // re-rendered on every engine pushState via this subscription:
  useUi((s) => s.queueIds);
  const queueIndex = useUi((s) => s.queueIndex);
  const currentId = useUi((s) => s.currentId);
  const tracks = useLibrary((s) => s.tracks);
  // effective listen order (identity, or shuffled) straight from the engine
  const effIds = engine.order.map((q) => engine.queue[q]).filter(Boolean);

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55] bg-black/50"
            onClick={() => setShow(false)}
          />
          <motion.aside
            initial={{ x: isRtl ? -380 : 380, opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: isRtl ? -380 : 380, opacity: 0.5 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="glass fixed inset-y-0 end-0 z-[56] flex w-[min(380px,92vw)] flex-col"
            style={{ borderColor: "var(--line)" }}
            aria-label={t("queue")}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
              <div>
                <div className="font-display text-lg italic">{t("upNext")}</div>
                <div className="t-faint tnum text-[11px]">{effIds.length} {t("tracksCount")}</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => engine.clearQueue()}
                  title={t("clearQueue")}
                  className="t-mut rounded-full p-2 transition-colors hover:bg-white/10"
                >
                  <ListX size={16} />
                </button>
                <button onClick={() => setShow(false)} aria-label={t("close")} className="t-mut rounded-full p-2 transition-colors hover:bg-white/10">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {effIds.length === 0 && (
                <div className="t-mut px-4 py-10 text-center text-[13px]">{t("queueEmpty")}</div>
              )}
              {effIds.map((id, listenPos) => {
                const tr = tracks[id];
                if (!tr) return null;
                const isCurrent = id === currentId && listenPos === queueIndex;
                const isPast = listenPos < queueIndex;
                return (
                  <div
                    key={`${id}-${listenPos}`}
                    className={cn(
                      "group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
                      isCurrent ? "bg-[var(--card2)]" : "hover:bg-[var(--card)]",
                      isPast && "opacity-40"
                    )}
                    onClick={() => engine.jumpTo(listenPos)}
                    role="button"
                    tabIndex={0}
                  >
                    <GripVertical size={13} className="t-faint shrink-0" />
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md">
                      <CoverArt trackId={id} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-[12.5px] font-semibold leading-tight", isCurrent && "t-accent")}>{tr.title}</div>
                      <div className="t-mut truncate text-[11px]">{tr.artist}</div>
                    </div>
                    <span className="tnum t-faint text-[11px]">{tr.duration ? fmtTime(tr.duration) : "—"}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); engine.removeFromQueue(listenPos); }}
                      aria-label={t("remove")}
                      className="t-faint rounded-full p-1.5 opacity-0 transition-opacity hover:bg-white/10 hover:text-[var(--fg)] group-hover:opacity-100"
                    >
                      <X size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
