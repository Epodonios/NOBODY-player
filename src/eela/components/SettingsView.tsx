// ── NOBODY EELA · Settings ───────────────────────────────────────────────────
// One calm paper card of rows. The Interface row is the home of UI switching
// (Classic / Cinema / EELA) — switching plays the shell's intro veil.

import { Languages, Moon, Wand2, Type, Music4, BarChart3, Layers } from "lucide-react";
import { useSettings } from "../../cinema/store/settings";
import { useT } from "../../cinema/lib/useT";
import { LANGS } from "../../cinema/i18n";
import { switchUiMode, useUiMode } from "../../uiMode";
import type { EelaLyricsStyle, EqStyle, Lang, ThemeMode } from "../../cinema/types";

// V1.4.0: the RU option. The shared LANGS array gains "ru" when the i18n
// round lands; until then a local "RU" pill is appended so the picker already
// offers it (de-duped, so either merge order renders exactly one RU).
const LANG_OPTS: { id: Lang; label: string }[] = (() => {
  const base = LANGS.map((l) => ({ id: l.id, label: l.label }));
  if (!base.some((l) => (l.id as string) === "ru")) base.push({ id: "ru" as unknown as Lang, label: "RU" });
  return base;
})();

export function SettingsView() {
  const t = useT();
  const s = useSettings();
  const uiMode = useUiMode();

  const themes: { id: ThemeMode; label: string }[] = [
    { id: "dark", label: t("stDark") },
    { id: "light", label: t("stLight") },
    { id: "contrast", label: t("stContrast") },
  ];

  const lyricStyles: { id: EelaLyricsStyle; label: string }[] = [
    { id: "calm", label: t("eCalm") },
    { id: "karaoke", label: t("stKaraoke") },
    { id: "minimal", label: t("stMinimal") },
  ];

  const eqStyles: { id: EqStyle; label: string }[] = [
    { id: "bars", label: t("stEqBars") },
    { id: "dots", label: t("stEqDots") },
    { id: "ring", label: t("stEqRing") },
    { id: "random", label: t("stEqRandom") },
  ];

  const faces: { id: "classic" | "cinema" | "eela" | "alok"; label: string; sub: string }[] = [
    { id: "classic", label: t("uiClassic"), sub: t("uiClassicSub") },
    { id: "cinema", label: t("uiCinema"), sub: t("uiCinemaSub") },
    { id: "eela", label: t("uiEela"), sub: t("uiEelaSub") },
    { id: "alok", label: t("uiAlok"), sub: t("uiAlokSub") },
  ];

  const sizePct = Math.round(((s.lyricsSize - 0.8) / (1.5 - 0.8)) * 100);

  return (
    <div className="ne-scroll h-full pb-[120px]">
      <div className="mx-auto max-w-[860px] px-5 pt-[86px] sm:px-8">
        <div className="ne-eyebrow mb-1.5">NOBODY</div>
        <h1 className="ne-display ne-h1">{t("navSettings")}</h1>

        <div className="ne-card mt-5 divide-y" style={{ borderColor: "var(--line2)" }}>
          {/* language */}
          <Row icon={Languages} label={t("stLanguage")}>
            <div className="ne-seg" role="group" aria-label={t("stLanguage")}>
              {LANG_OPTS.map((l) => (
                <button key={l.id} className="ne-seg-btn" data-on={s.lang === l.id} onClick={() => s.set("lang", l.id as Lang)}>
                  {l.label}
                </button>
              ))}
            </div>
          </Row>

          {/* theme — EELA's own (paper-light by default, independent of cinema) */}
          <Row icon={Moon} label={t("stTheme")}>
            <div className="ne-seg" role="group" aria-label={t("stTheme")}>
              {themes.map((th) => (
                <button key={th.id} className="ne-seg-btn" data-on={(s.eelaTheme ?? "light") === th.id} onClick={() => s.set("eelaTheme", th.id)}>
                  {th.label}
                </button>
              ))}
            </div>
          </Row>

          {/* ── interface switcher (the UI home) ── */}
          <Row icon={Layers} label={t("stInterface")} sub={t("stInterfaceSub")}>
            <div className="flex flex-wrap justify-end gap-2">
              {faces.map((f) => {
                const active = uiMode === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => switchUiMode(f.id)}
                    disabled={active}
                    className="ne-btn flex-col !items-start !gap-0.5 !rounded-[14px] !px-4 !py-2.5"
                    style={
                      active
                        ? { background: "var(--accent)", borderColor: "transparent", color: "var(--on-accent)" }
                        : undefined
                    }
                    aria-pressed={active}
                    title={f.sub}
                  >
                    <span className="text-[12.5px] font-semibold">{f.label}</span>
                    <span className="text-[10px] opacity-70">{active ? "✓ " : ""}{f.sub}</span>
                  </button>
                );
              })}
            </div>
          </Row>

          {/* accent from cover */}
          <Row icon={Wand2} label={t("stAccent")} sub={t("stAccentSub")}>
            <span
              role="switch"
              aria-checked={s.accentFromCover}
              tabIndex={0}
              className="ne-switch"
              data-on={s.accentFromCover}
              onClick={() => s.set("accentFromCover", !s.accentFromCover)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") s.set("accentFromCover", !s.accentFromCover); }}
            />
          </Row>

          {/* lyrics size */}
          <Row icon={Type} label={t("stLyricsSize")}>
            <div className="flex w-[240px] max-w-full items-center gap-3">
              <input
                type="range"
                min={0.8}
                max={1.5}
                step={0.05}
                value={s.lyricsSize}
                onChange={(e) => s.set("lyricsSize", parseFloat(e.target.value))}
                className="ne-range flex-1"
                style={{ ["--ne-val" as any]: `${sizePct}%` }}
                aria-label={t("stLyricsSize")}
              />
              <span className="tnum w-7 text-end text-[11px] text-[var(--mut)]">{Math.round(s.lyricsSize * 18)}</span>
            </div>
          </Row>

          {/* lyrics style */}
          <Row icon={Music4} label={t("stLyricsStyle")}>
            <div className="ne-seg" role="group" aria-label={t("stLyricsStyle")}>
              {lyricStyles.map((st) => (
                <button
                  key={st.id}
                  className="ne-seg-btn"
                  data-on={(s.eelaLyricsStyle ?? "karaoke") === st.id}
                  onClick={() => s.set("eelaLyricsStyle", st.id)}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </Row>

          {/* equalizer style */}
          <Row icon={BarChart3} label={t("stEq")} last>
            <div className="ne-seg" role="group" aria-label={t("stEq")}>
              {eqStyles.map((eq) => (
                <button key={eq.id} className="ne-seg-btn" data-on={s.eqStyle === eq.id} onClick={() => s.set("eqStyle", eq.id)}>
                  {eq.label}
                </button>
              ))}
            </div>
          </Row>
        </div>

        <div className="mt-8 flex items-center justify-between border-t pt-4 text-[10.5px] text-[var(--faint)]" style={{ borderColor: "var(--line)" }}>
          <span>{t("stVersion")}</span>
          <span className="ne-display italic">NOBODY · {t("credit")}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, sub, children, last }: { icon: any; label: string; sub?: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4.5 sm:px-6"
      style={last ? undefined : { borderBottom: "1px solid var(--line2)" }}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", color: "var(--accent-ink)" }}
        >
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-tight">{label}</div>
          {sub && <div className="mt-0.5 max-w-[380px] text-[11px] leading-snug text-[var(--mut)]">{sub}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  );
}
