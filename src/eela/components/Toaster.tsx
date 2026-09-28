// ── NOBODY EELA · toaster ────────────────────────────────────────────────────
// The shared NOBODY toast store (fed by the engine, importer, smart fetch…)
// rendered as paper chips — the cinema Toaster is hidden while EELA is up.

import { AnimatePresence, motion } from "framer-motion";
import { useUi } from "../../cinema/store/ui";

const COLORS: Record<string, string> = {
  info: "var(--accent)",
  success: "#2fbf8f",
  error: "#e5484d",
  progress: "var(--accent)",
};

export function Toaster() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[70] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      <AnimatePresence>
        {toasts.map((tt) => (
          <motion.div
            key={tt.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="ne-toast pointer-events-auto"
          >
            <span className="ne-toast-dot" style={{ background: COLORS[tt.kind] ?? COLORS.info }} aria-hidden />
            <span className="min-w-0 flex-1">{tt.msg}</span>
            {tt.kind === "progress" && typeof tt.progress === "number" && (
              <span className="tnum text-[10.5px] text-[var(--mut)]">{Math.round(tt.progress * 100)}%</span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
