// ── NOBODY · virtualized track list ──────────────────────────────────────────
// A few hundred rows must not all mount as live DOM — @tanstack/react-virtual
// windows the list (batch headers are flattened in as rows). "Is this row the
// current track" uses a per-row store selector, never .findIndex inside .map.

import { memo, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Heart, ListPlus, MoreHorizontal, Play, Plus, Trash2 } from "lucide-react";
import type { Batch, Track } from "../types";
import { useUi } from "../store/ui";
import { useLibrary, LIKED_ID } from "../store/library";
import { engine } from "../lib/engine";
import { useT } from "../lib/useT";
import { fmtTime } from "../lib/utils";
import { CoverArt } from "./CoverArt";
import { cn } from "../utils/cn";

export interface ListGroup {
  label: string; // display title (artist / album / folder)
  count: number;
  duration: number; // total seconds of the group
  onPlay?: () => void; // play the whole group
}

export type ListItem =
  | { type: "header"; batch: Batch }
  | { type: "group"; group: ListGroup }
  | { type: "row"; track: Track };

interface Props {
  items: ListItem[];
  playIds: string[]; // queue context in display order
  className?: string;
}

export function TrackList({ items, playIds, className }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (items[i].type === "group" ? 64 : items[i].type === "header" ? 52 : 62),
    overscan: 10,
  });

  return (
    <div ref={parentRef} className={cn("min-h-0 flex-1 overflow-y-auto", className)}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index];
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start}px)` }}
            >
              {item.type === "header" ? (
                <BatchHeader batch={item.batch} />
              ) : item.type === "group" ? (
                <GroupHead group={item.group} />
              ) : (
                <TrackRow track={item.track} playIds={playIds} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BatchHeader({ batch }: { batch: Batch }) {
  const t = useT();
  return (
    <div className="flex items-end justify-between gap-3 px-3 pb-2 pt-5">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="t-faint text-[10px] uppercase tracking-[0.18em]">{t("importedOn")}</span>
        <span className="truncate font-display text-[15px] italic t-accent">{batch.name}</span>
        <span aria-hidden className="hidden h-px w-16 self-center sm:block" style={{ background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 40%, transparent), transparent)" }} />
      </div>
      <span className="tnum t-faint shrink-0 text-[11px]">{batch.count} {t("tracksCount")}</span>
    </div>
  );
}

/** Group-by header (artist / album / folder) — rêve glass pill with a play chip.
    Spacing lives on the outer padding (never margins): the virtualizer measures
    this element's border-box, so margins would overlap the neighbouring rows. */
function GroupHead({ group }: { group: ListGroup }) {
  const t = useT();
  return (
    <div className="nc-group-head">
      <div className="nc-group-pill">
        <button
          type="button"
          className="nc-group-play"
          onClick={group.onPlay}
          disabled={!group.onPlay}
          aria-label={t("play")}
          title={t("play")}
        >
          <Play size={12} fill="currentColor" aria-hidden />
        </button>
        <span className="nc-group-title">{group.label}</span>
        <span aria-hidden className="nc-group-rule" />
        <span className="nc-group-meta">
          {t("tracksInGroup").replace("{{n}}", String(group.count))}
          <span aria-hidden> · </span>
          <span className="tnum">{fmtTime(group.duration)}</span>
        </span>
      </div>
    </div>
  );
}

const TrackRow = memo(function TrackRow({ track, playIds }: { track: Track; playIds: string[] }) {
  const t = useT();
  const isCurrent = useUi((s) => s.currentId === track.id);
  const isPlaying = useUi((s) => s.isPlaying) && isCurrent;
  const liked = useLibrary((s) => s.playlists.find((p) => p.id === LIKED_ID)?.trackIds.includes(track.id) ?? false);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const playlists = useLibrary((s) => s.playlists);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const removeTrack = useLibrary((s) => s.removeTrack);
  const [menu, setMenu] = useState<null | "actions">(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  return (
    <div
      className={cn(
        "nc-row group relative mx-1 flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition-colors duration-300",
        isCurrent ? "bg-[color-mix(in_srgb,var(--accent)_9%,var(--card2))]" : "hover:bg-[var(--card)]"
      )}
      onClick={() => engine.setQueue(playIds, track.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") engine.setQueue(playIds, track.id); }}
    >
      {isCurrent && <span aria-hidden className="nc-row-bar" />}

      {/* cover / play state */}
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl transition-transform duration-300 group-hover:scale-[1.06]">
        <CoverArt trackId={track.id} />
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-[1px] transition-opacity",
            isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          {isPlaying ? (
            <span className="flex gap-[2.5px]">
              {[0, 1, 2].map((i) => (
                <span key={i} className="block w-[3px] rounded-full pulse-soft" style={{ height: 12, background: "var(--accent)", animationDelay: `${i * 0.2}s` }} />
              ))}
            </span>
          ) : (
            <Play size={15} fill="white" className="text-white" />
          )}
        </div>
      </div>

      {/* title & artist */}
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13.5px] font-semibold leading-tight", isCurrent && "t-accent")}>{track.title}</div>
        <div className="t-mut truncate text-[12px] leading-tight">{track.artist}</div>
      </div>

      <div className="t-mut hidden w-40 truncate text-[12px] lg:block">{track.album}</div>

      <span
        className="t-faint hidden rounded-md border px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider sm:block"
        style={{ borderColor: "var(--line)" }}
      >
        {track.format}{track.bitrate ? ` · ${track.bitrate}k` : ""}
      </span>

      <span className="tnum t-mut w-11 shrink-0 text-end text-[12px]">{track.duration ? fmtTime(track.duration) : "—"}</span>

      {/* quick actions */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
        <IconBtn
          label={t("like")}
          active={liked}
          onClick={(e) => { e.stopPropagation(); toggleLike(track.id); }}
        >
          <Heart size={15} fill={liked ? "currentColor" : "none"} />
        </IconBtn>
        <IconBtn
          label={t("addToQueue")}
          onClick={(e) => { e.stopPropagation(); engine.addToQueue(track.id); }}
        >
          <ListPlus size={15} />
        </IconBtn>
        <div className="relative" ref={menuRef}>
          <IconBtn label={t("addToPlaylist")} onClick={(e) => { e.stopPropagation(); setMenu(menu ? null : "actions"); }}>
            <MoreHorizontal size={15} />
          </IconBtn>
          {menu && (
            <div
              className="glass absolute end-0 top-8 z-30 w-52 overflow-hidden rounded-2xl p-1.5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="t-faint px-2 pb-1 pt-1 text-[10px] uppercase tracking-[0.14em]">{t("addToPlaylist")}</div>
              <div className="max-h-44 overflow-y-auto">
                {playlists.filter((p) => !p.system).length === 0 && (
                  <div className="t-mut px-2 py-2 text-[12px]">{t("emptyPlaylist")}</div>
                )}
                {playlists.filter((p) => !p.system).map((p) => (
                  <button
                    key={p.id}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[12.5px] transition-colors hover:bg-[var(--card2)]"
                    onClick={() => { addToPlaylist(p.id, track.id); setMenu(null); }}
                  >
                    <Plus size={13} className="t-accent" /> <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
              <div className="my-1 h-px" style={{ background: "var(--line)" }} />
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[12.5px] text-red-400 transition-colors hover:bg-[var(--card2)]"
                onClick={() => { removeTrack(track.id); setMenu(null); }}
              >
                <Trash2 size={13} /> {t("removeTrack")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

function IconBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: (e: React.MouseEvent) => void; active?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("rounded-full p-1.5 transition-colors hover:bg-white/10", active ? "t-accent" : "t-mut")}
    >
      {children}
    </button>
  );
}
