/**
 * UNINSTALLER (V2) — same room, same light. Three pages: confirm, progress,
 * farewell. It asks about user data instead of deciding, because silently
 * deleting someone's playlists is how you lose them.
 */
import { t, tl } from "@/installer/i18n";
import { useSetup } from "@/installer/useSetup";
import { PourBar, ProgressRing } from "@/ui/meters";
import { AppTile, Button, Checkbox, Kicker } from "@/ui/kit";
import { GlowCard, Magnetic, OrbitRing } from "@/ui/dynamics";
import { LightBurst, Odometer, Reveal, Sheen, SplitText } from "@/ui/motion";

const STAGE_LABELS: Record<string, string> = {
  shortcuts: "Start Menu · Desktop · Startup",
  registry: "HKLM\\...\\Uninstall\\NOBODY",
  files: "C:\\Program Files\\NOBODY",
  "user data": "%APPDATA%\\NOBODY",
  "skip-data": "%APPDATA%\\NOBODY (kept)",
  final: "finalising",
};

export default function Uninstall() {
  const s = useSetup();
  if (s.unPage === "confirm") return <Confirm />;
  if (s.unPage === "progress") return <Progress />;
  return <Farewell />;
}

function Confirm() {
  const s = useSetup();
  const items = tl(s.lang, "unItems");
  return (
    <div className="flex h-full flex-col px-[76px] pb-9 pt-11">
      <header className="nb-rise mb-6 flex items-start gap-4">
        <Magnetic strength={5} tilt={7}>
          <span className="relative inline-block">
            <OrbitRing count={11} radius={58} duration={16000} dotSize={1.8} />
            <AppTile size={44} glow />
          </span>
        </Magnetic>
        <div>
          <Kicker className="mb-2.5 block text-nb-a2/80">UNINSTALL</Kicker>
          <h1 className="nb-font-display text-[21px] leading-tight font-semibold text-nb-ink">
            {t(s.lang, "un.title")}
          </h1>
          <p className="mt-1.5 text-[12.5px] text-nb-muted">{t(s.lang, "un.body")}</p>
        </div>
      </header>

      <div className="nb-rise nb-s1 mb-6">
        <div className="nb-font-mono mb-2.5 text-[9px] tracking-[0.2em] text-nb-dim/70 uppercase">
          {t(s.lang, "un.remove")}
        </div>
        <ul className="nb-card-quiet overflow-hidden">
          {items.map((it, i) => (
            <li
              key={it}
              className="nb-rise-sm flex items-center gap-3 px-4 py-2.5 text-[12px] text-nb-muted"
              style={{ animationDelay: `${180 + i * 70}ms` }}
            >
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background: i === items.length - 1 ? "#FF2D78" : "rgba(255,255,255,0.16)",
                  boxShadow:
                    i === items.length - 1 ? "0 0 8px 1px rgba(255,45,120,0.8)" : "none",
                }}
              />
              {it}
            </li>
          ))}
        </ul>
      </div>

      <Reveal mode="rise" delay={580}>
        <div className="nb-card px-4 py-1">
          <Checkbox
            checked={s.keepData}
            onChange={() => s.setKeepData(!s.keepData)}
            label={t(s.lang, "un.keepData")}
            hint="%APPDATA%\\NOBODY · 1.4 GB"
          />
        </div>
      </Reveal>

      <footer className="nb-rise nb-s7 mt-auto flex items-center justify-between">
        <Button onClick={s.unBack}>{t(s.lang, "un.keep")}</Button>
        <Reveal mode="pop" delay={280}>
          <Button variant="danger" size="lg" onClick={s.unNext} autoFocus>
            {t(s.lang, "un.remove")}
          </Button>
        </Reveal>
      </footer>
    </div>
  );
}

function Progress() {
  const s = useSetup();
  const order = [
    "shortcuts",
    "registry",
    "files",
    s.keepData ? "skip-data" : "user data",
    "final",
  ];
  const current = s.unProgress.file;
  const idx = order.indexOf(current);
  const running = s.unProgress.running;
  const frac = s.unProgress.done ? 1 : s.unProgress.frac;

  return (
    <div className="flex h-full flex-col px-[76px] pb-9 pt-11">
      <header className="nb-rise mb-7 flex items-start justify-between gap-4">
        <div>
          <Kicker className="mb-2.5 block text-nb-a2/80">UNINSTALL</Kicker>
          <h1 className="nb-font-display text-[19px] leading-tight font-semibold text-nb-ink">
            {t(s.lang, "un.progressTitle")}
          </h1>
        </div>
        <ProgressRing frac={frac} size={62} stroke={5} active={running}>
          <span className="nb-font-mono text-[13px] font-medium text-nb-ink">
            <Odometer value={Math.floor(frac * 100)} digits={3} />
          </span>
        </ProgressRing>
      </header>

      <div className="nb-fade">
        <PourBar frac={frac} rtl={s.dir === "rtl"} height={7} />
      </div>

      <GlowCard className="nb-fade mt-6 overflow-hidden" glow={running ? 0.45 : 0.15}>
      <ul className="overflow-hidden">
        {order.map((k, i) => {
          const done = s.unProgress.done || (idx >= 0 && i < idx);
          const active = idx === i;
          return (
            <div
              key={k}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{
                background: active ? "rgba(255,45,120,0.05)" : "transparent",
                transition: "background 400ms ease",
              }}
            >
              <span
                className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] transition-all duration-500"
                style={{
                  background: done
                    ? "linear-gradient(135deg,#FF2D78,#FF7A4D)"
                    : active
                      ? "rgba(255,45,120,0.16)"
                      : "rgba(255,255,255,0.045)",
                  border: active ? "1px solid rgba(255,45,120,0.5)" : "none",
                }}
                aria-hidden
              >
                {done ? (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6.4 4.8 9 10 3"
                      stroke="#fff"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <span
                    className={active ? "nb-breathe block h-1.5 w-1.5 rounded-full bg-nb-a1" : "block h-1.5 w-1.5 rounded-full bg-white/20"}
                  />
                )}
              </span>
              <span
                className="nb-font-mono text-[11px] transition-colors duration-500"
                style={{ color: done ? "#A9A3B4" : active ? "#F6F4F8" : "#6C6578" }}
              >
                {STAGE_LABELS[k] ?? k}
              </span>
              {active && running && (
                <span
                  className="nb-blink nb-font-mono ms-auto text-[9px] tracking-[0.2em] text-nb-a2/80"
                  aria-hidden
                >
                  working
                </span>
              )}
            </div>
          );
        })}
      </ul>
      </GlowCard>

      <div className="nb-fade mt-auto" />
    </div>
  );
}

function Farewell() {
  const s = useSetup();
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-[120px] text-center">
      <LightBurst trigger={s.burst} count={s.motionOn ? 18 : 0} />

      <div className="nb-blur-in relative">
        <Magnetic strength={6} tilt={8}>
          <span className="relative inline-block">
            <OrbitRing count={13} radius={70} duration={15000} dotSize={2} />
            <OrbitRing count={8} radius={86} duration={24000} reverse dotSize={1.5} />
            <AppTile size={52} glow />
          </span>
        </Magnetic>
      </div>

      <h1 className="nb-rise nb-s2 nb-font-display mt-8 max-w-[46ch] text-[19px] leading-8 font-semibold text-nb-ink">
        <SplitText
          text={t(s.lang, "un.done")}
          per={s.dir === "rtl" ? "word" : "char"}
          delay={340}
          step={26}
        />
      </h1>

      <Reveal mode="fade" delay={880}>
        <p className="mt-4 max-w-[52ch] text-[12.5px] leading-6 text-nb-muted">
          {t(s.lang, "un.clean")}
        </p>
      </Reveal>

      <Reveal mode="pop" delay={1120}>
        <div className="mt-9">
          <Button onClick={s.closeWindow} autoFocus>
            {t(s.lang, "fin.finish")}
          </Button>
        </div>
      </Reveal>

      {/* the mark of the room, one last light across it */}
      <span
        className="nb-rise nb-s5 nb-font-display relative mt-10 block overflow-hidden text-[13px] leading-none text-nb-dim/60"
        style={{ letterSpacing: "0.4em", paddingLeft: "0.4em" }}
        dir="ltr"
      >
        NOBODY
        <Sheen delay={200} every={6400} duration={1600} />
      </span>
    </div>
  );
}
