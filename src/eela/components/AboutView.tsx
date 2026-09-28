// ── NOBODY EELA · About ──────────────────────────────────────────────────────
// Contact / Dedication segmented card, serif voice, link pills.
// V1.4.0 (requests #7 + #11): every contact point now flows from the shared
// src/supportInfo.ts source of truth. Instagram has no live page yet, so it
// renders as a disabled row wearing a "coming soon" chip. No Twitter row —
// the classic UI has none either.

import { useState } from "react";
import { Mail, Send, Globe } from "lucide-react";
import { useT } from "../../cinema/lib/useT";
import { CONTACT } from "../../supportInfo";
import { APP_VERSION_LABEL } from "../../version";

// brand marks as inline SVG (lucide no longer ships brand icons)
const GithubMark = (p: any) => (
  <svg viewBox="0 0 24 24" width={p.size ?? 15} height={p.size ?? 15} fill="currentColor" className={p.className}><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"/></svg>
);
const InstagramMark = (p: any) => (
  <svg viewBox="0 0 24 24" width={p.size ?? 15} height={p.size ?? 15} fill="none" stroke="currentColor" strokeWidth="1.8" className={p.className}><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none"/></svg>
);

type ContactRow =
  | { kind: "link"; icon: any; label: string; href: string }
  | { kind: "soon"; icon: any; label: string; handle: string };

const LINKS: ContactRow[] = [
  { kind: "link", icon: Send, label: "Telegram", href: CONTACT.telegramHref },
  { kind: "link", icon: GithubMark, label: "GitHub", href: CONTACT.githubHref },
  { kind: "link", icon: Globe, label: "Website", href: "https://epodonios.app" },
  { kind: "soon", icon: InstagramMark, label: "Instagram", handle: CONTACT.instagramHandle },
  { kind: "link", icon: Mail, label: "Email", href: `mailto:${CONTACT.email}` },
];

export function AboutView() {
  const t = useT();
  const [tab, setTab] = useState<"contact" | "dedication">("contact");

  // defensive lookup — the shared cinema dict may not carry ctComingSoon yet
  const tt = (k: string, fb: string) => { const v = t(k); return !v || v === k ? fb : v; };
  const comingSoon = tt("ctComingSoon", "Coming soon");

  return (
    <div className="ne-scroll h-full pb-[120px]">
      <div className="mx-auto max-w-[860px] px-5 pt-[86px] sm:px-8">
        <div className="ne-eyebrow mb-1.5">NOBODY</div>
        <h1 className="ne-display ne-h1">{t("navAbout")}</h1>

        <div className="ne-seg mt-5" role="tablist" aria-label={t("navAbout")}>
          <button className="ne-seg-btn" data-on={tab === "contact"} role="tab" aria-selected={tab === "contact"} onClick={() => setTab("contact")}>
            {t("aboutContact")}
          </button>
          <button className="ne-seg-btn" data-on={tab === "dedication"} role="tab" aria-selected={tab === "dedication"} onClick={() => setTab("dedication")}>
            {t("aboutDedication")}
          </button>
        </div>

        {tab === "contact" ? (
          <div className="ne-card mt-4 p-7 sm:p-9">
            <p className="ne-display max-w-[620px] text-[clamp(1.25rem,2.6vw,1.7rem)] font-medium leading-[1.42]">
              {t("eAboutHead").split("EPODONIOS")[0]}
              <em className="not-italic" style={{ color: "var(--accent-ink)" }}>EPODONIOS</em>
              {t("eAboutHead").split("EPODONIOS")[1]}
            </p>
            <div className="mt-7 grid gap-2.5 sm:grid-cols-2">
              {LINKS.map((row) =>
                row.kind === "link" ? (
                  <a key={row.label} href={row.href} target="_blank" rel="noreferrer" className="ne-btn justify-start !rounded-[14px] !px-4 !py-3">
                    <row.icon size={15} className="text-[var(--accent-ink)]" />
                    {row.label}
                  </a>
                ) : (
                  <button
                    key={row.label}
                    type="button"
                    aria-disabled="true"
                    title={comingSoon}
                    className="ne-btn justify-start !rounded-[14px] !px-4 !py-3"
                  >
                    <row.icon size={15} className="text-[var(--mut)]" />
                    {row.label}
                    <span className="text-[11px] text-[var(--faint)]">{row.handle}</span>
                    <span
                      className="ne-chip ms-auto !px-2 !py-0.5 !text-[10px]"
                      style={{ color: "var(--accent-ink)" }}
                    >
                      {comingSoon}
                    </span>
                  </button>
                )
              )}
            </div>
            <div className="mt-6 flex items-center gap-2 text-[12px] text-[var(--mut)]">
              {t("madeBy")} <span className="ne-display text-[14px] font-semibold italic">EPODONIOS</span> — {t("aboutRole")}
              <span aria-hidden>·</span>
              <span
                className="ne-chip !px-2 !py-0.5 tnum"
                title="NOBODY version"
                style={{ color: "var(--accent-ink)" }}
              >
                {APP_VERSION_LABEL}
              </span>
            </div>
          </div>
        ) : (
          <div className="ne-card mt-4 space-y-6 p-7 sm:p-9">
            <div>
              <div className="ne-eyebrow mb-2">{t("fromNobodyTitle")}</div>
              <p className="text-[14px] leading-[1.75] text-[var(--fg)]">{t("fromNobodyBody")}</p>
            </div>
            <div className="border-t pt-6" style={{ borderColor: "var(--line2)" }}>
              <div className="ne-eyebrow mb-2">{t("fromCreatorTitle")}</div>
              <p className="text-[14px] leading-[1.75] text-[var(--fg)]">{t("fromCreatorBody")}</p>
            </div>
            <div className="ne-display text-[16px] italic text-[var(--mut)]">{t("signed")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
