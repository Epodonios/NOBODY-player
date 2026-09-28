// ── NOBODY ALOK · support nudge — the "TRANSMISSION" card ────────────────────
// A small ruled instrument card that appears once in a while (shared scheduler
// in src/nudge.ts) asking for a donation or a GitHub star. ALOK face rules:
//   • renders ONLY while the pure hub is showing — every overlay (panel,
//     sheets, palette, info, aura) AND the drag overlay suppress it, and the
//     idle-dim state suppresses it too (the chrome is hidden, so is this)
//   • fixed to the bottom-end, RTL-aware (inset-inline-end)
//   • ✕ / Escape dismiss this cycle (no auto-dismiss — the scheduler plans
//     the next transmission on its own cadence)
// Wallets + links come from src/supportInfo.ts (one source of truth).

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { DONATE_DIRECT, DONATE_WALLETS, copyText } from "../../supportInfo";
import { uiApi } from "../../cinema/store/ui";
import { useAlokUi } from "../store/alokUi";
import { useAlokT } from "../lib/i18n";
import type { NudgeKind } from "../../nudge";

/** Defensive lookup — the RU dictionary agent owns the new keys; until they
 *  land (or for locales the agent hasn't covered) the EN fallback prints
 *  instead of a raw key name. */
function makeAlokFb(at: (k: string) => string) {
  return (k: string, fb: string): string => {
    const v = at(k);
    return !v || v === k ? fb : v;
  };
}

/** Tracks the idle-dim attribute on #na-root so the popup can hide itself
 *  while the chrome is dimmed (and resurface on the next wake). */
function useRootIdle(): boolean {
  const [idle, setIdle] = useState(
    () => document.getElementById("na-root")?.hasAttribute("data-idle") ?? false,
  );
  useEffect(() => {
    const root = document.getElementById("na-root");
    if (!root) return;
    // The mount-time read above already seeded the value; from here the
    // MutationObserver is the single source of future updates (no sync
    // setState inside the effect body — cascading-render hygiene).
    const read = () => setIdle(root.hasAttribute("data-idle"));
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["data-idle"] });
    return () => obs.disconnect();
  }, []);
  return idle;
}

const shortAddr = (a: string) => (a.length > 10 ? `${a.slice(0, 10)}…` : a);

// brand mark as inline SVG (lucide no longer ships brand icons) — same path
// pattern as cinema's AboutView GithubMark
const GithubMark = ({ size = 14 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden>
    <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);

export function SupportPopup({
  nudge,
  dismiss,
}: {
  nudge: { kind: NudgeKind } | null;
  dismiss: () => void;
}) {
  const at = useAlokT();
  const tt = makeAlokFb(at);

  // suppression gate: every ALOK overlay + drag + idle-dim hides the card
  const overlayOpen = useAlokUi(
    (s) =>
      s.view !== null || s.showLyrics || s.showQueue || s.showFx ||
      s.showMood || s.showAura || s.showCmd || s.showInfo || s.dragging,
  );
  const idle = useRootIdle();
  const visible = nudge !== null && !overlayOpen && !idle;

  // Escape dismisses this cycle (the App-level Esc chain owns overlays; when
  // this card is visible nothing else is open, so both are safe)
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, dismiss]);

  const copyWallet = async (code: string, address: string) => {
    const ok = await copyText(address);
    uiApi.toast(`${code} — ${tt("alCopied", "Copied")}`, ok ? "success" : "info");
  };

  const kind = nudge?.kind ?? "donate";
  const eyebrow =
    kind === "donate"
      ? tt("nudgeDonateTitle", "FUEL NOBODY")
      : tt("nudgeStarTitle", "STAR NOBODY ON GITHUB");

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          className="na-nudge"
          role="dialog"
          aria-label={eyebrow}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="na-nudge-card">
            {/* corner reticles (instrument-panel frame ticks) */}
            <span className="na-nudge-corner na-nudge-corner-a" aria-hidden />
            <span className="na-nudge-corner na-nudge-corner-b" aria-hidden />

            <header className="na-nudge-head">
              <span className="na-nudge-ret" aria-hidden />
              <span className="na-eyebrow na-nudge-eyebrow">{eyebrow}</span>
              <button
                type="button"
                className="na-panel-x na-nudge-x"
                onClick={dismiss}
                aria-label={tt("nudgeDismiss", "Dismiss")}
                title={tt("nudgeDismiss", "Dismiss")}
              >
                <X size={13} />
              </button>
            </header>

            {kind === "donate" ? (
              <>
                <p className="na-nudge-body">
                  {tt(
                    "nudgeDonateBody",
                    "NOBODY is free, hand-built and ad-free. If it earns its place on your machine, a small transmission of support keeps the signal alive.",
                  )}
                </p>
                <div className="na-nudge-wallets">
                  {DONATE_WALLETS.map((w) => (
                    <button
                      key={w.code}
                      type="button"
                      className="na-nudge-wallet"
                      onClick={() => void copyWallet(w.code, w.address)}
                      title={`${w.code} · ${w.network} — ${w.name}`}
                      aria-label={`${w.code} ${w.network} — ${tt("supportCopy", "Copy address")}`}
                    >
                      <span className="na-nudge-wcode">{w.code} · {w.network}</span>
                      <span className="na-nudge-leader" aria-hidden />
                      <span className="na-nudge-waddr" dir="ltr">{shortAddr(w.address)}</span>
                      <span className="na-nudge-copy" aria-hidden>COPY</span>
                    </button>
                  ))}
                </div>
                <a
                  className="na-nudge-link"
                  href={DONATE_DIRECT.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {tt("nudgeDonateAction", "Support via Reymit")} <span aria-hidden>↗</span>
                </a>
              </>
            ) : (
              <>
                <p className="na-nudge-body">
                  {tt(
                    "nudgeStarBody",
                    "If the player hums for you, leave a star on GitHub — it costs nothing and helps NOBODY reach more listeners.",
                  )}
                </p>
                <a
                  className="na-btn na-btn-primary na-nudge-star"
                  href="https://github.com/Epodonios/NOBODY-player"
                  target="_blank"
                  rel="noreferrer"
                >
                  <GithubMark size={14} />
                  {tt("nudgeStarAction", "Star on GitHub")}
                </a>
              </>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
