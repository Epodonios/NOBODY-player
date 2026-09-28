// ── NOBODY Cinema · Floating Stage Islands (top navigation) ──────────────────
// The rêve-edition shell: three floating glass islands hovering over the
// aurora — brand sigil (start), a centered segmented nav capsule with a glowing
// sliding pill, and a quick-actions cluster (end). Islands mirror in RTL
// through logical properties only.
// Cursor fix (V1.2.1): -webkit-app-region drag regions are resolved at the
// Chromium/OS level where CSS cursors are ignored, so the ONLY drag surface
// here is an invisible 16px strip hugging the window's top edge — the custom
// cursor stays alive over 100% of the islands.

import { motion } from "framer-motion";
import {
  Library,
  ListMusic,
  WandSparkles,
  BookOpen,
  HeartHandshake,
  Settings2,
  Languages,
  Minus,
  Maximize2,
  X,
  Search,
  Keyboard,
} from "lucide-react";
import { useUi } from "../store/ui";
import { useSmartFetch } from "../lib/smartFetch";
import { useSettings } from "../store/settings";
import { minimizeDesktopWindow, maximizeDesktopWindow } from "../../desktopWindow";
import { requestAppClose } from "../../appClose";
import { useT } from "../lib/useT";
import { cn } from "../utils/cn";
import type { Lang, ViewId } from "../types";

const LANG_CYCLE: Lang[] = ["fa", "en", "tr", "ru"];
const LANG_TICK: Record<Lang, string> = { fa: "فا", en: "EN", tr: "TR", ru: "RU" };

export function TopBar() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const setSetting = useSettings((s) => s.set);
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const sfOpen = useSmartFetch((s) => s.open);
  const sfRunning = useSmartFetch((s) => s.running);
  const setSFOpen = useSmartFetch((s) => s.setOpen);

  /* BUG FIX (user report): the always-mounted drag region over the top 62px
   * swallowed every click aimed at the NowPlaying top bar (the collapse
   * chevron could never fire) and at any sheet header. While ANY fullscreen
   * overlay/sheet is open the drag region is removed entirely — the OS hit
   * test for -webkit-app-region ignores z-index, so removing the attribute
   * is the only way to let the overlay receive its clicks. The flag now
   * drives ONLY the 16px drag strip below, never the header content. */
  const overlayOpen = useUi((s) =>
    s.showNowPlaying || s.ambient || s.showQueue || s.showFx ||
    s.showPalette || s.showShortcuts || s.showSmartFetch,
  );
  const drag = overlayOpen ? undefined : true;

  const isFa = lang === "fa";

  const items: { id: ViewId; icon: any; label: string }[] = [
    { id: "library", icon: Library, label: t("navLibrary") },
    { id: "playlists", icon: ListMusic, label: t("navPlaylists") },
    { id: "about", icon: BookOpen, label: t("navAbout") },
    { id: "support", icon: HeartHandshake, label: t("navSupport") },
    { id: "settings", icon: Settings2, label: t("navSettings") },
  ];

  const cycleLang = () => {
    const next = LANG_CYCLE[(LANG_CYCLE.indexOf(lang) + 1) % LANG_CYCLE.length];
    setSetting("lang", next);
  };

  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-0 z-40 grid h-[62px] grid-cols-[1fr_auto_1fr] items-start gap-2 px-3 pt-2.5 lg:px-4"
      aria-label="main"
    >
      {/* ── Electron window drag strip — the ONLY drag surface in the header.
          An empty 16px band at the very top edge: it never underlaps the
          islands (they start at y=10 but paint above this z:-1 strip, and
          their controls start lower), and RTL is covered by inset-x-0.
          pointer-events-auto re-arms it inside this pointer-events-none
          header. Unmounted while an overlay is open (parked). */}
      {drag && (
        <div
          aria-hidden
          data-tauri-drag-region
          className="pointer-events-auto absolute inset-x-0 top-0 h-4"
          style={{ zIndex: 0 }}
        />
      )}

      {/* ── brand sigil island ── */}
      <div className="pointer-events-auto flex min-w-0 justify-start">
        <div className="glass flex h-[42px] items-center gap-2.5 rounded-2xl ps-1.5 pe-3">
          <div className="relative">
            <span className="nc-brand-glow rounded-xl" aria-hidden />
            <div
              className="relative flex h-[30px] w-[30px] items-center justify-center rounded-xl font-display text-[15px] italic font-semibold"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              N
            </div>
          </div>
          <div className="hidden min-w-0 sm:block">
            <div className="font-display text-[12px] font-semibold leading-tight tracking-[0.26em]">NOBODY</div>
            <div className="t-faint truncate text-[9px] leading-tight tracking-wide">{t("credit")}</div>
          </div>
        </div>
      </div>

      {/* ── nav capsule island ── */}
      <nav
        className="glass pointer-events-auto flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto rounded-2xl p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {items.map(({ id, icon: Icon, label }) => {
          const active = view === id && !sfOpen;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => setView(id)}
              title={label}
              className={cn(
                "relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-[12.5px] outline-none transition-colors duration-200",
                active ? "font-semibold t-accent" : "t-mut hover:text-[var(--fg)]"
              )}
            >
              {active && (
                <motion.span
                  layoutId="nc-topnav-pill"
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                  className="absolute inset-0 rounded-xl"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 16%, transparent)",
                    boxShadow:
                      "inset 0 0 0 1px color-mix(in srgb, var(--accent) 38%, transparent), 0 4px 18px -4px color-mix(in srgb, var(--accent) 45%, transparent)",
                  }}
                />
              )}
              <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className="relative" />
              <span className="relative hidden min-w-0 lg:inline">{label}</span>
            </button>
          );
        })}

        {/* Smart Fetch trigger */}
        <button
          role="tab"
          aria-selected={sfOpen}
          onClick={() => setSFOpen(true)}
          title={t("navDownloads")}
          className={cn(
            "relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-1.5 text-[12.5px] outline-none transition-colors duration-200",
            sfOpen ? "font-semibold t-accent" : "t-mut hover:text-[var(--fg)]"
          )}
        >
          <span className="relative">
            <WandSparkles size={16} strokeWidth={1.8} className="relative" />
            {sfRunning && (
              <span
                className="blink absolute -end-1 -top-1 h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--accent)", boxShadow: "0 0 8px 1px color-mix(in srgb, var(--accent) 70%, transparent)" }}
              />
            )}
          </span>
          <span className="relative hidden min-w-0 lg:inline">{t("navDownloads")}</span>
        </button>
      </nav>

      {/* ── quick actions island ── */}
      <div className="pointer-events-auto flex min-w-0 justify-end">
        <div className="glass flex h-[42px] items-center gap-0.5 rounded-2xl px-1.5">
          <button
            onClick={() => useUi.getState().setShowPalette(true)}
            title={`${t("cmdTitle")} · Ctrl K`}
            aria-label={t("cmdTitle")}
            className="flex h-8 w-8 items-center justify-center rounded-xl t-mut transition-colors hover:bg-[var(--card2)] hover:text-[var(--fg)]"
          >
            <Search size={14} strokeWidth={1.8} />
          </button>
          <button
            onClick={() => useUi.getState().setShowShortcuts(true)}
            title={`${t("keysTitle")} · ?`}
            aria-label={t("keysTitle")}
            className="hidden h-8 w-8 items-center justify-center rounded-xl t-mut transition-colors hover:bg-[var(--card2)] hover:text-[var(--fg)] lg:flex"
          >
            <Keyboard size={14} strokeWidth={1.8} />
          </button>
          <button
            onClick={cycleLang}
            title={isFa ? "تغییر زبان" : "Change language"}
            aria-label={isFa ? "تغییر زبان" : "Change language"}
            className="flex h-8 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-semibold t-mut transition-colors hover:bg-[var(--card2)] hover:text-[var(--fg)]"
          >
            <Languages size={14} strokeWidth={1.8} />
            <span className="tnum">{LANG_TICK[lang]}</span>
          </button>

          {/* UI switching lives in Settings → Interface (removed from the menu) */}

          {/* window controls (Tauri/Electron; decorative no-op in the browser) */}
          <div className="ms-0.5 flex items-center gap-0.5 border-s ps-1" style={{ borderColor: "var(--line)" }} dir="ltr">
            <button
              type="button"
              onClick={() => minimizeDesktopWindow()}
              aria-label="Minimize"
              title="Minimize"
              className="flex h-7 w-7 items-center justify-center rounded-lg t-faint transition-colors hover:bg-[var(--card2)] hover:text-[var(--fg)]"
            >
              <Minus size={14} />
            </button>
            <button
              type="button"
              onClick={() => maximizeDesktopWindow()}
              aria-label="Maximize"
              title="Maximize"
              className="flex h-7 w-7 items-center justify-center rounded-lg t-faint transition-colors hover:bg-[var(--card2)] hover:text-[var(--fg)]"
            >
              <Maximize2 size={12} />
            </button>
            <button
              type="button"
              onClick={() => void requestAppClose()}
              aria-label="Close"
              title="Close"
              className="flex h-7 w-7 items-center justify-center rounded-lg t-faint transition-colors hover:bg-[#e5484d] hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
