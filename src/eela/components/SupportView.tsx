// ── NOBODY EELA · Support ────────────────────────────────────────────────────
// The quiet ask: one headline, one direct-support card, three network rows
// with tap-to-copy — and a breathing visualizer to keep the page alive.
// V1.4.0 (request #11): wallets + the direct portal now flow from the shared
// src/supportInfo.ts source of truth (classic parity: USDT/TRX/BTC + Reymit).

import { useState } from "react";
import { Check, Copy, Heart } from "lucide-react";
import { uiApi } from "../../cinema/store/ui";
import { useT } from "../../cinema/lib/useT";
import { DONATE_DIRECT, DONATE_WALLETS, copyText, type SupportWallet } from "../../supportInfo";
import { EelaVisualizer } from "./EelaVisualizer";

export function SupportView() {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (w: SupportWallet) => {
    await copyText(w.address);
    setCopied(w.code);
    uiApi.toast(`${w.code} — ${t("supportCopied")}`, "success");
    setTimeout(() => setCopied((c) => (c === w.code ? null : c)), 1800);
  };

  return (
    <div className="ne-scroll h-full pb-[120px]">
      <div className="mx-auto max-w-[860px] px-5 pt-[86px] sm:px-8">
        <div className="ne-eyebrow mb-1.5">{t("navSupport")}</div>
        <h1 className="ne-display ne-h1 max-w-[560px] pb-2">{t("eSupportHead")}</h1>

        {/* direct support — the shared DONATE_DIRECT portal (Reymit) */}
        <a
          className="ne-card mt-5 flex items-center gap-4 overflow-hidden p-5 transition-transform hover:-translate-y-0.5"
          href={DONATE_DIRECT.href}
          target="_blank"
          rel="noreferrer"
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent-ink)" }}
          >
            <Heart size={17} fill="currentColor" />
          </span>
          <span className="min-w-0">
            <span className="ne-display block text-[19px] font-bold">{t("supportDirect")}</span>
            <span className="block truncate text-[12px] text-[var(--mut)]" dir="ltr">
              {DONATE_DIRECT.href.replace(/^https?:\/\//, "")}
            </span>
          </span>
        </a>

        {/* wallets */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {DONATE_WALLETS.map((w) => (
            <div key={w.code} className="ne-card flex items-center gap-3.5 p-4">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white"
                style={{ background: w.color }}
                aria-hidden
              >
                {w.mono}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold">
                  {w.name}
                  <span className="ms-2 text-[10px] font-medium text-[var(--faint)]">{w.network}</span>
                </span>
                <span className="block truncate font-mono text-[10.5px] text-[var(--mut)]" dir="ltr">
                  {w.address}
                </span>
              </span>
              <button
                className="ne-icon-btn"
                onClick={() => void copy(w)}
                title={t("supportCopy")}
                aria-label={`${t("supportCopy")}: ${w.code}`}
              >
                {copied === w.code ? <Check size={14} className="text-[var(--accent-ink)]" /> : <Copy size={13} />}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 text-[11px] text-[var(--faint)]">{t("supportCopy")}</div>
        <p className="mt-1 max-w-[520px] text-[12.5px] leading-relaxed text-[var(--mut)]">{t("supportNote")}</p>

        {/* living spectrum */}
        <div className="mt-8">
          <EelaVisualizer className="ne-viz-strip" height={90} bars={56} />
        </div>
      </div>
    </div>
  );
}
