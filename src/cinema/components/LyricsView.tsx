// ── NOBODY · synced lyrics view — rêve edition ───────────────────────────────
// Three selectable treatments, all rebuilt:
//   classic  — calm editorial: centered display type, accent active line with
//              an under-line progress thread.
//   karaoke  — the showpiece: giant italic display line that FILLS with the
//              accent color as the line is sung (gradient text-clip driven by
//              a per-frame --fill variable), siblings recede with depth blur.
//   minimal  — stripped, start-aligned, live thread under the active line.
// Auto-scroll lerps via rAF + refs; only the active-line index is React state.

import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Ghost, Search, WandSparkles } from "lucide-react";
import { engine } from "../lib/engine";
import { useSettings } from "../store/settings";
import { useLibrary } from "../store/library";
import { uiApi } from "../store/ui";
import { fetchOneLyrics } from "../lib/smartFetch";
import { parseLrc, looksLikeLrc } from "../lib/lyrics";
import { extractPaletteFromBlob, type TrackPalette } from "../lib/covers";
import { db } from "../lib/db";
import { useT } from "../lib/useT";
import { activeLineIndex, lerp, clamp } from "../lib/utils";
import type { LyricsStyle, Track } from "../types";
import { cn } from "../utils/cn";

const STYLE_ORDER: LyricsStyle[] = ["classic", "karaoke", "minimal"];

export function LyricsView({ track }: { track: Track }) {
  const t = useT();
  const style = useSettings((s) => s.lyricsStyle);
  const setStyle = useSettings((s) => s.set);
  const sizeMul = useSettings((s) => s.lyricsSize);
  const patchTrack = useLibrary((s) => s.patchTrack);
  const lines = track.syncedLyrics ?? [];
  const [active, setActive] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const target = useRef(0);
  const cur = useRef(0);
  const userScrollUntil = useRef(0); // wheel/touch grace — BUG FIX, see below
  const fileRef = useRef<HTMLInputElement>(null);
  const [fetching, setFetching] = useState(false);

  const orderedLines = useMemo(() => lines, [lines]);

  // BUG FIX (user report: "lyrics are not scrollable at all"): the rAF loop
  // used to write scrollTop on EVERY frame, so any manual wheel/drag was
  // overridden before it could render. Wheel / touch / pointer-grab now open
  // a short grace window during which auto-scroll stands down; the next
  // sung line re-captures the scroll (karaoke must follow the voice).
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const bump = () => { userScrollUntil.current = performance.now() + 4200; };
    scroll.addEventListener("wheel", bump, { passive: true });
    scroll.addEventListener("touchstart", bump, { passive: true });
    scroll.addEventListener("pointerdown", bump, { passive: true });
    return () => {
      scroll.removeEventListener("wheel", bump);
      scroll.removeEventListener("touchstart", bump);
      scroll.removeEventListener("pointerdown", bump);
    };
  }, []);

  // rAF: track time → active line + fill variable + smooth scroll + threads.
  // Per-frame targets are found via the container (same pattern as the player
  // scrubber) — no React refs involved, so nothing can detach underneath us.
  useEffect(() => {
    let raf = 0;
    let lastIdx = -1; // reset per effect run → the loop re-seeds the active line on frame one
    let fillEl: HTMLElement | null = null;
    let threadEl: HTMLElement | null = null;
    // track switch bookkeeping stays in refs (react-compiler clean: no
    // setState-in-effect) — `active` is re-derived by the loop asynchronously.
    cur.current = 0;
    target.current = 0;
    userScrollUntil.current = 0;
    // Seed the karaoke fill SYNCHRONOUSLY: on a mid-line style switch the
    // .lyr-fill span is already mounted here (effects run after commit), so
    // the very first paint carries the true progress — never a stuck/flash 0%.
    if (style === "karaoke" && orderedLines.length) {
      const time0 = engine.audio.currentTime;
      const i0 = activeLineIndex(orderedLines, time0);
      const line0 = orderedLines[i0];
      const next0 = orderedLines[i0 + 1];
      if (line0) {
        const span0 = Math.max(next0 ? next0.t - line0.t : 4, 0.6);
        const f0 = clamp((time0 - line0.t) / span0, 0, 1);
        const el0 = contentRef.current?.querySelector<HTMLElement>(".lyr-fill");
        if (el0) el0.style.setProperty("--fill", String(f0));
      }
    }
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const time = engine.audio.currentTime;
      if (orderedLines.length) {
        const idx = activeLineIndex(orderedLines, time);
        if (idx !== lastIdx) {
          lastIdx = idx;
          setActive(idx);
          userScrollUntil.current = 0; // a new sung line re-captures the stage
          const content = contentRef.current;
          const scroll = scrollRef.current;
          if (content && scroll) {
            const el = content.children[idx] as HTMLElement | undefined;
            if (el) {
              target.current = el.offsetTop + el.offsetHeight / 2 - scroll.clientHeight / 2;
              target.current = clamp(target.current, -40, Math.max(0, content.scrollHeight - scroll.clientHeight + 140));
            }
          }
        }
        // within-line progress 0..1 → drives the karaoke accent fill + threads
        const line = orderedLines[lastIdx >= 0 ? lastIdx : 0];
        const next = orderedLines[(lastIdx >= 0 ? lastIdx : 0) + 1];
        if (line) {
          const span = Math.max(next ? next.t - line.t : 4, 0.6);
          const f = clamp((time - line.t) / span, 0, 1);
          // re-resolve only when the active line moved (cheap: one query per line)
          if (!fillEl || !fillEl.isConnected) fillEl = contentRef.current?.querySelector(".lyr-fill") ?? null;
          if (fillEl) fillEl.style.setProperty("--fill", String(f));
          if (!threadEl || !threadEl.isConnected) threadEl = contentRef.current?.querySelector("[data-lyr-thread]") ?? null;
          if (threadEl) threadEl.style.transform = `scaleX(${f})`;
        }
      }
      // lerp scroll — but never fight an active user scroll (grace window)
      const scroll = scrollRef.current;
      if (scroll) {
        if (performance.now() < userScrollUntil.current) {
          // keep the lerp state glued to where the user actually took the
          // stage, so resuming auto-scroll never snaps
          cur.current = scroll.scrollTop;
        } else {
          cur.current = lerp(cur.current, target.current, 0.1);
          scroll.scrollTop = cur.current;
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [orderedLines, style]);

  // Cover palette → --lyr-c1/--lyr-c2 on the scroll stage: the karaoke fill
  // pours the track's REAL cover colors through the sung words. Re-runs on
  // track change, whenever the cover may have changed (hasCover toggle) and
  // when lyrics arrive (the scroll stage only exists once there are lines).
  // null/no cover → the props are removed so CSS falls back to --accent.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let alive = true;
    const apply = (p: TrackPalette | null) => {
      if (!alive) return;
      if (p) {
        el.style.setProperty("--lyr-c1", p.c1);
        el.style.setProperty("--lyr-c2", p.c2);
      } else {
        el.style.removeProperty("--lyr-c1");
        el.style.removeProperty("--lyr-c2");
      }
    };
    (async () => {
      try {
        const blob = await db.getCover(track.id);
        if (!blob) { apply(null); return; }
        apply(await extractPaletteFromBlob(blob, track.id));
      } catch {
        apply(null);
      }
    })();
    return () => { alive = false; };
  }, [track.id, track.hasCover, orderedLines]);

  const importLrc = async (file: File) => {
    const text = await file.text();
    if (looksLikeLrc(text)) {
      patchTrack(track.id, { syncedLyrics: parseLrc(text), hasEmbeddedLyrics: true, plainLyrics: undefined });
      uiApi.toast(t("lrcImported"), "success");
    } else {
      patchTrack(track.id, { plainLyrics: text, hasEmbeddedLyrics: true });
      uiApi.toast(t("lrcImported"), "success");
    }
  };

  const fetchNow = async () => {
    setFetching(true);
    const ok = await fetchOneLyrics(track.id);
    setFetching(false);
    uiApi.toast(ok ? t("lyricsFound") : t("notFoundToast"), ok ? "success" : "info");
  };

  // ── empty state — a quiet stage for the words to come ──
  if (!orderedLines.length) {
    return (
      <div className="relative flex h-full flex-col items-center justify-center gap-4 overflow-hidden px-6 text-center">
        {/* orbit rings */}
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-60">
          {[130, 210, 300].map((s, i) => (
            <div
              key={s}
              className="absolute rounded-full border"
              style={{ width: s, height: s, borderColor: "var(--line)", animation: `nc-spin ${26 + i * 14}s linear infinite` }}
            />
          ))}
        </div>
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)" }}>
          <Ghost size={34} strokeWidth={1.1} className="t-accent" />
        </div>
        <div className="relative font-display text-2xl italic dream-title">{t("noLyricsTitle")}</div>
        <p className="t-mut relative max-w-xs text-[12.5px] leading-relaxed">
          {track.plainLyrics ? t("noLyricsHint") : `${t("noLyricsHint")} · ${t("instrumentalTag")}`}
        </p>
        {track.plainLyrics && (
          <div className="t-mut relative max-h-48 max-w-md overflow-y-auto whitespace-pre-wrap px-4 text-[13px] leading-loose" style={{ fontSize: `${13 * sizeMul}px` }}>
            {track.plainLyrics}
          </div>
        )}
        <div className="relative mt-1 flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="glass flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] transition-transform hover:scale-[1.04]"
          >
            <FileUp size={14} className="t-accent" /> {t("importLrc")}
          </button>
          <button
            onClick={fetchNow}
            disabled={fetching}
            className="bg-accent flex items-center gap-2 rounded-full px-4 py-2.5 text-[12.5px] font-semibold transition-transform hover:scale-[1.04] disabled:opacity-60"
          >
            <Search size={14} className={fetching ? "pulse-soft" : ""} /> {t("fetchLyricsNow")}
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".lrc,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importLrc(f); e.currentTarget.value = ""; }} />
      </div>
    );
  }

  // ── size curves per style ──
  const base = style === "karaoke" ? 22 : style === "minimal" ? 14 : 17;
  const act = style === "karaoke" ? 40 : style === "minimal" ? 16.5 : 22;

  return (
    <div className="relative h-full">
      {/* style cycler */}
      <button
        onClick={() => setStyle("lyricsStyle", STYLE_ORDER[(STYLE_ORDER.indexOf(style) + 1) % STYLE_ORDER.length])}
        title={t("stLyricsStyle")}
        className="glass t-mut absolute end-3 top-3 z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] transition-colors hover:text-[var(--fg)]"
      >
        <WandSparkles size={11} className="t-accent" />
        {t(style === "karaoke" ? "stKaraoke" : style === "minimal" ? "stMinimal" : "stClassic")}
      </button>

      <div
        ref={scrollRef}
        className="nc-lyrics-scroll h-full overflow-y-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <div
          ref={contentRef}
          className={cn(
            "mx-auto flex min-h-full max-w-3xl flex-col justify-center px-6 py-[34vh]",
            style === "minimal" ? "items-start text-start" : "items-center text-center"
          )}
        >
          {orderedLines.map((line, i) => {
            const isActive = i === active;
            const isPast = i < active;
            const dist = Math.abs(i - active);
            const showFill = style === "karaoke" && isActive;
            const dim = clamp(1 - dist * 0.16, 0.14, 1);

            return (
              <button
                key={i}
                onClick={() => engine.seek(line.t + 0.02)}
                className={cn(
                  "lyric-line w-full cursor-pointer py-1.5 transition-all duration-500",
                  style === "minimal" ? "text-start" : "text-center"
                )}
                style={{
                  fontSize: `${(isActive ? act : base) * sizeMul}px`,
                  fontWeight: isActive ? 700 : style === "karaoke" ? 550 : 450,
                  fontFamily: style === "minimal" ? "var(--font-ui)" : "var(--font-display)",
                  fontStyle: style === "karaoke" || isActive ? "italic" : "normal",
                  opacity: isActive ? 1 : dim,
                  filter: !isActive && dist >= 2 ? `blur(${Math.min(dist * 0.55, 2.4)}px)` : "none",
                  transform: style === "karaoke" && isActive ? "scale(1.015)" : isPast ? "scale(0.985)" : undefined,
                  letterSpacing: isActive && style !== "minimal" ? "0.002em" : undefined,
                  transitionProperty: "font-size, opacity, color, filter, transform",
                  transitionDuration: "0.5s",
                  textWrap: "balance" as any,
                }}
              >
                {/* karaoke fill — accent pours through the words as they're sung */}
                {showFill ? (
                  <span className="lyr-fill inline-block">
                    {line.text || "♪"}
                  </span>
                ) : (
                  <span
                    className={cn("inline-block", isActive && style === "classic" && "eq-active-line")}
                    style={isActive && style !== "minimal" ? { color: "var(--accent)" } : undefined}
                  >
                    {line.text || "♪"}
                  </span>
                )}

                {/* minimal / classic: live thread under the active line */}
                {isActive && style !== "karaoke" && (
                  <span className="mt-1.5 block h-[2px] w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                    <span
                      data-lyr-thread
                      className="block h-full w-full origin-left rounded-full rtl:origin-right"
                      style={{ background: "var(--accent)", transform: "scaleX(0)", boxShadow: "0 0 8px color-mix(in srgb, var(--accent) 55%, transparent)" }}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
