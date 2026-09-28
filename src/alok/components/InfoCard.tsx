// ── NOBODY ALOK · track info card ────────────────────────────────────────────
// The technical soul of the current track: format, bitrate, size, file and
// import date in mono rows, plus one-click online fetches, like and queue.
// Opened by clicking the title in the hub meta; Esc closes (topmost overlay).

import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles, ImageIcon, Heart, ListPlus } from "lucide-react";
import { engine } from "../../cinema/lib/engine";
import { useLibrary } from "../../cinema/store/library";
import { useSettings } from "../../cinema/store/settings";
import { useUi, uiApi } from "../../cinema/store/ui";
import { useAlokUi } from "../store/alokUi";
import { useT } from "../../cinema/lib/useT";
import { fetchOneLyrics, fetchOneCover } from "../../cinema/lib/smartFetch";
import { fmtTime } from "../../cinema/lib/utils";

export function InfoCard() {
  const t = useT();
  const show = useAlokUi((s) => s.showInfo);
  const setShow = useAlokUi((s) => s.setShowInfo);
  const currentId = useUi((s) => s.currentId);
  const track = useLibrary((s) => (currentId ? s.tracks[currentId] : undefined));
  const playlists = useLibrary((s) => s.playlists);
  const toggleLike = useLibrary((s) => s.toggleLike);
  const liked = playlists.find((p) => p.id === "liked")?.trackIds.includes(currentId ?? "") ?? false;

  const fetchLyrics = async () => {
    if (!track) return;
    const ok = await fetchOneLyrics(track.id);
    uiApi.toast(ok ? `${track.title} — ${t("sfSaved")}` : t("notFoundToast"), ok ? "success" : "info");
  };
  const fetchCover = async () => {
    if (!track) return;
    const ok = await fetchOneCover(track.id);
    uiApi.toast(ok ? `${track.title} — ${t("sfSaved")}` : t("notFoundToast"), ok ? "success" : "info");
  };

  // bridged (classic) tracks carry bitrate as a string WITH unit and may lack
  // fileSize — normalize both so the card never prints "kbps kbps" / "NaN MB"
  const bitrateNum =
    typeof track?.bitrate === "number"
      ? track.bitrate
      : parseInt(String(track?.bitrate ?? "").replace(/[^\d]/g, ""), 10);
  const bitrateLabel = bitrateNum > 0 ? `${bitrateNum} kbps` : "—";
  const sizeLabel =
    typeof track?.fileSize === "number" && isFinite(track.fileSize) && track.fileSize > 0
      ? `${(track.fileSize / 1048576).toFixed(1)} MB`
      : "—";
  const lang = useSettings((s) => s.lang);
  // "ru" rides in with the RU dictionary — cast keeps this compiling whether
  // or not the Lang union has been widened yet (40-i18n-ru owns that file)
  const locale = lang === "fa" ? "fa-IR" : lang === "tr" ? "tr-TR" : (lang as string) === "ru" ? "ru-RU" : undefined;

  return (
    <AnimatePresence>
      {show && track && (
        <>
          <motion.div
            className="na-info-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShow(false)}
            aria-hidden
          />
          <motion.div
            className="na-info"
            role="dialog"
            aria-label={t("alInfo")}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="na-info-head">
              <div className="na-info-title" title={`${track.title} — ${track.artist}`}>
                {track.title} <span style={{ color: "var(--na-faint)", fontWeight: 400 }}>— {track.artist}</span>
              </div>
              <button className="na-panel-x" onClick={() => setShow(false)} title={t("close")} aria-label={t("close")}>
                <X size={15} />
              </button>
            </div>

            <div className="na-info-row"><span>{t("alFormat")}</span><b>{track.format.toUpperCase()}</b></div>
            <div className="na-info-row"><span>{t("alBitrate")}</span><b>{bitrateLabel}</b></div>
            <div className="na-info-row"><span>{t("sortDuration")}</span><b>{fmtTime(track.duration)}</b></div>
            <div className="na-info-row"><span>{t("alSize")}</span><b>{sizeLabel}</b></div>
            <div className="na-info-row"><span>{t("alImported")}</span><b>{new Date(track.importedAt).toLocaleDateString(locale)}</b></div>
            <div className="na-info-row"><span>{t("alFile")}</span><b title={track.fileName}>{track.fileName}</b></div>

            <div className="na-info-acts">
              <button className="na-btn" onClick={() => void fetchLyrics()}>
                <Sparkles size={13} /> {t("fetchLyricsNow")}
              </button>
              <button className="na-btn" onClick={() => void fetchCover()}>
                <ImageIcon size={13} /> {t("alFetchCovers")}
              </button>
              <button className="na-btn" data-on={liked} onClick={() => toggleLike(track.id)}>
                <Heart size={13} fill={liked ? "currentColor" : "none"} /> {t("like")}
              </button>
              <button
                className="na-btn"
                onClick={() => {
                  engine.addToQueue(track.id);
                  uiApi.toast(`${track.title} — ${t("addToQueue")}`, "info");
                  setShow(false);
                }}
              >
                <ListPlus size={13} /> {t("addToQueue")}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
