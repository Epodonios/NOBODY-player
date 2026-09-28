/**
 * The shell — V3 (dynamic).
 * A borderless 980×640 window with a glass titlebar, a gradient app tile, and
 * a slim progress spine down the start edge that grows in as soon as the user
 * commits to the flow.
 *
 * V3 adds an energy-driven ambience layer: the whole window breathes to a
 * single 0..1 value derived from real install progress, so the room genuinely
 * gets more alive while the disk is busy — the vignette pulses faster, the
 * aurora brightens, and the window picks up a faint warm bloom.
 *
 * What the NSIS build does with SetWindowLong / WM_NCLBUTTONDOWN is done here
 * with pointer events and a transform; the visual contract is identical.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { WALLPAPER_DATA_URI } from "@/generated/wallpaper";
import { LANGS, t } from "@/installer/i18n";
import { TOKENS } from "@/installer/tokens";
import { useSetup } from "@/installer/useSetup";
import { cn } from "@/utils/cn";
import { Aurora, Motes, useSpotlight } from "@/ui/motion";
import { AppTile, Hairline, LangPills, WinGlyph } from "@/ui/kit";

const W = TOKENS.window.w;
const H = TOKENS.window.h;

const SETUP_STEPS = ["welcome", "license", "destination", "installing", "finish"];
const UN_STEPS = ["confirm", "progress", "done"];

/* ------------------------------------------------------------- taskbar */

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="nb-font-mono nb-num text-[10px] leading-tight text-white/70">
      {now.getHours().toString().padStart(2, "0")}:{now.getMinutes().toString().padStart(2, "0")}
    </span>
  );
}

function Taskbar({ onRestore, running }: { onRestore: () => void; running: boolean }) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex h-12 items-center justify-center">
      <div
        className="flex h-full items-center gap-1 rounded-t-[14px] px-2"
        style={{
          background: "rgba(16,14,20,0.72)",
          backdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <button
          type="button"
          onClick={onRestore}
          className="group relative flex h-10 w-10 items-center justify-center"
          title="NOBODY Setup"
        >
          <span className="transition-transform duration-300 group-hover:scale-110">
            <AppTile size={24} />
          </span>
          <span
            className="absolute bottom-1 h-[2px] w-4 rounded-full transition-all duration-500"
            style={{
              background: running ? "#FF2D78" : "transparent",
              opacity: running ? 1 : 0,
              boxShadow: running ? "0 0 6px rgba(255,45,120,0.8)" : "none",
            }}
          />
        </button>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="grid h-10 w-10 place-items-center" aria-hidden>
            <span
              className="h-4 w-4"
              style={{
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: i % 2 ? "50%" : 6,
                background:
                  i === 1 ? "rgba(255,255,255,0.06)" : i === 3 ? "rgba(255,45,120,0.14)" : "transparent",
              }}
            />
          </span>
        ))}
      </div>
      <div className="absolute bottom-0 end-0 flex h-12 items-center pe-4">
        <Clock />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- desktop icon */

function DesktopIcon({
  onOpen,
  label,
  delay = 0,
}: {
  onOpen: () => void;
  label: string;
  delay?: number;
}) {
  return (
    <button
      type="button"
      onDoubleClick={onOpen}
      title="double-click"
      aria-label={label}
      className="nb-rise group absolute start-6 flex w-[86px] flex-col items-center gap-2 py-3 text-center"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="transition-transform duration-300 group-hover:scale-110">
        <AppTile size={40} />
      </span>
      <span className="nb-font-mono text-[9px] leading-4 tracking-wider text-white/55 group-hover:text-white/90">
        {label}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------ the spine */

function Spine({ steps, index, energy }: { steps: string[]; index: number; energy: number }) {
  const frac = steps.length > 1 ? index / (steps.length - 1) : 0;
  return (
    <div
      className="nb-slide-in pointer-events-none absolute inset-y-8 z-10 flex flex-col items-center"
      style={{ insetInlineStart: 30, animationDuration: "620ms" }}
      aria-hidden
    >
      <div className="absolute inset-y-1 w-[2px] rounded-full bg-white/[0.07]" />
      <div
        className="absolute top-1 w-[2px] origin-top rounded-full"
        style={{
          height: `calc(100% - 8px)`,
          transform: `scaleY(${Math.max(0.001, frac)})`,
          transition: "transform 700ms var(--ease-nb-out)",
          background: "linear-gradient(180deg, #FF2D78, #FF7A4D)",
          boxShadow: `0 0 ${8 + energy * 14}px rgba(255,45,120,${0.45 + energy * 0.5})`,
        }}
      />
      <div className="relative flex h-full flex-col justify-between py-1">
        {steps.map((st, i) => {
          const done = i < index;
          const now = i === index;
          return (
            <span key={st} className="relative grid place-items-center">
              {now && (
                <span
                  className="absolute h-4 w-4 rounded-full"
                  style={{
                    border: "1px solid rgba(255,45,120,0.55)",
                    animation: `nb-pulse-ring ${1900 - energy * 600}ms var(--ease-nb) infinite`,
                  }}
                />
              )}
              <span
                className="block h-[6px] w-[6px] rounded-full transition-all duration-500"
                style={{
                  background: done ? "#FF9EC4" : now ? "#FF2D78" : "rgba(255,255,255,0.14)",
                  transform: now ? "scale(1.5)" : "scale(1)",
                  boxShadow: now
                    ? `0 0 ${8 + energy * 12}px 2px rgba(255,45,120,${0.7 + energy * 0.3})`
                    : done
                      ? "0 0 6px rgba(255,158,196,0.4)"
                      : "none",
                }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- the window */

export function SetupWindow({ children }: { children: ReactNode }) {
  const s = useSetup();
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [vp, setVp] = useState({ w: 1600, h: 900 });
  const spotlight = useSpotlight<HTMLDivElement>();

  useLayoutEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const stageW = s.narrow ? 1366 : vp.w;
  const stageH = s.narrow ? 768 : vp.h;
  const stageScale = s.narrow ? Math.min(1, vp.w / 1366, vp.h / 768) : 1;
  const fitScale = Math.min(s.scale, (stageW - 56) / W, (stageH - 96) / H);

  const setupIdx = SETUP_STEPS.indexOf(s.page);
  const unIdx = UN_STEPS.indexOf(s.unPage);
  const showSpine = s.mode === "uninstall" ? unIdx >= 0 : setupIdx > 0;

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setPos({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const minimized = s.win === "minimized";
  const closed = s.win === "closed";
  const calm = !s.motionOn;
  const energy = calm ? 0.15 : s.energy;

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center overflow-hidden bg-[#030205]",
        calm && "nb-reduce",
      )}
    >
      <div
        className="relative overflow-hidden"
        style={{
          width: stageW,
          height: stageH,
          transform: `scale(${stageScale})`,
          transformOrigin: "center center",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.05)",
        }}
      >
        {/* desktop */}
        {s.showDesktop && (
          <>
            <div
              className="nb-fade absolute inset-0"
              style={{
                backgroundImage: `url(${WALLPAPER_DATA_URI})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <div
              className="nb-fade absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 80% at 50% 0%, rgba(8,7,11,0.2) 0%, rgba(8,7,11,0.72) 100%)",
              }}
            />
            <DesktopIcon onOpen={s.restart} label="NOBODY Setup" delay={200} />
            <DesktopIcon onOpen={s.launchUninstaller} label="Uninstall NOBODY" delay={320} />
            <div
              className="nb-rise absolute start-[130px] top-[220px] opacity-60"
              style={{ animationDelay: "420ms" }}
            >
              <div className="w-[86px]">
                <div className="mx-auto h-10 w-10 rounded-[12px] border border-white/12 bg-white/5" />
                <span className="nb-font-mono mt-2 block text-center text-[9px] leading-4 text-white/45">
                  library
                </span>
              </div>
            </div>
          </>
        )}
        {!s.showDesktop && <div className="nb-fade absolute inset-0 bg-[#08070B]" />}

        {/* window — three layers on purpose:
            L1 drag/position (translate) · L2 the entry/exit animation ·
            L3 the DPI scale. CSS animations override inline `transform`, so
            the entry animation and the scale must never live on the same
            element or fitScale silently stops working at 125% and 150%. */}
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
            transition: drag.current ? "none" : "transform .3s var(--ease-nb)",
          }}
        >
          {/* L2 · entry / exit */}
          <div
            className={cn(minimized ? "nb-genie" : closed ? "nb-fade-out" : "nb-pop")}
            style={{ borderRadius: TOKENS.radius.win }}
          >
          {/* L3 · the window */}
          <div
            ref={spotlight.ref}
            dir={s.dir}
            className="nb-grain relative flex flex-col overflow-hidden"
            style={
              {
                width: W,
                height: H,
                borderRadius: TOKENS.radius.win,
                background: TOKENS.bg,
                border: "1px solid rgba(255,255,255,0.09)",
                boxShadow: `0 46px 130px rgba(0,0,0,0.78), 0 0 ${70 + energy * 80}px -30px rgba(255,45,120,${0.12 + energy * 0.14}), inset 0 1px 0 rgba(255,255,255,0.06)`,
                fontFamily: s.dir === "rtl" ? "var(--font-fa)" : "var(--font-ui)",
                transform: `scale(${fitScale})`,
                opacity: closed ? 0 : 1,
                transition: "transform .34s var(--ease-nb), opacity .3s ease, filter .3s ease, box-shadow .6s ease",
                filter: closed ? "blur(8px)" : "none",
                pointerEvents: closed ? "none" : "auto",
                "--nb-dir": s.dir === "rtl" ? "-1" : "1",
                "--nb-energy": energy,
              } as React.CSSProperties
            }
          >
            {/* layered ambience */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(85% 55% at 50% 22%, rgba(255,45,120,0.06) 0%, rgba(255,122,77,0.02) 45%, rgba(8,7,11,0) 78%)",
              }}
            />
            {/* the breathing vignette — faster and brighter as energy rises */}
            <div
              className="nb-energy pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(70% 50% at 50% 62%, rgba(255,45,120,0.5) 0%, rgba(255,122,77,0.18) 45%, transparent 75%)",
                filter: "blur(40px)",
              }}
              aria-hidden
            />
            {!calm && <Aurora energy={energy} />}
            {!calm && s.ambient && <Motes count={20} seed={s.mode === "uninstall" ? 5 : 2} />}
            {!calm && spotlight.p.on && (
              <div
                className="pointer-events-none absolute"
                style={{
                  left: `${spotlight.p.x * 100}%`,
                  top: `${spotlight.p.y * 100}%`,
                  width: 440,
                  height: 440,
                  marginLeft: -220,
                  marginTop: -220,
                  background:
                    "radial-gradient(circle, rgba(255,158,196,0.06) 0%, rgba(255,45,120,0.02) 42%, transparent 70%)",
                  transition: "opacity 600ms ease",
                }}
              />
            )}

            {/* title bar */}
            <div
              className="nb-drag relative z-20 flex shrink-0 items-center justify-between"
              style={{ height: TOKENS.window.titlebar }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div className="nb-slide-in flex items-center gap-3 ps-6">
                <AppTile size={26} />
                <span className="nb-font-mono text-[10px] font-medium tracking-[0.14em] text-nb-dim">
                  {t(s.lang, "chrome.winTitle")}
                </span>
              </div>
              <div
                className="nb-slide-in flex items-center gap-2.5 pe-3"
                style={{ animationDelay: "90ms" }}
              >
                <LangPills
                  langs={LANGS}
                  active={s.lang}
                  onPick={(c) => s.setLang(c as typeof s.lang)}
                />
                <span className="mx-0.5 h-4 w-px bg-white/8" aria-hidden />
                <WinGlyph kind="min" label={t(s.lang, "chrome.min")} onClick={s.minimize} />
                <WinGlyph
                  kind="close"
                  label={t(s.lang, "chrome.close")}
                  onClick={() =>
                    s.openDialog(
                      s.page === "installing" && s.progress.running ? "cancel" : "quit",
                    )
                  }
                />
              </div>
            </div>

            <Hairline className="relative z-20 mx-6" travel={!calm} />

            {/* page */}
            <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
              {showSpine && (
                <Spine
                  steps={s.mode === "uninstall" ? UN_STEPS : SETUP_STEPS}
                  index={s.mode === "uninstall" ? unIdx : setupIdx}
                  energy={energy}
                />
              )}
              {children}
              {/* the opening curtain */}
              {!calm && s.curtain > 0 && s.mode === "setup" && s.page === "welcome" && (
                <span
                  key={s.curtain}
                  className="pointer-events-none absolute inset-0 z-30 overflow-hidden"
                  aria-hidden
                >
                  <span
                    className="absolute inset-x-0 top-0 h-1/2 origin-top"
                    style={{
                      background: "#050407",
                      animation: "nb-curtain-top 1000ms var(--ease-nb) both",
                    }}
                  />
                  <span
                    className="absolute inset-x-0 bottom-0 h-1/2 origin-bottom"
                    style={{
                      background: "#050407",
                      animation: "nb-curtain-bottom 1000ms var(--ease-nb) both",
                    }}
                  />
                  <span
                    className="absolute inset-x-0 top-1/2 h-[2px] rounded-full"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, #FF2D78 24%, #FFD9E6 50%, #FF7A4D 76%, transparent)",
                      boxShadow: "0 0 26px 4px rgba(255,45,120,0.5)",
                      animation: "nb-curtain-seam 1000ms var(--ease-nb) both",
                    }}
                  />
                </span>
              )}
            </div>
          </div>
          </div>
        </div>

        {s.showDesktop && <Taskbar onRestore={s.restore} running={!closed} />}

        {closed && (
          <div className="absolute inset-0 z-40 grid place-items-center">
            <div className="nb-fade text-center">
              <div className="nb-font-mono nb-blink mb-3 text-[10px] tracking-[0.3em] text-white/35">
                {s.mode === "uninstall" ? "UNINSTALLER EXITED" : "SETUP EXITED"}
              </div>
              <button
                type="button"
                onClick={s.restart}
                className="nb-focus rounded-full border border-white/12 px-6 py-2 text-[11px] text-white/70 transition-all duration-300 hover:border-white/30 hover:text-white"
              >
                {s.mode === "uninstall" ? "run the installer again" : "run setup again"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
