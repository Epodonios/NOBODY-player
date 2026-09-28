/**
 * PAGE 1 — WELCOME (V3 dynamic hero).
 * Logotype centred, one tagline, exactly one CTA, no Back button, no spine —
 * the page is a hero on purpose; the chrome only arrives once the user
 * commits to the flow.
 *
 * V3: the mark floats and carries two counter-rotating orbit rings, the CTA is
 * magnetic (it leans toward the pointer), and the stage beams breathe.
 */
import { t } from "@/installer/i18n";
import { TOKENS } from "@/installer/tokens";
import { useSetup } from "@/installer/useSetup";
import { CtaButton, Chip, Kicker } from "@/ui/kit";
import { Float, Magnetic, OrbitRing } from "@/ui/dynamics";
import { PulseRings, Reveal, Sheen, SplitText } from "@/ui/motion";

export default function Welcome() {
  const s = useSetup();
  const per = s.dir === "rtl" ? "word" : "char";

  return (
    <div className="relative flex h-full flex-col">
      {/* two soft stage beams crossing behind the mark */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <span
          className="nb-fade absolute"
          style={{
            top: -60,
            left: "50%",
            width: 190,
            height: 420,
            marginLeft: -290,
            background:
              "linear-gradient(180deg, rgba(255,45,120,0.13) 0%, rgba(255,45,120,0.02) 60%, transparent 100%)",
            filter: "blur(26px)",
            transform: "rotate(16deg)",
            transformOrigin: "top center",
            animationDuration: "900ms",
          }}
        />
        <span
          className="nb-fade absolute"
          style={{
            top: -60,
            left: "50%",
            width: 190,
            height: 420,
            marginLeft: 100,
            background:
              "linear-gradient(180deg, rgba(255,122,77,0.11) 0%, rgba(255,122,77,0.02) 60%, transparent 100%)",
            filter: "blur(26px)",
            transform: "rotate(-16deg)",
            transformOrigin: "top center",
            animationDuration: "900ms",
            animationDelay: "100ms",
          }}
        />
      </div>

      {/* plumb line */}
      <div
        className="nb-draw-y pointer-events-none absolute start-1/2 top-0"
        style={{
          width: 1,
          height: 112,
          transformOrigin: "top center",
          background:
            "linear-gradient(180deg, rgba(255,45,120,0) 0%, rgba(255,45,120,0.45) 62%, rgba(255,45,120,0.95) 100%)",
          animationDelay: "260ms",
        }}
        aria-hidden
      />
      <div
        className="nb-pop pointer-events-none absolute start-1/2 top-0 h-[3px] w-[3px] -translate-x-1/2 rounded-full"
        style={{
          background: "#FFD9E6",
          marginLeft: "-1.5px",
          boxShadow: "0 0 12px 2px rgba(255,158,196,0.85)",
          animationDelay: "220ms",
        }}
        aria-hidden
      />

      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 pb-5">
        <Reveal mode="fade" delay={380}>
          <Chip tone="accent">
            {t(s.lang, "welcome.kicker")} · V{TOKENS.version}
          </Chip>
        </Reveal>

        {/* wordmark — floats, so the hero never sits perfectly still */}
        <Float amp={5} duration={7200} className="w-[828px]">
          <div
            className="nb-blur-in relative flex h-[78px] items-end justify-center"
            style={{ animationDelay: "440ms" }}
          >
            <span
              className="nb-pulse pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(255,45,120,0.17) 0%, rgba(255,122,77,0.05) 44%, rgba(8,7,11,0) 72%)",
              }}
              aria-hidden
            />
            {/* two counter-rotating rings of light around the wordmark */}
            <OrbitRing count={16} radius={64} duration={17000} dotSize={2} />
            <OrbitRing count={10} radius={80} duration={26000} reverse dotSize={1.5} />
            <span
              dir="ltr"
              className="nb-font-display relative block overflow-hidden text-[52px] leading-none font-semibold"
              style={{ letterSpacing: "0.34em", paddingLeft: "0.34em" }}
            >
              {/* gradient per glyph — background-clip:text on a parent breaks
                  the moment the children carry their own transform, and
                  staggered letters must transform */}
              <SplitText
                text="NOBODY"
                per="char"
                delay={600}
                step={62}
                charStyle={{
                  background: "linear-gradient(180deg, #FFFFFF 0%, #EBE6EE 46%, #B3A6B8 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  paddingBottom: "0.06em",
                }}
              />
              <Sheen delay={1900} every={6200} duration={1500} />
            </span>
          </div>
        </Float>

        {/* tagline with hairline wings */}
        <Reveal mode="rise" delay={960} className="flex w-[740px] items-center gap-5">
          <span className="nb-hair-x nb-draw-x flex-1" aria-hidden />
          <p className="shrink-0 text-center text-[13.5px] leading-6 text-nb-muted">
            <SplitText text={t(s.lang, "chrome.tagline")} per={per} delay={1060} step={32} />
          </p>
          <span
            className="nb-hair-x nb-draw-x flex-1"
            style={{ transformOrigin: "right center" }}
            aria-hidden
          />
        </Reveal>

        {/* magnetic CTA */}
        <Reveal mode="pop" delay={1400}>
          <Magnetic strength={9} tilt={6}>
            <span className="relative inline-block">
              <PulseRings count={2} size={210} color="rgba(255,45,120,0.2)" />
              <CtaButton rtl={s.dir === "rtl"} live onClick={s.next} autoFocus>
                {t(s.lang, "welcome.cta")}
              </CtaButton>
            </span>
          </Magnetic>
        </Reveal>

        <Reveal mode="fade" delay={1680}>
          <Kicker className="text-nb-dim/70">{t(s.lang, "welcome.note")}</Kicker>
        </Reveal>
      </div>

      {/* bottom stat strip */}
      <div
        className="nb-fade mx-6 mb-6 grid grid-cols-4 gap-px overflow-hidden rounded-[14px]"
        style={{
          animationDelay: "1500ms",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Stat label="version" value={`V${TOKENS.version}`} accent />
        <Stat label="build" value={TOKENS.build} />
        <Stat label="payload" value={`${TOKENS.install.files} files`} />
        <Stat label="download" value={`${TOKENS.install.sizeMb} MB`} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[#0B0A0F] px-5 py-3">
      <div className="nb-font-mono mb-1.5 text-[8.5px] tracking-[0.22em] text-nb-dim/70 uppercase">
        {label}
      </div>
      <div
        className="nb-font-mono nb-num text-[11.5px]"
        style={{ color: accent ? "#FF9EC4" : "#A9A3B4" }}
      >
        {value}
      </div>
    </div>
  );
}
