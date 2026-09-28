// ── NOBODY EELA · Playlists ──────────────────────────────────────────────────
// Two paper cards: the playlist rail (with a quiet "new playlist" composer)
// and the selected playlist's track sheet.

import { useMemo, useState } from "react";
import { Heart, Play, Plus, X } from "lucide-react";
import { useLibrary, LIKED_ID } from "../../cinema/store/library";
import { useT } from "../../cinema/lib/useT";
import { engine } from "../../cinema/lib/engine";
import { CoverArt } from "../../cinema/components/CoverArt";
import { fmtTime } from "../../cinema/lib/utils";

export function PlaylistsView() {
  const t = useT();
  const playlists = useLibrary((s) => s.playlists);
  const tracks = useLibrary((s) => s.tracks);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);
  const [selected, setSelected] = useState<string>(LIKED_ID);
  const [newName, setNewName] = useState("");

  const pl = useMemo(() => playlists.find((p) => p.id === selected) ?? playlists[0], [playlists, selected]);
  const rows = useMemo(
    () => (pl ? pl.trackIds.map((id) => tracks[id]).filter(Boolean) : []),
    [pl, tracks]
  );

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    const id = createPlaylist(name);
    setNewName("");
    setSelected(id);
  };

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 px-5 pt-[86px] pb-4 sm:px-8 lg:px-12">
        <div className="ne-eyebrow mb-1.5">{t("navPlaylists")}</div>
        <h1 className="ne-display ne-h1">{t("navPlaylists")}</h1>
      </header>

      <div className="ne-scroll min-h-0 flex-1 px-5 pb-[120px] sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1060px] gap-4 lg:grid-cols-[300px_1fr]">
          {/* rail */}
          <div className="ne-card flex flex-col p-2.5">
            <div className="ne-scroll -m-1 flex-1 space-y-1 p-1">
              {playlists.map((p) => {
                const active = p.id === pl?.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className="flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-start transition-colors"
                    style={{
                      background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
                      color: active ? "var(--accent-ink)" : "var(--fg)",
                    }}
                    aria-pressed={active}
                  >
                    {p.id === LIKED_ID ? (
                      <Heart size={14} className="shrink-0" fill={active ? "currentColor" : "none"} />
                    ) : (
                      <ListMini />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{p.name}</span>
                    <span className="tnum text-[11px] opacity-60">{p.trackIds.length}</span>
                    {!p.system && (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label={`${t("delete")}: ${p.name}`}
                        className="opacity-40 transition-opacity hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(t("deleteConfirm"))) {
                            deletePlaylist(p.id);
                            if (selected === p.id) setSelected(LIKED_ID);
                          }
                        }}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <X size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* composer */}
            <div className="mt-2 flex items-center gap-2 border-t pt-2.5" style={{ borderColor: "var(--line2)" }}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") create(); }}
                placeholder={t("newPlaylist")}
                className="ne-input flex-1 !py-2 text-[12px]"
                aria-label={t("newPlaylist")}
              />
              <button className="ne-play-btn !h-8 !w-8" onClick={create} aria-label={t("create")} title={t("create")}>
                <Plus size={15} />
              </button>
            </div>
          </div>

          {/* sheet */}
          <div className="ne-card flex min-h-[320px] flex-col p-5">
            {pl ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="ne-display text-[24px] font-bold">{pl.name}</h2>
                  {rows.length > 0 && (
                    <button
                      className="ne-btn ne-btn-primary"
                      onClick={() => engine.setQueue(rows.map((r) => r.id), rows[0].id)}
                    >
                      <Play size={13} fill="currentColor" /> {t("play")}
                    </button>
                  )}
                </div>

                {rows.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--mut)]">
                    {t("emptyPlaylist")}
                  </div>
                ) : (
                  <div className="ne-scroll mt-3 min-h-0 flex-1 space-y-1 pe-1">
                    {rows.map((tr, i) => (
                      <div
                        key={`${tr.id}-${i}`}
                        className="group flex cursor-pointer items-center gap-3 rounded-[12px] px-2 py-2 transition-colors hover:bg-[var(--card2)]"
                        onClick={() => engine.setQueue(rows.map((r) => r.id), tr.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter") engine.setQueue(rows.map((r) => r.id), tr.id); }}
                      >
                        <span className="tnum w-5 text-end text-[11px] text-[var(--faint)]">{i + 1}</span>
                        <div className="h-9 w-9 shrink-0 overflow-hidden rounded-[8px]">
                          <CoverArt trackId={tr.id} rounded="rounded-[8px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12.5px] font-medium">{tr.title}</div>
                          <div className="ne-track-artist">{tr.artist}</div>
                        </div>
                        <span className="ne-track-time">{fmtTime(tr.duration)}</span>
                        <button
                          className="ne-icon-btn !w-7 !h-7 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={(e) => { e.stopPropagation(); removeFromPlaylist(pl.id, tr.id); }}
                          title={t("removeFromPlaylist")}
                          aria-label={`${t("removeFromPlaylist")}: ${tr.title}`}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--mut)]">
                {t("emptyPlaylist")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListMini() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="shrink-0">
      <path d="M3 6h13M3 12h13M3 18h8" />
      <path d="M19 12v7M16 16.5c0-1 1-2 3-2s3 .6 3 1.5-1 1.5-3 1.5-3 .5-3 1.5" />
    </svg>
  );
}
