// ── NOBODY EELA · support nudge (V1.4.0, request #2) ────────────────────────
// The ex libris: a small paper bookmark that slips in at the foot of the page
// every once in a while — a fuel ask for the presses, or a star for the shelf.
// Serif voice, hairline wallet rows, one quiet ✕ (or Escape) to send it away.
// App.tsx mounts it ONLY while no overlay (queue / now-playing / ambient)
// owns the page. Data flows from the shared src/supportInfo.ts source of
// truth; words come from the shared cinema dict with English fallbacks.

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Copy, X } from "lucide-react";
import { uiApi } from "../../cinema/store/ui";
import { useT } from "../../cinema/lib/useT";
import { CONTACT, DONATE_DIRECT, DONATE_WALLETS, copyText } from "../../supportInfo";
import type { NudgeKind } from "../../nudge";

// brand mark as inline SVG (lucide no longer ships brand icons)
const GithubMark = (p: any) => (
  <svg viewBox="0 0 24 24" width={p.size ?? 15} height={p.size ?? 15} fill="currentColor" className={p.className}><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"/></svg>
);

/** Defensive lookup: EELA borrows the shared cinema dictionary, so the new
 *  nudge keys may briefly be missing (or arrive as the raw key) — fall back
 *  to the English copy passed in. */
const makeTt = (t: (k: string) => string) => (k: string, fb: string) => {
  const v = t(k);
  return !v || v === k ? fb : v;
};

/** first ten characters of a wallet address, ledger-style */
const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 10)}…` : a);

export function SupportNudgeCard({ kind, dismiss }: { kind: NudgeKind; dismiss: () => void }) {
  const t = useT();
  const tt = makeTt(t);
  const reduce = useReducedMotion();

  // Escape sends the bookmark away. dismiss is a fresh closure on every
  // render, so it rides a ref and the window listener binds exactly once.
  const dismissRef = useRef(dismiss);
  useEffect(() => { dismissRef.current = dismiss; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismissRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const copyWallet = async (code: string, address: string) => {
    await copyText(address);
    uiApi.toast(`${code} — copied`, "success");
  };

  const donate = kind === "donate";
  const title = donate
    ? tt("nudgeDonateTitle", "Fuel NOBODY")
    : tt("nudgeStarTitle", "Star NOBODY on GitHub");
  const body = donate
    ? tt("nudgeDonateBody", "NOBODY is free, forever — no ads, no accounts. If the paper face earns its keep on your desk, a small top-up keeps the presses running.")
    : tt("nudgeStarBody", "NOBODY is set in the open. If it deserves a place on your shelf, a star on GitHub keeps the ink flowing and helps other listeners find it.");

  return (
    <motion.aside
      className="ne-card ne-nudge"
      role="dialog"
      aria-label={title}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="ne-nudge-head">
        <span className="ne-eyebrow">NOBODY · EX LIBRIS</span>
        <button
          type="button"
          className="ne-icon-btn ne-nudge-x"
          onClick={dismiss}
          title={tt("nudgeDismiss", "Dismiss")}
          aria-label={tt("nudgeDismiss", "Dismiss")}
        >
          <X size={13} />
        </button>
      </div>

      <h2 className="ne-display ne-nudge-title">{title}</h2>
      <p className="ne-nudge-body">{body}</p>

      {donate ? (
        <>
          {/* hairline wallet rows — tap to copy, ledger-fashion */}
          <div className="ne-nudge-wallets">
            {DONATE_WALLETS.map((w) => (
              <button
                key={w.code}
                type="button"
                className="ne-nudge-wallet"
                onClick={() => void copyWallet(w.code, w.address)}
                title={`${w.code} · ${w.network}`}
              >
                <span className="ne-nudge-mono" style={{ background: w.color }} aria-hidden>
                  {w.mono}
                </span>
                <span className="ne-nudge-wmeta">
                  <span className="ne-nudge-wcode">
                    {w.code} <i>· {w.network}</i>
                  </span>
                  <span className="ne-nudge-waddr" dir="ltr">{shortAddr(w.address)}</span>
                </span>
                <Copy size={12} className="ne-nudge-copy" aria-hidden />
              </button>
            ))}
          </div>
          <a className="ne-nudge-link" href={DONATE_DIRECT.href} target="_blank" rel="noreferrer">
            {tt("nudgeDonateAction", "Leave a kindness on Reymit")} <span aria-hidden>↗</span>
          </a>
        </>
      ) : (
        <a className="ne-btn ne-nudge-star" href={CONTACT.githubHref} target="_blank" rel="noreferrer">
          <GithubMark size={14} />
          {tt("nudgeStarAction", "Star NOBODY on GitHub")}
        </a>
      )}
    </motion.aside>
  );
}
