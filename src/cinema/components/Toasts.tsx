// ── NOBODY · toasts ──────────────────────────────────────────────────────────

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Info, AlertTriangle, X, Loader2 } from "lucide-react";
import { useUi } from "../store/ui";

const ICONS = { info: Info, success: CheckCircle2, error: AlertTriangle, progress: Loader2 };

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-[80] flex w-[min(420px,92vw)] -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="glass pointer-events-auto flex w-full items-center gap-3 rounded-2xl px-4 py-3"
              style={{
                borderInlineStart: `2.5px solid ${toast.kind === "success" ? "var(--accent)" : toast.kind === "error" ? "#f2555a" : "var(--line2)"}`,
              }}
            >
              <Icon
                size={16}
                className={toast.kind === "success" ? "t-accent shrink-0" : toast.kind === "error" ? "shrink-0 text-red-400" : "t-mut shrink-0"}
                style={toast.kind === "progress" ? { animation: "k-spin 1.4s linear infinite" } : undefined}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium">{toast.msg}</div>
                {toast.sub && <div className="t-mut tnum text-[11px]">{toast.sub}</div>}
                {toast.kind === "progress" && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${(toast.progress ?? 0) * 100}%`, background: "var(--accent)" }} />
                  </div>
                )}
              </div>
              <button onClick={() => dismiss(toast.id)} aria-label="dismiss" className="t-mut shrink-0 rounded-full p-1 hover:bg-white/10">
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
