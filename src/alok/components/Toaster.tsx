// ── NOBODY ALOK · toaster ────────────────────────────────────────────────────
// The shared NOBODY toast store (fed by the engine, importer, smart fetch…)
// rendered as mono hairline chips inside #na-root. Other UIs' toasters are
// hidden while ALOK is up.

import { AnimatePresence, motion } from "framer-motion";
import { useUi } from "../../cinema/store/ui";

const COLORS: Record<string, string> = {
  info: "var(--na-accent, #ffb347)",
  success: "#3dffb0",
  error: "#ff5c7a",
  progress: "var(--na-accent, #ffb347)",
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
            className="na-toast pointer-events-auto"
          >
            <span className="na-toast-dot" style={{ background: COLORS[tt.kind] ?? COLORS.info }} aria-hidden />
            <span className="min-w-0 flex-1">{tt.msg}</span>
            {tt.sub && <span style={{ color: "var(--na-faint)" }}>{tt.sub}</span>}
            {tt.kind === "progress" && typeof tt.progress === "number" && (
              <span style={{ fontSize: 10.5, color: "var(--na-mut)" }}>{Math.round(tt.progress * 100)}%</span>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
