// ── NOBODY · shared types ─────────────────────────────────────────────────────

export type RepeatMode = "off" | "all" | "one";
export type LyricsStyle = "classic" | "karaoke" | "minimal";
export type EelaLyricsStyle = "calm" | "karaoke" | "minimal";
export type EqStyle = "bars" | "dots" | "ring" | "random";
export type ThemeMode = "dark" | "light" | "contrast";
export type Lang = "en" | "fa" | "tr" | "ru";
export type ViewId =
  | "library"
  | "playlists"
  | "downloads"
  | "about"
  | "support"
  | "settings";

export interface LrcLine {
  t: number; // seconds
  text: string;
}

export interface Track {
  id: string; // stable: hash(name+size+lastModified)
  title: string;
  artist: string;
  album: string;
  year?: string;
  duration: number; // seconds
  format: string; // mp3 / flac / wav ...
  bitrate?: number; // kbps estimate
  hasCover: boolean; // a cover blob exists in IDB
  isPlaceholderCover: boolean;
  hasEmbeddedLyrics: boolean;
  syncedLyrics?: LrcLine[];
  plainLyrics?: string;
  batchId: string;
  importedAt: number;
  fileName: string;
  fileSize: number;
  accent?: string; // cached hsl string
  demo?: boolean;
  /* V1.2.0 library categories: absolute file path + the root folder the
   * track was imported from (bridge mode mirrors them from the classic
   * library; standalone imports fill filePath only). Folders/Subfolders
   * views are built from these. */
  filePath?: string;
  folderPath?: string;
}

export interface Batch {
  id: string;
  name: string;
  count: number;
  importedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: number;
  system?: boolean; // "liked"
}

export interface RecentEntry {
  trackId: string;
  at: number;
}

/** The 11 Library categories shared by the Cinematic + EELA libraries. */
export type LibraryCategoryId =
  | "songs"
  | "folders"
  | "subfolders"
  | "albums"
  | "albumArtists"
  | "artists"
  | "years"
  | "queue"
  | "mostPlayed"
  | "longest"
  | "favorites";

export interface Settings {
  lang: Lang;
  theme: ThemeMode;
  accentFromCover: boolean;
  lyricsSize: number; // 0.85 – 1.5
  lyricsStyle: LyricsStyle;
  eelaLyricsStyle?: EelaLyricsStyle; // EELA UI's own lyrics look (Calm/Karaoke/Minimal)
  eelaTheme?: ThemeMode; // EELA's own theme (paper-light by default, independent of cinema)
  eqStyle: EqStyle;
  ambientDelay: number; // seconds idle before ambient mode
  // advanced player (rêve+) — optional so older persisted blobs load cleanly
  customCursor?: boolean; // rêve cursor (fine pointers only)
  miniLyrics?: boolean; // floating now-playing lyric chip
  eqEnabled?: boolean; // 6-band WebAudio equalizer on/off
  eqGains?: number[]; // dB per band, -12..+12
  speed?: number; // playback rate 0.5–2
  // ALOK face (radial neon-core) — additive, older persisted blobs load fine
  alokTheme?: "void" | "graphite"; // near-black stage vs elevated greys
  alokRing?: "cover" | "spectrum" | "ember" | "aurora" | "ice" | "mono"; // ring palette
  alokVisualizer?: boolean; // radial visualizer around the core
  alokGlow?: boolean; // audio-reactive halo + beat pulse behind the core
  alokIdleDim?: boolean; // fade the chrome after idle seconds while the hub plays
}

/* "instrumental" — Task 30: LRCLIB answered "this track is instrumental"
 * (classic parity: LrcSyncModal's instrumental status). */
export type FetchStatus = "waiting" | "searching" | "saved" | "notfound" | "error" | "instrumental";

export interface FetchItem {
  trackId: string;
  title: string;
  artist: string;
  status: FetchStatus;
  detail?: string;
  gen: number; // bump to re-render retry
}

export interface FetchJob {
  mode: "lyrics" | "covers";
  items: FetchItem[];
  running: boolean;
  done: number;
}
