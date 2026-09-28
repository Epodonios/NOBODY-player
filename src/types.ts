export type Language = "fa" | "en" | "tr" | "ru";

export type Page = "focus" | "library" | "lyrics" | "downloads" | "contact" | "donate" | "settings";

export type LyricLine = {
  time: number;
  text: string;
  translations?: Partial<Record<Language, string>>;
};

export type AudioMetadata = {
  format: string;
  bitrate: string;
  sampleRate: string;
  channels: string;
  fileSize: string;
  codec: string;
  bitDepth: string;
  path: string;
  composer?: string;
  genre?: string;
};

export type Track = {
  id: number;
  title: string;
  artist: string;
  album: string;
  year: string;
  cover: string;
  accent: string;
  secondary: string;
  duration: number;
  durationLabel: string;
  bpm: number;
  key: string;
  lyrics: LyricLine[];
  metadata: AudioMetadata;
  sourceUrl?: string;
  sourcePath?: string;
  folderPath?: string;
  lrcSource?: string;
  isFallbackLyric?: boolean;
  isFallbackCover?: boolean;
};

export type Playlist = {
  id: string;
  name: string;
  trackIds: number[];
  createdAt: number;
  system?: "liked";
  emoji?: string;
  color?: string;
};

export type PersistedState = {
  trackId?: number;
  elapsed?: number;
  volume?: number;
  lang?: Language;
  likedIds?: number[];
  playlists?: Playlist[];
  urQueueIds?: number[];
  showTranslation?: boolean;
  lyricSize?: number;
  lyricStyle?: "classic" | "karaoke" | "minimal";
  idleEqualizerStyle?: "bars" | "wave" | "orbit" | "random";
  compactStyle?: "classic" | "cover" | "minimal";
  ambientMotion?: boolean;
  autoColor?: boolean;
  highContrast?: boolean;
  themeMode?: "dark" | "light";
  folderPaths?: string[];
  recentlyPlayedIds?: number[];
  savedAt?: number;
};

export type QuoteItem = {
  id: number;
  fa: string;
  en: string;
  tr: string;
  /** Task 40-i18n-ru: ready Russian quote text + author. Consumers should
   *  render `lang === "ru" ? (q.ru ?? q.en) : ...` — always fall back to en. */
  ru?: string;
  authorRu?: string;
  /** RU subject words used by the generator (pairs). Kept on every quote so a
   *  `q.ruX ?? q.en`-style lookup also lands on Russian text when present. */
  ruX?: string;
  ruY?: string;
  authorFa: string;
  authorEn: string;
  authorTr: string;
};
