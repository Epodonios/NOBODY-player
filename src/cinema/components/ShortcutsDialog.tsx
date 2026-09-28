// ── NOBODY · keyboard shortcuts help ─────────────────────────────────────────
// "?" opens a glass dialog listing every shortcut — doubles as the in-app
// report of everything the player can do.

import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, X } from "lucide-react";
import { useUi } from "../store/ui";
import { useT } from "../lib/useT";

export function ShortcutsDialog() {
  const t = useT();
  const show = useUi((s) => s.showShortcuts);
  const setShow = useUi((s) => s.setShowShortcuts);

  const rows: { keys: string[]; label: string }[] = [
    { keys: ["Space"], label: t("play") + " / " + t("pause") },
    { keys: ["→", "←"], label: `${t("seekFwdBwd")} · 5s` },
    { keys: ["N"], label: t("next") },
    { keys: ["P"], label: t("previous") },
    { keys: ["Ctrl", "K"], label: t("cmdTitle") },
    { keys: ["Ctrl", "E"], label: t("fxTitle") },
    { keys: ["?"], label: t("keysTitle") },
    { keys: ["Esc"], label: t("close") },
  ];

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/50"
            onClick={() => setShow(false)}
          />
          <motion.div
            role="dialog"
            aria-label={t("keysTitle")}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
            className="glass fixed inset-x-0 top-1/2 z-[71] mx-auto w-[min(420px,92vw)] -translate-y-1/2 overflow-hidden rounded-[22px]"
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 16%, transparent)" }}>
                  <Keyboard size={15} className="t-accent" />
                </span>
                <span className="font-display text-lg italic">{t("keysTitle")}</span>
              </div>
              <button onClick={() => setShow(false)} aria-label={t("close")} className="t-mut rounded-full p-2 transition-colors hover:bg-white/10">
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-3">
              {rows.map((r) => (
                <div key={r.label} className="flex items-center justify-between rounded-xl px-2.5 py-2 transition-colors hover:bg-[var(--card)]">
                  <span className="text-[12.5px]">{r.label}</span>
                  <span className="flex items-center gap-1">
                    {r.keys.map((k) => (
                      <kbd
                        key={k}
                        className="tnum rounded-md border px-1.5 py-0.5 text-[10.5px] shadow-sm"
                        style={{ borderColor: "var(--line2)", background: "var(--bg2)" }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
