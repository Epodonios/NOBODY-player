// ── NOBODY ALOK · left dock ──────────────────────────────────────────────────
// The vertical pill from the mock: Library / Liked / Recents / Playlists, and
// pinned at the bottom a white circular "+" (import files) with a small folder
// option that unfurls above it on hover (always visible on coarse pointers).

import { ArrowDownToLine, Grid2x2, Heart, History, ListMusic, Plus, FolderOpen } from "lucide-react";
import { useT } from "../../cinema/lib/useT";
import { useAlokUi, type AlokView } from "../store/alokUi";
import { useAlokT } from "../lib/i18n";
import { importViaPicker, importViaFolder } from "../lib/importActions";

const DOCK: { id: AlokView; icon: any; key: string }[] = [
  { id: "library", icon: Grid2x2, key: "alLibrary" },
  { id: "liked", icon: Heart, key: "alLiked" },
  { id: "recents", icon: History, key: "alRecents" },
  { id: "playlists", icon: ListMusic, key: "alPlaylists" },
  { id: "downloads", icon: ArrowDownToLine, key: "alDownloads" },
];

export function LeftDock() {
  const t = useT();
  const tt = useAlokT(); // dock labels resolve ALOK-first, then the core dict
  const view = useAlokUi((s) => s.view);
  const toggleView = useAlokUi((s) => s.toggleView);

  return (
    <nav className="na-dock" aria-label="views">
      {DOCK.map(({ id, icon: Icon, key }) => (
        <button
          key={id}
          className="na-dock-btn"
          data-on={view === id}
          onClick={() => toggleView(id)}
          title={tt(key)}
          aria-label={tt(key)}
          aria-pressed={view === id}
        >
          <Icon size={18} strokeWidth={1.8} />
        </button>
      ))}

      <span className="na-dock-sep" aria-hidden />

      {/* import cluster */}
      <div className="na-import-wrap">
        <button
          className="na-import-folder"
          onClick={() => void importViaFolder(t)}
          title={t("importFolder")}
          aria-label={t("importFolder")}
        >
          <FolderOpen size={14} />
        </button>
        <button
          className="na-import-main"
          onClick={() => void importViaPicker(t)}
          title={t("alAddMusic")}
          aria-label={t("alAddMusic")}
        >
          <Plus size={20} strokeWidth={2.4} />
        </button>
      </div>
    </nav>
  );
}
