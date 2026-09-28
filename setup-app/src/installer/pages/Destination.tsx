/**
 * PAGE 3 — DESTINATION (V2.1).
 * A rounded path field, a segmented install-scope control that actually
 * repoints the path, an upgrade card with its own icon tile, two stat cards
 * joined by the marching dashed leader, a disk gauge, and the file layout.
 */
import { formatMb, TOTAL_BYTES } from "@/installer/payload";
import { TOKENS } from "@/installer/tokens";
import { t } from "@/installer/i18n";
import { useSetup } from "@/installer/useSetup";
import { Button, CtaButton, Kicker } from "@/ui/kit";
import { Segmented } from "@/ui/controls";
import { GlowCard } from "@/ui/dynamics";
import { DiskGauge } from "@/ui/meters";
import { Odometer } from "@/ui/motion";

const LAYOUT: { dst: string; kind: string }[] = [
  { dst: "NOBODY.exe", kind: "app" },
  { dst: "resources\\app.asar", kind: "core" },
  { dst: "resources\\fonts\\*.woff2", kind: "fonts" },
  { dst: "codecs\\avcodec-61.dll", kind: "codecs" },
  { dst: "locales\\fa.pak", kind: "locales" },
];

export default function Destination() {
  const s = useSetup();
  const need = TOTAL_BYTES;
  const enough = s.freeMb * 1024 * 1024 >= need;
  const root = (s.installDir.match(/^[A-Za-z]:\\/) ?? ["C:\\"])[0];
  const usedFrac = enough ? 0.29 : 0.94;

  return (
    <div className="flex h-full flex-col px-[76px] py-9">
      <header className="nb-rise mb-5">
        <Kicker className="mb-3 block text-nb-a2/80">03 · PATH</Kicker>
        <h1 className="nb-font-display text-[21px] leading-tight font-semibold text-nb-ink">
          {t(s.lang, "dest.title")}
        </h1>
        <p className="mt-1.5 text-[12.5px] text-nb-muted">{t(s.lang, "dest.hint")}</p>
      </header>

      {/* upgrade / fresh state card */}
      <div
        className="nb-rise nb-s1 relative mb-4 flex items-center gap-3.5 overflow-hidden rounded-[14px] py-3 ps-3.5 pe-4"
        style={{
          borderColor: s.upgrade ? "rgba(255,45,120,0.26)" : "rgba(255,255,255,0.06)",
          background: s.upgrade
            ? "linear-gradient(135deg, rgba(255,45,120,0.09), rgba(255,122,77,0.04))"
            : "rgba(255,255,255,0.022)",
          border: "1px solid",
          transition: "border-color 500ms ease, background 500ms ease",
        }}
      >
        <span
          className={
            s.upgrade
              ? "nb-grad grid h-8 w-8 shrink-0 place-items-center rounded-[10px]"
              : "grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-white/10 bg-white/[0.03]"
          }
          style={{ boxShadow: s.upgrade ? "0 0 18px -4px rgba(255,45,120,0.7)" : undefined }}
          aria-hidden
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            {s.upgrade ? (
              <path
                d="M8 12.5V3.5m0 0L4.5 7M8 3.5 11.5 7"
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <circle cx="8" cy="8" r="3" stroke="#A9A3B4" strokeWidth="1.4" />
            )}
          </svg>
        </span>
        <p
          className="text-[12px] leading-5 transition-colors duration-500"
          style={{ color: s.upgrade ? "#FFC9DC" : "#A9A3B4" }}
        >
          {t(s.lang, s.upgrade ? "dest.upgrade" : "dest.fresh")}
        </p>
        <span
          className="nb-font-mono nb-num ms-auto shrink-0 rounded-full px-2 py-1 text-[9.5px]"
          style={{
            color: s.upgrade ? "#FF9EC4" : "#6C6578",
            background: s.upgrade ? "rgba(255,45,120,0.14)" : "rgba(255,255,255,0.04)",
          }}
          aria-hidden
        >
          {s.upgrade ? `1.4.0 → ${TOKENS.version}` : "no prior key"}
        </span>
      </div>

      {/* path field + scope */}
      <div className="nb-rise nb-s2">
        <div className="mb-3 flex items-end justify-between gap-6">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="nb-dir"
              className="nb-font-mono mb-2 block text-[9.5px] tracking-[0.2em] text-nb-dim uppercase"
            >
              {t(s.lang, "dest.label")}
            </label>
            <div className="group relative">
              <input
                id="nb-dir"
                value={s.installDir}
                spellCheck={false}
                onChange={(e) => s.setInstallDir(e.target.value)}
                className="nb-focus nb-font-mono nb-num h-11 w-full rounded-[10px] border border-white/[0.09] bg-white/[0.028] px-4 text-[12px] text-nb-ink transition-all duration-300 outline-none placeholder:text-nb-dim focus:border-nb-a1/50 focus:bg-white/[0.045] focus:shadow-[0_0_0_3px_rgba(255,45,120,0.12)]"
                placeholder="C:\Program Files\NOBODY"
              />
              <span
                className="nb-caret pointer-events-none absolute h-4 w-px bg-nb-a2 opacity-0 transition-opacity duration-200 group-focus-within:opacity-90"
                style={{ insetInlineStart: "1rem", top: 14 }}
                aria-hidden
              />
            </div>
          </div>
          <div className="w-[220px] shrink-0">
            <div className="nb-font-mono mb-2 block text-[9.5px] tracking-[0.2em] text-nb-dim uppercase">
              {t(s.lang, "dest.scope")}
            </div>
            <Segmented
              options={[
                { v: "all" as const, l: t(s.lang, "dest.scopeAll"), hint: "HKLM" },
                { v: "me" as const, l: t(s.lang, "dest.scopeMe"), hint: "HKCU" },
              ]}
              value={s.scope}
              onChange={s.setScope}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button className="h-9" onClick={() => s.openDialog("browse")}>
            {t(s.lang, "dest.browse")}
          </Button>
          <p className="nb-font-mono nb-num text-[10px] tracking-[0.12em] text-nb-dim/70">
            {root} NTFS · {s.installDir.length}/248 · unicode ok ·{" "}
            {s.scope === "all" ? "HKLM" : "HKCU"}
          </p>
        </div>
      </div>

      {/* what lands where */}
      <div className="nb-rise nb-s3 mt-5">
        <div className="nb-font-mono mb-2.5 text-[9px] tracking-[0.2em] text-nb-dim/70 uppercase">
          {s.installDir}
        </div>
        <ul className="nb-card-quiet overflow-hidden">
          {LAYOUT.map((l, i) => (
            <li
              key={l.dst}
              className="nb-rise-sm flex items-center gap-3 px-4 py-[7px]"
              style={{ animationDelay: `${320 + i * 70}ms` }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background: i === 0 ? "#FF2D78" : "rgba(255,255,255,0.16)",
                  boxShadow: i === 0 ? "0 0 8px 1px rgba(255,45,120,0.8)" : "none",
                }}
              />
              <span className="nb-font-mono text-[10.5px] text-nb-muted">{l.dst}</span>
              <span className="nb-hair-x flex-1 opacity-70" aria-hidden />
              <span className="nb-font-mono text-[9px] tracking-[0.16em] text-nb-dim/60 uppercase">
                {l.kind}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* space: two cards + marching leader + gauge */}
      <div className="nb-rise nb-s5 mt-auto mb-7">
        <div className="flex items-stretch gap-4">
          <GlowCard className="flex-1 px-4 py-3.5">
            <Stat label={t(s.lang, "dest.need")} value={formatMb(need)} tone="ink" />
          </GlowCard>
          <div className="flex w-10 items-center">
            <div className="nb-marching h-px w-full" aria-hidden />
          </div>
          <GlowCard
            className="flex-1 px-4 py-3.5"
            glow={enough ? 0 : 0.7}
            style={
              enough
                ? undefined
                : { borderColor: "rgba(255,45,120,0.4)", background: "rgba(255,45,120,0.06)" }
            }
          >
            <Stat
              label={t(s.lang, "dest.free")}
              value={s.freeMb > 1024 ? `${(s.freeMb / 1024).toFixed(1)} GB` : `${s.freeMb} MB`}
              tone={enough ? "muted" : "danger"}
            />
          </GlowCard>
        </div>
        <div className="mt-4">
          <DiskGauge usedFrac={usedFrac} danger={!enough} rtl={s.dir === "rtl"} />
          <div className="nb-font-mono mt-2 flex justify-between text-[9px] tracking-[0.16em] text-nb-dim/70">
            <span>{root}</span>
            <span className="nb-num">
              <Odometer value={s.freeMb} digits={6} /> MB free
            </span>
          </div>
        </div>
        {!enough && (
          <p className="nb-rise mt-3 text-[12px]" style={{ color: "#FF2D78" }}>
            {t(s.lang, "dest.warn")}
          </p>
        )}
      </div>

      <footer className="nb-rise nb-s6 flex items-center justify-between">
        <Button onClick={s.back}>{t(s.lang, "dest.back")}</Button>
        <CtaButton rtl={s.dir === "rtl"} onClick={s.next} autoFocus disabled={!enough}>
          {t(s.lang, "dest.install")}
        </CtaButton>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ink" | "muted" | "danger";
}) {
  const color = tone === "ink" ? "#F6F4F8" : tone === "muted" ? "#A9A3B4" : "#FF2D78";
  return (
    <div>
      <div className="nb-font-mono mb-1.5 text-[9px] tracking-[0.2em] text-nb-dim uppercase">
        {label}
      </div>
      <div className="nb-font-mono nb-num text-[20px] leading-none font-medium" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
