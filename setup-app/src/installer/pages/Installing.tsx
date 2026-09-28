/**
 * PAGE 4 — INSTALLING (V3 dynamic bento). The heart of it.
 *
 * The hero cards are GlowCards: their 1px edge lights up under the pointer and
 * stays hot while the extraction runs, so the card itself answers both the
 * cursor and the disk. The ring carries a bezel of 44 ticks, the equalizer has
 * peak-hold markers, and the throughput card draws a sparkline fed by real
 * rate samples. One control only: Cancel.
 */
import { useEffect, useRef, useState } from "react";
import { t, tl } from "@/installer/i18n";
import { FILE_COUNT, formatMb, TOTAL_BYTES } from "@/installer/payload";
import { useSetup } from "@/installer/useSetup";
import { Button, Chip, ShimmerLogo } from "@/ui/kit";
import { Sparkline, StatTile } from "@/ui/controls";
import { GlowCard } from "@/ui/dynamics";
import { Equalizer, PourBar, ProgressRing } from "@/ui/meters";
import { Odometer, PhaseStepper } from "@/ui/motion";

export default function Installing() {
  const s = useSetup();
  const phases = tl(s.lang, "phases");
  const p = s.progress;
  const [shownFile, setShownFile] = useState("");

  // the page owns its own start event: entering it is the act of installing
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    s.startInstall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the file readout swaps with a slide, but never more often than every 105ms
  useEffect(() => {
    if (p.file === shownFile) return;
    const id = window.setTimeout(() => setShownFile(p.file), 100);
    return () => window.clearTimeout(id);
  }, [p.file, shownFile]);

  const remaining = p.rate > 0 ? (TOTAL_BYTES - p.bytes) / p.rate : 0;
  const frac = p.done ? 1 : p.frac;
  const phaseIdx = Math.min(p.phase, phases.length - 1);
  // the hero cards glow in proportion to real throughput, not to a timer
  const hot = p.running ? 0.35 + 0.65 * Math.min(1, p.rate / (30 * 1024 * 1024)) : 0;

  return (
    <div className="relative flex h-full flex-col px-[76px] pb-8 pt-7">
      {/* header */}
      <div className="nb-fade mb-5 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ShimmerLogo size="sm" sheenEvery={5200} />
          <span className="nb-hair-y h-7 shrink-0" aria-hidden />
          <div className="min-w-0">
            <div className="text-[13px] leading-4 font-medium text-nb-ink/90">
              {phases[phaseIdx]}
            </div>
            {/* fixed-height slot so a long Farsi path can never push the meter */}
            <div className="relative mt-1 h-[14px] w-full overflow-hidden">
              <span
                key={shownFile}
                className="nb-rise-sm nb-font-mono absolute inset-y-0 start-0 block max-w-full truncate text-[10px] leading-[14px] text-nb-dim"
                dir="ltr"
              >
                {shownFile ? `› ${shownFile}` : ""}
              </span>
            </div>
          </div>
        </div>
        <Chip tone={p.running ? "live" : "quiet"} className="shrink-0">
          {p.running ? t(s.lang, "inst.working") : t(s.lang, "inst.simulated")}
        </Chip>
      </div>

      {/* hero row: ring + equalizer, both glow with real throughput */}
      <div className="nb-fade flex h-[166px] items-stretch gap-4">
        <GlowCard className="grid shrink-0 place-items-center px-3" glow={hot} style={{ width: 156 }}>
          <ProgressRing frac={frac} size={126} stroke={7} ticks={44} active={p.running}>
            <span className="nb-font-mono flex items-baseline leading-none">
              <span className="text-[22px] font-medium text-nb-ink">
                <Odometer value={Math.floor(frac * 100)} digits={3} />
              </span>
              <span className="ms-0.5 text-[10px] text-nb-a2/90">%</span>
            </span>
          </ProgressRing>
        </GlowCard>
        <GlowCard className="min-w-0 flex-1 overflow-hidden px-5 py-1" glow={hot}>
          <Equalizer active={p.running} progress={frac} calm={!s.motionOn} barW={24} />
        </GlowCard>
      </div>

      {/* the pour */}
      <div className="nb-fade mt-6">
        <PourBar frac={frac} rtl={s.dir === "rtl"} height={7} />
        <div className="mt-3 flex items-baseline justify-between">
          <span className="nb-font-mono nb-num text-[10px] tracking-[0.14em] text-nb-dim">
            {formatMb(p.bytes)} / {formatMb(TOTAL_BYTES)}
          </span>
          <span className="nb-font-mono nb-num text-[10px] tracking-[0.14em] text-nb-dim/70">
            {FILE_COUNT} files · lzma2 solid
          </span>
        </div>
      </div>

      {/* phases */}
      <div className="nb-fade mt-6">
        <PhaseStepper labels={phases} active={phaseIdx} frac={frac} rtl={s.dir === "rtl"} />
      </div>

      {/* readouts — the throughput card carries the sparkline */}
      <div className="nb-fade mt-auto mb-6 grid grid-cols-5 gap-2.5">
        <StatTile label={t(s.lang, "inst.elapsed")} value={clock(p.elapsedMs)} />
        <StatTile
          label={t(s.lang, "inst.remaining")}
          value={p.running ? clock(remaining * 1000) : "—"}
        />
        <StatTile
          label={t(s.lang, "inst.rate")}
          className="col-span-2"
          value={p.running ? (p.rate / 1024 / 1024).toFixed(1) : "—"}
          unit="MB/s"
          chart={<Sparkline data={p.hist} width={132} height={24} rtl={s.dir === "rtl"} />}
        />
        <StatTile
          label={t(s.lang, "inst.files")}
          value={`${p.fileIndex}`}
          unit={`/ ${FILE_COUNT}`}
        />
      </div>

      <div className="nb-fade flex items-center justify-between">
        <Button onClick={() => s.openDialog("cancel")}>{t(s.lang, "inst.cancel")}</Button>
        <span className="nb-font-mono nb-num text-[10px] text-nb-dim/60">
          7z callback {p.running ? "live" : "idle"}
        </span>
      </div>
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
