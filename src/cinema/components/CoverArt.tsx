// ── CoverArt — blob-URL managed cover image with graceful gradient fallback ──

import { memo, useEffect, useState } from "react";
import { coverUrl, invalidateCover as _inv, paletteFor } from "../lib/covers";
import { useLibrary } from "../store/library";
import { Music2 } from "lucide-react";
import { cn } from "../utils/cn";

interface Props {
  trackId: string | null | undefined;
  className?: string;
  rounded?: string;
  /** bump to force reload after Smart Fetch etc. */
  alt?: string;
}

export const CoverArt = memo(function CoverArt({ trackId, className, rounded = "rounded-lg", alt }: Props) {
  const track = useLibrary((s) => (trackId ? s.tracks[trackId] : undefined));
  const [url, setUrl] = useState<string | null>(null);

  const hasCover = track?.hasCover;
  const isPh = track?.isPlaceholderCover;
  useEffect(() => {
    let alive = true;
    if (!trackId || !hasCover) { setUrl(null); return; }
    coverUrl(trackId).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
    // scalar deps only — a track patch (e.g. accent) must not re-trigger the fetch
  }, [trackId, hasCover, isPh]);

  const pal = paletteFor(track ? `${track.title}|${track.artist}` : "nobody");

  if (url) {
    return (
      <img
        src={url}
        alt={alt ?? track?.title ?? ""}
        draggable={false}
        className={cn("h-full w-full object-cover select-none", rounded, className)}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={cn("flex h-full w-full items-center justify-center select-none", rounded, className)}
      style={{ background: `linear-gradient(135deg, hsl(${pal.h1} 45% 18%), hsl(${pal.h2} 50% 10%))` }}
    >
      <Music2 className="h-1/3 w-1/3 opacity-40" strokeWidth={1.2} />
    </div>
  );
});

export function forceCoverReload(trackId: string) {
  _inv(trackId);
}
