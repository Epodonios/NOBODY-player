// ── NOBODY ALOK · top hairline header ────────────────────────────────────────
// NOBODY wordmark + mono ALOK badge on the left; a mono clock, search (palette)
// button, language cycle pill, settings gear and (in desktop runtimes) the
// window controls on the right.
// Cursor fix (V1.2.1): -webkit-app-region drag regions are resolved at the
// Chromium/OS level where CSS cursors are ignored, so the ONLY drag surface
// is an invisible 16px strip hugging the window's top edge — the custom
// cursor stays alive over the brand, clock and gaps. NO UI-switch icon —
// switching lives only in Settings.

import { useEffect, useState } from "react";
import { Minus, Maximize2, X, Settings2, Languages, Search } from "lucide-react";
import { useSettings } from "../../cinema/store/settings";
import { useT } from "../../cinema/lib/useT";
import { LANGS } from "../../cinema/i18n";
import {
  minimizeDesktopWindow,
  maximizeDesktopWindow,
} from "../../desktopWindow";
import { requestAppClose } from "../../appClose";
import { useAlokUi } from "../store/alokUi";
import type { Lang } from "../../cinema/types";

const LANG_ORDER: Lang[] = ["en", "fa", "tr", "ru"];

export function Header() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const setSetting = useSettings((s) => s.set);
  const toggleView = useAlokUi((s) => s.toggleView);
  const view = useAlokUi((s) => s.view);
  const setShowCmd = useAlokUi((s) => s.setShowCmd);
  const [clock, setClock] = useState(() => fmtClock());

  /* BUG FIX: the header drag strip is full-width; while any sheet/overlay is
   * open it swallowed clicks aimed at their headers (app-region hit-testing
   * ignores z-index). Park the drag region while any surface is up. The flag
   * now drives ONLY the 16px drag strip below, never the header content. */
  const anySurface = useAlokUi((s) =>
    s.view !== null || s.showLyrics || s.showQueue || s.showFx ||
    s.showMood || s.showAura || s.showCmd || s.showInfo,
  );
  const drag = anySurface ? undefined : true;

  // mono clock, one tick per 15 s is plenty
  useEffect(() => {
    const iv = window.setInterval(() => setClock(fmtClock()), 15000);
    return () => window.clearInterval(iv);
  }, []);

  const cycleLang = () => {
    const next = LANG_ORDER[(LANG_ORDER.indexOf(lang) + 1) % LANG_ORDER.length];
    setSetting("lang", next);
  };

  return (
    <header className="na-header" aria-label="main">
      {/* Electron window drag strip — the ONLY drag surface in the header.
          An empty 16px band at the very top edge (inset-x-0 covers RTL). The
          .na-icon-btn/.na-win-btn controls start at y≈10/14 in the 58px bar,
          so they overlap the band — zIndex:-1 paints the strip beneath the
          static header content, and Chromium's app-region hit test picks the
          topmost paint, so controls always win. Unmounted while a sheet or
          overlay is open (parked). */}
      {drag && (
        <div
          aria-hidden
          data-tauri-drag-region
          className="absolute inset-x-0 top-0 h-4"
          style={{ zIndex: 0 }}
        />
      )}
      <div className="na-brand">
        <b>NOBODY</b>
        <span className="na-brand-badge" aria-hidden>ALOK</span>
      </div>

      <div className="na-header-end">
        <span className="na-clock" aria-hidden>{clock}</span>
        <button
          className="na-icon-btn"
          onClick={() => setShowCmd(true)}
          title={t("alCmd")}
          aria-label={t("alCmd")}
        >
          <Search size={16} />
        </button>
        <button
          className="na-lang-btn"
          onClick={cycleLang}
          title={lang === "fa" ? "تغییر زبان" : "Change language"}
          aria-label={lang === "fa" ? "تغییر زبان" : "Change language"}
        >
          <Languages size={13} />
          <span className="na-mono">{LANGS.find((l) => l.id === lang)?.label}</span>
        </button>

        <button
          className="na-icon-btn"
          data-on={view === "settings"}
          onClick={() => toggleView("settings")}
          title={t("alSettings")}
          aria-label={t("alSettings")}
        >
          <Settings2 size={17} />
        </button>

        {/* window controls — real buttons in Tauri/Electron, harmless in browser.
            dir="ltr" keeps their Min/Max/Close order stable in RTL locales. */}
        <div className="flex items-center gap-0.5 border-s ps-1" style={{ borderColor: "var(--na-line-soft)" }} dir="ltr">
          <button className="na-win-btn" onClick={() => void minimizeDesktopWindow()} aria-label="Minimize" title="Minimize">
            <Minus size={14} />
          </button>
          <button className="na-win-btn" onClick={() => void maximizeDesktopWindow()} aria-label="Maximize" title="Maximize">
            <Maximize2 size={12} />
          </button>
          <button className="na-win-btn" data-danger onClick={() => void requestAppClose()} aria-label="Close" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}

function fmtClock(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
