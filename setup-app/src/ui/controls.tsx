/**
 * V2.1 controls — the small instruments that make a surface feel engineered
 * rather than decorated.
 *
 *   Segmented  a sliding-indicator control (install scope)
 *   Sparkline  an inline throughput chart fed by real engine samples
 *   StatTile   a labelled card that can carry a value, a unit and a chart
 */
import { useId, type ReactNode } from "react";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------- segmented */

/**
 * Two or three options, one indicator that slides between them. The indicator
 * is a signed translate, so it also travels the right way in a mirrored
 * (Farsi) layout.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { v: T; l: string; hint?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.v === value));
  return (
    <div
      className={cn("relative flex items-center gap-0.5 rounded-full p-0.5", className)}
      style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.07)" }}
      role="group"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 rounded-full transition-transform duration-[380ms]"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          insetInlineStart: 2,
          background: "linear-gradient(135deg, rgba(255,45,120,0.92), rgba(255,122,77,0.78))",
          transform: `translateX(calc(var(--nb-dir) * ${idx} * 100%))`,
          boxShadow: "0 2px 12px -2px rgba(255,45,120,0.65)",
        }}
      />
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          aria-pressed={value === o.v}
          title={o.hint}
          className={cn(
            "nb-focus relative z-10 flex-1 rounded-full py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors duration-300",
            value === o.v ? "text-white" : "text-nb-dim hover:text-nb-muted",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- sparkline */

/**
 * An inline area chart. Points come from the extraction engine (real rate
 * samples), so when the disk stalls the line flattens — it is not decorative.
 */
export function Sparkline({
  data,
  width = 120,
  height = 26,
  rtl = false,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  rtl?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const series = data.length > 1 ? data : [0, ...data, 0];
  const max = Math.max(1e-6, ...series);
  const n = series.length;
  const px = (i: number) => (i / (n - 1)) * width;
  const py = (v: number) => height - 1 - (v / max) * (height - 3);
  const line = series.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const last = series[n - 1] ?? 0;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      style={{ transform: rtl ? "scaleX(-1)" : undefined, display: "block" }}
      aria-hidden
    >
      <defs>
        <linearGradient id={`nb-spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF2D78" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#FF7A4D" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#nb-spark-${id})`} />
      <path
        d={line}
        fill="none"
        stroke="#FF9EC4"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the live head — a dot with a soft halo at the newest sample */}
      <circle
        cx={px(n - 1)}
        cy={py(last)}
        r="1.9"
        fill="#FFD9E6"
        style={{ filter: "drop-shadow(0 0 3px rgba(255,158,196,0.9))" }}
      />
    </svg>
  );
}

/* -------------------------------------------------------------- stat tile */

export function StatTile({
  label,
  value,
  unit,
  chart,
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  chart?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("nb-card-quiet nb-lift px-4 py-2.5", className)}>
      <div className="nb-font-mono mb-1 text-[8.5px] tracking-[0.2em] text-nb-dim/80 uppercase">
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="nb-font-mono nb-num text-[12px] text-nb-ink/85">{value}</span>
        {unit && <span className="nb-font-mono text-[9px] text-nb-dim">{unit}</span>}
      </div>
      {chart && <div className="mt-1.5">{chart}</div>}
      {children}
    </div>
  );
}
