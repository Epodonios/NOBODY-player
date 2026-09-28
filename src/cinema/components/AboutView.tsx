// ── NOBODY · About — Contact & Dedication ────────────────────────────────────
// Two switchable panels with a springy flip transition. Contact: creator info,
// socials, decorative typography flourish. Dedication: book-dedication styling,
// centered, editorial — one message from NOBODY, one from the creator.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Mail, ArrowUpRight, PenLine, BookHeart } from "lucide-react";
import { useT } from "../lib/useT";
import { cn } from "../utils/cn";
import { CONTACT } from "../../supportInfo";

// brand marks as inline SVG (lucide no longer ships brand icons)
const GithubMark = (p: any) => (
  <svg viewBox="0 0 24 24" width={p.size ?? 15} height={p.size ?? 15} fill="currentColor" className={p.className}><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.54-3.87-1.54-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.2.66.8.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z"/></svg>
);
const InstagramMark = (p: any) => (
  <svg viewBox="0 0 24 24" width={p.size ?? 15} height={p.size ?? 15} fill="none" stroke="currentColor" strokeWidth="1.8" className={p.className}><rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none"/></svg>
);

// V1.4.0 (request #7): every handle lives in the shared src/supportInfo.ts —
// ONE source of truth for all four faces. Instagram has no page yet → it
// renders as a disabled "coming soon" card (href: null).
const SOCIALS: { icon: any; label: string; handle: string; href: string | null }[] = [
  { icon: GithubMark, label: "GitHub", handle: CONTACT.githubHandle, href: CONTACT.githubHref },
  { icon: Send, label: "Telegram", handle: CONTACT.telegramHandle, href: CONTACT.telegramHref },
  { icon: Mail, label: "Email", handle: CONTACT.email, href: `mailto:${CONTACT.email}` },
  { icon: InstagramMark, label: "Instagram", handle: CONTACT.instagramHandle, href: null },
];

export function AboutView() {
  const t = useT();
  const [tab, setTab] = useState<"contact" | "dedication">("dedication");

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-28 pt-8 lg:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        {/* switcher */}
        <div className="mx-auto flex items-center gap-1 rounded-full border p-1 glass" style={{ borderColor: "var(--line)" }}>
          {(["dedication", "contact"] as const).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn("relative rounded-full px-5 py-2 text-[12.5px] transition-colors", tab === id ? "font-semibold" : "t-mut")}
            >
              {tab === id && (
                <motion.span
                  layoutId="about-pill"
                  className="absolute inset-0 rounded-full"
                  style={{ background: "var(--accent)" }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5" style={tab === id ? { color: "var(--on-accent)" } : undefined}>
                {id === "contact" ? <PenLine size={12} /> : <BookHeart size={12} />}
                {id === "contact" ? t("aboutContact") : t("aboutDedication")}
              </span>
            </button>
          ))}
        </div>

        <div className="relative mt-10 flex-1">
          <AnimatePresence mode="wait">
            {tab === "dedication" ? (
              <motion.div
                key="ded"
                initial={{ opacity: 0, y: 18, rotateX: 6 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                exit={{ opacity: 0, y: -18, rotateX: -6 }}
                transition={{ type: "spring", stiffness: 160, damping: 22 }}
                className="mx-auto max-w-xl text-center"
              >
                <div className="t-faint text-[10px] uppercase tracking-[0.4em]">{t("aboutDedication")}</div>
                <Ornament />
                <h2 className="font-display text-[13px] uppercase tracking-[0.3em] t-mut">{t("fromNobodyTitle")}</h2>
                <p className="mt-4 font-display text-[clamp(1.05rem,2.2vw,1.35rem)] italic leading-[1.9]">
                  {t("fromNobodyBody")}
                </p>
                <Ornament />
                <h2 className="font-display text-[13px] uppercase tracking-[0.3em] t-mut">{t("fromCreatorTitle")}</h2>
                <p className="mt-4 font-display text-[clamp(1.05rem,2.2vw,1.35rem)] italic leading-[1.9]">
                  {t("fromCreatorBody")}
                </p>
                <div className="t-accent mt-8 font-display text-2xl italic">{t("signed")}</div>
                <div className="t-faint mx-auto mt-14 border-t pt-4 text-[10px] tracking-[0.25em]" style={{ borderColor: "var(--line)" }}>
                  {t("appName")} · {t("credit")}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="contact"
                initial={{ opacity: 0, y: 18, rotateX: 6 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                exit={{ opacity: 0, y: -18, rotateX: -6 }}
                transition={{ type: "spring", stiffness: 160, damping: 22 }}
                className="relative"
              >
                {/* decorative typography flourish */}
                <div aria-hidden className="outline-text pointer-events-none absolute -top-14 end-0 hidden select-none font-display text-[13rem] font-bold italic leading-none lg:block">
                  &amp;
                </div>

                <div className="t-faint text-[10px] uppercase tracking-[0.4em]">{t("madeBy")}</div>
                <h1 className="mt-2 font-display text-[clamp(2.6rem,7vw,4.6rem)] font-bold italic leading-none tracking-tight">
                  EPODONIOS
                </h1>
                <div className="t-accent mt-2 font-display text-lg italic">{t("aboutRole")}</div>
                <p className="t-mut mt-5 max-w-md text-[13.5px] leading-relaxed">{t("aboutBlurb")}</p>

                <div className="mt-9 grid gap-2.5 sm:grid-cols-2">
                  {SOCIALS.map(({ icon: Icon, label, handle, href }) => {
                    // defensive dict lookup — the ctComingSoon key exists in all
                    // four dicts, but a stale bundle must still read like English
                    const v = t("ctComingSoon");
                    const soon = !v || v === "ctComingSoon" ? "Coming soon" : v;
                    if (!href) {
                      return (
                        <div
                          key={label}
                          aria-disabled="true"
                          className="glass flex select-none items-center gap-3 rounded-2xl px-4 py-3.5 opacity-50"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 10%, var(--bg2))" }}>
                            <Icon size={15} className="t-accent" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold leading-tight">{label}</span>
                            <span className="t-faint flex min-w-0 items-center gap-1.5 text-[11px]">
                              <span className="truncate">{handle}</span>
                              <span
                                className="shrink-0 rounded-full px-1.5 py-px text-[9px] uppercase tracking-[0.14em]"
                                style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}
                              >
                                {soon}
                              </span>
                            </span>
                          </span>
                        </div>
                      );
                    }
                    return (
                      <a
                        key={label}
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        className="glass group flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_38px_-16px_color-mix(in_srgb,var(--accent)_40%,transparent)]"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--accent) 10%, var(--bg2))" }}>
                          <Icon size={15} className="t-accent" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold leading-tight">{label}</span>
                          <span className="t-faint block truncate text-[11px]">{handle}</span>
                        </span>
                        <ArrowUpRight size={14} className="t-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]" />
                      </a>
                    );
                  })}
                </div>

                <div className="t-faint mt-12 text-[10px] tracking-[0.25em]">{t("stVersion")}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Ornament() {
  return (
    <div className="my-8 flex items-center justify-center gap-3" aria-hidden>
      <span className="h-px w-16" style={{ background: "linear-gradient(90deg, transparent, var(--line2))" }} />
      <span className="relative flex h-8 w-8 items-center justify-center">
        <span className="absolute inset-0 rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 32%, transparent), 0 0 18px -2px color-mix(in srgb, var(--accent) 40%, transparent)" }} />
        <span className="t-accent relative font-display text-sm italic">N</span>
      </span>
      <span className="h-px w-16" style={{ background: "linear-gradient(90deg, var(--line2), transparent)" }} />
    </div>
  );
}
