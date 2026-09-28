// ── NOBODY · Settings ────────────────────────────────────────────────────────

import { useState } from "react";
import {
  Moon, Sun, Contrast, Languages, Type, AlignCenter, Music4, Minus,
  BarChart3, Wand2, Waves, Orbit, Shapes, Database, Trash2, Check,
  MousePointer2, MessageSquareText, SlidersHorizontal, Layers,
} from "lucide-react";
import { useSettings } from "../store/settings";
import { useUi } from "../store/ui";
import { useT } from "../lib/useT";
import { LANGS } from "../i18n";
import { db } from "../lib/db";
import { revokeAllCovers } from "../lib/covers";
import { switchUiMode, useUiMode } from "../../uiMode";
import { cn } from "../utils/cn";
import type { EqStyle, Lang, LyricsStyle, ThemeMode } from "../types";

export function SettingsView() {
  const t = useT();
  const s = useSettings();
  const uiMode = useUiMode();
  const [clearArmed, setClearArmed] = useState(false);

  const lyricStyles: { id: LyricsStyle; icon: any; label: string; sub: string }[] = [
    { id: "classic", icon: AlignCenter, label: t("stClassic"), sub: t("stClassicSub") },
    { id: "karaoke", icon: Music4, label: t("stKaraoke"), sub: t("stKaraokeSub") },
    { id: "minimal", icon: Minus, label: t("stMinimal"), sub: t("stMinimalSub") },
  ];

  const eqStyles: { id: EqStyle; icon: any; label: string }[] = [
    { id: "bars", icon: BarChart3, label: t("stEqBars") },
    { id: "dots", icon: Waves, label: t("stEqDots") },
    { id: "ring", icon: Orbit, label: t("stEqRing") },
    { id: "random", icon: Shapes, label: t("stEqRandom") },
  ];

  const themes: { id: ThemeMode; icon: any; label: string }[] = [
    { id: "dark", icon: Moon, label: t("stDark") },
    { id: "light", icon: Sun, label: t("stLight") },
    { id: "contrast", icon: Contrast, label: t("stContrast") },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-28 pt-7 lg:px-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="t-faint mb-1.5 text-[9.5px] uppercase tracking-[0.34em]">NOBODY · rêve</div>
        <h1 className="dream-title font-display text-[clamp(1.8rem,4vw,2.8rem)] font-semibold leading-none tracking-tight">
          {t("navSettings")}
        </h1>

        {/* language */}
        <Section icon={Languages} title={t("stLanguage")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {LANGS.map((l) => (
              <ChoiceCard key={l.id} active={s.lang === l.id} onClick={() => s.set("lang", l.id as Lang)}>
                <div className="text-[15px] font-semibold">{l.label}</div>
                <div className="t-faint mt-0.5 text-[10px] uppercase tracking-widest">{l.id} · {l.dir.toUpperCase()}</div>
              </ChoiceCard>
            ))}
          </div>
        </Section>

        {/* interface — the home of UI switching (Classic / Cinema / EELA) */}
        <Section icon={Layers} title={t("stInterface")} sub={t("stInterfaceSub")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {([
              { id: "classic", label: t("uiClassic"), sub: t("uiClassicSub") },
              { id: "cinema", label: t("uiCinema"), sub: t("uiCinemaSub") },
              { id: "eela", label: t("uiEela"), sub: t("uiEelaSub") },
              { id: "alok", label: t("uiAlok"), sub: t("uiAlokSub") },
            ] as const).map((f) => (
              <ChoiceCard
                key={f.id}
                active={uiMode === f.id}
                onClick={() => { if (uiMode !== f.id) switchUiMode(f.id); }}
              >
                <div className="text-[15px] font-semibold">{f.label}</div>
                <div className="t-faint mt-0.5 text-[10.5px] leading-snug">{uiMode === f.id ? `✓ ${f.sub}` : f.sub}</div>
              </ChoiceCard>
            ))}
          </div>
        </Section>

        {/* theme */}
        <Section icon={Moon} title={t("stTheme")}>
          <div className="grid grid-cols-3 gap-2">
            {themes.map(({ id, icon: Icon, label }) => (
              <ChoiceCard key={id} active={s.theme === id} onClick={() => s.set("theme", id)}>
                <Icon size={16} className="t-accent" />
                <div className="mt-1.5 text-[13px] font-semibold">{label}</div>
              </ChoiceCard>
            ))}
          </div>
        </Section>

        {/* dynamic accent */}
        <Section icon={Wand2} title={t("stAccent")} sub={t("stAccentSub")}>
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {["#e3b162", "#e3638f", "#63e3c8", "#8f63e3"].map((c) => (
                <span
                  key={c}
                  className="h-6 w-6 rounded-full transition-all"
                  style={{
                    background: c,
                    boxShadow: s.accentFromCover ? "none" : undefined,
                    opacity: s.accentFromCover ? 1 : 0.35,
                  }}
                />
              ))}
            </div>
            <span
              role="switch"
              aria-checked={s.accentFromCover}
              tabIndex={0}
              className="switch"
              data-on={s.accentFromCover}
              onClick={() => s.set("accentFromCover", !s.accentFromCover)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") s.set("accentFromCover", !s.accentFromCover); }}
            />
          </div>
        </Section>

        {/* rêve experience */}
        <Section icon={MousePointer2} title={t("stExperience")} sub={t("stExperienceSub")}>
          <div className="space-y-3">
            {/* custom cursor removed (user ask: same cursor as Classic UI everywhere) */}
            <ToggleRow
              icon={MessageSquareText}
              label={t("stMiniLyrics")}
              sub={t("stMiniLyricsSub")}
              on={s.miniLyrics !== false}
              onToggle={() => s.set("miniLyrics", s.miniLyrics === false)}
            />
            <div className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-center gap-2.5">
                <SlidersHorizontal size={15} className="t-accent" />
                <span className="text-[12.5px] font-medium">{t("fxTitle")}</span>
              </div>
              <button
                onClick={() => useUi.getState().setShowFx(true)}
                className="t-accent rounded-full border px-3 py-1 text-[11px] font-semibold transition-transform hover:scale-105"
                style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}
              >
                {t("fxOpen")}
              </button>
            </div>
          </div>
        </Section>

        {/* lyrics size */}
        <Section icon={Type} title={t("stLyricsSize")}>
          <div className="flex items-center gap-4">
            <span className="t-faint font-display text-sm italic">Aa</span>
            <input
              type="range"
              min={0.8}
              max={1.5}
              step={0.05}
              value={s.lyricsSize}
              onChange={(e) => s.set("lyricsSize", parseFloat(e.target.value))}
              className="nobody-range flex-1"
              aria-label={t("stLyricsSize")}
            />
            <span className="font-display text-2xl italic t-accent">Aa</span>
            <span className="tnum t-mut w-12 text-end text-[12px]">{Math.round(s.lyricsSize * 100)}%</span>
          </div>
        </Section>

        {/* lyrics style */}
        <Section icon={Music4} title={t("stLyricsStyle")}>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {lyricStyles.map(({ id, icon: Icon, label, sub }) => (
              <ChoiceCard key={id} active={s.lyricsStyle === id} onClick={() => s.set("lyricsStyle", id)}>
                <Icon size={16} className="t-accent" />
                <div className="mt-1.5 text-[13px] font-semibold">{label}</div>
                <div className="t-faint mt-0.5 text-[10.5px] leading-snug">{sub}</div>
                <LyricsPreview style={id} active={s.lyricsStyle === id} />
              </ChoiceCard>
            ))}
          </div>
        </Section>

        {/* equalizer style */}
        <Section icon={BarChart3} title={t("stEq")}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {eqStyles.map(({ id, icon: Icon, label }) => (
              <ChoiceCard key={id} active={s.eqStyle === id} onClick={() => s.set("eqStyle", id)}>
                <Icon size={17} className="t-accent" />
                <div className="mt-1.5 text-[12.5px] font-semibold">{label}</div>
              </ChoiceCard>
            ))}
          </div>
        </Section>

        {/* ambient delay */}
        <Section icon={Moon} title={t("stAmbientDelay")}>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={5}
              max={60}
              step={1}
              value={s.ambientDelay}
              onChange={(e) => s.set("ambientDelay", parseInt(e.target.value, 10))}
              className="nobody-range flex-1"
              aria-label={t("stAmbientDelay")}
            />
            <span className="tnum t-mut w-14 text-end text-[13px]">{s.ambientDelay}{t("stSeconds")}</span>
          </div>
        </Section>

        {/* storage */}
        <Section icon={Database} title={t("stStorage")} sub={t("stStorageSub")}>
          <button
            onClick={async () => {
              if (!clearArmed) { setClearArmed(true); return; }
              await db.clearAll();
              revokeAllCovers();
              localStorage.removeItem("nobody-resume");
              location.reload();
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition-all",
              clearArmed ? "border-red-400 bg-red-500/15 text-red-400" : "t-mut"
            )}
            style={clearArmed ? undefined : { borderColor: "var(--line)" }}
          >
            <Trash2 size={14} /> {clearArmed ? t("stClearConfirm") : t("stClear")}
          </button>
        </Section>

        <div className="t-faint mt-10 flex items-center justify-between border-t pt-4 text-[10.5px]" style={{ borderColor: "var(--line)" }}>
          <span>{t("stVersion")}</span>
          <span className="font-display italic">{t("appName")} · {t("credit")}</span>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, sub, children }: { icon: any; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)" }}>
          <Icon size={13} className="t-accent" />
        </span>
        <h2 className="text-[13px] font-bold uppercase tracking-[0.14em]">{title}</h2>
      </div>
      {sub && <p className="t-mut -mt-1 mb-3 text-[11.5px]">{sub}</p>}
      <div className="glass rounded-2xl p-4">{children}</div>
    </section>
  );
}

function ToggleRow({ icon: Icon, label, sub, on, onToggle }: { icon: any; label: string; sub?: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon size={15} className="t-accent shrink-0" />
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium leading-tight">{label}</div>
          {sub && <div className="t-faint truncate text-[10.5px] leading-tight">{sub}</div>}
        </div>
      </div>
      <span
        role="switch"
        aria-checked={on}
        tabIndex={0}
        className="switch"
        data-on={on}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle(); }}
      />
    </div>
  );
}

function ChoiceCard({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn("relative rounded-xl border p-3 text-start transition-all hover:-translate-y-0.5")}
      style={{
        borderColor: active ? "color-mix(in srgb, var(--accent) 60%, transparent)" : "var(--line)",
        background: active ? "color-mix(in srgb, var(--accent) 8%, var(--card))" : "transparent",
        boxShadow: active ? "0 8px 24px -10px color-mix(in srgb, var(--accent) 50%, transparent)" : undefined,
      }}
    >
      {active && <Check size={12} className="t-accent absolute end-2.5 top-2.5" />}
      {children}
    </button>
  );
}

function LyricsPreview({ style, active }: { style: LyricsStyle; active: boolean }) {
  return (
    <div aria-hidden className="mt-2 space-y-1 opacity-60">
      <div className="h-[3px] w-3/5 rounded-full mx-auto" style={{ background: "var(--line2)", marginInlineStart: style === "minimal" ? 0 : undefined }} />
      <div
        className={cn("h-[4px] rounded-full", style === "karaoke" ? "w-full" : "w-4/5", style !== "minimal" && "mx-auto")}
        style={{ background: active ? "var(--accent)" : "var(--line2)" }}
      />
      <div className="h-[3px] w-3/5 rounded-full" style={{ background: "var(--line2)", marginInlineStart: style === "minimal" ? 0 : undefined, margin: style === "minimal" ? undefined : "0 auto" }} />
    </div>
  );
}
