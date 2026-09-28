// ── NOBODY · navigation rail ─────────────────────────────────────────────────

import { Library, ListMusic, WandSparkles, BookOpen, HeartHandshake, Settings2, ArrowLeftRight } from "lucide-react";
import { useUi } from "../store/ui";
import { useSmartFetch } from "../lib/smartFetch";
import { useSettings } from "../store/settings";
import { switchUiMode } from "../../uiMode";
import { useT } from "../lib/useT";
import { cn } from "../utils/cn";
import type { ViewId } from "../types";

export function Sidebar() {
  const t = useT();
  const lang = useSettings((s) => s.lang);
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const sfOpen = useSmartFetch((s) => s.open);
  const sfRunning = useSmartFetch((s) => s.running);
  const setSFOpen = useSmartFetch((s) => s.setOpen);

  const items: { id: ViewId; icon: any; label: string }[] = [
    { id: "library", icon: Library, label: t("navLibrary") },
    { id: "playlists", icon: ListMusic, label: t("navPlaylists") },
    { id: "about", icon: BookOpen, label: t("navAbout") },
    { id: "support", icon: HeartHandshake, label: t("navSupport") },
    { id: "settings", icon: Settings2, label: t("navSettings") },
  ];

  return (
    <nav
      className="fixed inset-y-0 start-0 z-40 flex w-[68px] flex-col items-center border-e py-5 lg:w-[200px] lg:items-stretch lg:px-4"
      style={{ borderColor: "var(--line)", background: "var(--bg)" }}
      aria-label="main"
    >
      {/* wordmark */}
      <div className="mb-8 flex items-center justify-center gap-2 lg:justify-start lg:px-2">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-lg italic"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          N
        </div>
        <div className="hidden lg:block">
          <div className="font-display text-[15px] font-semibold tracking-[0.22em]">NOBODY</div>
          <div className="t-faint text-[10px] tracking-wide">{t("credit")}</div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {items.map(({ id, icon: Icon, label }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => setView(id)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all duration-200",
                active ? "font-semibold" : "t-mut hover:text-[var(--fg)]"
              )}
              style={active ? { background: "var(--card2)" } : undefined}
              aria-current={active ? "page" : undefined}
            >
              {active && (
                <span
                  className="absolute inset-y-2 start-0 w-[3px] rounded-full lg:-start-4"
                  style={{ background: "var(--accent)" }}
                />
              )}
              <Icon size={17} strokeWidth={active ? 2.2 : 1.8} className={active ? "t-accent" : ""} />
              <span className="hidden lg:inline">{label}</span>
            </button>
          );
        })}

        {/* Smart Fetch trigger */}
        <button
          onClick={() => setSFOpen(true)}
          className={cn(
            "group relative mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all",
            sfOpen ? "font-semibold" : "t-mut hover:text-[var(--fg)]"
          )}
          style={sfOpen ? { background: "var(--card2)" } : undefined}
        >
          <span className="relative">
            <WandSparkles size={17} strokeWidth={1.8} className={sfOpen ? "t-accent" : ""} />
            {sfRunning && (
              <span className="absolute -end-1 -top-1 h-2 w-2 rounded-full blink" style={{ background: "var(--accent)" }} />
            )}
          </span>
          <span className="hidden lg:inline">{t("navSmartFetch")}</span>
        </button>
      </div>

      {/* bottom: UI-mode switch + credit */}
      <div className="flex flex-col gap-1">
        <button
          onClick={() => switchUiMode("classic")}
          className="group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] text-[var(--mut)] transition-all hover:text-[var(--fg)]"
          title={lang === "fa" ? "سوئیچ به رابط کلاسیک NOBODY" : "Switch to NOBODY Classic"}
          aria-label={lang === "fa" ? "سوئیچ به رابط کلاسیک NOBODY" : "Switch to NOBODY Classic"}
        >
          <ArrowLeftRight size={17} strokeWidth={1.8} />
          <span className="hidden lg:inline">{lang === "fa" ? "رابط کلاسیک" : "Classic UI"}</span>
        </button>
        <div className="t-faint hidden px-2 pb-1 text-[10px] leading-relaxed lg:block">
          <div className="font-display italic text-[11px]">{t("appName")}</div>
          {t("stVersion")}
        </div>
      </div>
    </nav>
  );
}
