// ── NOBODY EELA · top navigation ─────────────────────────────────────────────
// One floating paper card: NOBODY wordmark, the five views as teal-pill nav,
// a language pill and (in desktop runtimes) the window controls.
// Cursor fix (V1.2.1): -webkit-app-region drag regions are resolved at the
// Chromium/OS level where CSS cursors are ignored, so the ONLY drag surface
// is an invisible 16px strip hugging the window's top edge — the custom
// cursor stays alive over the whole paper card.

import { Library, ListMusic, Download, HeartHandshake, Info, Settings2, Languages, Minus, Maximize2, X } from "lucide-react";
import { useEelaUi } from "../store/eelaUi";
import { useSettings } from "../../cinema/store/settings";
import { useT } from "../../cinema/lib/useT";
import { LANGS } from "../../cinema/i18n";
import { minimizeDesktopWindow, maximizeDesktopWindow } from "../../desktopWindow";
import { requestAppClose } from "../../appClose";
import type { Lang, ViewId } from "../../cinema/types";

const NAV: { id: ViewId; icon: any }[] = [
  { id: "library", icon: Library },
  { id: "playlists", icon: ListMusic },
  { id: "downloads", icon: Download },
  { id: "support", icon: HeartHandshake },
  { id: "about", icon: Info },
  { id: "settings", icon: Settings2 },
];

// V1.4.0: "ru" rides the cycle (Settings offers the RU pill too). The cast
// keeps this compiling whether the shared Lang union has widened yet or not.
const LANG_ORDER = ["en", "fa", "tr", "ru"] as unknown as Lang[];

export function TopNav() {
  const t = useT();
  const view = useEelaUi((s) => s.view);
  const setView = useEelaUi((s) => s.setView);
  const lang = useSettings((s) => s.lang);
  const setSetting = useSettings((s) => s.set);

  /* BUG FIX: the always-mounted full-width drag strip swallowed clicks aimed
   * at the NowPlaying / ambient / queue headers while those overlays were
   * open (app-region hit-testing ignores z-index). Park the drag region
   * whenever an overlay is up. The flag now drives ONLY the 16px drag strip
   * below, never the card content. */
  const overlayOpen = useEelaUi((s) => s.showNp || s.showAmbient || s.showQueue);
  const drag = overlayOpen ? undefined : true;

  const cycleLang = () => {
    const next = LANG_ORDER[(LANG_ORDER.indexOf(lang) + 1) % LANG_ORDER.length];
    setSetting("lang", next);
  };

  return (
    <header className="ne-topnav" aria-label="main">
      {/* Electron window drag strip — the ONLY drag surface in the header.
          -top-3.5 mirrors .ne-topnav { top: 14px } so the strip hugs the
          window's very top edge instead of floating down with the card; at
          that height it never underlaps a control (the card's buttons start
          ≈22px down and paint above this z:-1 strip). inset-x-0 covers RTL.
          pointer-events-auto re-arms it inside this pointer-events-none
          header. Unmounted while an overlay is open (parked). */}
      {drag && (
        <div
          aria-hidden
          data-tauri-drag-region
          className="pointer-events-auto absolute inset-x-0 -top-3.5 h-4"
          style={{ zIndex: 0 }}
        />
      )}
      <div className="ne-topnav-card">
        <div className="ne-brand">
          <b>NOBODY</b>
          <span>{t("credit")}</span>
        </div>

        <nav className="ne-nav" role="tablist" aria-label="views">
          {NAV.map(({ id, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className="ne-nav-btn"
              data-on={view === id}
              title={t(`nav${id[0].toUpperCase()}${id.slice(1)}` as any) || id}
            >
              <Icon size={14} strokeWidth={2} />
              <span className="hidden lg:inline">{t(`nav${id[0].toUpperCase()}${id.slice(1)}` as any)}</span>
            </button>
          ))}

          <span className="ne-nav-sep" aria-hidden />

          <button
            className="ne-nav-btn"
            data-on="false"
            onClick={cycleLang}
            title={lang === "fa" ? "تغییر زبان" : "Change language"}
            aria-label={lang === "fa" ? "تغییر زبان" : "Change language"}
          >
            <Languages size={14} strokeWidth={2} />
            <span className="hidden sm:inline">{LANGS.find((l) => l.id === lang)?.label ?? lang.toUpperCase()}</span>
          </button>

          {/* window controls — real buttons in Tauri/Electron, harmless in browser.
              dir="ltr" keeps their Min/Max/Close order stable in RTL locales. */}
          <span className="flex items-center" dir="ltr">
            <button className="ne-icon-btn !w-7 !h-7" onClick={() => minimizeDesktopWindow()} aria-label="Minimize" title="Minimize">
              <Minus size={13} />
            </button>
            <button className="ne-icon-btn !w-7 !h-7" onClick={() => maximizeDesktopWindow()} aria-label="Maximize" title="Maximize">
              <Maximize2 size={11} />
            </button>
            <button
              className="ne-icon-btn !w-7 !h-7 hover:!bg-[#e5484d] hover:!text-white"
              onClick={() => void requestAppClose()}
              aria-label="Close"
              title="Close"
            >
              <X size={13} />
            </button>
          </span>
        </nav>
      </div>
    </header>
  );
}
