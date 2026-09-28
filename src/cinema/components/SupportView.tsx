// ── NOBODY · Support / donate ────────────────────────────────────────────────
// Crypto wallets as tappable cards (per-currency color + monogram), a featured
// direct-support link, and the SAME visualizer component from ambient mode,
// honoring the person's chosen equalizer style.

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, ExternalLink, HeartHandshake } from "lucide-react";
import { useT } from "../lib/useT";
import { useSettings } from "../store/settings";
import { useUi } from "../store/ui";
import { uiApi } from "../store/ui";
import { Visualizer } from "./Visualizer";
import { cn } from "../utils/cn";
import { DONATE_DIRECT, DONATE_WALLETS, copyText, type SupportWallet } from "../../supportInfo";

export function SupportView() {
  const t = useT();
  const eqStyle = useSettings((s) => s.eqStyle);
  const currentId = useUi((s) => s.currentId);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (w: SupportWallet) => {
    await copyText(w.address);
    setCopied(w.code);
    uiApi.toast(`${w.code} — ${t("supportCopied")}`, "success");
    setTimeout(() => setCopied((c) => (c === w.code ? null : c)), 1800);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-28 pt-8 lg:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center gap-2 t-accent">
          <HeartHandshake size={17} />
          <span className="text-[11px] uppercase tracking-[0.3em]">{t("navSupport")}</span>
        </div>
        <h1 className="dream-title mt-3 font-display text-[clamp(2rem,5vw,3.4rem)] font-semibold italic leading-none tracking-tight">
          {t("supportTitle")}
        </h1>
        <p className="t-mut mt-4 max-w-lg text-[13.5px] leading-relaxed">{t("supportBlurb")}</p>

        {/* featured direct support — the shared Reymit portal (V1.4.0 #11) */}
        <motion.a
          href={DONATE_DIRECT.href}
          target="_blank"
          rel="noreferrer"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="group mt-7 flex items-center justify-between gap-4 overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-1"
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 40%, transparent)",
            background: "color-mix(in srgb, var(--accent) 8%, var(--card))",
            boxShadow: "0 18px 44px -18px color-mix(in srgb, var(--accent) 45%, transparent)",
          }}
        >
          <div>
            <div className="font-display text-xl italic">{t("supportDirect")}</div>
            <div className="t-mut mt-1 text-[12px]">{DONATE_DIRECT.href.replace(/^https?:\/\//, "")}</div>
          </div>
          <span className="bg-accent flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-transform group-hover:scale-105">
            {t("supportDirect")} <ExternalLink size={13} />
          </span>
        </motion.a>

        {/* wallets — classic parity, from the shared source of truth */}
        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          {DONATE_WALLETS.map((w, i) => (
            <motion.button
              key={w.code}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 + i * 0.05 }}
              onClick={() => copy(w)}
              className="glass group relative overflow-hidden rounded-2xl p-4 text-start transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_38px_-16px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
              title={t("supportCopy")}
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -end-6 -top-10 select-none font-display text-[7rem] font-bold italic leading-none opacity-[0.07]"
                style={{ color: w.color }}
              >
                {w.mono}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-lg italic"
                  style={{ background: `color-mix(in srgb, ${w.color} 16%, transparent)`, color: w.color, border: `1px solid color-mix(in srgb, ${w.color} 35%, transparent)` }}
                >
                  {w.mono}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] font-bold tracking-wide">{w.code}</span>
                    <span className="t-faint text-[10.5px] uppercase tracking-wider">{w.network}</span>
                  </div>
                  <div className="t-mut mt-0.5 truncate font-mono text-[11px]" dir="ltr">
                    {w.address}
                  </div>
                </div>
                <span className={cn("shrink-0 rounded-full p-2 transition-colors", copied === w.code ? "text-green-400" : "t-mut group-hover:bg-white/10")}>
                  {copied === w.code ? <Check size={15} /> : <Copy size={15} />}
                </span>
              </div>
            </motion.button>
          ))}
        </div>

        <p className="t-faint mt-5 text-center text-[11.5px]">{t("supportNote")}</p>

        {/* live equalizer — the person's chosen style, shared component */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="glass mt-8 h-40 overflow-hidden rounded-2xl"
        >
          <Visualizer variant={eqStyle} trackSeed={currentId ?? "support"} className="h-full w-full" />
        </motion.div>
      </div>
    </div>
  );
}
