/**
 * Installer UI kit — V2 (modern pass).
 * Every control is ours: no Windows button chrome, no native checkbox, no
 * MessageBox. The V2 look is soft geometry (pills, 14px cards), one warm
 * pink→coral gradient for the primary signal, layered translucent surfaces,
 * and a rotating conic outline on the element that matters most.
 *
 * Motion stays quiet: a shine crosses a primary button on hover (transition,
 * not animation), a ripple leaves the actual click point, the checkbox mark
 * draws itself. Nothing bounces, nothing outlives 500 ms.
 */
import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/utils/cn";
import { DrawCheck, Sheen } from "@/ui/motion";

/* --------------------------------------------------------------- app tile */

/**
 * The brand mark inside a rounded gradient tile — the modern "app icon" shape.
 * Used at 28px in the title bar, 56px on Finish, 40px on the desktop.
 */
export function AppTile({
  size = 28,
  className,
  glow = false,
}: {
  size?: number;
  className?: string;
  glow?: boolean;
}) {
  return (
    <span
      className={cn("nb-grad relative inline-grid shrink-0 place-items-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(7, Math.round(size * 0.31)),
        boxShadow: glow
          ? "0 0 0 1px rgba(255,255,255,0.18) inset, 0 10px 26px -8px rgba(255,45,120,0.75)"
          : "0 0 0 1px rgba(255,255,255,0.16) inset, 0 6px 18px -8px rgba(255,45,120,0.6)",
      }}
      aria-hidden
    >
      <StageGlyph size={size * 0.62} />
    </span>
  );
}

/** The stage mark: a spotlight dot over a stage, drawn with round joins. */
export function StageGlyph({ size = 16, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block" }} aria-hidden>
      <circle cx="12" cy="7.4" r="2.1" fill={color} opacity="0.95" />
      <path
        d="M12 10.6 5.4 19.4h13.2z"
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ logo */

export function ShimmerLogo({
  size = "sm",
  sheenEvery = 6000,
  className,
  style,
}: {
  size?: "xs" | "sm" | "md" | "lg";
  sheenEvery?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const map = {
    xs: { f: "13px", ls: "0.3em" },
    sm: { f: "17px", ls: "0.32em" },
    md: { f: "30px", ls: "0.36em" },
    lg: { f: "52px", ls: "0.34em" },
  }[size];
  return (
    <span
      dir="ltr"
      className={cn(
        "nb-font-display relative inline-block overflow-hidden whitespace-nowrap font-semibold",
        className,
      )}
      style={{ fontSize: map.f, letterSpacing: map.ls, paddingLeft: map.ls, lineHeight: 1, ...style }}
    >
      <span className="nb-grad-text relative block">NOBODY</span>
      <Sheen every={sheenEvery} duration={1400} />
    </span>
  );
}

/* ---------------------------------------------------------------- kicker */

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "nb-font-mono text-[9.5px] leading-none font-medium tracking-[0.26em] text-nb-dim uppercase",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A small glass pill — the modern replacement for a bare uppercase label. */
export function Chip({
  children,
  tone = "quiet",
  className,
}: {
  children: ReactNode;
  tone?: "quiet" | "accent" | "live";
  className?: string;
}) {
  const tones: Record<string, string> = {
    quiet: "text-nb-dim",
    accent: "text-nb-a2",
    live: "text-nb-a2",
  };
  return (
    <span
      className={cn(
        "nb-font-mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9.5px] tracking-[0.14em] uppercase",
        tones[tone],
        className,
      )}
      style={{
        background: tone === "quiet" ? "rgba(255,255,255,0.045)" : "rgba(255,45,120,0.1)",
        border:
          tone === "quiet"
            ? "1px solid rgba(255,255,255,0.08)"
            : "1px solid rgba(255,45,120,0.28)",
      }}
    >
      {tone === "live" && (
        <span
          className="nb-breathe block h-1 w-1 rounded-full bg-nb-a1"
          style={{ boxShadow: "0 0 6px 1px rgba(255,45,120,0.9)" }}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("nb-font-mono nb-num text-[10px]", className)}>{children}</span>;
}

export function Hairline({ className, travel = true }: { className?: string; travel?: boolean }) {
  return (
    <div className={cn("nb-hair-x relative overflow-hidden", className)} aria-hidden>
      {travel && <span className="nb-travel" />}
    </div>
  );
}

/* ---------------------------------------------------------------- button */

type Ripple = { id: number; x: number; y: number };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "quiet" | "danger";
  size?: "md" | "lg";
  autoFocus?: boolean;
  icon?: ReactNode;
  /** adds the rotating conic outline — use once per view, on the hero action */
  live?: boolean;
};

export function Button({
  variant = "ghost",
  size = "md",
  className,
  autoFocus,
  icon,
  live = false,
  children,
  onPointerDown,
  ...rest
}: BtnProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const base =
    "nb-focus group relative inline-flex select-none items-center justify-center overflow-hidden " +
    "transition-[color,border-color,background-color,box-shadow,transform,filter] duration-300 ease-out " +
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-40 hover:-translate-y-[1px]";

  const sizes =
    size === "lg" ? "h-11 px-7 text-[13px] font-medium" : "h-9 px-4.5 text-[12px] font-medium";

  const skins: Record<string, string> = {
    primary:
      "nb-grad rounded-full text-white nb-grad-ring hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(255,45,120,.5),0_16px_40px_-10px_rgba(255,45,120,.75)]",
    ghost:
      "rounded-full text-nb-muted hover:text-nb-ink border border-white/10 bg-white/[0.035] hover:bg-white/[0.07] hover:border-white/20",
    quiet: "rounded-full text-nb-dim hover:text-nb-muted",
    danger:
      "rounded-full text-nb-a2 border border-nb-a1/40 bg-nb-a1/10 hover:bg-nb-a1/18 hover:border-nb-a1/70",
  };

  return (
    <button
      ref={ref}
      type="button"
      className={cn(base, sizes, skins[variant], live && "nb-conic", className)}
      onPointerDown={(e) => {
        const el = ref.current;
        if (el) {
          const r = el.getBoundingClientRect();
          const id = ++seq.current;
          setRipples((rs) => [...rs, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
          window.setTimeout(() => setRipples((rs) => rs.filter((x) => x.id !== id)), 620);
        }
        onPointerDown?.(e);
      }}
      {...rest}
    >
      {/* hover shine — a transition so it fires on entry, not once on mount */}
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
        <span
          className="nb-btn-sheen absolute inset-y-0 block w-1/2"
          style={{
            background:
              "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)",
          }}
        />
      </span>
      {ripples.map((r) => (
        <span
          key={r.id}
          aria-hidden
          className="pointer-events-none absolute h-16 w-16 rounded-full"
          style={{
            left: r.x,
            top: r.y,
            marginLeft: -32,
            marginTop: -32,
            background:
              "radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(255,45,120,0.16) 45%, transparent 70%)",
            animation: "nb-pulse-ring 600ms var(--ease-nb-out) both",
          }}
        />
      ))}
      <span className="relative flex items-center gap-2 tracking-tight">
        {children}
        {icon}
      </span>
    </button>
  );
}

/** The hero CTA: pill, gradient, arrow that nudges, optional conic ring. */
export function CtaButton({ children, rtl = false, live = false, ...rest }: BtnProps & { rtl?: boolean }) {
  return (
    <Button variant="primary" size="lg" live={live} {...rest} icon={<Arrow rtl={rtl} />}>
      {children}
    </Button>
  );
}

function Arrow({ rtl }: { rtl: boolean }) {
  return (
    <svg
      width="14"
      height="8"
      viewBox="0 0 14 8"
      aria-hidden
      className="transition-transform duration-300 group-hover:translate-x-0.5"
      style={{ transform: rtl ? "scaleX(-1)" : undefined }}
    >
      <path
        d="M0 4h12M9 1l3 3-3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  );
}

/* -------------------------------------------------------------- checkbox */

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  autoFocus,
}: {
  checked: boolean;
  onChange: () => void;
  label: ReactNode;
  hint?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        "nb-focus group flex w-full items-center gap-3.5 rounded-xl py-2.5 text-start transition-all duration-300",
        "hover:bg-white/[0.03]",
      )}
    >
      <span
        className={cn(
          "grid h-[18px] w-[18px] shrink-0 place-items-center transition-all duration-300",
          checked ? "nb-grad" : "border border-white/16 bg-white/[0.03] group-hover:border-white/30",
        )}
        style={{
          borderRadius: 7,
          boxShadow: checked ? "0 0 16px -2px rgba(255,45,120,0.6)" : undefined,
        }}
      >
        {checked && <DrawCheck size={11} color="#fff" />}
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            "block text-[13px] leading-5 transition-colors duration-300",
            checked ? "text-nb-ink" : "text-nb-muted group-hover:text-nb-ink",
          )}
        >
          {label}
        </span>
        {hint && (
          <span className="nb-font-mono nb-type mt-0.5 block text-[10px] leading-4 text-nb-dim">
            {hint}
          </span>
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------- language pill */

const PILL_W = 34;
const PILL_GAP = 4;

export function LangPills({
  langs,
  active,
  onPick,
}: {
  langs: { code: string; tag: string; name: string }[];
  active: string;
  onPick: (code: string) => void;
}) {
  const idx = Math.max(
    0,
    langs.findIndex((l) => l.code === active),
  );
  return (
    <div
      className="relative flex items-center rounded-full p-0.5"
      style={{ gap: PILL_GAP, background: "rgba(255,255,255,0.04)" }}
      role="group"
    >
      {/* one indicator slides between pills — one object in motion, not four */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0.5 h-[22px] rounded-full transition-transform duration-[420ms]"
        style={{
          width: PILL_W,
          insetInlineStart: 2,
          background: "linear-gradient(135deg, rgba(255,45,120,0.9), rgba(255,122,77,0.75))",
          transform: `translateX(calc(var(--nb-dir) * ${idx * (PILL_W + PILL_GAP)}px))`,
          boxShadow: "0 2px 10px -2px rgba(255,45,120,0.7)",
        }}
      />
      {langs.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => onPick(l.code)}
          title={l.name}
          aria-pressed={active === l.code}
          className={cn(
            "nb-focus nb-font-mono relative h-[22px] rounded-full text-[10px] leading-none font-medium transition-colors duration-300",
            active === l.code ? "text-white" : "text-nb-dim hover:text-nb-muted",
          )}
          style={{ width: PILL_W }}
        >
          {l.tag}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- window glyph */

export function WinGlyph({
  kind,
  label,
  onClick,
}: {
  kind: "min" | "close";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "nb-winbtn nb-focus group grid h-[30px] w-[30px] place-items-center transition-all duration-200",
        kind === "close"
          ? "rounded-[9px] hover:bg-nb-a1/25 hover:shadow-[0_0_16px_-4px_rgba(255,45,120,0.7)]"
          : "rounded-[9px] hover:bg-white/10",
      )}
    >
      <span
        className={cn(
          kind === "min" ? "nb-glyph-min" : "nb-glyph-close",
          "text-nb-muted transition-colors duration-200 group-hover:text-nb-ink",
        )}
        aria-hidden
      />
    </button>
  );
}

/* --------------------------------------------------------------- modal */

export function Modal({
  title,
  body,
  children,
  onClose,
  danger = false,
}: {
  title: string;
  body: string;
  children: ReactNode;
  onClose: () => void;
  danger?: boolean;
}) {
  const stayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    stayRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center p-8">
      <div
        className="nb-fade absolute inset-0 rounded-[16px] bg-black/60"
        style={{ backdropFilter: "blur(5px)" }}
        onClick={onClose}
      />
      <div
        ref={stayRef}
        className={cn("nb-pop nb-card relative w-[400px] p-6")}
        style={{
          background: "linear-gradient(180deg,#14111B,#0E0C13)",
          borderColor: danger ? "rgba(255,45,120,0.3)" : "rgba(255,255,255,0.08)",
          boxShadow: "0 30px 90px -20px rgba(0,0,0,0.85)",
        }}
      >
        {danger && <span className="nb-conic absolute inset-0 rounded-[14px]" aria-hidden />}
        <h2 className="nb-rise nb-font-ui mb-2.5 text-[15px] font-semibold text-nb-ink">{title}</h2>
        <p className="nb-rise nb-s1 mb-6 text-[12.5px] leading-6 text-nb-muted">{body}</p>
        <div className="nb-rise nb-s2 flex items-center justify-end gap-2">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ scroll frame */

export function ScrollFrame({
  children,
  className,
  onScrollState,
  onScrollFrac,
}: {
  children: ReactNode;
  className?: string;
  onScrollState?: (atEnd: boolean) => void;
  onScrollFrac?: (frac: number) => void;
}) {
  return (
    <div
      className={cn(
        "nb-scroll relative overflow-y-auto rounded-[14px] border border-white/[0.07] bg-[#0B0A0F] px-6 py-5",
        className,
      )}
      onScroll={(e) => {
        const el = e.currentTarget;
        const max = el.scrollHeight - el.clientHeight;
        onScrollFrac?.(max > 0 ? el.scrollTop / max : 1);
        onScrollState?.(el.scrollTop + el.clientHeight >= el.scrollHeight - 12);
      }}
    >
      {children}
    </div>
  );
}
