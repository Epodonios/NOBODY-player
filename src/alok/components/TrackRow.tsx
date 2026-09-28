// ── NOBODY ALOK · shared track row ───────────────────────────────────────────
// Circular-thumb row used by every panel list. Click = play (engine.setQueue
// over the visible ids), heart = toggleLike, hover "add to queue", and a
// playlist popover (existing lists + inline create).

import { useEffect, useRef, useState } from "react";
import { Heart, ListPlus, X, FolderPlus, Check, Plus } from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary, LIKED_ID } from "../../cinema/store/library";
import { useUi, uiApi } from "../../cinema/store/ui";
import { useT } from "../../cinema/lib/useT";
import { CoverArt } from "../../cinema/components/CoverArt";
import { fmtTime } from "../../cinema/lib/utils";
import type { Track } from "../../cinema/types";

interface Props {
  track: Track;
  playIds: string[];
  /** show a remove (×) action instead of nothing — used in playlist detail */
  onRemove?: () => void;
  removeTitle?: string;
}

export function TrackRow({ track, playIds, onRemove, removeTitle }: Props) {
  const t = useT();
  const currentId = useUi((s) => s.currentId);
  const playlists = useLibrary((s) => s.playlists);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const liked = playlists.find((p) => p.id === LIKED_ID)?.trackIds.includes(track.id) ?? false;

  const [popOpen, setPopOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const popRef = useRef<HTMLDivElement>(null);
  const userLists = playlists.filter((p) => p.id !== LIKED_ID);

  // close the popover on any outside click
  useEffect(() => {
    if (!popOpen) return;
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPopOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [popOpen]);

  const createAndAdd = () => {
    const name = newName.trim();
    if (!name) return;
    const pid = createPlaylist(name);
    addToPlaylist(pid, track.id);
    setNewName("");
    setPopOpen(false);
    uiApi.toast(`${track.title} → ${name}`, "success");
  };

  return (
    <div
      className="na-row"
      data-playing={track.id === currentId}
      role="button"
      tabIndex={0}
      onClick={() => engine.setQueue(playIds, track.id, true)}
      onKeyDown={(e) => { if (e.key === "Enter") engine.setQueue(playIds, track.id, true); }}
      aria-label={`${track.title} — ${track.artist}`}
    >
      <span className="na-row-main">
        <span className="na-row-thumb">
          <CoverArt trackId={track.id} rounded="rounded-full" />
        </span>
        <span className="na-row-titles">
          <span className="na-row-title" style={{ display: "block" }}>{track.title}</span>
          <span className="na-row-sub" style={{ display: "block" }}>{track.artist}</span>
        </span>
      </span>
      <span className="na-row-acts" onClick={(e) => e.stopPropagation()}>
        <span className="na-row-time na-mono">{fmtTime(track.duration)}</span>
        <button
          className="na-icon-btn"
          data-on={liked}
          onClick={() => toggleLike(track.id)}
          title={t("like")}
          aria-label={`${t("like")}: ${track.title}`}
        >
          <Heart size={14} fill={liked ? "currentColor" : "none"} />
        </button>
        <span className="na-pop-wrap" ref={popRef}>
          <button
            className="na-icon-btn"
            data-on={popOpen}
            onClick={() => setPopOpen(!popOpen)}
            title={t("addToPlaylist")}
            aria-label={`${t("addToPlaylist")}: ${track.title}`}
            aria-expanded={popOpen}
          >
            <FolderPlus size={15} />
          </button>
          {popOpen && (
            <div className="na-pop" role="menu" aria-label={t("addToPlaylist")}>
              <div className="na-pop-title">{t("addToPlaylist")}</div>
              <input
                className="na-pop-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") createAndAdd(); }}
                placeholder={t("alNewPlaylist")}
                aria-label={t("alNewPlaylist")}
              />
              {newName.trim() && (
                <button className="na-pop-btn" onClick={createAndAdd}>
                  <Plus size={13} /> {t("alCreatePlaylist")} «{newName.trim()}»
                </button>
              )}
              {userLists.map((p) => {
                const inList = p.trackIds.includes(track.id);
                return (
                  <button
                    key={p.id}
                    className="na-pop-btn"
                    data-on={inList}
                    onClick={() => { addToPlaylist(p.id, track.id); }}
                  >
                    {inList ? <Check size={13} /> : <ListMusicMini />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                    {inList && <Check size={12} style={{ marginInlineStart: "auto", opacity: 0.8 }} />}
                  </button>
                );
              })}
              {userLists.length === 0 && !newName.trim() && (
                <div className="na-pop-btn" style={{ cursor: "default", opacity: 0.6 }}>
                  {t("emptyPlaylist")}
                </div>
              )}
            </div>
          )}
        </span>
        <button
          className="na-icon-btn"
          onClick={() => {
            engine.addToQueue(track.id);
            uiApi.toast(`${track.title} — ${t("addToQueue")}`, "info");
          }}
          title={t("addToQueue")}
          aria-label={`${t("addToQueue")}: ${track.title}`}
        >
          <ListPlus size={15} />
        </button>
        {onRemove && (
          <button
            className="na-icon-btn"
            onClick={onRemove}
            title={removeTitle ?? t("remove")}
            aria-label={`${removeTitle ?? t("remove")}: ${track.title}`}
          >
            <X size={15} />
          </button>
        )}
      </span>
    </div>
  );
}

/* tiny placeholder icon so playlist rows read as list entries */
function ListMusicMini() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15V6" /><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" /><path d="M12 12H3" /><path d="M16 6H3" /><path d="M12 18H3" />
    </svg>
  );
}
