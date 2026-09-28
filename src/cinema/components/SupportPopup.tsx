// ── NOBODY Cinema · support nudge (V1.4.0, request #2) ───────────────────────
// A small dreamy glass card that drifts up from the foot of the stage every
// once in a while — a fuel ask for the player, or a star for the repo.
// One quiet ✕ (or Escape) dissolves it back into the mist. App.tsx mounts it
// ONLY while the shared scheduler holds a live nudge AND no overlay
// (now-playing / queue / ambient) owns the screen. Data flows from the shared
// src/supportInfo.ts source of truth; words come from the cinema dict with
// English fallbacks so a stale bundle never shows a raw key.

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Copy, HeartHandshake, X } from "lucide-react";
import { useT } from "../lib/useT";
import { uiApi } from "../store/ui";
import { CONTACT, DONATE_DIRECT, DONATE_WALLETS, copyText } from "../../supportInfo";
import type { NudgeKind } from "../../nudge";

// brand mark as inline SVG (lucide no longer ships brand icons) — same
// component pattern as AboutView
const GithubMark = (p: any) => (
  <svg viewBox="0 0 24 24" width={p.size ?? 15} height={p.size ?? 15} fill="currentColor" className={p.className}><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"/></svg>
);

/** every t() call goes through here — nudge keys land in the dict with this
 *  V1.4.0 round, but a stale bundle must fall back to readable English */
const makeTt = (t: (k: string) => string) => (k: string, fb: string) => {
  const v = t(k);
  return !v || v === k ? fb : v;
};

/** first ten characters of a wallet address, ledger-style */
const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 10)}…` : a);

export function SupportPopup({ kind, dismiss }: { kind: NudgeKind; dismiss: () => void }) {
  const t = useT();
  const tt = makeTt(t);
  const reduce = useReducedMotion();

  // Escape dissolves the popup. dismiss is a fresh closure on every render,
  // so it rides a ref and the window listener binds exactly once.
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
    ? tt("nudgeDonateBody", "NOBODY is free and independent — a small donation keeps the music playing.")
    : tt("nudgeStarBody", "Enjoying the player? A GitHub star is the best thank-you.");
  const later = tt("nudgeDismiss", "Later");

  return (
    <motion.aside
      role="dialog"
      aria-label={title}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 14 }}
      transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="glass fixed bottom-24 end-4 z-[75] w-[300px] max-w-[calc(100dvw-2rem)] rounded-2xl border p-4"
      style={{ boxShadow: "0 24px 60px -24px color-mix(in srgb, var(--accent) 38%, transparent)" }}
    >
      {/* accent hairline rule — the projector's top light */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-0 h-px"
        style={{ background: "linear-gradient(90deg, var(--accent), transparent)" }}
      />

      {/* eyebrow + quiet ✕ */}
      <div className="flex items-start justify-between gap-2">
        <div className="t-accent flex min-w-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.24em]">
          {donate ? <HeartHandshake size={13} className="shrink-0" /> : <GithubMark size={13} className="shrink-0" />}
          <span className="truncate">{title}</span>
        </div>
        <button
          type="button"
          onClick={dismiss}
          title={later}
          aria-label={later}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full t-faint transition-colors hover:bg-[var(--card2)] hover:text-[var(--fg)]"
        >
          <X size={12} />
        </button>
      </div>

      <p className="t-mut mt-2 text-[12px] leading-relaxed">{body}</p>

      {donate ? (
        <>
          {/* wallet rows — tap to copy, ledger-fashion */}
          <div className="mt-3 flex flex-col gap-1">
            {DONATE_WALLETS.map((w) => (
              <button
                key={w.code}
                type="button"
                onClick={() => void copyWallet(w.code, w.address)}
                title={`${w.code} · ${w.network}`}
                className="group flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-[var(--card2)]"
              >
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-display text-[13px] italic"
                  style={{
                    background: `color-mix(in srgb, ${w.color} 16%, transparent)`,
                    color: w.color,
                    border: `1px solid color-mix(in srgb, ${w.color} 35%, transparent)`,
                  }}
                >
                  {w.mono}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-semibold tracking-wide">
                    {w.code} <span className="t-faint font-normal">· {w.network}</span>
                  </span>
                  <span className="t-faint block truncate font-mono text-[10px]" dir="ltr">
                    {shortAddr(w.address)}
                  </span>
                </span>
                <Copy size={12} aria-hidden className="t-faint shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))}
          </div>
          <a
            href={DONATE_DIRECT.href}
            target="_blank"
            rel="noreferrer"
            className="bg-accent mt-3 flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12.5px] font-semibold transition-transform hover:scale-[1.02]"
            style={{ color: "var(--on-accent)" }}
          >
            {tt("nudgeDonateAction", "Donate")} <ArrowUpRight size={13} />
          </a>
        </>
      ) : (
        <a
          href={CONTACT.githubHref}
          target="_blank"
          rel="noreferrer"
          className="bg-accent mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-transform hover:scale-[1.02]"
          style={{ color: "var(--on-accent)" }}
        >
          <GithubMark size={14} />
          {tt("nudgeStarAction", "Star on GitHub")}
        </a>
      )}
    </motion.aside>
  );
}
