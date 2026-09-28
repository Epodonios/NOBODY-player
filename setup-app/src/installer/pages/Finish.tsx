/**
 * PAGE 5 — FINISH (V3).
 * A small celebration, then a receipt. The mark floats inside two orbit rings
 * and leans toward the pointer, three rings expand once, thin streaks fly
 * outward — and the receipt sits in a GlowCard whose edge follows the cursor.
 */
import { t } from "@/installer/i18n";
import { TOKENS } from "@/installer/tokens";
import { FILE_COUNT, formatMb, TOTAL_BYTES } from "@/installer/payload";
import { useSetup } from "@/installer/useSetup";
import { AppTile, Button, Checkbox, Kicker } from "@/ui/kit";
import { GlowCard, Magnetic, OrbitRing } from "@/ui/dynamics";
import { LightBurst, PulseRings, Reveal, Typewriter } from "@/ui/motion";

export default function Finish() {
  const s = useSetup();
  const p = s.progress;

  const shortcuts = [
    s.options.desktop ? t(s.lang, "fin.desktop") : null,
    "Start Menu",
    s.scope === "all" ? t(s.lang, "dest.scopeAll") : t(s.lang, "dest.scopeMe"),
  ].filter(Boolean) as string[];

  const avg = TOTAL_BYTES / 1024 / 1024 / Math.max(1, p.elapsedMs / 1000);

  return (
    <div className="relative flex h-full flex-col px-[76px] pb-9 pt-10">
      <LightBurst trigger={s.burst} count={s.motionOn ? 24 : 0} />

      <div className="nb-blur-in relative mx-auto" style={{ animationDelay: "120ms" }}>
        <Magnetic strength={6} tilt={8}>
          <span className="relative inline-block">
            <PulseRings count={3} size={206} color="rgba(255,45,120,0.22)" />
            <OrbitRing count={14} radius={72} duration={15000} dotSize={2} />
            <OrbitRing count={9} radius={88} duration={23000} reverse dotSize={1.5} />
            <AppTile size={54} glow />
          </span>
        </Magnetic>
      </div>

      <header className="nb-rise nb-s2 mt-6 text-center">
        <Kicker className="mb-2.5 block text-nb-a2/80">05 · DONE</Kicker>
        <h1 className="nb-font-display text-[22px] leading-tight font-semibold text-nb-ink">
          {t(s.lang, "fin.title")}
        </h1>
        <p className="mt-1.5 text-[13px] text-nb-muted">{t(s.lang, "fin.body")}</p>
      </header>

      {/* the receipt — its edge lights up under the pointer */}
      <Reveal mode="rise" delay={340} className="mt-6">
        <GlowCard className="overflow-hidden" glow={0.25}>
          <div
            className="grid grid-cols-4 gap-px"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <Row label={t(s.lang, "fin.size")} value={formatMb(TOTAL_BYTES)} />
            <Row label={t(s.lang, "fin.files")} value={String(FILE_COUNT)} />
            <Row label={t(s.lang, "fin.time")} value={clock(p.elapsedMs)} />
            <Row label={t(s.lang, "inst.rate")} value={`${avg.toFixed(1)} MB/s`} />
          </div>
          <div className="nb-hair-x" aria-hidden />
          <div className="px-5 py-3.5">
            <div className="nb-font-mono mb-1.5 text-[8.5px] tracking-[0.2em] text-nb-dim/80 uppercase">
              {t(s.lang, "fin.location")}
            </div>
            <div className="nb-font-mono nb-num text-[11px] text-nb-muted">
              <Typewriter text={s.installDir} speed={1.2} delay={620} />
              <span className="nb-caret ms-px inline-block h-3 w-px bg-nb-a2 align-middle" />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {shortcuts.map((sc) => (
                <span
                  key={sc}
                  className="nb-rise-sm nb-font-mono rounded-full px-2 py-1 text-[9px] tracking-[0.1em]"
                  style={{
                    color: "#FF9EC4",
                    background: "rgba(255,45,120,0.1)",
                    border: "1px solid rgba(255,45,120,0.2)",
                  }}
                >
                  {sc}
                </span>
              ))}
            </div>
          </div>
        </GlowCard>
      </Reveal>

      {/* options */}
      <div className="nb-rise nb-s4 mt-5 flex flex-col gap-0.5">
        <Checkbox
          checked={s.options.run}
          onChange={() => s.toggleOption("run")}
          label={t(s.lang, "fin.run")}
          hint="NOBODY.exe"
        />
        <Checkbox
          checked={s.options.desktop}
          onChange={() => s.toggleOption("desktop")}
          label={t(s.lang, "fin.desktop")}
          hint="%USERPROFILE%\\Desktop\\NOBODY.lnk"
        />
        <Checkbox
          checked={s.options.openFolder}
          onChange={() => s.toggleOption("openFolder")}
          label={t(s.lang, "fin.openFolder")}
          hint={s.installDir}
        />
      </div>

      <footer className="nb-rise nb-s6 mt-auto flex items-center justify-between">
        <Kicker className="text-nb-dim/60">
          V{TOKENS.version} · {s.upgrade ? `1.4.0 → ${TOKENS.version}` : "fresh install"}
        </Kicker>
        <Magnetic strength={5} tilt={5}>
          <Button variant="primary" size="lg" live onClick={s.closeWindow} autoFocus>
            {t(s.lang, "fin.finish")}
          </Button>
        </Magnetic>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#0C0B10] px-4 py-3">
      <div className="nb-font-mono mb-1 text-[8.5px] tracking-[0.2em] text-nb-dim/80 uppercase">
        {label}
      </div>
      <div className="nb-font-mono nb-num text-[13px] font-medium text-nb-ink/90">{value}</div>
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
