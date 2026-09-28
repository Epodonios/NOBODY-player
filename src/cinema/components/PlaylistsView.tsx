// ── NOBODY · Playlists view ──────────────────────────────────────────────────

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown, ArrowUp, Heart, ListMusic, Pencil, Play, Plus,
  Shuffle, Trash2, X, Check,
} from "lucide-react";
import { useLibrary, LIKED_ID } from "../store/library";
import { engine } from "../lib/engine";
import { uiApi } from "../store/ui";
import { useT } from "../lib/useT";
import { fmtTime } from "../lib/utils";
import { CoverArt } from "./CoverArt";
import { cn } from "../utils/cn";

export function PlaylistsView() {
  const t = useT();
  const playlists = useLibrary((s) => s.playlists);
  const tracks = useLibrary((s) => s.tracks);
  const lib = useLibrary();
  const [selected, setSelected] = useState<string>(LIKED_ID);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");

  const pl = playlists.find((p) => p.id === selected) ?? playlists[0];
  const plName = pl.system ? t("likedSongs") : pl.name;
  const plTracks = useMemo(() => pl.trackIds.map((id) => tracks[id]).filter(Boolean), [pl, tracks]);
  const totalDur = plTracks.reduce((a, tr) => a + (tr.duration || 0), 0);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* playlist rail */}
      <aside className="w-full shrink-0 border-b px-6 pb-4 pt-7 lg:w-[300px] lg:border-b-0 lg:border-e lg:px-6" style={{ borderColor: "var(--line)" }}>
        <div className="t-faint mb-1.5 text-[9.5px] uppercase tracking-[0.34em]">NOBODY · rêve</div>
        <h1 className="dream-title font-display text-[clamp(1.7rem,3vw,2.4rem)] font-semibold leading-none tracking-tight">
          {t("navPlaylists")}
        </h1>

        <div className="mt-5 flex flex-col gap-1.5 overflow-y-auto pe-0.5 lg:max-h-[calc(100dvh-260px)]">
          {playlists.map((p) => {
            const active = p.id === pl.id;
            const firstTrack = p.trackIds[0];
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p.id)}
                className={cn(
                  "relative flex items-center gap-3 rounded-2xl px-2.5 py-2 text-start transition-all duration-300",
                  active
                    ? "glass shadow-[0_10px_30px_-14px_color-mix(in_srgb,var(--accent)_45%,transparent)]"
                    : "hover:bg-[var(--card)]"
                )}
              >
                {active && <span aria-hidden className="nc-row-bar" style={{ height: "46%" }} />}
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl">
                  {p.system ? (
                    <div className="flex h-full w-full items-center justify-center" style={{ background: "linear-gradient(135deg,#8b2d5c,#3d1637)" }}>
                      <Heart size={15} fill="#fff" className="text-white" />
                    </div>
                  ) : (
                    <CoverArt trackId={firstTrack ?? null} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate text-[13px] font-semibold leading-tight", active && "t-accent")}>
                    {p.system ? t("likedSongs") : p.name}
                  </div>
                  <div className="t-faint tnum text-[10.5px]">{p.trackIds.length} {t("songs")}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* create */}
        <div className="mt-4">
          {creating ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = name.trim();
                if (!n) return;
                const id = lib.createPlaylist(n);
                setSelected(id);
                setCreating(false);
                setName("");
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("playlistName")}
                className="min-w-0 flex-1 px-3 py-2 text-[13px]"
              />
              <button type="submit" aria-label={t("create")} className="bg-accent rounded-lg p-2"><Check size={14} /></button>
              <button type="button" aria-label={t("close")} onClick={() => setCreating(false)} className="t-mut rounded-lg p-2 hover:bg-white/10"><X size={14} /></button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="t-mut flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-2.5 text-[13px] transition-all hover:border-[color-mix(in_srgb,var(--accent)_45%,transparent)] hover:t-accent"
              style={{ borderColor: "var(--line2)" }}
            >
              <Plus size={14} /> {t("newPlaylist")}
            </button>
          )}
        </div>
      </aside>

      {/* detail */}
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-28 pt-6 lg:px-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={pl.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                {renaming ? (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => { e.preventDefault(); if (renameVal.trim()) lib.renamePlaylist(pl.id, renameVal.trim()); setRenaming(false); }}
                  >
                    <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} className="px-3 py-2 text-lg" />
                    <button className="bg-accent rounded-lg p-2" aria-label={t("rename")}><Check size={15} /></button>
                  </form>
                ) : (
                  <h2 className="dream-title font-display text-[clamp(1.5rem,3vw,2.4rem)] font-semibold italic leading-tight">{plName}</h2>
                )}
                <div className="t-mut tnum mt-1 text-[12px]">
                  {pl.trackIds.length} {t("songs")} · {fmtTime(totalDur)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => plTracks.length && engine.setQueue(plTracks.map((x) => x.id), plTracks[0].id)}
                  className="bg-accent flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-transform hover:scale-[1.03] disabled:opacity-50"
                  disabled={!plTracks.length}
                >
                  <Play size={14} fill="currentColor" /> {t("playAll")}
                </button>
                <button
                  onClick={() => {
                    if (!plTracks.length) return;
                    const ids = plTracks.map((x) => x.id);
                    const start = ids[Math.floor(Math.random() * ids.length)];
                    engine.setShuffle(true);
                    engine.setQueue(ids, start);
                  }}
                  className="glass t-mut flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] transition-all hover:text-[var(--fg)] disabled:opacity-50"
                  disabled={!plTracks.length}
                  aria-label={t("shuffle")}
                >
                  <Shuffle size={14} />
                </button>
                {!pl.system && (
                  <>
                    <button
                      onClick={() => { setRenaming(true); setRenameVal(pl.name); }}
                      className="glass t-mut rounded-full p-2.5 transition-all hover:text-[var(--fg)]"
                      aria-label={t("rename")}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(t("deleteConfirm"))) {
                          lib.deletePlaylist(pl.id);
                          setSelected(LIKED_ID);
                          uiApi.toast(t("delete"), "info");
                        }
                      }}
                      className="glass rounded-full p-2.5 text-red-400 transition-colors hover:bg-red-500/10"
                      aria-label={t("delete")}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* tracks */}
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
              {plTracks.length === 0 ? (
                <div className="t-mut flex h-40 items-center justify-center gap-2 text-[13px]">
                  <ListMusic size={15} /> {t("emptyPlaylist")}
                </div>
              ) : (
                plTracks.map((tr, i) => (
                  <div
                    key={tr.id}
                    className="nc-row group flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-[var(--card)]"
                    onClick={() => engine.setQueue(plTracks.map((x) => x.id), tr.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="tnum t-faint w-6 text-end text-[11px]">{i + 1}</span>
                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md">
                      <CoverArt trackId={tr.id} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-semibold leading-tight">{tr.title}</div>
                      <div className="t-mut truncate text-[11px]">{tr.artist}</div>
                    </div>
                    <span className="tnum t-mut hidden text-[11px] sm:block">{tr.duration ? fmtTime(tr.duration) : "—"}</span>
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button aria-label={t("moveUp")} disabled={i === 0} onClick={(e) => { e.stopPropagation(); lib.moveInPlaylist(pl.id, i, i - 1); }} className="t-mut rounded-full p-1.5 hover:bg-white/10 disabled:opacity-25">
                        <ArrowUp size={13} />
                      </button>
                      <button aria-label={t("moveDown")} disabled={i === plTracks.length - 1} onClick={(e) => { e.stopPropagation(); lib.moveInPlaylist(pl.id, i, i + 1); }} className="t-mut rounded-full p-1.5 hover:bg-white/10 disabled:opacity-25">
                        <ArrowDown size={13} />
                      </button>
                      <button aria-label={t("removeFromPlaylist")} onClick={(e) => { e.stopPropagation(); lib.removeFromPlaylist(pl.id, tr.id); }} className="t-mut rounded-full p-1.5 hover:bg-white/10">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
