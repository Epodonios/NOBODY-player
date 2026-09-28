/**
 * PAGE 2 — LICENSE (V2).
 * A rounded glass scroll frame, a scroll rail on the leading edge, a three
 * segment reading meter, and an accept button that carries the live conic
 * ring — because accepting is the decision that matters on this page.
 */
import { useState } from "react";
import { t, tl } from "@/installer/i18n";
import { useSetup } from "@/installer/useSetup";
import { Button, Kicker, ScrollFrame } from "@/ui/kit";
import { GlowCard } from "@/ui/dynamics";
import { DrawCheck, Reveal } from "@/ui/motion";

export default function License() {
  const s = useSetup();
  const paras = tl(s.lang, "licenseParas");
  const [frac, setFrac] = useState(0);

  return (
    <div className="relative flex h-full flex-col px-[76px] py-9">
      <header className="nb-rise mb-5 flex items-start justify-between gap-6">
        <div>
          <Kicker className="mb-3 block text-nb-a2/80">02 · EULA</Kicker>
          <h1 className="nb-font-display text-[21px] leading-tight font-semibold text-nb-ink">
            {t(s.lang, "license.title")}
          </h1>
          <p className="mt-1.5 text-[12.5px] text-nb-muted">{t(s.lang, "license.hint")}</p>
        </div>
        {/* reading meter */}
        <div className="nb-fade nb-s2 flex shrink-0 items-center gap-1.5 pt-2" aria-hidden>
          {[0, 1, 2].map((i) => {
            const on = frac > (i + 0.15) / 3;
            return (
              <span
                key={i}
                className="block h-3.5 w-[4px] rounded-full transition-all duration-500"
                style={{
                  background: on ? "linear-gradient(180deg,#FF2D78,#FF7A4D)" : "rgba(255,255,255,0.1)",
                  transform: on ? "scaleY(1.2)" : "scaleY(1)",
                  boxShadow: on ? "0 0 8px rgba(255,45,120,0.6)" : "none",
                }}
              />
            );
          })}
        </div>
      </header>

      <div className="nb-rise nb-s1 relative min-h-0 flex-1">
        {/* scroll rail */}
        <div
          className="pointer-events-none absolute inset-y-0 start-0 w-[2px] rounded-full bg-white/[0.06]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute start-0 w-[2px] origin-top rounded-full"
          style={{
            top: 0,
            bottom: 0,
            transform: `scaleY(${Math.max(0.02, frac)})`,
            background: "linear-gradient(180deg, rgba(255,45,120,0.25), #FF2D78, #FF7A4D)",
            transition: "transform 180ms linear",
          }}
          aria-hidden
        />
        <GlowCard className="h-full" glow={s.licenseRead ? 0.3 : 0} style={{ background: "#0B0A0F" }}>
        <ScrollFrame
          className="h-full border-0 bg-transparent ps-7"
          onScrollState={s.setLicenseRead}
          onScrollFrac={setFrac}
        >
          <p className="mb-5 max-w-[62ch] text-[14px] leading-7 text-nb-ink/90">{paras[0]}</p>
          <div className="nb-hair-x mb-5" aria-hidden />
          <div className="space-y-5">
            {paras.slice(1).map((p, i) => (
              <p key={i} className="flex gap-4 text-[12.5px] leading-6 text-nb-muted">
                <span
                  className="nb-font-mono mt-0.5 shrink-0 text-[10px] transition-colors duration-700"
                  style={{
                    color: frac > (i + 1) / (paras.length + 1) ? "#FF2D78" : "#5C5568",
                  }}
                >
                  {String(i + 2).padStart(2, "0")}
                </span>
                <span className="max-w-[64ch]">{p}</span>
              </p>
            ))}
          </div>
          {/* end-of-text marker */}
          <div className="flex items-center gap-3 pt-6" aria-hidden>
            <span className="nb-hair-x flex-1" />
            <span
              className="nb-font-mono flex items-center gap-2 rounded-full px-2.5 py-1 text-[9.5px] tracking-[0.2em] uppercase transition-all duration-700"
              style={{
                color: s.licenseRead ? "#FF9EC4" : "#5C5568",
                background: s.licenseRead ? "rgba(255,45,120,0.1)" : "rgba(255,255,255,0.03)",
              }}
            >
              {s.licenseRead && <DrawCheck size={11} color="#FF9EC4" />}
              {s.licenseRead ? t(s.lang, "license.read") : "···"}
            </span>
            <span className="nb-hair-x flex-1" />
          </div>
        </ScrollFrame>
        </GlowCard>
      </div>

      <footer className="nb-rise nb-s3 mt-7 flex items-center justify-between">
        <Button onClick={() => s.openDialog("quit")}>{t(s.lang, "license.decline")}</Button>
        <Reveal mode="pop" delay={260}>
          <Button variant="primary" size="lg" live onClick={s.acceptLicense} autoFocus>
            {t(s.lang, "license.accept")}
          </Button>
        </Reveal>
      </footer>
    </div>
  );
}
