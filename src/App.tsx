import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronLeft,
  Copy,
  Disc3,
  Download,
  Expand,
  FileText,
  FolderPlus,
  Heart,
  Image as ImageIcon,
  Home,
  Info,
  Layers,
  Library,
  ListMusic,
  ListPlus,
  Loader2,
  Mail,
  Maximize2,
  MessageCircle,
  Mic2,
  Minimize2,
  Pause,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  Repeat2,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Sparkles,
  Star,
  Trash2,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type MutableRefObject,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { requestAppClose } from "./appClose";
import { parseAudioFileMetadata } from "./audioParser";
import { createManagedBlobUrl, dataUrlToBlobUrl, revokeManagedBlobUrl } from "./blobRegistry";
import DownloadCenter from "./DownloadCenter";
import {
  enterCompactWindow,
  exitCompactWindow,
  isElectron,
  isTauri,
  minimizeDesktopWindow,
  onElectronWindowState,
  toggleDesktopFullscreen,
} from "./desktopWindow";
import {
  chooseMusicFiles,
  chooseMusicFolders,
  DesktopImportFile,
  isDesktopRuntime,
  loadDesktopFiles,
  loadDesktopFolders,
  saveCoverImage,
  saveLrcFile,
} from "./desktopLibrary";
import { downloadCoverArt, findCoverArtUrl } from "./coverart";
import { DICTIONARY } from "./i18n";
import { fetchLrclibLyrics, checkLrclibConnection, type LrclibResult } from "./lrclib";
import { parseLrc } from "./lrc";
import { onMediaKey } from "./mediaKeys";
import { useSupportNudge } from "./nudge";
import { getTrackQuote } from "./quotes";
import {
  getArtistFontStyle,
  getRandomTitleAnim,
  MUSIC_ADJECTIVES,
  shouldUseArtistFont,
  TitleAnimConfig,
} from "./stylesData";
import { CONTACT, DONATE_DIRECT, DONATE_WALLETS, copyText } from "./supportInfo";
import { UI_SWITCH_EVENT, clearUiHandoff, readUiHandoff, switchUiMode, readUiPrefs, publishUiLang, onUiLang, getUiMode } from "./uiMode";
import { APP_VERSION_LABEL } from "./version";
import { Language, LyricLine, Page, PersistedState, Playlist, Track } from "./types";

type Dict = (typeof DICTIONARY)["fa"];

const STORAGE_KEY = "nobody-player-state-v2";
const IDLE_DELAY = 30000; // 30 seconds inactivity

/* Task 30 — module-level import serialization. Every classic batch import
   (boot folder rescan, user pick, bridge import from cinema/EELA/ALOK)
   appends to this chain so two imports can never interleave. Before this,
   the boot rescan and a manual import both captured the same `tracks`
   snapshot and the LAST finisher wrote `setTracks([...stale, ...new])`,
   ERASING the other's tracks ("second folder never gets added"). */
let importChain: Promise<unknown> = Promise.resolve();
let importBatchSeq = 0;

/* Task 30 — deferred handoff retry. When consuming a UI-switch handoff
   aborts (bridge not mounted yet, track not in the classic library yet,
   auto-import still walking), the handoff blob is KEPT and retried on a
   timer and on bridge notifications instead of being dropped silently. */
const handoffPending = { attempts: 0, timer: null as number | null };
/* V1.3.0 QA: the deferred handoff retry must outlast a slow boot rescan — a
 * big folder re-walk can take several seconds, and giving up at ~8s reproduced
 * "returning to Classic cut the music" on slower machines. 14 × 1.3s ≈ 18s of
 * coverage, still bounded so a truly dead handoff (no library ever grows)
 * cannot resurrect forever. */
const HANDOFF_MAX_ATTEMPTS = 14;
const HANDOFF_RETRY_MS = 1300;

const PLAYLIST_COLORS = ["#ef4c78", "#6542d8", "#35d8d2", "#f0b849", "#ff5a30", "#4ade80", "#38bdf8", "#e879f9"];
const PLAYLIST_EMOJIS = ["✧", "♫", "✦", "☾", "✺", "◆", "◇", "👑"];

function GithubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

/* Instagram brand icon (lucide-react dropped brand icons — same reason a
   local GithubIcon exists above). Used by the disabled Instagram contact row. */
function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

function NobodyLuxuryLogo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true" className="nobody-crest">
      <rect x="4" y="4" width="32" height="32" rx="10" fill="#08070b" />
      <rect x="4.75" y="4.75" width="30.5" height="30.5" rx="9.25" stroke="rgba(255,255,255,.16)" strokeWidth="1.5" />
      <path d="M13 27V13L27 27V13" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 30H28" stroke="rgba(255,255,255,.22)" strokeLinecap="round" />
      <circle cx="29" cy="11" r="2" fill="var(--accent)" />
    </svg>
  );
}

/* PHASE-2 PERF FIX — REF-DRIVEN BEAT VISUALIZER:
   The old hook pushed ~60 setStates per second through React (one per
   animation frame), re-rendering its entire subtree every frame. This
   version returns a container ref; a rAF loop writes bar heights and the
   --h CSS var directly on the child <span> elements. Zero React work per
   frame; the only React render happens when isPlaying/bpm/count change. */
function useBeatVisualizer(count: number, isPlaying: boolean, bpm = 120) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const bars = Array.from(container.children) as HTMLElement[];
    if (bars.length === 0) return;

    if (!isPlaying) {
      bars.forEach((bar, i) => {
        const idle = 15 + ((i * 11) % 18);
        bar.style.height = `${idle}%`;
        bar.style.setProperty("--h", String(idle));
      });
      return;
    }

    const beatFreq = (Math.max(60, Math.min(220, bpm)) / 60) * Math.PI * 2;
    const start = performance.now() / 1000;
    let frameId = 0;

    const tick = () => {
      if (!document.hidden && container.isConnected) {
        const t = performance.now() / 1000 - start;
        for (let i = 0; i < bars.length; i += 1) {
          const wave1 = Math.sin(t * beatFreq + i * 0.45);
          const wave2 = Math.cos(t * beatFreq * 1.5 - i * 0.65);
          const wave3 = Math.sin(t * beatFreq * 0.5 + i * 1.1);
          const norm = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2 + 1) / 2;
          const pulse = Math.pow(Math.sin(t * (beatFreq / 2)), 4) * 30;
          const value = Math.min(98, Math.max(14, Math.floor(norm * 62 + pulse + 15)));
          bars[i].style.height = `${value}%`;
          bars[i].style.setProperty("--h", String(value));
        }
      }
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [count, isPlaying, bpm]);

  return containerRef;
}

function generateAestheticCover(title: string, artist: string): string {
  let hash = 0;
  const str = title + artist;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const posHash = Math.abs(hash);
  const hue1 = posHash % 360;
  const hue2 = (hue1 + 55 + (posHash % 110)) % 360;
  const hue3 = (hue2 + 135) % 360;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
    <defs>
      <radialGradient id="grad" cx="30%" cy="30%" r="80%">
        <stop offset="0%" stop-color="hsl(${hue1}, 80%, 55%)" />
        <stop offset="50%" stop-color="hsl(${hue2}, 70%, 35%)" />
        <stop offset="100%" stop-color="hsl(${hue3}, 85%, 15%)" />
      </radialGradient>
    </defs>
    <rect width="500" height="500" fill="url(#grad)" />
    <circle cx="400" cy="100" r="180" fill="hsl(${hue1}, 90%, 65%)" opacity="0.22" />
    <circle cx="100" cy="400" r="220" fill="hsl(${hue3}, 90%, 50%)" opacity="0.25" />
    <g transform="translate(40, 420)" fill="white" opacity="0.88" font-family="Georgia, serif">
      <text font-size="30" font-weight="bold" letter-spacing="1.5">${title.slice(0, 18)}</text>
      <text y="30" font-size="14" opacity="0.7" font-family="sans-serif" letter-spacing="3">${artist
        .slice(0, 24)
        .toUpperCase()}</text>
    </g>
    <text x="40" y="50" fill="white" opacity="0.4" font-size="11" font-family="sans-serif" letter-spacing="4" font-weight="bold">NOBODY • EPODONIOS</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* PHASE-1 PERF FIX, quality revision (user report: the ambient backdrop read
   as "pixelated / low quality"): the bitmap is still generated ONCE per
   track, but at 192px instead of 64px — large enough that the browser's
   upscale is artifact-free — and the static .ambient>img layer carries a
   one-time CSS blur. A static blur is rasterized once and cached by the
   compositor (zero per-frame cost), while the palette-driven gradients
   painted behind it supply the "colors of the cover" the user asked for.
   Returns null when generation fails (tainted canvas, decode error) so the
   caller can fall back to a small CSS blur. */
async function createPreBlurredCover(src: string, size = 192): Promise<string | null> {
  const loadImage = (useCors: boolean) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      if (useCors) el.crossOrigin = "anonymous";
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("ambient cover decode failed"));
      el.src = src;
    });

  const drawAndEncode = (img: HTMLImageElement): string | null => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.filter = "saturate(1.35)";
    ctx.drawImage(img, 0, 0, size, size);
    try {
      return canvas.toDataURL("image/jpeg", 0.82);
    } catch {
      return null; // SecurityError — tainted canvas
    }
  };

  try {
    const plain = await loadImage(false);
    const encoded = drawAndEncode(plain);
    if (encoded) return encoded;
  } catch {
    /* fall through to CORS retry */
  }

  try {
    const cors = await loadImage(true);
    return drawAndEncode(cors);
  } catch {
    return null;
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

/** Extracts a vivid, cover-driven palette. Sampling is intentionally tiny
 * (48×48) so importing hundreds of tracks remains fast on WebView2. */
async function extractCoverPalette(source: string, fallbackSeed: string) {
  const fallbackHue = Array.from(fallbackSeed).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 330);
  const fallback = {
    accent: `hsl(${fallbackHue} 82% 61%)`,
    secondary: `hsl(${(fallbackHue + 72) % 360} 72% 55%)`,
  };
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return fallback;
    context.drawImage(image, 0, 0, 48, 48);
    const pixels = context.getImageData(0, 0, 48, 48).data;
    const buckets = new Map<string, { r: number; g: number; b: number; score: number }>();
    for (let index = 0; index < pixels.length; index += 16) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max - min;
      const brightness = (r + g + b) / 3;
      if (brightness < 24 || brightness > 238 || saturation < 18) continue;
      const qr = Math.round(r / 32) * 32;
      const qg = Math.round(g / 32) * 32;
      const qb = Math.round(b / 32) * 32;
      const key = `${qr}-${qg}-${qb}`;
      const existing = buckets.get(key) ?? { r: qr, g: qg, b: qb, score: 0 };
      existing.score += 1 + saturation / 80;
      buckets.set(key, existing);
    }
    const colors = [...buckets.values()].sort((a, b) => b.score - a.score);
    if (!colors.length) return fallback;
    const first = colors[0];
    const second = colors.find((color) =>
      Math.abs(color.r - first.r) + Math.abs(color.g - first.g) + Math.abs(color.b - first.b) > 130,
    ) ?? colors[Math.min(1, colors.length - 1)] ?? first;
    return {
      accent: rgbToHex(first.r, first.g, first.b),
      secondary: rgbToHex(second.r, second.g, second.b),
    };
  } catch {
    return fallback;
  }
}

/**
 * Production build ships with an EMPTY library.
 * The user imports their own folders / files from the Library page.
 */
const INITIAL_TRACKS: Track[] = [];

/**
 * Neutral placeholder used only while the library is empty so that
 * every view keeps rendering safely without null-checks everywhere.
 */
const PLACEHOLDER_TRACK: Track = {
  id: 0,
  title: "Nobody",
  artist: "EPODONIOS",
  album: "Import your music to begin",
  year: "—",
  cover: generateAestheticCover("Nobody", "EPODONIOS"),
  accent: "#ef4c78",
  secondary: "#6542d8",
  duration: 1,
  durationLabel: "0:00",
  bpm: 120,
  key: "—",
  lyrics: [],
  isFallbackLyric: true,
  metadata: {
    format: "—",
    bitrate: "—",
    sampleRate: "—",
    channels: "—",
    fileSize: "—",
    codec: "—",
    bitDepth: "—",
    path: "—",
  },
};

const NAV_ICONS: Record<Page, typeof Home> = {
  focus: Home,
  library: Library,
  lyrics: Mic2,
  downloads: Download,
  contact: MessageCircle,
  donate: Heart,
  settings: Settings,
};

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

/** Deterministic 32-bit FNV-1a hash turned into a positive integer. Used to
 *  derive a stable track ID from a file's path, so the same physical file
 *  gets the same ID every time it's scanned — across app relaunches,
 *  folder rescans, etc. Without this, IDs were random-per-import, silently
 *  breaking "resume last track", liked songs, and playlists after restart. */
function stableIdFromPath(path: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < path.length; i++) {
    hash ^= path.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function shortFormat(value: string) {
  if (!value) return "AUDIO";
  const base = value.split("(")[0].split("/").pop() || value;
  return base.replace(/audio|x-|\.|\s/gi, "").toUpperCase().slice(0, 6) || "AUDIO";
}

/* ============================ PHASE-3 MEMORY FIX ============================
   The central blob-URL registry (createManagedBlobUrl / revokeManagedBlobUrl /
   dataUrlToBlobUrl) moved verbatim to ./blobRegistry so the Download Center
   can route its cover downloads through the same revocation-safe registry. */

/** Duration probe that only runs when metadata parsing could not determine a
 *  duration. The old code created a `new Audio()` per imported track even
 *  when the duration was already known, and never released it (its media
 *  loader kept the resource open until GC). This version always tears down. */
function probeAudioDuration(url: string, timeoutMs = 1500): Promise<number> {
  return new Promise((resolve) => {
    let settled = false;
    const probe = new Audio();
    probe.preload = "metadata";
    const finish = (value: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute("src");
      probe.load(); // release the media resource immediately
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(220), timeoutMs);
    probe.onloadedmetadata = () =>
      finish(Number.isFinite(probe.duration) && probe.duration > 0 ? Math.max(1, Math.floor(probe.duration)) : 220);
    probe.onerror = () => finish(220);
    probe.src = url;
  });
}

function artistStyleFor(name: string): CSSProperties | undefined {
  return shouldUseArtistFont(name) ? getArtistFontStyle(name) : undefined;
}

// Highlights all case-insensitive matches of `query` inside `text`.
function highlightMatch(text: string, query: string): ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  /* PHASE-2 FIX: a /g regex's .test() advances lastIndex between calls, which
     mis-flagged alternating split parts. Plain comparison is exact for the
     captured separator parts .split() produces. */
  const needle = trimmed.toLowerCase();
  return parts.map((part, idx) =>
    part.toLowerCase() === needle ? (
      <mark key={idx} className="search-highlight">
        {part}
      </mark>
    ) : (
      <span key={idx}>{part}</span>
    ),
  );
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PersistedState;
  } catch {
    return {};
  }
}

const SAVED = loadPersisted();

const DEFAULT_PLAYLISTS: Playlist[] = [
  { id: "liked", name: "liked", trackIds: [], createdAt: Date.now(), system: "liked", emoji: "♥", color: "#ef4c78" },
];

function IconButton({
  children,
  label,
  active = false,
  onClick,
  className = "",
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""} ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle ${checked ? "on" : ""}`}
      onClick={onChange}
    >
      <span />
    </button>
  );
}

function TransportButton({
  label,
  onClick,
  children,
  variant = "ghost",
  active = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  variant?: "ghost" | "solid";
  active?: boolean;
}) {
  return (
    <motion.button
      type="button"
      className={`transport-btn ${variant} ${active ? "active" : ""}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.08, y: -1 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: "spring", stiffness: 480, damping: 18 }}
    >
      <span className="tb-icon">{children}</span>
    </motion.button>
  );
}

function PlayButton({
  isPlaying,
  onClick,
  label,
  size = "large",
}: {
  isPlaying: boolean;
  onClick: () => void;
  label: string;
  size?: "large" | "small";
}) {
  return (
    <motion.button
      type="button"
      className={`play-button-lux ${size}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 420, damping: 16 }}
    >
      <span className="pb-core">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={isPlaying ? "pause" : "play"}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pb-glyph"
          >
            {isPlaying ? (
              <Pause size={size === "large" ? 20 : 16} fill="currentColor" />
            ) : (
              <Play size={size === "large" ? 20 : 16} fill="currentColor" />
            )}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  );
}

function svgCursor(fill: string, pointer = false) {
  const svg = pointer
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="9" fill="${fill}" fill-opacity="0.25" stroke="${fill}" stroke-width="2"/><circle cx="13" cy="13" r="3" fill="#ffffff"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path fill="#0d0a12" stroke="${fill}" stroke-width="1.8" d="M6 3.5v19l5.4-5.3a.7.7 0 0 1 .5-.2h7.7a.6.6 0 0 0 .4-1L7 3a.6.6 0 0 0-1 .5Z"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${pointer ? "13 13" : "4 3"}, ${
    pointer ? "pointer" : "default"
  }`;
}

/* V1.4.0 (#1) — RU plural forms for inline count strings ("N результатов"):
   1 → one · 2–4 → few · 0/5–20 → many (the classic Slavic rule). */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export default function App() {
  const [lang, setLang] = useState<Language>(SAVED.lang ?? "fa");
  // V1.4.0 QA fix (#1): suppress the mount-run publish of the STALE persisted
  // lang — at boot the effect below either seeds the channel (when empty) or
  // adopts the shared value, and publishing the stale one right after started
  // an echo war that could revert the other UI's fresh language choice.
  const bootLangPublishSkipped = useRef(false);

  // ── dual-UI language sync (classic ⇄ cinema) ──
  // Boot: the shared channel (last explicit choice in EITHER UI) wins over
  // this app's stale persisted value. Live: follow the other UI's language.
  // Publishing happens in an effect so adoptions converge after one echo and
  // the loop terminates (receiver compares values before applying).
  useEffect(() => {
    const shared = readUiPrefs();
    if (!shared?.lang) publishUiLang(lang, "classic");
    else if ((shared.lang === "fa" || shared.lang === "en" || shared.lang === "tr" || shared.lang === "ru") && shared.lang !== lang) {
      setLang(shared.lang);
    }
    return onUiLang((next) => {
      if (next === "fa" || next === "en" || next === "tr" || next === "ru") {
        // bail out on our own echo so a stale boot publish can never win
        setLang((prev) => (next === prev ? prev : next));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!bootLangPublishSkipped.current) {
      bootLangPublishSkipped.current = true;
      return;
    }
    publishUiLang(lang, "classic");
  }, [lang]);

  const [page, setPage] = useState<Page>("focus");
  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [trackIndex, setTrackIndex] = useState(() => {
    const idx = INITIAL_TRACKS.findIndex((t) => t.id === SAVED.trackId);
    return idx >= 0 ? idx : 0;
  });
  const [isPlaying, setIsPlaying] = useState(false);
  /* PHASE-2 PERF FIX — DECOUPLED PLAYBACK CLOCK:
     `elapsed` used to be React state updated on every audio timeupdate
     (~4x/sec), re-rendering this 4,700-line component and every child each
     time. It now lives in a ref; the DOM (progress CSS var, time labels,
     seek inputs) is updated imperatively. The only remaining playback-driven
     state is the active lyric line index — updated only when it changes. */
  const elapsedRef = useRef(SAVED.elapsed ?? 0);
  const [activeLyricIndex, setActiveLyricIndex] = useState(0);
  const activeLyricIndexRef = useRef(0);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const timeLabelRef = useRef<HTMLSpanElement | null>(null);
  const compactTimeLabelRef = useRef<HTMLSpanElement | null>(null);
  const mainSeekRef = useRef<HTMLInputElement | null>(null);
  const compactSeekRef = useRef<HTMLInputElement | null>(null);

  /* Direct DOM sync for the playback position — zero React re-renders. */
  const applyElapsedUI = useCallback((t: number, duration: number) => {
    const pct = `${Math.min(100, (t / (duration || 1)) * 100)}%`;
    shellRef.current?.style.setProperty("--progress", pct);
    const label = formatTime(t);
    if (timeLabelRef.current) timeLabelRef.current.textContent = label;
    if (compactTimeLabelRef.current) compactTimeLabelRef.current.textContent = label;
    const seekValue = String(Math.round(t));
    if (mainSeekRef.current) mainSeekRef.current.value = seekValue;
    if (compactSeekRef.current) compactSeekRef.current.value = seekValue;
  }, []);
  const [volume, setVolume] = useState(SAVED.volume ?? 74);
  const [previousVolume, setPreviousVolume] = useState(SAVED.volume ?? 74);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");

  /* V1.4.0 (#2) — support nudge. ONE global scheduler lives in ./nudge; this
     face renders the popup only while classic is the active pane, never in
     compact/idle modes (the render site below double-gates those). */
  const { nudge, dismiss: dismissNudge } = useSupportNudge("classic");
  const [searchHighlight, setSearchHighlight] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [fullscreenHint, setFullscreenHint] = useState(false);
  const [fsTransitioning, setFsTransitioning] = useState(false);
  // Translation feature completely removed as requested
  const [lyricSize, setLyricSize] = useState(SAVED.lyricSize ?? 100);
  const [lyricStyle, setLyricStyle] = useState<"classic" | "karaoke" | "minimal">(SAVED.lyricStyle ?? "classic");
  const [idleEqualizerStyle, setIdleEqualizerStyle] = useState<"bars" | "wave" | "orbit" | "random">(
    SAVED.idleEqualizerStyle ?? "bars",
  );
  const [compactStyle, setCompactStyle] = useState<"classic" | "cover" | "minimal">(SAVED.compactStyle ?? "classic");
  const [ambientMotion, setAmbientMotion] = useState(SAVED.ambientMotion ?? true);
  const [autoColor, setAutoColor] = useState(SAVED.autoColor ?? true);
  const [highContrast, setHighContrast] = useState(SAVED.highContrast ?? false);
  const [dropActive, setDropActive] = useState(false);
  const [folderPaths, setFolderPaths] = useState<string[]>(SAVED.folderPaths ?? []);
  const [recentlyPlayedIds, setRecentlyPlayedIds] = useState<number[]>(SAVED.recentlyPlayedIds ?? []);
  const [rescanningFolder, setRescanningFolder] = useState<string | null>(null);
  const [lrcSyncFolder, setLrcSyncFolder] = useState<string | null>(null);
  const [coverSyncFolder, setCoverSyncFolder] = useState<string | null>(null);

  // Playlists (Req 2 redesign)
  const [playlists, setPlaylists] = useState<Playlist[]>(SAVED.playlists ?? DEFAULT_PLAYLISTS);
  const [activePlaylistId, setActivePlaylistId] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Track | null>(null);

  // Compact mode — shrinks the actual OS window into a mini floating player.
  const [isCompact, setIsCompact] = useState(false);
  const [compactInside, setCompactInside] = useState(false);
  const [compactZone, setCompactZone] = useState<"none" | "text" | "controls">("none");
  const [compactOffset, setCompactOffset] = useState(0);

  useEffect(() => {
    if (isCompact) {
      void enterCompactWindow();
    } else {
      void exitCompactWindow();
    }
  }, [isCompact]);
  const [scrollDir, setScrollDir] = useState(1);

  const [lyricManual, setLyricManual] = useState(false);
  const [titleAnim, setTitleAnim] = useState<TitleAnimConfig>(() => getRandomTitleAnim());
  const [idleMode, setIdleMode] = useState(false);
  const [windowFocused, setWindowFocused] = useState(true);

  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const fileInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lyricRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const restoredFoldersRef = useRef(false);
  /* Task 30 — fresh-value refs. The once-registered __NOBODY_BRIDGE__ (and
     the serialized import chain) must read CURRENT tracks/index/folders, not
     whichever render happened to create them. */
  const firstNewIndexRef = useRef(0);
  const firstNewBatchRef = useRef(0);
  const tracksRef = useRef<Track[]>(tracks);
  const trackIndexRef = useRef<number>(trackIndex);
  const folderPathsRef = useRef<string[]>(folderPaths);
  const rescanningRef = useRef(false);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    // Electron migration: the generic desktop hook is runtime-neutral; the
    // legacy tauri-runtime tag is now applied only under actual Tauri.
    document.documentElement.classList.add("desktop-runtime");
    if (isTauri()) document.documentElement.classList.add("tauri-runtime");
    return () => {
      document.documentElement.classList.remove("desktop-runtime");
      document.documentElement.classList.remove("tauri-runtime");
    };
  }, []);

  const dict = DICTIONARY[lang];
  const hasLibrary = tracks.length > 0;
  const track = tracks[trackIndex] ?? tracks[0] ?? PLACEHOLDER_TRACK;
  const lyrics = track.lyrics;

  /* PHASE-1 PERF FIX: static pre-blurred ambient bitmap (see createPreBlurredCover).
     Re-generated only when the track's cover actually changes — zero per-frame cost. */
  const [ambientSrc, setAmbientSrc] = useState<string>("");
  const [ambientBlurFallback, setAmbientBlurFallback] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const cover = track.cover;
    if (!cover) {
      setAmbientSrc("");
      setAmbientBlurFallback(false);
      return;
    }
    createPreBlurredCover(cover).then((dataUrl) => {
      if (cancelled) return;
      if (dataUrl) {
        setAmbientSrc(dataUrl);
        setAmbientBlurFallback(false);
      } else {
        setAmbientSrc(cover);
        setAmbientBlurFallback(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [track.cover]);

  const likedPlaylist = playlists.find((p) => p.system === "liked");
  const likedIds = likedPlaylist?.trackIds ?? [];
  const liked = likedIds.includes(track.id);

  const urQueueIds = useMemo(() => SAVED.urQueueIds ?? [], []);
  const [queueIds, setQueueIds] = useState<number[]>(urQueueIds);
  const [activeQueueTab, setActiveQueueTab] = useState<"upNext" | "urQueue">("upNext");

  const artistFont = useMemo(
    () => (shouldUseArtistFont(track.artist) ? getArtistFontStyle(track.artist) : {}),
    [track.artist],
  );

  const globalSearchResults = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return tracks.slice(0, 5);
    return tracks
      .filter((item) =>
        `${item.title} ${item.artist} ${item.album} ${item.year} ${item.metadata.format}`
          .toLocaleLowerCase()
          .includes(query),
      )
      .slice(0, 7);
  }, [search, tracks]);

  useEffect(() => {
    /* BUG FIX (user report: fullscreen would not restore): isFullscreen used
     * to be synced ONLY from `document.fullscreenchange`, which never fires
     * for native window fullscreen under Electron — the renderer state could
     * drift from the real window state. Both listeners now feed the same
     * state: the DOM event (web runtime) and the pushed Electron state. */
    const syncFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", syncFullscreen);
    const offElectron = onElectronWindowState((state) => setIsFullscreen(state.fullscreen));
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreen);
      offElectron();
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      setFsTransitioning(true);
      await new Promise((resolve) => window.setTimeout(resolve, 190));
      const nextState = await toggleDesktopFullscreen(isFullscreen);
      setIsFullscreen(nextState);
      if (nextState && !localStorage.getItem("nobody-fullscreen-hint-seen")) {
        localStorage.setItem("nobody-fullscreen-hint-seen", "1");
        setFullscreenHint(true);
        window.setTimeout(() => setFullscreenHint(false), 6500);
      }
      // The native window resize/restore isn't necessarily finished the
      // instant the OS call resolves — give it a beat before revealing
      // content again, or the tail end of the native animation flashes
      // through.
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      setFsTransitioning(false);
    } catch {
      /* Fullscreen can be denied by the host window. */
      setFsTransitioning(false);
    }
  };

  const handleLogoClick = async () => {
    if (document.fullscreenElement || isFullscreen) {
      setFsTransitioning(true);
      await new Promise((resolve) => window.setTimeout(resolve, 190));
      await toggleDesktopFullscreen(true);
      setIsFullscreen(false);
      setFullscreenHint(false);
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      setFsTransitioning(false);
      return;
    }
    setPage("focus");
  };

  /* V1.4.0 (#6) — the ONE close entry: play classic's CRT power-off veil,
     then really close (Electron main intercepts every close path and asks
     this renderer to run the same veil — requestAppClose is idempotent). */
  const closeWindow = () => {
    void requestAppClose();
  };

  const selectSearchResult = (result: Track) => {
    const index = tracks.findIndex((item) => item.id === result.id);
    if (index < 0) return;
    selectTrack(index);
    setPage("focus");
    setSearchOpen(false);
    setSearch("");
  };

  useEffect(() => {
    const payload: PersistedState = {
      trackId: track.id,
      elapsed: elapsedRef.current,
      volume,
      lang,
      playlists,
      urQueueIds: queueIds,
      lyricSize,
      lyricStyle,
      idleEqualizerStyle,
      compactStyle,
      ambientMotion,
      autoColor,
      highContrast,
      folderPaths,
      recentlyPlayedIds,
      savedAt: Date.now(),
    };
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [track.id, volume, lang, playlists, queueIds, lyricSize, lyricStyle, idleEqualizerStyle, compactStyle, ambientMotion, autoColor, highContrast, folderPaths, recentlyPlayedIds]);

  useEffect(() => {
    const save = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const base = raw ? JSON.parse(raw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, trackId: track.id, elapsed: elapsedRef.current, savedAt: Date.now() }));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", save);
    return () => window.removeEventListener("beforeunload", save);
  }, [track.id]);

  /* IDLE CINEMA — 30 SECONDS */
  useEffect(() => {
    if (page !== "focus" || isCompact) {
      setIdleMode(false);
      return;
    }
    let timer = window.setTimeout(() => setIdleMode(true), IDLE_DELAY);
    const reset = () => {
      setIdleMode(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdleMode(true), IDLE_DELAY);
    };
    const events = ["mousemove", "mousedown", "wheel", "touchstart"];
    const handleIdleKey = (event: KeyboardEvent) => {
      // PageUp/PageDown keep the cinematic mode visible while changing tracks.
      if (event.code === "PageUp" || event.code === "PageDown") return;
      reset();
    };
    events.forEach((evt) => window.addEventListener(evt, reset, { passive: true }));
    window.addEventListener("keydown", handleIdleKey);
    return () => {
      window.clearTimeout(timer);
      events.forEach((evt) => window.removeEventListener(evt, reset));
      window.removeEventListener("keydown", handleIdleKey);
    };
  }, [page, isCompact]);

  const selectTrack = (index: number, autoplay = true) => {
    const nextTrack = tracks[index];
    if (!nextTrack) return;
    setTrackIndex(index);
    elapsedRef.current = 0;
    activeLyricIndexRef.current = 0;
    setActiveLyricIndex(0);
    applyElapsedUI(0, nextTrack.duration || 1);
    setTitleAnim(getRandomTitleAnim());
    if (autoplay) setIsPlaying(true);

    // Preload the artist's decorative font in the background. A brief swap-in
    // once it's ready is fine — blocking the actual track change on a font
    // fetch (previously up to 800ms) is what was causing the "Next" button
    // to feel laggy in large libraries with many different artists/fonts.
    const font = artistStyleFor(nextTrack.artist)?.fontFamily;
    if (font && document.fonts && !document.fonts.check(`16px ${font}`)) {
      void document.fonts.load(`16px ${font}`);
    }
  };

  const seekTo = useCallback(
    (value: number) => {
      const next = Math.max(0, Math.min(track.duration, value));
      elapsedRef.current = next;
      if (audioRef.current && track.sourceUrl) audioRef.current.currentTime = next;
      applyElapsedUI(next, track.duration);
    },
    [track.duration, track.sourceUrl, applyElapsedUI],
  );

  /* Keep the imperative playback UI in sync whenever the track changes
     (runs pre-paint, so restoring a saved position never flashes). */
  useLayoutEffect(() => {
    applyElapsedUI(elapsedRef.current, track.duration || 1);
  }, [track.id, track.duration, applyElapsedUI]);

  // A track only counts as "recently played" once it's actually been
  // listened to for a little while — logging it the instant it becomes
  // active meant rapid skips/previews polluted the Recents list with
  // tracks the person never really heard.
  useEffect(() => {
    if (!isPlaying || !track.id) return;
    const timer = window.setTimeout(() => {
      setRecentlyPlayedIds((current) => [track.id, ...current.filter((id) => id !== track.id)].slice(0, 30));
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [track.id, isPlaying]);

  const goNext = () => {
    if (!hasLibrary) return;
    if (activeQueueTab === "urQueue" && queueIds.length > 0) {
      const currPos = queueIds.indexOf(track.id);
      const nextId = queueIds[(currPos + 1) % queueIds.length];
      const nextIdx = tracks.findIndex((t) => t.id === nextId);
      if (nextIdx !== -1) return selectTrack(nextIdx);
    }
    if (shuffle) {
      let next = Math.floor(Math.random() * tracks.length);
      if (next === trackIndex) next = (next + 1) % tracks.length;
      return selectTrack(next);
    }
    selectTrack((trackIndex + 1) % tracks.length);
  };

  const goPrevious = () => {
    if (!hasLibrary) return;
    if (elapsedRef.current > 4) return seekTo(0);
    selectTrack((trackIndex - 1 + tracks.length) % tracks.length);
  };

  /* V1.4.0 (#9) — hardware media keys (⏯ ⏭ ⏮ ⏹). Classic drives its own
     <audio> element, so it answers for itself; the engine bridge ignores
     classic mode. This pane stays mounted (hidden) while another face is
     active, hence the getUiMode() gate — it prevents double-firing.
     Handlers are exactly the ones the player-bar / compact buttons call and
     none of them depend on page visibility: audio keeps playing minimized.
     Re-subscribing per render is intentional — it keeps goNext/goPrevious
     closures fresh without ref plumbing. */
  useEffect(() => {
    return onMediaKey((action) => {
      if (getUiMode() !== "classic") return;
      try {
        if (action === "play-pause") setIsPlaying((value) => !value);
        else if (action === "next") goNext();
        else if (action === "prev") goPrevious();
        else if (action === "stop") setIsPlaying(false);
      } catch {
        /* a media-key press must never crash the shell */
      }
    });
  });

  const toggleUrQueue = (trackId: number) =>
    setQueueIds((prev) => (prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]));

  const toggleLike = (trackId: number) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.system === "liked"
          ? {
              ...pl,
              trackIds: pl.trackIds.includes(trackId) ? pl.trackIds.filter((id) => id !== trackId) : [...pl.trackIds, trackId],
            }
          : pl,
      ),
    );
  };

  const createPlaylist = (name: string, color = "#ef4c78", emoji = "✧") => {
    const clean = name.trim();
    if (!clean) return;
    setPlaylists((prev) => [
      ...prev,
      { id: `pl-${Date.now()}`, name: clean, trackIds: [], createdAt: Date.now(), emoji, color },
    ]);
    setCreateOpen(false);
  };

  const togglePlaylistTrack = (playlistId: string, trackId: number) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? {
              ...pl,
              trackIds: pl.trackIds.includes(trackId) ? pl.trackIds.filter((id) => id !== trackId) : [...pl.trackIds, trackId],
            }
          : pl,
      ),
    );
  };

  const deletePlaylist = (playlistId: string) => {
    setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId || pl.system === "liked"));
    setActivePlaylistId("all");
  };

  useEffect(() => {
    if (!isPlaying || track.sourceUrl || !hasLibrary) return;
    /* PHASE-2 PERF FIX: fallback 1Hz ticker now drives the ref-based clock +
       imperative UI sync instead of the removed `elapsed` state. */
    const timer = window.setInterval(() => {
      const next = elapsedRef.current + 1;
      if (next >= track.duration) {
        elapsedRef.current = 0;
        activeLyricIndexRef.current = 0;
        setActiveLyricIndex(0);
        applyElapsedUI(0, track.duration);
        if (!repeat) window.setTimeout(goNext, 0);
        return;
      }
      elapsedRef.current = next;
      applyElapsedUI(next, track.duration);
      if (lyrics.length > 0) {
        let active = 0;
        for (let i = 0; i < lyrics.length; i += 1) {
          if (lyrics[i].time <= next) active = i;
          else break;
        }
        if (active !== activeLyricIndexRef.current) {
          activeLyricIndexRef.current = active;
          setActiveLyricIndex(active);
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, track.duration, track.sourceUrl, trackIndex, repeat, shuffle, activeQueueTab, queueIds, lyrics, applyElapsedUI]);

  useEffect(() => {
    if (page !== "lyrics" || isCompact || lyricManual) return;
    lyricRefs.current[activeLyricIndex]?.scrollIntoView({
      behavior: ambientMotion ? "smooth" : "auto",
      block: "center",
    });
  }, [activeLyricIndex, page, ambientMotion, isCompact, lyricManual]);

  useEffect(() => {
    if (!lyricManual) return;
    const timer = window.setTimeout(() => {
      setLyricManual(false);
      lyricRefs.current[activeLyricIndex]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [lyricManual, activeLyricIndex]);

  useEffect(() => {
    if (compactOffset === 0) return;
    const timer = window.setTimeout(() => setCompactOffset(0), 4000);
    return () => window.clearTimeout(timer);
  }, [compactOffset, activeLyricIndex]);

  useEffect(() => {
    setCompactOffset(0);
  }, [trackIndex]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track.sourceUrl) return;
    audio.volume = volume / 100;
    if (isPlaying) {
      // ── single-source rule: only ONE audio element may be audible. Both UIs
      // stay mounted, so starting classic playback must silence the Cinema
      // engine (its detached Audio element would otherwise overlap).
      try { (window as any).__NOBODY_CINEMA__?.pause?.(); } catch { /* ignore */ }
      audio.play().catch(() => setIsPlaying(false));
    } else audio.pause();
  }, [isPlaying, track.sourceUrl, volume]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      // single-owner rule: only the ACTIVE ui may answer global keys. All four
      // panes stay mounted, so without this gate classic kept toggling its own
      // (hidden) transport while ALOK/Cinema/EELA was playing — Space toggled
      // BOTH engines at once and the two "single-source" guards paused each
      // other, leaving the restarted app silent no matter what was pressed.
      if (getUiMode() !== "classic") return;
      const target = event.target as HTMLElement;
      const editing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      // Slash always focuses the search bar (except when editing text)
      if (!editing && event.key === "/") {
        event.preventDefault();
        setSearchOpen(true);
        return;
      }

      // Escape closes any open overlay
      if (event.key === "Escape") {
        if (searchOpen) {
          setSearchOpen(false);
          setSearch("");
        }
        if (queueOpen) setQueueOpen(false);
        if (createOpen) setCreateOpen(false);
        if (addToPlaylistTrack) setAddToPlaylistTrack(null);
        if (lrcSyncFolder) setLrcSyncFolder(null);
        if (coverSyncFolder) setCoverSyncFolder(null);
        return;
      }

      if (editing) return;

      switch (event.code) {
        case "Space":
          event.preventDefault();
          setIsPlaying((value) => !value);
          break;
        case "ArrowRight":
          event.preventDefault();
          seekTo(elapsedRef.current + 5);
          break;
        case "ArrowLeft":
          event.preventDefault();
          seekTo(elapsedRef.current - 5);
          break;
        case "ArrowUp":
          event.preventDefault();
          setVolume(Math.min(100, volume + 5));
          break;
        case "ArrowDown":
          event.preventDefault();
          setVolume(Math.max(0, volume - 5));
          break;
        case "PageUp":
          event.preventDefault();
          goPrevious();
          break;
        case "PageDown":
          event.preventDefault();
          goNext();
          break;
        case "Home":
          event.preventDefault();
          seekTo(0);
          break;
        case "End":
          event.preventDefault();
          seekTo(track.duration - 1);
          break;
        case "KeyM":
          setPreviousVolume(volume);
          setVolume((v) => (v === 0 ? previousVolume || 74 : 0));
          break;
        case "KeyL":
          toggleLike(track.id);
          break;
        case "KeyS":
          setShuffle((v) => !v);
          break;
        case "KeyR":
          setRepeat((v) => !v);
          break;
        case "KeyC":
          setIsCompact((value) => !value);
          break;
        case "KeyQ":
          setQueueOpen((v) => !v);
          break;
        case "KeyF":
          if (document.fullscreenElement) document.exitFullscreen?.();
          else document.documentElement.requestFullscreen?.();
          break;
        case "Digit1":
          setPage("focus");
          break;
        case "Digit2":
          setPage("library");
          break;
        case "Digit3":
          setPage("lyrics");
          break;
        case "Digit4":
          setPage("contact");
          break;
        case "Digit5":
          setPage("donate");
          break;
        case "Digit6":
          setPage("downloads");
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    track.duration,
    track.id,
    track.sourceUrl,
    volume,
    previousVolume,
    searchOpen,
    queueOpen,
    createOpen,
    addToPlaylistTrack,
    lrcSyncFolder,
    coverSyncFolder,
  ]);

  /* Task 30 — the WHOLE batch import runs serialized through the module-level
     `importChain` (boot rescan + user pick + bridge imports can no longer
     interleave), and appends via a functional updater so the freshest library
     state always wins. Everything inside reads refs, so the once-registered
     bridge can safely keep the FIRST render's closure for the whole session. */
  const handleBatchImport = (input: FileList | DesktopImportFile[], options?: { silent?: boolean }) => {
    /* Runtime guard: callers may pass a bare File[] (e.g. the Cinema bridge).
       Wrap any raw File element into a record before mapping, otherwise
       `.file` would be undefined for every entry and the import would crash. */
    const records: DesktopImportFile[] = Array.isArray(input)
      ? (input as unknown[]).map((entry) =>
          entry instanceof File
            ? ({ file: entry, path: "", folder: "", sourceUrl: "" } as DesktopImportFile)
            : (entry as DesktopImportFile),
        )
      : Array.from(input).map((file) => ({ file, path: "", folder: "", sourceUrl: "" }));
    const batchSeq = ++importBatchSeq;
    const task = importChain.then(async () => {
      const imported = await runBatchImport(records, options, batchSeq);
      /* §4 wiring sanity — a user-visible import notifies the new-UI mirrors
         immediately (silent imports ride the tracks-change effect). */
      if (!options?.silent) {
        try {
          (window as any).__NOBODY_BRIDGE__?.notify?.();
        } catch {
          /* bridge absent (pure web) */
        }
      }
      return imported;
    });
    importChain = task.catch(() => undefined);
    return task;
  };

  const runBatchImport = async (
    records: DesktopImportFile[],
    options?: { silent?: boolean },
    batchSeq = ++importBatchSeq,
  ): Promise<Track[]> => {
    const allFiles = records.map((record) => record.file);
    const recordByFile = new Map(records.map((record) => [record.file, record]));
    const audioFiles = allFiles.filter(
      (file) =>
        file.type.startsWith("audio/") ||
        /\.(mp3|flac|wav|ogg|m4a|aac|wma|opus|aiff|alac|ape|webm|3gp|dsf|mpc)$/i.test(file.name),
    );
    const lrcFiles = allFiles.filter((file) => /\.(lrc|txt)$/i.test(file.name));
    const imageFiles = allFiles.filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file.name));

    if (audioFiles.length === 0 && lrcFiles.length > 0) {
      const parsed = parseLrc(await lrcFiles[0].text());
      if (parsed.length) {
        const updated = [...tracksRef.current];
        const current = updated[trackIndexRef.current];
        if (current) {
          updated[trackIndexRef.current] = {
            ...current,
            lrcSource: lrcFiles[0].name,
            isFallbackLyric: false,
            lyrics: parsed,
          };
          setTracks(updated);
          setPage("lyrics");
        }
      }
      return [];
    }

    const lrcMap = new Map<string, string>();
    for (const lrcFile of lrcFiles) {
      lrcMap.set(lrcFile.name.replace(/\.[^.]+$/, "").toLowerCase(), await lrcFile.text());
    }

    const imageMap = new Map<string, File>();
    for (const imageFile of imageFiles) {
      imageMap.set(imageFile.name.replace(/\.[^.]+$/, "").toLowerCase(), imageFile);
    }

    const newTracks: Track[] = [];
    /* PHASE-3: re-adding a folder that is already in the library used to
       duplicate every track (same stable id twice -> duplicate React keys
       and double library rows). Skip files whose stable id already exists.
       Task 30: read the LIVE mirror (tracksRef) — the closure `tracks` could
       be arbitrarily stale inside the serialized chain. */
    const existingTrackIds = new Set(tracksRef.current.map((item) => item.id));
    for (const file of audioFiles) {
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const matchedLrcText = lrcMap.get(baseName.toLowerCase());
      const parsedLyrics = matchedLrcText ? parseLrc(matchedLrcText) : [];

      const desktopRecord = recordByFile.get(file);
      const trackId = desktopRecord?.path ? stableIdFromPath(desktopRecord.path) : 0;
      if (trackId && existingTrackIds.has(trackId)) continue;

      /* PHASE-3 + PHASE-4 — single bounded NATIVE parse pass (music-metadata
         removed): reads at most 3MB of the file (+ a small end-slice for
         MP4/OGG) and returns tags, cover, embedded lyrics AND technicals
         (container/codec/bitrate/sampleRate/channels/bitDepth/duration). */
      const realSize = desktopRecord?.fileSize ?? file.size;
      const embedded = await parseAudioFileMetadata(file, {
        tail: desktopRecord ? desktopRecord.tailFile : file,
        realSize,
      });

      const title = embedded.title || baseName;
      const artist = embedded.artist || "Local Library";
      const album = embedded.album || (file.webkitRelativePath ? file.webkitRelativePath.split("/")[0] : "Local Music");

      let cover = embedded.cover;
      /* PHASE-3: embedded covers used to stay in state as ~1.37x-sized base64
         strings for the whole session; they now become compact revocable
         blob URLs instead. */
      if (cover && cover.startsWith("data:")) {
        const blobCover = await dataUrlToBlobUrl(cover);
        if (blobCover) cover = blobCover;
      }
      const matchedImage = !embedded.cover ? imageMap.get(baseName.toLowerCase()) : undefined;
      if (matchedImage) {
        cover = createManagedBlobUrl(matchedImage);
      }
      const isFallbackCover = !cover;
      cover ||= generateAestheticCover(title, artist);

      const sourceUrl = desktopRecord?.sourceUrl || createManagedBlobUrl(file);

      /* PHASE-3: the Audio probe runs ONLY when the parser could not derive a
         trustworthy duration, and it always releases its media loader. */
      const duration = embedded.duration
        ? Math.max(1, Math.floor(embedded.duration))
        : await probeAudioDuration(sourceUrl);

      /* Lyric priority:
         1. Same-name .lrc file next to the audio
         2. Embedded lyrics inside the audio tags (USLT / SYLT / VORBIS LYRICS)
            — parsed as LRC when timestamps exist, otherwise spread evenly. */
      let finalLyrics = parsedLyrics;
      let lyricSource: string | undefined = matchedLrcText ? `${baseName}.lrc` : undefined;

      if (finalLyrics.length === 0 && embedded.lyrics) {
        const parsedEmbedded = parseLrc(embedded.lyrics);
        if (parsedEmbedded.length > 0) {
          finalLyrics = parsedEmbedded;
          lyricSource = "Embedded LRC";
        } else {
          const plainLines = embedded.lyrics
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
          if (plainLines.length > 1) {
            finalLyrics = plainLines.map((text, i) => ({
              time: Math.floor((i * duration) / plainLines.length),
              text,
            }));
            lyricSource = "Embedded Lyrics";
          }
        }
      }

      /* PHASE-4: the native parser now also reads MP4 (©lyr) and OGG (LYRICS)
         comment fields, so no second parser pass is needed for those containers. */

      const palette = await extractCoverPalette(cover, `${artist}-${album}-${title}`);

      const isFallbackLyric = finalLyrics.length === 0;
      const id = trackId || Date.now() + Math.floor(Math.random() * 100000);
      existingTrackIds.add(id);
      newTracks.push({
        id,
        title,
        artist,
        album,
        year: embedded.year || new Date().getFullYear().toString(),
        cover,
        accent: palette.accent,
        secondary: palette.secondary,
        duration,
        durationLabel: formatTime(duration),
        bpm: 120,
        key: "—",
        lyrics: isFallbackLyric ? [{ time: 0, text: title }] : finalLyrics,
        lrcSource: lyricSource,
        isFallbackLyric,
        isFallbackCover,
        sourceUrl,
        sourcePath: desktopRecord?.path || undefined,
        folderPath: desktopRecord?.folder || undefined,
        metadata: {
          format: shortFormat(embedded.container || file.name.split(".").pop() || file.type),
          bitrate: embedded.bitrate
            ? `${Math.round(embedded.bitrate / 1000)} kbps`
            : duration && realSize
              ? `${Math.max(1, Math.round((realSize * 8) / duration / 1000))} kbps`
              : "—",
          sampleRate: embedded.sampleRate ? `${embedded.sampleRate} Hz` : "—",
          channels: embedded.channels ? `${embedded.channels} channels` : "Stereo",
          fileSize: `${(realSize / (1024 * 1024)).toFixed(1)} MB`,
          codec: shortFormat(embedded.codec || file.name.split(".").pop() || "PCM"),
          bitDepth: embedded.bitDepth ? `${embedded.bitDepth}-bit` : "—",
          path: desktopRecord?.path || file.webkitRelativePath || file.name,
        },
      });
    }

    if (newTracks.length > 0) {
      /* Task 30 — FUNCTIONAL updater: always append to the freshest state
         (the old `[...tracks, ...newTracks]` captured a stale snapshot and
         the boot rescan / manual import race erased tracks). While the
         updater runs it stamps firstNewIndexRef with THIS batch's base —
         React flushes queued updaters in order, so the setTrackIndex
         updater below reads the freshly stamped value, never a stale one. */
      setTracks((current) => {
        const known = new Set(current.map((item) => item.id));
        const fresh = newTracks.filter((item) => !known.has(item.id));
        if (!fresh.length) return current;
        firstNewIndexRef.current = current.length;
        firstNewBatchRef.current = batchSeq;
        return [...current, ...fresh];
      });
      if (!options?.silent) {
        /* Runs after the setTracks updater above (React flushes queued
           updaters in order). When THIS batch appended, the ref pair holds
           this batch's base index; when every file was a duplicate the
           updater keeps the previous index (nothing new to jump to). */
        setTrackIndex((prev) => {
          if (firstNewBatchRef.current !== batchSeq) return prev;
          return Math.max(0, Math.min(firstNewIndexRef.current, tracksRef.current.length));
        });
        elapsedRef.current = 0;
        activeLyricIndexRef.current = 0;
        setActiveLyricIndex(0);
        applyElapsedUI(0, newTracks[0]?.duration || 1);
        setTitleAnim(getRandomTitleAnim());
        setIsPlaying(true);
        setPage("lyrics");
      }
    }
    return newTracks;
  };

  /* Task 30 — folder-add core shared by the classic UI, the classic bridge
     (importPaths) and any other caller. Unions the paths into folderPaths
     (functional updater + ref so the bridge never reads a stale list), walks
     them, silently imports through the serialized chain, then notifies the
     new-UI mirrors. Reads ONLY refs + stable setters → safe for the
     once-registered bridge to hold forever. */
  const importFolderPaths = async (paths: string[]): Promise<{ added: number }> => {
    const unique = Array.from(new Set((paths || []).filter(Boolean)));
    if (!unique.length) return { added: 0 };
    setFolderPaths((current) => {
      const merged = Array.from(new Set([...current, ...unique]));
      folderPathsRef.current = merged; // stay fresh even before the commit
      return merged;
    });
    const records = await loadDesktopFolders(unique);
    const imported = records.length ? await handleBatchImport(records, { silent: true }) : [];
    const added = Array.isArray(imported) ? imported.length : 0;
    try {
      (window as any).__NOBODY_BRIDGE__?.notify?.();
    } catch {
      /* bridge absent (pure web) */
    }
    return { added };
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) handleBatchImport(event.target.files);
    event.target.value = "";
  };

  const addMusicFolders = async () => {
    try {
      const selected = await chooseMusicFolders();
      if (selected.length) {
        /* Task 30 — one shared folder-add core (union + walk + silent import
           + bridge notify). Previously the union read a possibly-stale
           folderPaths snapshot and the import could interleave with the boot
           rescan, which is how the "second folder never gets added" bug was
           born. */
        await importFolderPaths(selected);
        return;
      }
    } catch {
      // Browser fallback below.
    }
    folderInput.current?.click();
  };

  const addMusicFiles = async () => {
    try {
      const paths = await chooseMusicFiles();
      if (paths.length) {
        const records = await loadDesktopFiles(paths);
        if (records.length) await handleBatchImport(records);
        return;
      }
    } catch {
      // Browser fallback below.
    }
    audioInput.current?.click();
  };

  /* Task 30 — ref-based remove core (also serves __NOBODY_BRIDGE__.removeFolder,
     which keeps the first render's closure for the whole session). */
  const removeMusicFolder = (folder: string) => {
    setFolderPaths((current) => current.filter((item) => item !== folder));
    /* PHASE-3: blob URLs (imported audio / covers) of the removed tracks used
       to stay pinned in RAM forever. The currently playing track keeps its
       audio URL so an in-flight song is never cut off mid-removal. */
    const snapshot = tracksRef.current;
    const removed = snapshot.filter((item) => item.folderPath === folder);
    if (removed.length === 0) return;
    const playingId = snapshot[trackIndexRef.current]?.id;
    setTracks((current) => current.filter((item) => item.folderPath !== folder));
    setTrackIndex((index) => Math.max(0, Math.min(index, Math.max(0, snapshot.length - removed.length - 1))));
    for (const item of removed) {
      revokeManagedBlobUrl(item.cover);
      if (item.id !== playingId) revokeManagedBlobUrl(item.sourceUrl);
    }
  };

  /* Task 30 — ref-based rescan core (also serves __NOBODY_BRIDGE__.rescanFolder). */
  const rescanFolder = async (folder: string) => {
    if (!isDesktopRuntime() || rescanningRef.current) return;
    setRescanningFolder(folder);
    rescanningRef.current = true;
    try {
      const records = await loadDesktopFolders([folder]);
      const audioRe = /\.(mp3|flac|wav|ogg|m4a|aac|wma|opus|aiff|alac|ape|webm|3gp|dsf|mpc)$/i;
      const lrcRe = /\.(lrc|txt)$/i;
      const imageRe = /\.(jpg|jpeg|png|webp)$/i;
      const baseName = (path: string) => (path.split(/[\\/]/).pop() || path).replace(/\.[^.]+$/, "").toLowerCase();

      const audioRecords = records.filter((record) => audioRe.test(record.path));
      const currentAudioPaths = new Set(audioRecords.map((record) => record.path));

      // Files this folder already contributed to the library, based on the
      // live library mirror (Task 30: tracksRef instead of the closure).
      const snapshot = tracksRef.current;
      const existingPaths = new Set(
        snapshot
          .filter((item) => item.folderPath === folder && item.sourcePath)
          .map((item) => item.sourcePath as string),
      );

      // Drop tracks whose source file no longer exists on disk, and release
      // their blob URLs (PHASE-3: these used to leak on every rescan).
      const droppedTracks = snapshot.filter(
        (item) => item.folderPath === folder && item.sourcePath && !currentAudioPaths.has(item.sourcePath),
      );
      setTracks((current) =>
        current.filter(
          (item) => item.folderPath !== folder || !item.sourcePath || currentAudioPaths.has(item.sourcePath),
        ),
      );
      setTrackIndex((index) =>
        Math.max(0, Math.min(index, Math.max(0, snapshot.length - droppedTracks.length - 1))),
      );
      const rescanPlayingId = snapshot[trackIndexRef.current]?.id;
      for (const item of droppedTracks) {
        revokeManagedBlobUrl(item.cover);
        if (item.id !== rescanPlayingId) revokeManagedBlobUrl(item.sourceUrl);
      }

      // Import only the audio files that weren't already in the library,
      // together with any same-name .lrc/.txt file so lyric matching still
      // works for freshly discovered tracks.
      const newAudioRecords = audioRecords.filter((record) => !existingPaths.has(record.path));
      const newBaseNames = new Set(newAudioRecords.map((record) => baseName(record.path)));
      const relevantLrcRecords = records.filter(
        (record) => lrcRe.test(record.path) && newBaseNames.has(baseName(record.path)),
      );
      const relevantImageRecords = records.filter(
        (record) => imageRe.test(record.path) && newBaseNames.has(baseName(record.path)),
      );

      const toImport = [...newAudioRecords, ...relevantLrcRecords, ...relevantImageRecords];
      if (toImport.length) await handleBatchImport(toImport, { silent: true });
    } catch {
      // A removed or inaccessible folder should not prevent the rest of the app from working.
    } finally {
      setRescanningFolder(null);
      rescanningRef.current = false;
    }
  };

  const applyFetchedLyrics = (trackId: number, lyrics: LyricLine[], sourceLabel: string) => {
    setTracks((current) =>
      current.map((item) =>
        item.id === trackId
          ? { ...item, lyrics: lyrics.length ? lyrics : item.lyrics, lrcSource: sourceLabel, isFallbackLyric: false }
          : item,
      ),
    );
  };

  const applyFetchedCover = (trackId: number, coverUrl: string) => {
    const previous = tracks.find((item) => item.id === trackId);
    setTracks((current) =>
      current.map((item) => (item.id === trackId ? { ...item, cover: coverUrl, isFallbackCover: false } : item)),
    );
    /* PHASE-3: the replaced cover's blob URL used to leak forever. */
    if (previous) revokeManagedBlobUrl(previous.cover);
  };

  /* ── NOBODY UI-MODE BRIDGE ──────────────────────────────────────────────────
     Exposes classic library/playback accessors so the alternative "Cinema" UI
     can share this library and hand playback over on UI switches. Strictly
     additive — classic behavior is untouched when the bridge is unused. */
  const bridgeApiRef = useRef<{
    tracks: Track[];
    trackIndex: number;
    isPlaying: boolean;
    volume: number;
    selectTrack: (index: number, autoplay?: boolean) => void;
    seekTo: (value: number) => void;
    applyElapsedUI: (t: number, duration: number) => void;
    handleBatchImport: (input: FileList | DesktopImportFile[], options?: { silent?: boolean }) => Promise<Track[] | void>;
    importFolderPaths: (paths: string[]) => Promise<{ added: number }>;
    applyFetchedLyrics: (trackId: number, lyrics: LyricLine[], sourceLabel: string) => void;
    applyFetchedCover: (trackId: number, coverUrl: string) => void;
    setIsPlaying: (value: boolean) => void;
    setVolume: (value: number) => void;
    audioRef: MutableRefObject<HTMLAudioElement | null>;
    elapsedRef: MutableRefObject<number>;
  } | null>(null);
  bridgeApiRef.current = {
    tracks,
    trackIndex,
    isPlaying,
    volume,
    selectTrack,
    seekTo,
    applyElapsedUI,
    handleBatchImport,
    importFolderPaths,
    applyFetchedLyrics,
    applyFetchedCover,
    setIsPlaying,
    setVolume,
    audioRef,
    elapsedRef,
  };
  /* Task 30 — keep the fresh-value refs in lock-step with every render (the
     serialized import chain and the once-registered bridge read these). */
  tracksRef.current = tracks;
  trackIndexRef.current = trackIndex;
  folderPathsRef.current = folderPaths;

  useEffect(() => {
    const listeners = new Set<() => void>();
    const notifyLocal = () => {
      listeners.forEach((cb) => {
        try {
          cb();
        } catch {
          /* ignore */
        }
      });
    };
    /* Task 30 — the bridge is registered ONCE (mount effect), so it captures
       the first render's closures. That is safe ONLY because removeMusicFolder,
       rescanFolder and importFolderPaths read the fresh-value refs + stable
       setters (never stale state). */
    const removeCore = removeMusicFolder;
    const rescanCore = rescanFolder;
    const importFoldersCore = importFolderPaths;
    const w = window as any;
    w.__NOBODY_BRIDGE__ = {
      version: 1,
      hasTrack: (id: string) => Boolean(bridgeApiRef.current?.tracks.some((t) => String(t.id) === id)),
      listTracks: () => {
        const cur = bridgeApiRef.current;
        if (!cur) return [];
        return cur.tracks.map((t, order) => ({
          id: String(t.id),
          title: t.title,
          artist: t.artist,
          album: t.album,
          year: t.year ?? "",
          duration: t.duration || 0,
          format: t.metadata?.format ?? "mp3",
          bitrate: t.metadata?.bitrate ?? undefined,
          fileSize: t.metadata?.fileSize ?? 0,
          fileName: (t.metadata?.path || "").split(/[\\/]/).pop() || t.title,
          hasCover: Boolean(t.cover),
          isPlaceholderCover: Boolean(t.isFallbackCover),
          hasLyrics: Array.isArray(t.lyrics) && t.lyrics.length > 0 && !t.isFallbackLyric,
          syncedLyrics: Array.isArray(t.lyrics)
            ? t.lyrics.filter((l) => l && l.text).map((l) => ({ t: l.time, text: l.text }))
            : [],
          accent: t.accent || undefined,
          batchId: t.folderPath || "library",
          order,
          coverUrl: t.cover || null,
          sourceUrl: t.sourceUrl || null,
          /* V1.2.0: real paths for the new-UI Folders / Subfolders views. */
          folderPath: t.folderPath || undefined,
          filePath: t.metadata?.path || undefined,
        }));
      },
      resolveSource: (id: string) => {
        const cur = bridgeApiRef.current;
        const t = cur?.tracks.find((x) => String(x.id) === id);
        return t?.sourceUrl ?? null;
      },
      getCoverUrl: (id: string) => {
        const cur = bridgeApiRef.current;
        const t = cur?.tracks.find((x) => String(x.id) === id);
        return t?.cover || null;
      },
      importFiles: async (files: FileList | File[]) => {
        const cur = bridgeApiRef.current;
        if (!cur) return { added: 0 };
        /* Cinema sends plain File[] — Array.isArray(File[]) is true, so a naive
           pass-through reached handleBatchImport's "records" branch where every
           entry is expected to be {file,...}; `.file` came back undefined and
           the import crashed silently. Normalize EVERY shape into records and
           count against fresh refs (the captured ref goes stale across await). */
        const plain = Array.from(files as ArrayLike<File>);
        const records: DesktopImportFile[] = plain.map((file) => ({
          file,
          path: "",
          folder: "",
          sourceUrl: "",
        }));
        /* QA fix: the old before/after length diff read bridgeApiRef BEFORE
           React flushed the state update, so every import reported added: 0
           (cinema's toast always said "0 added"). handleBatchImport resolves
           with the exact imported list — use it, fall back to the diff. */
        const before = bridgeApiRef.current?.tracks.length ?? 0;
        const imported = await cur.handleBatchImport(records, { silent: true });
        const after = bridgeApiRef.current?.tracks.length ?? 0;
        const diff = Math.max(0, after - before);
        const added = Array.isArray(imported) ? imported.length : diff;
        return { added };
      },
      /* V1.2.0 installer import fix: the new UIs now import through the SAME
         real-path pipeline as classic (native dialog paths → bounded head/tail
         reads → app:// streaming). Renderer File objects have no .path under
         Electron ≥32, so the old File[] route produced blob-URL tracks that
         could not stream in the packaged app.
         Task 30: folder paths route through importFolderPaths (union into the
         managed-folder list + serialized silent import + notify), files keep
         the direct walker → the new UIs' folder imports behave EXACTLY like
         classic's own "Add music folders". */
      importPaths: async (paths: string[]) => {
        const cur = bridgeApiRef.current;
        if (!cur || !paths?.length) return { added: 0 };
        /* V1.2.0: native dialogs can return folders OR files — split them by
         * stat so each goes through its proper walker. */
        const filePaths: string[] = [];
        const folderList: string[] = [];
        const api = window.electronAPI;
        for (const p of paths) {
          try {
            const info = await api!.stat(p);
            if (info?.isFile === false) folderList.push(p);
            else filePaths.push(p);
          } catch {
            filePaths.push(p); // stat failed → treat as a file (best effort)
          }
        }
        let added = 0;
        if (folderList.length) added += (await importFoldersCore(folderList)).added;
        if (filePaths.length) {
          const records: DesktopImportFile[] = await loadDesktopFiles(filePaths);
          if (records.length) {
            const imported = await cur.handleBatchImport(records, { silent: true });
            added += Array.isArray(imported) ? imported.length : 0;
          }
        }
        return { added };
      },
      /* Task 30 — folder management surface for cinema / EELA / ALOK.
         Every mutation flows through the same core the classic UI uses and
         notifies the mirrors so all three rehydrate. */
      listFolders: () => {
        const cur = bridgeApiRef.current;
        return folderPathsRef.current.map((p) => ({
          path: p,
          name: p.split(/[\\/]/).filter(Boolean).pop() || p,
          trackCount: (cur?.tracks ?? []).filter((t) => t.folderPath === p).length,
        }));
      },
      removeFolder: (folder: string) => {
        removeCore(folder);
        notifyLocal();
      },
      rescanFolder: async (folder: string) => {
        await rescanCore(folder);
        notifyLocal();
      },
      /* Task 30 — raw pass-through to the classic importer (handoff
         auto-import, folderManager side doors). */
      handleBatchImport: async (input: FileList | unknown[], options?: { silent?: boolean }) =>
        bridgeApiRef.current?.handleBatchImport(input as FileList | DesktopImportFile[], options),
      patchLyrics: (id: string, lines: { t: number; text: string }[], sourceLabel?: string) => {
        const cur = bridgeApiRef.current;
        if (!cur) return;
        cur.applyFetchedLyrics(
          Number(id),
          lines.map((l) => ({ time: l.t, text: l.text })),
          sourceLabel || "Cinema Sync",
        );
      },
      patchCover: (id: string, blob: Blob) => {
        const cur = bridgeApiRef.current;
        if (!cur) return;
        cur.applyFetchedCover(Number(id), createManagedBlobUrl(blob));
      },
      patchAccent: (id: string, accent: string) => {
        const cur = bridgeApiRef.current;
        if (!cur) return;
        setTracks((current) => current.map((item) => (item.id === Number(id) ? { ...item, accent } : item)));
      },
      captureHandoff: () => {
        const cur = bridgeApiRef.current;
        if (!cur) return { trackId: null, position: 0, isPlaying: false, volume: 0.74, queueIds: [] };
        const t = cur.tracks[cur.trackIndex];
        return {
          trackId: t ? String(t.id) : null,
          position: cur.elapsedRef.current || 0,
          isPlaying: cur.isPlaying,
          volume: cur.volume / 100,
          queueIds: cur.tracks.map((item) => String(item.id)),
        };
      },
      pause: () => {
        const cur = bridgeApiRef.current;
        if (!cur) return;
        cur.setIsPlaying(false);
        try {
          cur.audioRef.current?.pause();
        } catch {
          /* ignore */
        }
      },
      subscribe: (cb: () => void) => {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
      notify: notifyLocal,
    };
    return () => {
      delete w.__NOBODY_BRIDGE__;
    };
  }, []);

  /* Push classic library/playback changes to the Cinema UI (live mirror). */
  useEffect(() => {
    (window as any).__NOBODY_BRIDGE__?.notify?.();
  }, [tracks, trackIndex, isPlaying, volume]);

  /* Apply a playback handoff coming from the Cinema UI when switching back
     (and once at boot, in case the app reloaded mid-handoff).
     BUG FIX (music stopped after switching back to Classic): the old matcher
     did Number(handoff.trackId) — but tracks imported inside Cinema/EELA/ALOK
     have opaque string ids, so Number() was NaN, findIndex missed, and the
     consume silently aborted: the song stayed paused forever. Now ids are
     compared as strings (numeric ids stringify to the same value), and when
     the track genuinely isn't in the classic library yet (it was imported in
     another UI) it is pulled in from the shared engine library and imported
     before the position is restored. */
  useEffect(() => {
    const handoffSource = () => readUiHandoff("cinema") ?? readUiHandoff("eela") ?? readUiHandoff("alok");
    let consuming = false; // re-entrancy guard (a notify can fire mid-apply)

    const consume = async (): Promise<boolean> => {
      // the shared engine lives behind __NOBODY_CINEMA__ for BOTH cinema,
      // eela and alok — a handoff may arrive tagged with any of these origins
      const handoff = handoffSource();
      if (!handoff) {
        handoffPending.attempts = 0;
        return true;
      }
      /* Task 30: the handoff blob is cleared ONLY after a successful apply —
         every early return keeps it intact so the deferred retry can finish
         the job once the library/bridge is actually ready. */
      let cur = bridgeApiRef.current;
      if (!cur || !handoff.trackId) return false;

      const byId = (api: NonNullable<typeof cur>, idLike: unknown) =>
        api.tracks.findIndex((t) => String(t.id) === String(idLike));

      let idx = byId(cur, handoff.trackId);
      let api: NonNullable<typeof cur> = cur;
      if (idx < 0) {
        // The track was imported inside one of the new UIs — classic has never
        // seen it. Fetch its record from the shared library store and import
        // the source file into classic, then resume from the handoff position.
        try {
          const { db } = await import("./cinema/lib/db");
          const rec = (await db.getAllTracks()).find((t) => String(t.id) === String(handoff.trackId));
          /* Task 30: read the REAL path — cinema Track records carry
             `filePath` (the old `sourcePath` probe never matched, so the
             auto-import silently did nothing for bridged tracks). */
          const recAny = rec as unknown as { filePath?: string; sourcePath?: string } | null;
          const path = recAny?.filePath || recAny?.sourcePath;
          if (path && isDesktopRuntime()) {
            const records = await loadDesktopFiles([path]);
            if (records.length) {
              const imported = await api.handleBatchImport(records, { silent: true });
              // let the library state commit before re-scanning
              await new Promise((r) => window.setTimeout(r, 80));
              const fresh = bridgeApiRef.current;
              if (!fresh) return false;
              api = fresh;
              const t0 = Array.isArray(imported) ? imported.find(Boolean) : null;
              idx = t0 ? byId(api, t0.id) : -1;
              if (idx < 0) idx = byId(api, handoff.trackId);
            }
          }
        } catch { /* best-effort continuity */ }
      }
      if (idx < 0) return false; // not available yet — the retry re-checks later

      api.setVolume(Math.round(Math.min(1, Math.max(0, handoff.volume ?? 0.74)) * 100));
      if (api.trackIndex !== idx) api.selectTrack(idx, false);

      /* Task 30 — restore the LISTEN order. The outgoing engine handed its
         full queue (queueIds); classic's equivalent structure is the
         user-queue (`queueIds` + the urQueue tab, which drives goNext in
         that exact order). Rebuild it: map every handed id onto a classic
         track (ids that never existed in classic drop out) and pin the
         playing track to the front when it isn't in the list. */
      if (handoff.queueIds?.length) {
        const fresh = bridgeApiRef.current ?? api;
        const mapped = handoff.queueIds
          .map((id) => fresh.tracks.find((t) => String(t.id) === String(id))?.id)
          .filter((id): id is number => typeof id === "number");
        if (mapped.length) {
          const playingId = fresh.tracks[idx]?.id;
          setQueueIds(mapped.includes(playingId) ? mapped : [playingId, ...mapped]);
          setActiveQueueTab("urQueue");
        }
      }

      const duration = api.tracks[idx]?.duration || 0;
      const rawPosition = Number(handoff.position) || 0;
      // Handoff at/after the end means the track had finished — restart from the top.
      const position = duration > 0 && rawPosition >= duration - 0.5 ? 0 : rawPosition;
      api.elapsedRef.current = position;
      api.applyElapsedUI(position, duration);
      const audio = api.audioRef.current;
      const targetSrc = api.tracks[idx]?.sourceUrl ?? "";
      /* Task 30 — seek hardening: the whole block defers by one animation
         frame so React has committed the NEW src (the old inline
         `readyState >= 1` shortcut could seek the PREVIOUS track's media
         before the commit), then waits for `loadedmetadata` of the new
         source. The only direct-seek case is "src unchanged AND metadata
         already loaded" (same-track resume), verified via currentSrc —
         never the old resource. */
      window.requestAnimationFrame(() => {
        const el = bridgeApiRef.current?.audioRef.current ?? audio;
        if (!el) return;
        const applySeek = () => {
          try {
            const dur = isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
            const pos = dur > 0 && position >= dur - 0.5 ? 0 : position;
            el.currentTime = Math.max(0, Math.min(pos, Math.max(0, dur - 0.4)));
          } catch {
            /* ignore */
          }
          el.removeEventListener("loadedmetadata", applySeek);
        };
        if (targetSrc && el.currentSrc === targetSrc && el.readyState >= 1) applySeek();
        else el.addEventListener("loadedmetadata", applySeek);
      });
      if (handoff.isPlaying) api.setIsPlaying(true);

      // SUCCESS — only now drop the handoff (and the retry budget).
      clearUiHandoff();
      handoffPending.attempts = 0;
      if (handoffPending.timer !== null) {
        window.clearTimeout(handoffPending.timer);
        handoffPending.timer = null;
      }
      return true;
    };

    /* Task 30 — deferred retry (mirrors the engine's retryDeferredResume):
       ~5 attempts / 8s on the timer, plus an immediate re-check on every
       bridge notification (library grew / boot rescan finished). */
    const scheduleRetry = () => {
      if (handoffPending.attempts >= HANDOFF_MAX_ATTEMPTS) {
        clearUiHandoff(); // gave up — don't resurrect the blob forever
        handoffPending.attempts = 0;
        return;
      }
      handoffPending.attempts += 1;
      if (handoffPending.timer !== null) window.clearTimeout(handoffPending.timer);
      handoffPending.timer = window.setTimeout(() => {
        handoffPending.timer = null;
        kick();
      }, HANDOFF_RETRY_MS);
    };

    const kick = () => {
      if (consuming) return; // a consume is already running — it owns the blob
      consuming = true;
      void consume()
        .then((ok) => {
          if (!ok) scheduleRetry();
        })
        .finally(() => {
          consuming = false;
        });
    };

    // Boot-time consume ONLY when classic is the active UI — if the app was
    // closed while Cinema was playing, its handoff is still pending; playing
    // it inside the hidden classic pane is what made the user hear two songs.
    if (getUiMode() === "classic") kick();
    const onSwitch = (event: Event) => {
      if ((event as CustomEvent).detail?.to === "classic") {
        handoffPending.attempts = 0; // a fresh switch restarts the budget
        kick();
      }
    };
    window.addEventListener(UI_SWITCH_EVENT, onSwitch);
    const offBridge = (window as any).__NOBODY_BRIDGE__?.subscribe?.(() => {
      if (handoffSource() && handoffPending.timer === null) kick();
    });
    return () => {
      window.removeEventListener(UI_SWITCH_EVENT, onSwitch);
      try {
        offBridge?.();
      } catch {
        /* ignore */
      }
      if (handoffPending.timer !== null) {
        window.clearTimeout(handoffPending.timer);
        handoffPending.timer = null;
      }
    };
  }, []);

  // Restore all persisted desktop folders on first launch. Paths are small and
  // stable; audio bytes never live in localStorage and are re-read by Tauri.
  useEffect(() => {
    if (restoredFoldersRef.current || !isDesktopRuntime() || !folderPaths.length) return;
    restoredFoldersRef.current = true;
    void loadDesktopFolders(folderPaths).then(async (records) => {
      if (!records.length) return;
      const imported = await handleBatchImport(records, { silent: true });
      if (imported && imported.length) {
        const resumeIndex = imported.findIndex((item) => item.id === SAVED.trackId);
        if (resumeIndex >= 0) setTrackIndex(resumeIndex);
      }
    });
  }, []);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    // single-owner rule: only the ACTIVE ui may consume a drop — all panes
    // stay mounted, and an unguarded handler here would swallow files that
    // were meant for the visible UI (and drain the DataTransferItemList).
    if (getUiMode() !== "classic") return;
    if (event.dataTransfer.files?.length) handleBatchImport(event.dataTransfer.files);
  };

  /* PHASE-2 PERF FIX: --progress is now set imperatively on the shell element
     (applyElapsedUI) instead of flowing through this style object, so the
     theme object identity no longer changes on every playback tick. */
  const accentColor = autoColor ? track.accent : "#a878ff";
  const secondaryColor = autoColor ? track.secondary : "#2d72f7";
  const themeStyle = useMemo(
    () =>
      ({
        "--accent": accentColor,
        "--secondary": secondaryColor,
        "--volume": `${volume}%`,
        "--lyric-scale": lyricSize / 100,
        "--cursor-default": svgCursor(accentColor),
        "--cursor-pointer": svgCursor(accentColor, true),
      }) as CSSProperties,
    [accentColor, secondaryColor, volume, lyricSize],
  );

  const isRtl = lang === "fa";

  /* Single persistent <audio> — rendered to <body> via portal so it survives
     the entire compact ⇄ main tree swap and never restarts playback. */
  const persistentAudio = createPortal(
    <audio
      ref={audioRef}
      className="visually-hidden"
      src={track.sourceUrl ?? undefined}
      onTimeUpdate={(e) => {
        const t = e.currentTarget.currentTime;
        elapsedRef.current = t;
        applyElapsedUI(t, e.currentTarget.duration || track.duration || 1);
        if (lyrics.length > 0) {
          let active = 0;
          for (let i = 0; i < lyrics.length; i += 1) {
            if (lyrics[i].time <= t) active = i;
            else break;
          }
          if (active !== activeLyricIndexRef.current) {
            activeLyricIndexRef.current = active;
            setActiveLyricIndex(active);
          }
        }
      }}
      onEnded={goNext}
    />,
    document.body,
  );

  /* ————————————————— CINEMATIC COMPACT MODE ————————————————— */
  if (isCompact) {
    const targetIdx = Math.max(0, Math.min(lyrics.length - 1, activeLyricIndex + compactOffset));
    const prevLine = lyrics[targetIdx - 1];
    const currLine = lyrics[targetIdx] || { text: track.title, time: 0 };
    const nextLine = lyrics[targetIdx + 1];
    const showControls = compactInside && compactZone !== "text";

    return (
      <>
        {persistentAudio}
        <div
        className={`compact-shell compact-style-${compactStyle} ${ambientMotion ? "motion-on" : "motion-off"} ${isPlaying ? "is-playing" : "is-paused"} ${isRtl ? "rtl-mode" : "ltr-mode"} ${windowFocused ? "" : "window-unfocused"}`}
        ref={shellRef}
        style={themeStyle}
        dir={isRtl ? "rtl" : "ltr"}
        onContextMenu={(e) => e.preventDefault()}
        onMouseEnter={() => {
          setCompactInside(true);
          setCompactZone("controls");
        }}
        onMouseLeave={() => {
          setCompactInside(false);
          setCompactZone("none");
        }}
        onMouseMove={() => setCompactInside(true)}
      >
        <div className="compact-ambient" aria-hidden="true">
          <img
            src={ambientSrc || track.cover}
            alt=""
            className={ambientBlurFallback ? "ambient-blur-fallback" : undefined}
          />
          <div className="compact-glow" />
        </div>

        <div
          className="compact-topbar"
          data-tauri-drag-region
          onMouseEnter={() => setCompactZone("controls")}
        >
          <div className="compact-brand" data-tauri-drag-region>
            <img className="compact-cover-thumb" src={track.cover} alt="" data-tauri-drag-region />
            <NobodyLuxuryLogo size={18} />
            <span data-tauri-drag-region>NOBODY</span>
            <small data-tauri-drag-region>• EPODONIOS</small>
          </div>
          <button
            type="button"
            className="compact-exit-btn"
            onClick={() => setIsCompact(false)}
            title={dict.compact.exitCompact}
          >
            <Maximize2 size={12} />
            <span>{dict.compact.exitCompact}</span>
          </button>
        </div>

        <div
          className="compact-lyrics-area"
          onMouseEnter={() => setCompactZone("text")}
          onMouseLeave={() => setCompactZone("controls")}
          onWheel={(e) => {
            const delta = e.deltaY > 0 ? 1 : -1;
            setScrollDir(delta);
            setCompactOffset((prev) => {
              const nextVal = prev + delta;
              const abs = activeLyricIndex + nextVal;
              if (abs < 0 || abs >= lyrics.length) return prev;
              return nextVal;
            });
          }}
        >
          <div className="compact-lyric-stack">
            <AnimatePresence mode="popLayout" initial={false} custom={scrollDir}>
              <motion.div
                key={`p-${targetIdx}`}
                className="compact-line line-prev"
                custom={scrollDir}
                initial={{ opacity: 0, y: scrollDir * 22, filter: "blur(6px)" }}
                animate={{ opacity: 0.45, y: 0, filter: "blur(0.4px)" }}
                exit={{ opacity: 0, y: scrollDir * -22, filter: "blur(6px)" }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
                onClick={() => {
                  if (!prevLine) return;
                  setCompactOffset(0);
                  seekTo(prevLine.time);
                }}
              >
                {prevLine ? prevLine.text : ""}
              </motion.div>

              <motion.div
                key={`c-${targetIdx}`}
                className="compact-line line-curr"
                custom={scrollDir}
                initial={{ opacity: 0, y: scrollDir * 30, scale: 0.92, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: scrollDir * -30, scale: 0.92, filter: "blur(8px)" }}
                transition={{ type: "spring", stiffness: 300, damping: 26 }}
                onClick={() => {
                  setCompactOffset(0);
                  seekTo(currLine.time);
                }}
              >
                <p>{currLine.text}</p>
              </motion.div>

              <motion.div
                key={`n-${targetIdx}`}
                className="compact-line line-next"
                custom={scrollDir}
                initial={{ opacity: 0, y: scrollDir * 22, filter: "blur(6px)" }}
                animate={{ opacity: 0.45, y: 0, filter: "blur(0.4px)" }}
                exit={{ opacity: 0, y: scrollDir * -22, filter: "blur(6px)" }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
                onClick={() => {
                  if (!nextLine) return;
                  setCompactOffset(0);
                  seekTo(nextLine.time);
                }}
              >
                {nextLine ? nextLine.text : ""}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div
          className={`compact-controls-footer ${showControls ? "visible" : "hidden"}`}
          onMouseEnter={() => setCompactZone("controls")}
        >
          <div className="compact-btns">
            <TransportButton label="prev" onClick={goPrevious}>
              <SkipBack size={15} fill="currentColor" />
            </TransportButton>
            <PlayButton
              isPlaying={isPlaying}
              onClick={() => setIsPlaying(!isPlaying)}
              label={isPlaying ? dict.focus.pause : dict.focus.play}
              size="small"
            />
            <TransportButton label="next" onClick={goNext}>
              <SkipForward size={15} fill="currentColor" />
            </TransportButton>
          </div>
          <div className="compact-progress-wrap">
            <input
              type="range"
              min="0"
              max={track.duration}
              defaultValue={elapsedRef.current}
              ref={compactSeekRef}
              onChange={(e) => seekTo(Number(e.target.value))}
              aria-label="progress"
            />
            <div className="compact-time-labels">
              <span ref={compactTimeLabelRef}>{formatTime(elapsedRef.current)}</span>
              <span>{track.durationLabel}</span>
            </div>
          </div>
        </div>
        </div>
      </>
    );
  }

  /* ————————————————— MAIN SHELL ————————————————— */
  return (
    <>
      {persistentAudio}
      <div
      className={`app-shell dark-mode ${ambientMotion ? "motion-on" : "motion-off"} ${
        isPlaying ? "is-playing" : "is-paused"
      } ${
        highContrast ? "high-contrast" : ""
      } ${isRtl ? "rtl-mode" : "ltr-mode"} ${fsTransitioning ? "fs-transitioning" : ""} ${
        windowFocused ? "" : "window-unfocused"
      }`}
      ref={shellRef}
      data-idle={idleMode ? "true" : undefined}
      style={themeStyle}
      dir={isRtl ? "rtl" : "ltr"}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={(event) => {
        if (getUiMode() !== "classic") return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={handleDrop}
    >
      <div className="ambient" aria-hidden="true">
        <img
          src={ambientSrc || track.cover}
          alt=""
          className={ambientBlurFallback ? "ambient-blur-fallback" : undefined}
        />
        <div className="ambient-orb orb-one" />
        <div className="ambient-orb orb-two" />
      </div>

      <header className="titlebar" dir="ltr" data-tauri-drag-region>
        <div className="titlebar-brand" data-tauri-drag-region>
          <button type="button" className="titlebar-logo-button" onClick={handleLogoClick} aria-label={isFullscreen ? "Exit fullscreen" : "Nobody home"} title={isFullscreen ? "Exit fullscreen" : "Nobody home"}>
            <NobodyLuxuryLogo size={22} />
          </button>
          <span data-tauri-drag-region>NOBODY</span>
          <strong className="titlebar-epodonios" data-tauri-drag-region>EPODONIOS</strong>
          <i />
          <small data-tauri-drag-region>{dict.subtitle}</small>
        </div>
        <div className="window-controls">
          <button type="button" className="window-action window-minimize" onClick={() => minimizeDesktopWindow()} aria-label="Minimize" title="Minimize">
            <Minimize2 size={12} />
          </button>
          <button type="button" className={`window-action window-fullscreen ${isFullscreen ? "active" : ""}`} onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
            <Maximize2 size={13} />
          </button>
          <button type="button" className="window-action window-close" onClick={closeWindow} aria-label="Close" title="Close">
            <X size={14} />
          </button>
        </div>
      </header>

      <aside className="sidebar">
        <button className="brand-mark" type="button" onClick={handleLogoClick} aria-label={isFullscreen ? "Exit fullscreen" : "Nobody home"}>
          <NobodyLuxuryLogo size={26} />
        </button>

        <nav className="primary-nav" aria-label="menu">
          {(["focus", "library", "lyrics", "downloads", "contact", "donate"] as Page[]).map((id) => {
            const Icon = NAV_ICONS[id];
            return (
              <button
                key={id}
                type="button"
                className={page === id ? "active" : ""}
                onClick={() => setPage(id)}
                aria-label={dict.nav[id]}
                title={dict.nav[id]}
              >
                <Icon size={20} strokeWidth={1.75} />
                <span>{dict.nav[id]}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          {/* UI switching lives in Settings → Interface (menu icon removed) */}
          <button
            className={`settings-nav ${page === "settings" ? "active" : ""}`}
            type="button"
            onClick={() => setPage("settings")}
            title={dict.nav.settings}
            aria-label={dict.nav.settings}
          >
            <Settings size={20} strokeWidth={1.75} />
            <span>{dict.nav.settings}</span>
          </button>
          {/* Req 4 — Subtle EPODONIOS signature at sidebar base */}
          <div className="sidebar-epodonios-stamp">EPODONIOS ARCHITECTURE</div>
        </div>
      </aside>

      <main className="main-area">
        <div className="page-header">
          <div className="page-title">
            <span>{dict.pageTitles[page]}</span>
            <i />
            <small>{track.artist}</small>
            {track.lrcSource && <span className="auto-lrc-pill">{dict.library.autoLrcBadge}</span>}
          </div>
          <div className="header-actions">
            <div className="search-wrapper">
              <AnimatePresence>
                {searchOpen && (
                  <motion.div
                    className="search-field"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 260, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Search size={15} />
                    <input
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setSearchHighlight(0);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSearchOpen(false);
                          setSearch("");
                        }
                        if (event.key === "ArrowDown") {
                          event.preventDefault();
                          setSearchHighlight((v) => Math.min(v + 1, globalSearchResults.length - 1));
                        }
                        if (event.key === "ArrowUp") {
                          event.preventDefault();
                          setSearchHighlight((v) => Math.max(v - 1, 0));
                        }
                        if (event.key === "Enter" && globalSearchResults[searchHighlight]) {
                          selectSearchResult(globalSearchResults[searchHighlight]);
                        }
                      }}
                      autoFocus
                      placeholder={lang === "fa" ? "جست‌وجوی آهنگ، آرتیست یا آلبوم..." : lang === "tr" ? "Şarkı, sanatçı veya albüm ara..." : lang === "ru" ? "Поиск по треку, исполнителю или альбому..." : "Search track, artist or album..."}
                    />
                    {search && (
                      <button type="button" className="search-clear" onClick={() => setSearch("")} aria-label="Clear">
                        <X size={13} />
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              <IconButton label="search" active={searchOpen} onClick={() => {
                setSearchOpen((value) => !value);
                if (searchOpen) setSearch("");
              }}>
                <Search size={18} />
              </IconButton>

              <AnimatePresence>
                {searchOpen && (
                  <motion.div
                    className="search-dropdown"
                    initial={{ opacity: 0, y: -10, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <div className="search-dropdown-head">
                      <div className="search-head-title">
                        <Sparkles size={13} />
                        <span>
                          {search.trim()
                            ? lang === "fa"
                              ? `${globalSearchResults.length} نتیجه`
                              : lang === "tr"
                                ? `${globalSearchResults.length} sonuç`
                                : lang === "ru"
                                  ? `${globalSearchResults.length} ${ruPlural(globalSearchResults.length, "результат", "результата", "результатов")}`
                                  : `${globalSearchResults.length} results`
                            : lang === "fa"
                              ? "دسترسی سریع"
                              : lang === "tr"
                                ? "Hızlı Erişim"
                                : lang === "ru"
                                  ? "Быстрый доступ"
                                  : "Quick Access"}
                        </span>
                      </div>
                      <span className="search-head-tag">EPODONIOS · {tracks.length} TRACKS</span>
                    </div>

                    <div className="search-dropdown-list">
                      {globalSearchResults.map((result, idx) => {
                        const isPlaying = tracks[trackIndex]?.id === result.id;
                        return (
                          <button
                            type="button"
                            key={result.id}
                            className={`search-result-card ${idx === searchHighlight ? "highlighted" : ""} ${isPlaying ? "is-playing" : ""}`}
                            onMouseEnter={() => setSearchHighlight(idx)}
                            onClick={() => selectSearchResult(result)}
                          >
                            <div className="src-cover">
                              <img src={result.cover} alt="" />
                              {isPlaying && (
                                <span className="src-playing-mark" aria-hidden>
                                  <i /><i /><i />
                                </span>
                              )}
                            </div>
                            <div className="src-info">
                              <strong dir="ltr">{highlightMatch(result.title, search)}</strong>
                              <span dir="ltr">
                                {highlightMatch(result.artist, search)}
                                <em> · </em>
                                {highlightMatch(result.album, search)}
                              </span>
                            </div>
                            <div className="src-meta">
                              <span className="src-format">{shortFormat(result.metadata.format)}</span>
                              <time>{result.durationLabel}</time>
                            </div>
                          </button>
                        );
                      })}

                      {globalSearchResults.length === 0 && (
                        <div className="search-empty-state">
                          <div className="search-empty-icon">
                            <Search size={26} />
                          </div>
                          <strong>
                            {lang === "fa" ? "چیزی پیدا نشد" : lang === "tr" ? "Sonuç bulunamadı" : lang === "ru" ? "Ничего не найдено" : "No matches found"}
                          </strong>
                          <span>
                            {lang === "fa"
                              ? "کلید‌واژه دیگری امتحان کن یا از میان‌بر / برای جست‌وجوی سریع استفاده کن."
                              : lang === "tr"
                                ? "Farklı bir anahtar kelime dene veya / kısayolunu kullan."
                                : lang === "ru"
                                  ? "Попробуйте другое ключевое слово или нажмите / , чтобы искать из любого места."
                                  : "Try a different keyword or use / to focus search anywhere."}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="search-dropdown-foot">
                      <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                      <span><kbd>Enter</kbd> Play</span>
                      <span><kbd>Esc</kbd> Close</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              type="button"
              className="lang-pill-btn"
              onClick={() => setLang(lang === "fa" ? "en" : lang === "en" ? "tr" : lang === "tr" ? "ru" : "fa")}
              title="FA / EN / TR / RU"
            >
              {lang.toUpperCase()}
            </button>
          </div>
        </div>



        <AnimatePresence mode="wait">
          <motion.section
            key={page}
            className="page-content"
            initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(6px)" }}
            transition={{ duration: ambientMotion ? 0.35 : 0 }}
          >
            {page === "focus" && !hasLibrary && (
              <EmptyLibraryWelcome
                onAddFolder={addMusicFolders}
                onAddAudio={addMusicFiles}
                dict={dict}
                lang={lang}
              />
            )}

            {page === "focus" && hasLibrary && (
              <FocusView
                track={track}
                isPlaying={isPlaying}
                setIsPlaying={setIsPlaying}
                setPage={setPage}
                liked={liked}
                toggleLike={() => toggleLike(track.id)}
                dict={dict}
                titleAnim={titleAnim}
                artistFont={artistFont}
              />
            )}

            {page === "library" && (
              <LibraryView
                tracks={tracks}
                currentIndex={trackIndex}
                selectTrack={selectTrack}
                search={search}
                setPage={setPage}
                onAddAudio={addMusicFiles}
                onAddFolder={addMusicFolders}
                urQueueIds={queueIds}
                toggleUrQueue={toggleUrQueue}
                openUrQueue={() => {
                  setActiveQueueTab("urQueue");
                  setQueueOpen(true);
                }}
                playlists={playlists}
                activePlaylistId={activePlaylistId}
                setActivePlaylistId={setActivePlaylistId}
                openCreate={() => setCreateOpen(true)}
                deletePlaylist={deletePlaylist}
                likedIds={likedIds}
                toggleLike={toggleLike}
                openAddToPlaylist={setAddToPlaylistTrack}
                dict={dict}
                lang={lang}
                folderPaths={folderPaths}
                removeFolder={removeMusicFolder}
                rescanFolder={rescanFolder}
                rescanningFolder={rescanningFolder}
                openLrcSync={setLrcSyncFolder}
                openCoverSync={setCoverSyncFolder}
                recentlyPlayedIds={recentlyPlayedIds}
              />
            )}

            {page === "lyrics" && (
              <LyricsView
                track={track}
                lyrics={lyrics}
                activeIndex={activeLyricIndex}
                setElapsed={seekTo}
                lyricRefs={lyricRefs}
                dict={dict}
                lyricStyle={lyricStyle}
                onImport={() => fileInput.current?.click()}
                onManualScroll={() => setLyricManual(true)}
                onLyricsFetched={applyFetchedLyrics}
                onOpenDownloads={() => setPage("downloads")}
              />
            )}

            {page === "downloads" && (
              <DownloadCenter
                tracks={tracks}
                dict={dict}
                lang={lang}
                onLyricsFetched={applyFetchedLyrics}
                onCoverFetched={applyFetchedCover}
                onPlayTrack={(trackId) => {
                  const index = tracks.findIndex((item) => item.id === trackId);
                  if (index >= 0) selectTrack(index);
                }}
              />
            )}

            {page === "contact" && <ContactView dict={dict} artistFont={artistFont} artist={track.artist} />}

            {page === "donate" && (
              <DonateView dict={dict} isPlaying={isPlaying} bpm={track.bpm} equalizerStyle={idleEqualizerStyle} trackId={track.id} />
            )}

            {page === "settings" && (
              <SettingsView
                ambientMotion={ambientMotion}
                setAmbientMotion={setAmbientMotion}
                autoColor={autoColor}
                setAutoColor={setAutoColor}
                highContrast={highContrast}
                setHighContrast={setHighContrast}
                lyricSize={lyricSize}
                setLyricSize={setLyricSize}
                lyricStyle={lyricStyle}
                setLyricStyle={setLyricStyle}
                idleEqualizerStyle={idleEqualizerStyle}
                setIdleEqualizerStyle={setIdleEqualizerStyle}
                compactStyle={compactStyle}
                setCompactStyle={setCompactStyle}
                lang={lang}
                setLang={setLang}
                dict={dict}
              />
            )}
          </motion.section>
        </AnimatePresence>
      </main>

      {idleMode && hasLibrary && (
        <IdleCinemaOverlay
          track={track}
          isPlaying={isPlaying}
          titleAnim={titleAnim}
          artistFont={artistFont}
          equalizerStyle={idleEqualizerStyle}
        />
      )}

      <PlayerBar
        track={track}
        timeRef={timeLabelRef}
        seekRef={mainSeekRef}
        setElapsed={seekTo}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        liked={liked}
        toggleLike={() => toggleLike(track.id)}
        shuffle={shuffle}
        setShuffle={setShuffle}
        repeat={repeat}
        setRepeat={setRepeat}
        volume={volume}
        setVolume={setVolume}
        previousVolume={previousVolume}
        setPreviousVolume={setPreviousVolume}
        goNext={goNext}
        goPrevious={goPrevious}
        queueOpen={queueOpen}
        setQueueOpen={setQueueOpen}
        setIsCompact={setIsCompact}
        dict={dict}
      />

      {/* V1.4.0 (#2) — support nudge: only while this main (non-compact) shell
          is on screen and the idle cinema overlay is off. Fixed + z-60, so it
          sits above content but below every modal layer. */}
      {nudge && !idleMode && (
        <ClassicSupportNudge kind={nudge.kind} dict={dict} onDismiss={dismissNudge} />
      )}

      <AnimatePresence>
        {queueOpen && (
          <QueuePanel
            tracks={tracks}
            currentIndex={trackIndex}
            selectTrack={selectTrack}
            urQueueIds={queueIds}
            toggleUrQueue={toggleUrQueue}
            activeTab={activeQueueTab}
            setActiveTab={setActiveQueueTab}
            close={() => setQueueOpen(false)}
            dict={dict}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createOpen && <CreatePlaylistModal dict={dict} close={() => setCreateOpen(false)} create={createPlaylist} />}
      </AnimatePresence>

      <AnimatePresence>
        {addToPlaylistTrack && (
          <AddToPlaylistModal
            dict={dict}
            track={addToPlaylistTrack}
            playlists={playlists}
            toggle={togglePlaylistTrack}
            openCreate={() => {
              setAddToPlaylistTrack(null);
              setCreateOpen(true);
            }}
            close={() => setAddToPlaylistTrack(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {lrcSyncFolder && (
          <LrcSyncModal
            folder={lrcSyncFolder}
            folderPaths={folderPaths}
            tracks={tracks}
            dict={dict}
            lang={lang}
            close={() => setLrcSyncFolder(null)}
            onLyricsFetched={applyFetchedLyrics}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {coverSyncFolder && (
          <CoverArtSyncModal
            folder={coverSyncFolder}
            folderPaths={folderPaths}
            tracks={tracks}
            dict={dict}
            lang={lang}
            close={() => setCoverSyncFolder(null)}
            onCoverFetched={applyFetchedCover}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dropActive && (
          <motion.div className="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <FolderPlus size={36} />
            <strong>{dict.library.addFolder}</strong>
            <span>{dict.library.addFolderHint}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {fullscreenHint && (
          <motion.div className="fullscreen-hint" initial={{ opacity: 0, y: -18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.96 }}>
            <span className="fullscreen-hint-logo"><NobodyLuxuryLogo size={24} /></span>
            <div><strong>{lang === "fa" ? "حالت تمام‌صفحه فعال شد" : lang === "tr" ? "Tam ekran açıldı" : lang === "ru" ? "Полноэкранный режим включён" : "Fullscreen enabled"}</strong><p>{lang === "fa" ? "برای خروج از تمام‌صفحه روی لوگوی Nobody کلیک کن." : lang === "tr" ? "Tam ekrandan çıkmak için Nobody logosuna tıklayın." : lang === "ru" ? "Чтобы выйти из полноэкранного режима, кликните по логотипу Nobody." : "Click the Nobody logo to exit fullscreen."}</p></div>
            <button type="button" onClick={() => setFullscreenHint(false)} aria-label="Dismiss"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInput} className="visually-hidden" type="file" accept=".lrc,text/plain" onChange={handleFileInput} />
      <input ref={audioInput} className="visually-hidden" type="file" accept="audio/*" multiple onChange={handleFileInput} />
      <input
        ref={folderInput}
        className="visually-hidden"
        type="file"
        /* @ts-expect-error webkitdirectory is a non-standard attribute */
        webkitdirectory="true"
        directory="true"
        multiple
        onChange={handleFileInput}
      />
      </div>
    </>
  );
}

function AlbumArtwork({ track }: { track: Track }) {
  return (
    <motion.div
      className="artwork-wrap"
      layout
      initial={{ scale: 0.94, rotate: -1.2 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="artwork-halo" />
      <img src={track.cover} alt={track.title} />
      <div className="artwork-sheen" />
    </motion.div>
  );
}

/* ————————————————— FOCUS VIEW ————————————————— */
function FocusView({
  track,
  isPlaying,
  setIsPlaying,
  setPage,
  liked,
  toggleLike,
  dict,
  titleAnim,
  artistFont,
}: {
  track: Track;
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
  setPage: (page: Page) => void;
  liked: boolean;
  toggleLike: () => void;
  dict: Dict;
  titleAnim: TitleAnimConfig;
  artistFont: CSSProperties;
}) {
  return (
    <div className="focus-view">
      <motion.div
        className="focus-copy"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -30, filter: "blur(10px)" }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="title-anim-wrapper">
          <h1 className={`focus-title ${titleAnim.className}`} style={titleAnim.style} dir="ltr">
            {track.title}
          </h1>
        </div>

        <p className="focus-artist" style={artistFont} dir="ltr">
          {track.artist}
        </p>

        <div className="focus-actions">
          <button className="primary-action" type="button" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
            {isPlaying ? dict.focus.pause : dict.focus.play}
          </button>
          <button className="text-action" type="button" onClick={() => setPage("lyrics")}>
            <span>{dict.focus.viewLiveLyrics}</span>
            <ChevronLeft size={17} />
          </button>
          <IconButton label={dict.playlists.like} active={liked} onClick={toggleLike}>
            <Heart size={19} fill={liked ? "currentColor" : "none"} />
          </IconButton>
        </div>

        <div className="focus-meta" dir="ltr">
          <span>{track.album}</span>
          <i />
          <span>{track.year}</span>
          <i />
          <span className="meta-epodonios">EPODONIOS MASTER</span>
        </div>
      </motion.div>

      <motion.div className="focus-art" layout transition={{ type: "spring", stiffness: 150, damping: 22 }}>
        <AlbumArtwork track={track} />
      </motion.div>
    </div>
  );
}

/* ————————————————— IDLE CINEMA OVERLAY — completely independent centering ————————————————— */
function IdleCinemaOverlay({
  track,
  isPlaying,
  titleAnim,
  artistFont,
  equalizerStyle,
}: {
  track: Track;
  isPlaying: boolean;
  titleAnim: TitleAnimConfig;
  artistFont: CSSProperties;
  equalizerStyle: "bars" | "wave" | "orbit" | "random";
}) {
  const barCount = equalizerStyle === "orbit" ? 16 : 24;
  /* PHASE-2 PERF FIX: bars are driven by direct DOM writes (see useBeatVisualizer) */
  const equalizerRef = useBeatVisualizer(barCount, isPlaying, track.bpm);

  // "Random" picks a style per track (stable for as long as this track is
  // playing — derived from the track's own id, not re-rolled on every
  // render/tick) rather than jittering between styles every frame.
  const resolvedStyle = useMemo(() => {
    if (equalizerStyle !== "random") return equalizerStyle;
    const variants: Array<"bars" | "wave" | "orbit"> = ["bars", "wave", "orbit"];
    return variants[Math.abs(stableIdFromPath(String(track.id))) % variants.length];
  }, [equalizerStyle, track.id]);

  return (
    <motion.div
      className="idle-cinema-overlay"
      initial={{ opacity: 0, filter: "blur(18px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="idle-cinema-core"
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.98 }}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="idle-cinema-art">
          <AlbumArtwork track={track} />
        </div>

        <div className="idle-caption">
          <h2 className={`idle-title ${titleAnim.className}`} style={titleAnim.style} dir="ltr">
            {track.title}
          </h2>
          <p className="idle-artist" style={artistFont} dir="ltr">
            {track.artist}
          </p>
          <div ref={equalizerRef} className={`idle-beat-equalizer style-${resolvedStyle}`} aria-hidden="true">
            {Array.from({ length: barCount }, (_, i) => (
              <span key={i} style={{ "--angle": `${(360 / barCount) * i}deg` } as CSSProperties} />
            ))}
          </div>
          <div className="idle-epodonios-stamp">PROJECTION BY EPODONIOS ARCHITECTURE</div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ————————————————— EMPTY LIBRARY WELCOME (production first-run) ————————————————— */
function EmptyLibraryWelcome({
  onAddFolder,
  onAddAudio,
  dict,
  lang,
}: {
  onAddFolder: () => void;
  onAddAudio: () => void;
  dict: Dict;
  lang: Language;
}) {
  const copy =
    lang === "fa"
      ? {
          tag: "به Nobody خوش آمدی",
          title: "کتابخانه‌ات خالی است",
          desc: "برای شروع، پوشه موسیقی خود را وارد کن. Nobody به‌صورت خودکار کاور داخلی، متادیتا و فایل‌های .lrc همنام را پیدا و متصل می‌کند.",
          hint: "می‌توانی فایل‌ها را مستقیماً داخل پنجره رها کنی (Drag & Drop)",
        }
      : lang === "tr"
        ? {
            tag: "Nobody'ye hoş geldin",
            title: "Kütüphanen boş",
            desc: "Başlamak için müzik klasörünü içe aktar. Nobody gömülü kapakları, metadatayı ve aynı isimli .lrc dosyalarını otomatik eşleştirir.",
            hint: "Dosyaları doğrudan pencereye sürükleyip bırakabilirsin",
          }
        : lang === "ru"
          ? {
              tag: "Добро пожаловать в Nobody",
              title: "Ваша библиотека пуста",
              desc: "Импортируйте папку с музыкой, чтобы начать. Nobody автоматически извлекает встроенные обложки и метаданные и подхватывает одноимённые файлы .lrc.",
              hint: "Файлы можно просто перетащить прямо в окно (Drag & Drop)",
            }
          : {
            tag: "Welcome to Nobody",
            title: "Your library is empty",
            desc: "Import your music folder to begin. Nobody automatically extracts embedded cover art, metadata and matches same-name .lrc lyric files.",
            hint: "You can also drag & drop files straight into the window",
          };

  return (
    <div className="empty-library-view">
      <motion.div
        className="empty-library-card"
        initial={{ opacity: 0, y: 26, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="elw-orb" aria-hidden />

        <motion.div
          className="elw-logo"
          animate={{ y: [0, -9, 0] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
        >
          <NobodyLuxuryLogo size={60} />
        </motion.div>

        <span className="elw-tag">{copy.tag}</span>
        <h1>{copy.title}</h1>
        <p>{copy.desc}</p>

        <div className="elw-actions">
          <button type="button" className="primary-action" onClick={onAddFolder}>
            <FolderPlus size={18} />
            <span>{dict.library.addFolder}</span>
          </button>
          <button type="button" className="text-action" onClick={onAddAudio}>
            <Plus size={17} />
            <span>{dict.library.addMusic}</span>
          </button>
        </div>

        <div className="elw-hint">
          <Info size={13} />
          <span>{copy.hint}</span>
        </div>

        <div className="elw-formats">
          {["MP3", "FLAC", "WAV", "OGG", "M4A", "AAC", "OPUS", "WMA"].map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>

        <div className="elw-footer">EPODONIOS AUDIO ARCHITECTURE</div>
      </motion.div>
    </div>
  );
}

/* ————————————————— LIBRARY + PLAYLISTS ————————————————— */
function LibraryView({
  tracks,
  currentIndex,
  selectTrack,
  search,
  setPage,
  onAddAudio,
  onAddFolder,
  urQueueIds,
  toggleUrQueue,
  openUrQueue,
  playlists,
  activePlaylistId,
  setActivePlaylistId,
  openCreate,
  deletePlaylist,
  likedIds,
  toggleLike,
  openAddToPlaylist,
  dict,
  lang,
  folderPaths,
  removeFolder,
  rescanFolder,
  rescanningFolder,
  openLrcSync,
  openCoverSync,
  recentlyPlayedIds,
}: {
  tracks: Track[];
  currentIndex: number;
  selectTrack: (index: number) => void;
  search: string;
  setPage: (page: Page) => void;
  onAddAudio: () => void;
  onAddFolder: () => void;
  urQueueIds: number[];
  toggleUrQueue: (id: number) => void;
  openUrQueue: () => void;
  playlists: Playlist[];
  activePlaylistId: string;
  setActivePlaylistId: (id: string) => void;
  openCreate: () => void;
  deletePlaylist: (id: string) => void;
  likedIds: number[];
  toggleLike: (id: number) => void;
  openAddToPlaylist: (track: Track) => void;
  dict: Dict;
  lang: Language;
  folderPaths: string[];
  removeFolder: (folder: string) => void;
  rescanFolder: (folder: string) => void;
  rescanningFolder: string | null;
  openLrcSync: (folder: string) => void;
  openCoverSync: (folder: string) => void;
  recentlyPlayedIds: number[];
}) {
  const [libraryTab, setLibraryTab] = useState<"music" | "recents" | "folders">("music");
  const [activeFolderFilter, setActiveFolderFilter] = useState<string | null>(null);
  const activePlaylist = playlists.find((p) => p.id === activePlaylistId);
  const folderScoped = activeFolderFilter ? tracks.filter((t) => t.folderPath === activeFolderFilter) : tracks;
  const scoped = activePlaylist ? folderScoped.filter((t) => activePlaylist.trackIds.includes(t.id)) : folderScoped;
  const filteredTracks = scoped.filter((t) =>
    `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(search.toLowerCase()),
  );

  const current = tracks[currentIndex] || tracks[0] || PLACEHOLDER_TRACK;
  const trackQuote = getTrackQuote(current.id || currentIndex);
  const playlistName = (pl: Playlist) => (pl.system === "liked" ? dict.playlists.likedName : pl.name);
  const recents = recentlyPlayedIds
    .map((id) => tracks.find((t) => t.id === id))
    .filter((t): t is Track => Boolean(t))
    .slice(0, 12);

  /* PHASE-2 PERF FIX: O(1) id→index lookups — the old per-row findIndex made
     rendering O(n²) (~250,000 comparisons per render on a 500-track library). */
  const indexById = useMemo(() => {
    const map = new Map<number, number>();
    tracks.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [tracks]);

  return (
    <div className="library-view">
      <div className="library-quote-card">
        <div className="quote-left">
          <Sparkles size={18} className="quote-icon" />
          <div className="quote-text-wrap">
            <blockquote key={trackQuote.id}>
              “{lang === "fa" ? trackQuote.fa : lang === "tr" ? trackQuote.tr : lang === "ru" ? trackQuote.ru ?? trackQuote.en : trackQuote.en}”
            </blockquote>
            <cite>
              —{" "}
              {lang === "fa" ? trackQuote.authorFa : lang === "tr" ? trackQuote.authorTr : lang === "ru" ? trackQuote.authorRu ?? trackQuote.authorEn : trackQuote.authorEn}
            </cite>
          </div>
        </div>
      </div>

      <div className="library-tabs" role="tablist" aria-label="Library views">
        <button
          type="button"
          role="tab"
          aria-selected={libraryTab === "music"}
          className={libraryTab === "music" ? "active" : ""}
          onClick={() => setLibraryTab("music")}
        >
          <ListMusic size={15} />
          <span>{lang === "fa" ? "موزیک" : lang === "tr" ? "Müzik" : lang === "ru" ? "Музыка" : "Music"}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={libraryTab === "recents"}
          className={libraryTab === "recents" ? "active" : ""}
          onClick={() => setLibraryTab("recents")}
        >
          <AudioLines size={15} />
          <span>{lang === "fa" ? "آخرین پخش‌ها" : lang === "tr" ? "Son Çalınanlar" : lang === "ru" ? "Недавние" : "Recents"}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={libraryTab === "folders"}
          className={libraryTab === "folders" ? "active" : ""}
          onClick={() => setLibraryTab("folders")}
        >
          <FolderPlus size={15} />
          <span>{lang === "fa" ? "فولدرها" : lang === "tr" ? "Klasörler" : lang === "ru" ? "Папки" : "Folders"}</span>
          {folderPaths.length > 0 && <small>{folderPaths.length}</small>}
        </button>
      </div>

      {libraryTab === "music" && (
        <>
      <div className="playlist-section">
        <div className="playlist-head">
          <h3>
            <ListMusic size={16} />
            <span>{dict.playlists.sectionTitle}</span>
          </h3>
          <button type="button" className="playlist-create-btn" onClick={openCreate}>
            <Plus size={15} />
            <span>{dict.playlists.createBtn}</span>
          </button>
        </div>

        <motion.div
          className="playlist-rail"
          layout
          onWheel={(event) => {
            if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
              event.currentTarget.scrollLeft += event.deltaY;
            }
          }}
        >
          <motion.button
            layout
            type="button"
            className={`playlist-card ${activePlaylistId === "all" ? "active" : ""}`}
            onClick={() => setActivePlaylistId("all")}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.97 }}
            style={{ "--pl-color": "#8b8b95", "--pl-color-soft": "rgba(139,139,149,.18)" } as CSSProperties}
          >
            <span className="pl-emoji">✺</span>
            <strong>{dict.playlists.allTracks}</strong>
            <small>
              {tracks.length} {dict.playlists.tracks}
            </small>
          </motion.button>

          <AnimatePresence initial={false}>
            {playlists.map((pl) => (
              <motion.button
                layout
                key={pl.id}
                type="button"
                className={`playlist-card ${activePlaylistId === pl.id ? "active" : ""} ${
                  pl.system === "liked" ? "liked-card" : ""
                }`}
                onClick={() => setActivePlaylistId(pl.id)}
                initial={{ opacity: 0, scale: 0.85, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: -12 }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  "--pl-color": pl.color ?? "#ef4c78",
                  "--pl-color-soft": `color-mix(in srgb, ${pl.color ?? "#ef4c78"} 22%, transparent)`,
                } as CSSProperties}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
              >
                <span className="pl-emoji">{pl.system === "liked" ? "♥" : pl.emoji ?? "✧"}</span>
                <strong>{playlistName(pl)}</strong>
                <small>
                  {pl.trackIds.length} {dict.playlists.tracks}
                </small>
                {!pl.system && (
                  <span
                    className="pl-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePlaylist(pl.id);
                    }}
                    title={dict.playlists.remove}
                  >
                    <Trash2 size={12} />
                  </span>
                )}
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      <div className="section-heading">
        <div>
          <h2>{activePlaylist ? playlistName(activePlaylist) : dict.playlists.allTracks}</h2>
          {activeFolderFilter && (
            <div className="folder-filter-chip">
              <FolderPlus size={12} />
              <span title={activeFolderFilter}>
                {lang === "fa" ? "فیلتر پوشه:" : lang === "tr" ? "Klasör filtresi:" : lang === "ru" ? "Фильтр папки:" : "Folder filter:"}{" "}
                {activeFolderFilter.split(/[\\/]/).filter(Boolean).pop() || activeFolderFilter}
              </span>
              <button
                type="button"
                onClick={() => setActiveFolderFilter(null)}
                aria-label={lang === "fa" ? "حذف فیلتر پوشه" : lang === "tr" ? "Klasör filtresini kaldır" : lang === "ru" ? "Сбросить фильтр папки" : "Clear folder filter"}
                title={lang === "fa" ? "نمایش همه آهنگ‌ها" : lang === "tr" ? "Tüm şarkıları göster" : lang === "ru" ? "Показать все треки" : "Show all tracks"}
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="library-buttons-row">
          <button className="primary-folder-btn" type="button" onClick={onAddFolder}>
            <FolderPlus size={17} />
            <span>{dict.library.addFolder}</span>
          </button>
          <button className="text-action" type="button" onClick={onAddAudio}>
            <Plus size={17} />
            <span>{dict.library.addMusic}</span>
          </button>
        </div>
      </div>

      <div className="folder-hint-bar">
        <Info size={14} />
        <span>{dict.library.addFolderHint}</span>
      </div>

      {false && folderPaths.length > 0 && (
        <div className="folder-manager">
          <div className="folder-manager-title">
            <FolderPlus size={14} />
            <span>{lang === "fa" ? "فولدرهای موسیقی" : lang === "tr" ? "Müzik Klasörleri" : lang === "ru" ? "Музыкальные папки" : "Music Folders"}</span>
            <small>{folderPaths.length}</small>
          </div>
          <div className="folder-manager-list">
            {folderPaths.map((folder) => (
              <div className="folder-manager-item" key={folder} title={folder}>
                <span>{folder.split(/[\\/]/).pop() || folder}</span>
                <button type="button" onClick={() => removeFolder(folder)} aria-label="Remove folder">
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="track-table" role="table">
        <div className="track-row track-header" role="row">
          <span>{dict.library.colNum}</span>
          <span>{dict.library.colTitle}</span>
          <span>{dict.library.colAlbum}</span>
          <span>FORMAT</span>
          <span>{dict.library.colTime}</span>
          <span />
        </div>

        {filteredTracks.map((item) => {
            const idx = indexById.get(item.id) ?? 0;
            const active = idx === currentIndex;
            const inQueue = urQueueIds.includes(item.id);
            const isLiked = likedIds.includes(item.id);

            return (
              <div
                key={item.id}
                className={`track-row-wrapper ${active ? "current" : ""}`}
                onClick={() => selectTrack(idx)}
              >
                <div className="track-row">
                  <span className="track-number">
                    {active ? <AudioLines size={16} /> : String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="track-title-cell">
                    <img src={item.cover} alt="" />
                    <span>
                      <strong>
                        {item.title}
                        {item.lrcSource && <small className="lrc-badge">LRC</small>}
                      </strong>
                      <small>{item.artist}</small>
                    </span>
                  </span>
                  <span>{item.album}</span>
                  <span className="format-chip">{shortFormat(item.metadata.format)}</span>
                  <span className="track-duration-cell" dir="ltr">{item.durationLabel}</span>
                  <div className="track-actions-cell" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className={`row-icon-btn ${isLiked ? "liked" : ""}`}
                      onClick={() => toggleLike(item.id)}
                      title={dict.playlists.like}
                    >
                      <Heart size={14} fill={isLiked ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      className="row-icon-btn"
                      onClick={() => openAddToPlaylist(item)}
                      title={dict.playlists.addTo}
                    >
                      <ListPlus size={15} />
                    </button>
                    <button
                      type="button"
                      className={`ur-queue-btn ${inQueue ? "added" : ""}`}
                      onClick={() => {
                        toggleUrQueue(item.id);
                        if (!inQueue) openUrQueue();
                      }}
                      title={inQueue ? dict.library.inUrQueue : dict.library.addToUrQueue}
                    >
                      {inQueue ? <Check size={12} /> : <Plus size={12} />}
                      <span>Ur Queue</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {!filteredTracks.length && (
        <div className="empty-state">
          <Star size={28} />
          <strong>{activePlaylist ? dict.playlists.empty : dict.library.noResults}</strong>
          <span>{dict.library.noResultsDesc}</span>
        </div>
      )}

      <button className="library-lyric-link" type="button" onClick={() => setPage("lyrics")}>
        <Mic2 size={19} />
        <span>{dict.library.viewSyncedLyrics}</span>
      </button>

      <div className="library-epodonios-footer">EPODONIOS MUSIC REPOSITORY • ULTRA FIDELITY AUDIO</div>
        </>
      )}

      {libraryTab === "recents" && (
        <div className="recents-tab-panel">
          <div className="folder-tab-heading">
            <div>
              <span className="overline">EPODONIOS RECENT LISTENS</span>
              <h2>{lang === "fa" ? "آخرین پخش‌ها" : lang === "tr" ? "Son Çalınanlar" : lang === "ru" ? "Недавние прослушивания" : "Recent Plays"}</h2>
              <p>{lang === "fa" ? "آخرین آهنگ‌هایی که در Nobody پخش کرده‌ای؛ با دسترسی سریع و چیدمان تصویری." : lang === "tr" ? "Nobody içinde en son çaldığınız parçalar — hızlı erişim için görsel bir ızgara." : lang === "ru" ? "Недавно проигранные в Nobody треки — наглядная сетка для быстрого доступа." : "The most recently played tracks in Nobody, arranged as a visual quick-access grid."}</p>
            </div>
          </div>

          {recents.length ? (
            <div className="recents-grid">
              {recents.map((item) => {
                const idx = indexById.get(item.id) ?? 0;
                return (
                  <button key={item.id} className="recent-card" onClick={() => selectTrack(idx)}>
                    <img src={item.cover} alt="" />
                    <div className="recent-info">
                      <strong>{item.title}</strong>
                      <span>{item.artist}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="folder-empty-state">
              <AudioLines size={32} />
              <strong>{lang === "fa" ? "هنوز چیزی پخش نشده" : lang === "tr" ? "Henüz bir şey çalınmadı" : lang === "ru" ? "Здесь пока ничего не играло" : "Nothing has been played yet"}</strong>
              <p>{lang === "fa" ? "وقتی شروع به پخش آهنگ‌ها کنی اینجا آخرین آهنگ‌هایت نمایش داده می‌شوند." : lang === "tr" ? "Müzik çalmaya başladığınızda son çalınanlar burada görünür." : lang === "ru" ? "Запустите музыку — и последние треки появятся здесь." : "Start playing music and your most recent tracks will appear here."}</p>
            </div>
          )}
        </div>
      )}

      {libraryTab === "folders" && (
        <div className="folder-tab-panel">
          <div className="folder-tab-heading">
            <div>
              <span className="overline">EPODONIOS LIBRARY SOURCES</span>
              <h2>{lang === "fa" ? "فولدرهای موسیقی" : lang === "tr" ? "Müzik Klasörleri" : lang === "ru" ? "Музыкальные папки" : "Music Folders"}</h2>
              <p>{lang === "fa" ? "فولدرهای متصل را مدیریت کن؛ Nobody مسیرها را در اجرای بعدی هم به خاطر می‌سپارد." : lang === "tr" ? "Bağlı klasörleri yönetin; Nobody bu yolları sonraki açılışta da hatırlar." : lang === "ru" ? "Управляйте подключёнными папками — Nobody запомнит эти пути и при следующем запуске." : "Manage connected folders. Nobody remembers these sources on your next launch."}</p>
            </div>
            <button className="primary-folder-btn" type="button" onClick={onAddFolder}>
              <FolderPlus size={17} />
              <span>{dict.library.addFolder}</span>
            </button>
          </div>

          {folderPaths.length ? (
            <div className="folder-cards-grid">
              {folderPaths.map((folder, index) => {
                const folderTracks = tracks.filter((item) => item.folderPath === folder);
                const folderName = folder.split(/[\\/]/).filter(Boolean).pop() || folder;
                return (
                  <motion.article
                    key={folder}
                    className={`folder-source-card ${activeFolderFilter === folder ? "active" : ""}`}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.05, 0.35) }}
                    onClick={() => {
                      setActiveFolderFilter(folder);
                      setActivePlaylistId("all");
                      setLibraryTab("music");
                    }}
                    role="button"
                    tabIndex={0}
                    title={lang === "fa" ? "برای نمایش فقط آهنگ‌های این پوشه کلیک کن" : lang === "tr" ? "Yalnızca bu klasörün şarkılarını görmek için tıklayın" : lang === "ru" ? "Кликните, чтобы показать только треки этой папки" : "Click to show only this folder's tracks"}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setActiveFolderFilter(folder);
                      setActivePlaylistId("all");
                      setLibraryTab("music");
                    }}
                  >
                    <div className="folder-source-icon"><FolderPlus size={27} /></div>
                    <div className="folder-source-content">
                      <strong>{folderName}</strong>
                      <span title={folder}>{folder}</span>
                      <small>{folderTracks.length} {dict.playlists.tracks} · AUTO LRC SYNC</small>
                    </div>
                    <div className="folder-source-actions">
                      <button
                        type="button"
                        className="folder-source-cover"
                        onClick={(event) => {
                          event.stopPropagation();
                          openCoverSync(folder);
                        }}
                        title={lang === "fa" ? "دانلود خودکار کاور آلبوم برای این پوشه" : lang === "ru" ? "Скачать обложки альбомов для этой папки" : "Download cover art for this folder"}
                      >
                        <ImageIcon size={15} />
                      </button>
                      <button
                        type="button"
                        className="folder-source-lrc"
                        onClick={(event) => {
                          event.stopPropagation();
                          openLrcSync(folder);
                        }}
                        title={lang === "fa" ? "دانلود لیریک همگام برای این پوشه" : lang === "tr" ? "Bu klasör için senkronize söz indir" : lang === "ru" ? "Скачать синхронизированный текст для этой папки" : "Download synced lyrics for this folder"}
                      >
                        <Download size={15} />
                      </button>
                      <button
                        type="button"
                        className={`folder-source-rescan ${rescanningFolder === folder ? "spinning" : ""}`}
                        disabled={rescanningFolder === folder}
                        onClick={(event) => {
                          event.stopPropagation();
                          rescanFolder(folder);
                        }}
                        title={lang === "fa" ? "اسکن مجدد این پوشه" : lang === "tr" ? "Bu klasörü yeniden tara" : lang === "ru" ? "Пересканировать эту папку" : "Re-scan this folder"}
                      >
                        <RefreshCw size={15} />
                      </button>
                      <button
                        type="button"
                        className="folder-source-remove"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeFolder(folder);
                        }}
                        title="Remove folder"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          ) : (
            <div className="folder-empty-state">
              <FolderPlus size={32} />
              <strong>{lang === "fa" ? "هنوز فولدری اضافه نشده" : lang === "tr" ? "Henüz klasör eklenmedi" : lang === "ru" ? "Пока не добавлено ни одной папки" : "No folders added yet"}</strong>
              <p>{lang === "fa" ? "یک فولدر را انتخاب کن تا آهنگ‌ها، کاورها و فایل‌های LRC به طور خودکار خوانده شوند." : lang === "tr" ? "Müzik, kapak ve LRC dosyalarını otomatik okumak için bir klasör seçin." : lang === "ru" ? "Выберите папку — Nobody автоматически подхватит музыку, обложки и подходящие LRC-файлы." : "Choose a folder and Nobody will scan music, covers and matching LRC files automatically."}</p>
              <button className="primary-action" type="button" onClick={onAddFolder}>
                <FolderPlus size={17} />
                <span>{dict.library.addFolder}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* PHASE-2 PERF FIX: memoized lyric line — when the active line changes during
   playback only the few lines whose active/distance props actually changed
   re-render, instead of React reconciling the entire (200+ line) list.
   LYRIC THEATRE REDESIGN: every line is a "station" on the playback spine —
   a resting dot per line, a glowing one for the active line, a timestamp
   chip revealed on hover/active, and a passed state for lines already sung. */
const LyricLineButton = memo(function LyricLineButton({
  line,
  idx,
  active,
  distance,
  passed,
  lyricRefs,
  onSeek,
}: {
  line: LyricLine;
  idx: number;
  active: boolean;
  distance: number;
  passed: boolean;
  lyricRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>;
  onSeek: (value: number) => void;
}) {
  return (
    <button
      type="button"
      ref={(node) => {
        lyricRefs.current[idx] = node;
      }}
      className={`lyric-line ${active ? "active" : ""} ${passed ? "passed" : ""} ${distance > 3 ? "far" : ""}`}
      onClick={() => onSeek(line.time)}
    >
      <span className="lyric-line-time" dir="ltr" aria-hidden="true">
        {formatTime(line.time)}
      </span>
      <span className="lyric-line-dot" aria-hidden="true" />
      <span className="lyric-line-text" dir="auto">
        {line.text}
      </span>
    </button>
  );
});

/* ————————————————— LYRICS · THE LYRIC THEATRE —————————————————
   Complete redesign: the lyrics page is no longer a dark panel floating on
   the ambient (the old solid #0c0a0e toolbar/fade bars painted visible
   rectangles with hard edges — the "split line" bug). Everything is now
   full-bleed and transparent; fading is done exclusively with masks; the
   floating controls live in a soft glass pill; the artwork sits on a vinyl
   pedestal with a rotating halo; empty state is an orbital "void" stage
   with one-tap Import / LRCLIB auto-find / Download Center actions. */
type AutoFindState = "idle" | "loading" | "applied" | "plain" | "none" | "error";

function LyricsView({
  track,
  lyrics,
  activeIndex,
  setElapsed,
  lyricRefs,
  dict,
  lyricStyle,
  onImport,
  onManualScroll,
  onLyricsFetched,
  onOpenDownloads,
}: {
  track: Track;
  lyrics: LyricLine[];
  activeIndex: number;
  setElapsed: (value: number) => void;
  lyricRefs: MutableRefObject<Record<number, HTMLButtonElement | null>>;
  dict: Dict;
  lyricStyle: "classic" | "karaoke" | "minimal";
  onImport: () => void;
  onManualScroll: () => void;
  onLyricsFetched: (trackId: number, lyrics: LyricLine[], sourceLabel: string) => void;
  onOpenDownloads: () => void;
}) {
  const showFallbackCard = track.isFallbackLyric || (lyrics.length <= 1 && lyrics[0]?.text === track.title);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isLyricFullscreen, setIsLyricFullscreen] = useState(false);
  /* Electron: element.requestFullscreen() is unreliable inside a transparent
   * frameless window (silently rejected — reported as "the lyrics fullscreen
   * button does nothing"). We drive the native WINDOW fullscreen instead and
   * mirror it onto the stage with the .lyric-stage-windowfs class, which the
   * stylesheet maps to the exact same :fullscreen presentation. */
  const [windowFs, setWindowFs] = useState(false);
  const fsEnteredHere = useRef(false);
  const [lyricFsTransitioning, setLyricFsTransitioning] = useState(false);
  const theatreFs = isLyricFullscreen || windowFs;
  const [isScrolling, setIsScrolling] = useState(false);
  /* Auto-find status is tracked per track id — switching tracks always
     reads as "idle" without any effect/ref manipulation (derived state). */
  const [autoFindRun, setAutoFindRun] = useState<{ id: number; state: AutoFindState }>(() => ({
    id: track.id,
    state: "idle",
  }));
  const autoFind: AutoFindState = autoFindRun.id === track.id ? autoFindRun.state : "idle";
  const setAutoFind = (state: AutoFindState) => setAutoFindRun({ id: track.id, state });
  const scrollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => setIsLyricFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  // If the window left fullscreen by any other path (F11, window button),
  // the lyric window-fs mirror must follow — one-way sync, Electron only.
  useEffect(() => {
    if (!isElectron()) return;
    return onElectronWindowState((state) => {
      if (!state.fullscreen) {
        fsEnteredHere.current = false;
        setWindowFs(false);
      }
    });
  }, []);

  /* One-tap synced-lyrics lookup for the current track (LRCLIB.net). */
  const runAutoFind = async () => {
    if (autoFind === "loading") return;
    setAutoFind("loading");
    try {
      const result = await fetchLrclibLyrics({
        trackName: track.title,
        artistName: track.artist,
        albumName: track.album,
        duration: track.duration,
      });
      if (result?.syncedLyrics) {
        const parsed = parseLrc(result.syncedLyrics);
        if (parsed.length) {
          onLyricsFetched(track.id, parsed, "LRCLIB.net");
          setAutoFind("applied");
          return;
        }
      }
      setAutoFind(result?.plainLyrics ? "plain" : "none");
    } catch {
      setAutoFind("error");
    }
  };

  const enterLyricFullscreen = async () => {
    const el = stageRef.current;
    if (!el) return;
    setLyricFsTransitioning(true);
    await new Promise((resolve) => window.setTimeout(resolve, 190));
    if (isElectron()) {
      /* Deterministic window-level fullscreen: the element API silently
       * rejects inside the transparent frameless window. If the window is
       * ALREADY fullscreen we only take the stage over visually. */
      try {
        const st = await window.electronAPI!.getState();
        if (!st.fullscreen) {
          await toggleDesktopFullscreen(false);
          fsEnteredHere.current = true;
        }
        setWindowFs(true);
      } catch {
        /* fall through — theatre stays as-is */
      }
    } else if (document.fullscreenElement) {
      await document.exitFullscreen?.().catch(() => undefined);
    } else {
      await el.requestFullscreen?.().catch(() => undefined);
    }
    requestAnimationFrame(() => setLyricFsTransitioning(false));
  };

  const exitLyricFullscreen = async () => {
    setLyricFsTransitioning(true);
    await new Promise((resolve) => window.setTimeout(resolve, 190));
    if (isElectron()) {
      /* Only restore the window when THIS stage is what fullscreened it —
         otherwise (window was already fullscreen) just drop the mirror. */
      if (fsEnteredHere.current) {
        await toggleDesktopFullscreen(true);
        fsEnteredHere.current = false;
      }
      setWindowFs(false);
    } else {
      await document.exitFullscreen?.().catch(() => undefined);
    }
    requestAnimationFrame(() => setLyricFsTransitioning(false));
  };

  const handleScroll = () => {
    onManualScroll();
    setIsScrolling(true);
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(() => setIsScrolling(false), 900);
  };

  return (
    <div className="lyrics-view">
      {/* —— Side stage: the artwork on a vinyl pedestal + identity + quick actions —— */}
      <aside className="lyric-side">
        <div className="lyric-vinyl">
          <span className="vinyl-halo" aria-hidden="true" />
          <span className="vinyl-ring" aria-hidden="true" />
          <div className="vinyl-disc">
            <img src={track.cover} alt={track.title} />
            <span className="vinyl-spindle" aria-hidden="true" />
          </div>
          <div className="vinyl-reflection" aria-hidden="true">
            <img src={track.cover} alt="" />
          </div>
        </div>

        <div className="lyric-identity">
          <h2 dir="ltr">{track.title}</h2>
          <p dir="ltr">
            {track.artist} <span>/</span> {track.album}
          </p>
          <div className="lyric-chips" dir="ltr">
            <span className="lyric-chip source">
              <Mic2 size={12} />
              {track.lrcSource ? dict.lyrics.externalLrcActive : dict.lyrics.nobodySync}
            </span>
            <span className="lyric-chip count">
              {lyrics.length} {dict.lyrics.linesUnit}
            </span>
          </div>
        </div>

        <div className="lyric-side-actions">
          <button type="button" onClick={onImport}>
            <Upload size={14} />
            <span>{dict.lyrics.loadLrcBtn}</span>
          </button>
          <button type="button" onClick={onOpenDownloads}>
            <Download size={14} />
            <span>{dict.nav.downloads}</span>
          </button>
        </div>
      </aside>

      {/* —— The theatre: a borderless, full-bleed stage. No solid bars anywhere —
             top/bottom fading is handled purely by the scroll mask. —— */}
      <motion.div
        ref={stageRef}
        className={`lyric-theatre style-${lyricStyle} ${theatreFs ? "lyric-stage-fullscreen" : ""} ${windowFs ? "lyric-stage-windowfs" : ""} ${lyricFsTransitioning ? "fs-transitioning" : ""}`}
        layout
        transition={{ type: "spring", stiffness: 220, damping: 30, mass: 0.9 }}
      >
        <AnimatePresence>
          {theatreFs && (
            <motion.div
              className="lyric-stage-glow"
              aria-hidden
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.6 }}
            />
          )}
        </AnimatePresence>

        <header className="lyric-float-head">
          <div className="lfh-now" dir="ltr">
            <img src={track.cover} alt="" />
            <div className="lfh-meta">
              <strong>{track.title}</strong>
              <span>{track.artist}</span>
            </div>
          </div>
          <div className="lfh-status">
            <span className="lfh-pulse" aria-hidden="true" />
            <span className="lfh-source">{track.lrcSource ? dict.lyrics.externalLrcActive : dict.lyrics.nobodySync}</span>
            <em dir="ltr">
              {lyrics.length} {dict.lyrics.linesUnit}
            </em>
          </div>
          <div className="lfh-actions">
            {showFallbackCard && (
              <button type="button" className="lfh-btn" onClick={onImport} title={dict.lyrics.loadLrcBtn} aria-label={dict.lyrics.loadLrcBtn}>
                <Upload size={14} />
              </button>
            )}
            {!theatreFs ? (
              <button
                type="button"
                className="lfh-btn"
                onClick={enterLyricFullscreen}
                title="Enter Fullscreen"
                aria-label="Enter fullscreen"
              >
                <Expand size={15} />
              </button>
            ) : (
              <button type="button" className="lfh-exit" onClick={exitLyricFullscreen} title="Exit Fullscreen">
                <X size={15} />
                <span>EXIT</span>
              </button>
            )}
          </div>
        </header>

        {showFallbackCard ? (
          <div className="lyric-void" role="status">
            <div className="void-orbit" aria-hidden="true">
              <span className="orbit-ring ring-a" />
              <span className="orbit-ring ring-b" />
              <span className="orbit-dot dot-a" />
              <span className="orbit-dot dot-b" />
              <div className="void-core">
                <img src={track.cover} alt="" />
              </div>
            </div>

            <span className="void-kicker">PURE SONIC EXPERIENCE</span>
            <h3 className="void-title">{dict.lyrics.voidTitle}</h3>
            <p className="void-desc">{dict.lyrics.noSyncedLyricsDesc}</p>

            <div className="void-actions">
              <button type="button" className="void-primary" onClick={onImport}>
                <Upload size={15} />
                <span>{dict.lyrics.loadLrcBtn}</span>
              </button>
              <button type="button" className="void-secondary" onClick={runAutoFind} disabled={autoFind === "loading"}>
                {autoFind === "loading" ? <Loader2 size={15} className="void-spinner" /> : <Sparkles size={15} />}
                <span>{autoFind === "loading" ? dict.lyrics.autoFindLoading : dict.lyrics.autoFindAction}</span>
              </button>
              <button type="button" className="void-link" onClick={onOpenDownloads}>
                <Download size={14} />
                <span>{dict.nav.downloads}</span>
              </button>
            </div>

            <AnimatePresence>
              {autoFind !== "idle" && autoFind !== "loading" && (
                <motion.p
                  key={autoFind}
                  className={`void-status is-${autoFind}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  aria-live="polite"
                >
                  {autoFind === "applied" && dict.lyrics.autoFindApplied}
                  {autoFind === "plain" && dict.lyrics.autoFindPlain}
                  {autoFind === "none" && dict.lyrics.autoFindNone}
                  {autoFind === "error" && dict.lyrics.autoFindError}
                </motion.p>
              )}
            </AnimatePresence>

            <div className="void-wave" aria-hidden="true">
              {[...Array(24)].map((_, i) => (
                <i
                  key={i}
                  style={
                    {
                      "--wave-delay": `${i * 0.13}s`,
                      "--wave-height": `${16 + ((i * 17) % 70)}%`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </div>
        ) : (
          <div className={`lyrics-scroll ${isScrolling ? "is-scrolling" : ""}`} onWheel={handleScroll} onScroll={handleScroll}>
            <div className="lyric-spacer" />
            {lyrics.map((line, idx) => (
              <LyricLineButton
                key={`${line.time}-${idx}`}
                line={line}
                idx={idx}
                active={activeIndex === idx}
                distance={Math.abs(activeIndex - idx)}
                passed={idx < activeIndex}
                lyricRefs={lyricRefs}
                onSeek={setElapsed}
              />
            ))}
            <div className="lyric-spacer" />
          </div>
        )}

        {/* The playback spine — a fixed hairline the glowing active dot travels along */}
        {!showFallbackCard && <span className="lyric-spine" aria-hidden="true" />}
      </motion.div>
    </div>
  );
}

/* ————————————————— SUPPORT NUDGE (V1.4.0 #2) ————————————————— */
/* Classic's face of the shared support scheduler (./nudge). Rendered fixed at
   the bottom-end corner (inset-inline-end respects RTL), z-index 60 — below
   the modal layer — and only while classic is active and NOT in compact or
   idle mode (gated at the render site). kind "donate" lists the three crypto
   wallets with click-to-copy feedback (classic has no toast system, so each
   row shows its own transient "copied" state) plus the Reymit direct link;
   kind "star" is a single GitHub action. Escape and the ✕ both dismiss. */
function ClassicSupportNudge({
  kind,
  dict,
  onDismiss,
}: {
  kind: "donate" | "star";
  dict: Dict;
  onDismiss: () => void;
}) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copiedTimer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, [onDismiss]);

  const copyWallet = async (code: string, address: string) => {
    try {
      await copyText(address);
      setCopiedCode(code);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopiedCode(null), 1600);
    } catch {
      /* clipboard unavailable → row just doesn't light up */
    }
  };

  return (
    <aside className="classic-nudge" role="dialog" aria-label={kind === "donate" ? dict.nudge.donateTitle : dict.nudge.starTitle}>
      <header className="classic-nudge-head">
        <span className="classic-nudge-dot" aria-hidden="true" />
        <strong>{kind === "donate" ? dict.nudge.donateTitle : dict.nudge.starTitle}</strong>
        <button
          type="button"
          className="classic-nudge-close"
          onClick={onDismiss}
          aria-label={dict.nudge.dismiss}
          title={dict.nudge.dismiss}
        >
          <X size={13} />
        </button>
      </header>

      <p className="classic-nudge-body">{kind === "donate" ? dict.nudge.donateBody : dict.nudge.starBody}</p>

      {kind === "donate" ? (
        <>
          <div className="classic-nudge-wallets">
            {DONATE_WALLETS.map((wallet) => (
              <button
                key={wallet.code}
                type="button"
                className={`classic-nudge-wallet ${copiedCode === wallet.code ? "copied" : ""}`}
                onClick={() => void copyWallet(wallet.code, wallet.address)}
                title={wallet.address}
              >
                <span className="classic-nudge-wallet-mono" style={{ color: wallet.color }} aria-hidden="true">{wallet.mono}</span>
                <span className="classic-nudge-wallet-code">{wallet.code}</span>
                <span className="classic-nudge-wallet-addr">{wallet.network} · {wallet.address.slice(0, 10)}…</span>
                <span className="classic-nudge-wallet-state" aria-live="polite">
                  {copiedCode === wallet.code ? <Check size={12} /> : <Copy size={12} />}
                </span>
              </button>
            ))}
          </div>
          <a className="classic-nudge-action" href={DONATE_DIRECT.href} target="_blank" rel="noreferrer">
            {dict.nudge.donateAction}
          </a>
        </>
      ) : (
        <a className="classic-nudge-action" href="https://github.com/Epodonios/NOBODY-player" target="_blank" rel="noreferrer">
          {dict.nudge.starAction}
        </a>
      )}
    </aside>
  );
}

/* ————————————————— CONTACT ————————————————— */
function ContactView({
  dict,
  artistFont,
  artist,
}: {
  dict: Dict;
  artistFont: CSSProperties;
  artist: string;
}) {
  const [adjIndex, setAdjIndex] = useState(0);
  const [contactTab, setContactTab] = useState<"contact" | "dedication">("contact");

  useEffect(() => {
    const interval = setInterval(() => setAdjIndex((prev) => (prev + 1) % MUSIC_ADJECTIVES.length), 3200);
    return () => clearInterval(interval);
  }, []);

  const currentAdjective = MUSIC_ADJECTIVES[adjIndex];

  return (
    <div className="contact-view">
      <div className="contact-card-container">
        <div className="contact-tabs">
          <button
            type="button"
            className={contactTab === "contact" ? "active" : ""}
            onClick={() => setContactTab("contact")}
          >
            <MessageCircle size={14} />
            <span>{dict.contact.tabContact}</span>
          </button>
          <button
            type="button"
            className={contactTab === "dedication" ? "active" : ""}
            onClick={() => setContactTab("dedication")}
          >
            <Heart size={14} />
            <span>{dict.contact.tabDedication}</span>
          </button>
        </div>

        <AnimatePresence mode="wait">
          {contactTab === "contact" ? (
            <motion.div
              key="contact-panel"
              className="contact-panel-inner"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="contact-header-badge">
                <Sparkles size={16} className="text-accent" />
                <span>{dict.contact.headingTag}</span>
              </div>

              <h1 className="contact-main-title">{dict.contact.headingTitle}</h1>
              <p className="contact-subtitle">{dict.contact.headingSubtitle}</p>

              <div className="rotating-slogan-box" dir="ltr" style={artistFont}>
                <span className="slogan-prefix" style={artistFont}>
                  Aaaaaaaaaaaaaa music is{" "}
                </span>
                <div className="slogan-adj-wrapper">
                  <AnimatePresence mode="wait">
                    <motion.strong
                      key={currentAdjective}
                      initial={{ opacity: 0, y: 12, rotateX: 20 }}
                      animate={{ opacity: 1, y: 0, rotateX: 0 }}
                      exit={{ opacity: 0, y: -12, rotateX: -20 }}
                      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                      className="slogan-adjective"
                      style={artistFont}
                    >
                      {currentAdjective}.
                    </motion.strong>
                  </AnimatePresence>
                </div>
                <span className="slogan-source">typography synced with · {artist}</span>
              </div>

              <p className="contact-description">{dict.contact.connectMsg}</p>

              {/* V1.4.0 (#7) — contact points now come from ./supportInfo (ONE
                  source for all four faces). Telegram handle fixed to
                  @nowheremans; email is a mailto:; Instagram has no real page
                  yet → a disabled "coming soon" chip, never a link. */}
              <div className="contact-actions-row">
                <a href={CONTACT.telegramHref} target="_blank" rel="noopener noreferrer" className="contact-social-btn btn-telegram">
                  <MessageCircle size={20} />
                  <span>{dict.contact.telegramBtn}</span>
                </a>
                <a href={CONTACT.githubHref} target="_blank" rel="noopener noreferrer" className="contact-social-btn btn-github">
                  <GithubIcon size={20} />
                  <span>{dict.contact.githubBtn}</span>
                </a>
                <a href={`mailto:${CONTACT.email}`} className="contact-social-btn btn-email">
                  <Mail size={20} />
                  <span>{dict.contact.emailBtn}</span>
                </a>
                <button type="button" className="contact-social-btn btn-instagram is-disabled" aria-disabled="true">
                  <InstagramIcon size={20} />
                  <span>{dict.contact.instagramBtn}</span>
                  <small className="contact-soon-chip">{dict.contact.instagramSoon}</small>
                </button>
              </div>

              <div className="contact-epodonios-footer">
                <Disc3 size={15} className="spin-slow" />
                <span>EPODONIOS AUDIO ARCHITECTURE • BUILD 2026</span>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dedication-panel"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="contact-panel-inner dedication-panel"
            >
              <div className="dedication-title-row">
                <Star size={18} className="text-accent" />
                <h1 className="dedication-title">{dict.contact.dedicationTitle}</h1>
                <Sparkles size={18} className="text-accent" />
              </div>

              <div className="dedication-divider" aria-hidden="true" />

              <div className="dedication-card">
                <div className="dedication-mark">N</div>
                <p>{dict.contact.dedicationBody}</p>
                <div className="dedication-signoff-line" aria-hidden="true" />
                <em>— {dict.contact.dedicationSign}</em>
              </div>

              <div className="dedication-dots" aria-hidden="true">
                <span className="dot dot-1" />
                <span className="dot dot-2" />
                <span className="dot dot-3" />
                <span className="dot dot-4" />
              </div>

              <div className="dedication-creator-card">
                <span className="dedication-creator-badge">
                  <Star size={11} />
                  {dict.contact.fromCreatorTag}
                </span>
                <p>{dict.contact.creatorBody}</p>
                <em>— {dict.contact.creatorSign}</em>
              </div>

              <div className="contact-epodonios-footer">
                <Disc3 size={15} className="spin-slow" />
                <span>{dict.contact.dedicationFooter}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ————————————————— REQ 3 & 15 — DONATE VIEW WITH SYNCED BARS & CRYPTO/REYMIT ————————————————— */
function DonateView({
  dict,
  isPlaying,
  bpm = 120,
  equalizerStyle = "bars",
  trackId = 0,
}: {
  dict: Dict;
  isPlaying: boolean;
  bpm?: number;
  equalizerStyle?: "bars" | "wave" | "orbit" | "random";
  trackId?: number;
}) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const resolvedEqStyle = useMemo(() => {
    if (equalizerStyle !== "random") return equalizerStyle;
    const variants: Array<"bars" | "wave" | "orbit"> = ["bars", "wave", "orbit"];
    return variants[stableIdFromPath(String(trackId)) % variants.length];
  }, [equalizerStyle, trackId]);

  // Live audio spectrum visualizer synchronized with music beat & tempo!
  /* PHASE-2 PERF FIX: bars are driven by direct DOM writes (see useBeatVisualizer) */
  const donateBarCount = resolvedEqStyle === "orbit" ? 16 : 38;
  const equalizerRef = useBeatVisualizer(donateBarCount, isPlaying, bpm);

  const copyAddress = (key: string, address: string) => {
    navigator.clipboard?.writeText(address);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 3000);
  };

  const wallets = [
    { key: "usdt", label: dict.donate.usdtLabel, address: "TXYZ987654321USDT_PLACEHOLDER_TRC20", symbol: "₮", color: "#26a17b" },
    { key: "trx", label: dict.donate.trxLabel, address: "TRX1234567890_PLACEHOLDER_ADDRESS", symbol: "T", color: "#ef0027" },
    { key: "btc", label: dict.donate.btcLabel, address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", symbol: "₿", color: "#f7931a" },
  ];

  return (
    <div className="donate-view">
      <div className="donate-container">
        <div className="donate-hero-box">
          <div className="donate-hero-glow" aria-hidden="true" />
          <div className="donate-header-badge">
            <Heart size={16} className="text-accent" />
            <span>{dict.donate.headingTag}</span>
          </div>

          <h1 className="donate-main-title">{dict.donate.headingTitle}</h1>
          <p className="donate-subtitle">{dict.donate.headingSubtitle}</p>

          {/* Req 3 — visualizer bars actively synced with currently playing track! */}
          <div ref={equalizerRef} className={`donate-synced-visualizer idle-beat-equalizer style-${resolvedEqStyle}`} aria-label="Live audio spectrum">
            {Array.from({ length: donateBarCount }, (_, i) => (
              <span key={i} style={{ "--angle": `${(360 / donateBarCount) * i}deg` } as CSSProperties} />
            ))}
          </div>
        </div>

        <div className="donate-content-grid">
          {/* WALLETS SECTION */}
          <div className="wallets-panel">
            {wallets.map((w) => {
              const isCopied = copiedKey === w.key;
              return (
                <div
                  key={w.key}
                  className="crypto-card"
                  style={{ "--crypto-color": w.color } as CSSProperties}
                  onClick={() => copyAddress(w.key, w.address)}
                >
                  <div className="crypto-monogram">{w.symbol}</div>
                  <div className="crypto-info">
                    <span className="crypto-label">{w.label}</span>
                    <code dir="ltr" className="crypto-addr">{w.address}</code>
                  </div>
                  <button type="button" className={`crypto-copy-btn ${isCopied ? "copied" : ""}`}>
                    {isCopied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                    <span>{isCopied ? dict.donate.copiedMsg : dict.donate.copyAddressBtn}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* REYMIT DIRECT SUPPORT PORTAL */}
          <motion.div
            className="reymit-portal-card"
            whileHover={{ scale: 1.015, y: -3 }}
            transition={{ type: "spring", stiffness: 350, damping: 22 }}
          >
            <div className="reymit-badge">VERIFIED REYMIT PORTAL</div>
            <div className="reymit-icon-ring">
              <Sparkles size={26} className="text-accent reymit-icon" />
            </div>
            <h3>{dict.donate.reymitTitle}</h3>
            <p>{dict.donate.reymitDesc}</p>
            <a
              href="https://reymit.ir/epodonios" // placeholder link for Reymit until real link supplied
              target="_blank"
              rel="noopener noreferrer"
              className="reymit-action-btn"
            >
              <span>{dict.donate.reymitBtn}</span>
            </a>
            <small className="reymit-footer-note">SECURED AUDIO PATRONAGE BY EPODONIOS</small>
          </motion.div>
        </div>

        <div className="donate-epodonios-thankyou">
          <div className="donate-thankyou-icon">
            <Heart size={18} className="text-accent fill-accent" />
          </div>
          <div>
            <h4>{dict.donate.thankYouTitle}</h4>
            <p>{dict.donate.thankYouDesc}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ————————————————— SETTINGS (Req 1 — removed light mode button) ————————————————— */
function SettingsView({
  ambientMotion,
  setAmbientMotion,
  autoColor,
  setAutoColor,
  highContrast,
  setHighContrast,
  lyricSize,
  setLyricSize,
  lyricStyle,
  setLyricStyle,
  idleEqualizerStyle,
  setIdleEqualizerStyle,
  compactStyle,
  setCompactStyle,
  lang,
  setLang,
  dict,
}: {
  ambientMotion: boolean;
  setAmbientMotion: (value: boolean) => void;
  autoColor: boolean;
  setAutoColor: (value: boolean) => void;
  highContrast: boolean;
  setHighContrast: (value: boolean) => void;
  lyricSize: number;
  setLyricSize: (value: number) => void;
  lyricStyle: "classic" | "karaoke" | "minimal";
  setLyricStyle: (value: "classic" | "karaoke" | "minimal") => void;
  idleEqualizerStyle: "bars" | "wave" | "orbit" | "random";
  setIdleEqualizerStyle: (value: "bars" | "wave" | "orbit" | "random") => void;
  compactStyle: "classic" | "cover" | "minimal";
  setCompactStyle: (value: "classic" | "cover" | "minimal") => void;
  lang: Language;
  setLang: (value: Language) => void;
  dict: Dict;
}) {
  return (
    <div className="settings-view">
      <div className="settings-heading">
        <span className="overline">{dict.settings.headingTag}</span>
        <h2>{dict.settings.headingTitle}</h2>
        <p>{dict.settings.headingSubtitle}</p>
      </div>

      <div className="settings-columns">
        <div className="settings-group">
          <h3>
            <Layers size={17} />
            <span>{dict.settings.interfaceGroup}</span>
          </h3>
          <div className="language-selector-row">
            <div>
              <strong>{dict.settings.interfaceGroup}</strong>
              <span>{dict.settings.interfaceDesc}</span>
            </div>
            <div className="lang-buttons-pill">
              <button type="button" className="active" disabled title={dict.settings.interfaceClassic}>
                {dict.settings.interfaceClassic}
              </button>
              <button type="button" onClick={() => switchUiMode("cinema")} title={dict.settings.interfaceCinema}>
                {dict.settings.interfaceCinema}
              </button>
              <button type="button" onClick={() => switchUiMode("eela")} title={dict.settings.interfaceEela}>
                {dict.settings.interfaceEela}
              </button>
              <button type="button" onClick={() => switchUiMode("alok")} title={dict.settings.interfaceAlok}>
                {dict.settings.interfaceAlok}
              </button>
            </div>
          </div>
        </div>

        <div className="settings-group">
          <h3>
            <Sparkles size={17} />
            <span>{dict.settings.appearanceGroup}</span>
          </h3>
          <SettingRow title={dict.settings.autoColor} description={dict.settings.autoColorDesc}>
            <Toggle checked={autoColor} onChange={() => setAutoColor(!autoColor)} />
          </SettingRow>
          <SettingRow title={dict.settings.ambientMotion} description={dict.settings.ambientMotionDesc}>
            <Toggle checked={ambientMotion} onChange={() => setAmbientMotion(!ambientMotion)} />
          </SettingRow>
          <SettingRow title={dict.settings.highContrast} description={dict.settings.highContrastDesc}>
            <Toggle checked={highContrast} onChange={() => setHighContrast(!highContrast)} />
          </SettingRow>
        </div>

        <div className="settings-group">
          <h3>
            <Mic2 size={17} />
            <span>{dict.settings.lyricsGroup}</span>
          </h3>
          {/* Translation feature has been completely removed as requested */}

          <div className="setting-slider">
            <div>
              <strong>{dict.settings.lyricSize}</strong>
              <span>{lyricSize}%</span>
            </div>
            <input
              type="range"
              min="80"
              max="125"
              value={lyricSize}
              onChange={(e) => setLyricSize(Number(e.target.value))}
              style={{ "--setting-progress": `${((lyricSize - 80) / 45) * 100}%` } as CSSProperties}
            />
            <div className="slider-labels">
              <small>{dict.settings.smallText}</small>
              <small>{dict.settings.largeText}</small>
            </div>
          </div>

          <div className="language-selector-row">
            <div>
              <strong>{dict.settings.lyricStyleLabel}</strong>
              <span>{dict.settings.lyricStyleDesc}</span>
            </div>
            <div className="lang-buttons-pill">
              <button type="button" className={lyricStyle === "classic" ? "active" : ""} onClick={() => setLyricStyle("classic")}>
                {dict.settings.lyricStyleClassic}
              </button>
              <button type="button" className={lyricStyle === "karaoke" ? "active" : ""} onClick={() => setLyricStyle("karaoke")}>
                {dict.settings.lyricStyleKaraoke}
              </button>
              <button type="button" className={lyricStyle === "minimal" ? "active" : ""} onClick={() => setLyricStyle("minimal")}>
                {dict.settings.lyricStyleMinimal}
              </button>
            </div>
          </div>

          <div className="language-selector-row">
            <div>
              <strong>{dict.settings.idleEqLabel}</strong>
              <span>{dict.settings.idleEqDesc}</span>
            </div>
            <div className="lang-buttons-pill">
              <button type="button" className={idleEqualizerStyle === "bars" ? "active" : ""} onClick={() => setIdleEqualizerStyle("bars")}>
                {dict.settings.idleEqBars}
              </button>
              <button type="button" className={idleEqualizerStyle === "wave" ? "active" : ""} onClick={() => setIdleEqualizerStyle("wave")}>
                {dict.settings.idleEqWave}
              </button>
              <button type="button" className={idleEqualizerStyle === "orbit" ? "active" : ""} onClick={() => setIdleEqualizerStyle("orbit")}>
                {dict.settings.idleEqOrbit}
              </button>
              <button type="button" className={idleEqualizerStyle === "random" ? "active" : ""} onClick={() => setIdleEqualizerStyle("random")}>
                {dict.settings.idleEqRandom}
              </button>
            </div>
          </div>

          <div className="language-selector-row">
            <div>
              <strong>{dict.settings.compactStyleLabel}</strong>
              <span>{dict.settings.compactStyleDesc}</span>
            </div>
            <div className="lang-buttons-pill">
              <button type="button" className={compactStyle === "classic" ? "active" : ""} onClick={() => setCompactStyle("classic")}>
                {dict.settings.compactStyleClassic}
              </button>
              <button type="button" className={compactStyle === "cover" ? "active" : ""} onClick={() => setCompactStyle("cover")}>
                {dict.settings.compactStyleCover}
              </button>
              <button type="button" className={compactStyle === "minimal" ? "active" : ""} onClick={() => setCompactStyle("minimal")}>
                {dict.settings.compactStyleMinimal}
              </button>
            </div>
          </div>

          <div className="language-selector-row">
            <div>
              <strong>{dict.settings.languageSelect}</strong>
              <span>{dict.settings.languageDesc}</span>
            </div>
            <div className="lang-buttons-pill">
              <button type="button" className={lang === "fa" ? "active" : ""} onClick={() => setLang("fa")}>
                فارسی
              </button>
              <button type="button" className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>
                English
              </button>
              <button type="button" className={lang === "tr" ? "active" : ""} onClick={() => setLang("tr")}>
                Türkçe
              </button>
              <button type="button" className={lang === "ru" ? "active" : ""} onClick={() => setLang("ru")}>
                Русский
              </button>
            </div>
          </div>

        </div>
      </div>

      <div className="about-line" dir="ltr">
        <span>NOBODY</span>
        <i />
        <span>VERSION {APP_VERSION_LABEL}</span>
        <i />
        <span>DESIGNED BY EPODONIOS</span>
      </div>
    </div>
  );
}

function SettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {children}
    </div>
  );
}

/* ————————————————— PLAYER BAR ————————————————— */
function PlayerBar({
  track,
  timeRef,
  seekRef,
  setElapsed,
  isPlaying,
  setIsPlaying,
  liked,
  toggleLike,
  shuffle,
  setShuffle,
  repeat,
  setRepeat,
  volume,
  setVolume,
  previousVolume,
  setPreviousVolume,
  goNext,
  goPrevious,
  queueOpen,
  setQueueOpen,
  setIsCompact,
  dict,
}: {
  track: Track;
  timeRef: MutableRefObject<HTMLSpanElement | null>;
  seekRef: MutableRefObject<HTMLInputElement | null>;
  setElapsed: (value: number) => void;
  isPlaying: boolean;
  setIsPlaying: (value: boolean) => void;
  liked: boolean;
  toggleLike: () => void;
  shuffle: boolean;
  setShuffle: (value: boolean) => void;
  repeat: boolean;
  setRepeat: (value: boolean) => void;
  volume: number;
  setVolume: (value: number) => void;
  previousVolume: number;
  setPreviousVolume: (value: number) => void;
  goNext: () => void;
  goPrevious: () => void;
  queueOpen: boolean;
  setQueueOpen: (value: boolean) => void;
  setIsCompact: (value: boolean) => void;
  dict: Dict;
}) {
  const VolumeIcon = volume === 0 ? VolumeX : volume < 50 ? Volume1 : Volume2;
  const toggleMute = () => {
    if (volume === 0) setVolume(previousVolume || 74);
    else {
      setPreviousVolume(volume);
      setVolume(0);
    }
  };

  return (
    <footer className="player-bar">
      <div className="now-playing">
        <img src={track.cover} alt="" />
        <div>
          <strong dir="ltr">{track.title}</strong>
          <span dir="ltr">
            {track.artist}
            <small className="pb-epodonios-mark"> • EPODONIOS</small>
          </span>
        </div>
        <IconButton label={dict.playlists.like} active={liked} onClick={toggleLike}>
          <Heart size={17} fill={liked ? "currentColor" : "none"} />
        </IconButton>
      </div>

      <div className="transport">
        <div className="transport-controls">
          <TransportButton label="shuffle" onClick={() => setShuffle(!shuffle)} active={shuffle}>
            <Shuffle size={15} />
          </TransportButton>
          <TransportButton label="previous" onClick={goPrevious}>
            <SkipBack size={18} fill="currentColor" />
          </TransportButton>
          <PlayButton
            isPlaying={isPlaying}
            onClick={() => setIsPlaying(!isPlaying)}
            label={isPlaying ? dict.focus.pause : dict.focus.play}
          />
          <TransportButton label="next" onClick={goNext}>
            <SkipForward size={18} fill="currentColor" />
          </TransportButton>
          <TransportButton label="repeat" onClick={() => setRepeat(!repeat)} active={repeat}>
            <Repeat2 size={15} />
          </TransportButton>
        </div>

        <div className="timeline">
          <span ref={timeRef}>{formatTime(0)}</span>
          <input
            aria-label="seek"
            type="range"
            min="0"
            max={track.duration}
            defaultValue={0}
            ref={seekRef}
            onChange={(event) => setElapsed(Number(event.target.value))}
          />
          <span>{track.durationLabel}</span>
        </div>
      </div>

      <div className="player-extras">
        <button
          type="button"
          className="compact-footer-btn"
          onClick={() => setIsCompact(true)}
          title={dict.compact.enterCompact}
        >
          <Minimize2 size={15} />
          <span>COMPACT</span>
        </button>
        <IconButton label="queue" active={queueOpen} onClick={() => setQueueOpen(!queueOpen)}>
          <ListMusic size={18} />
        </IconButton>
        <div className="volume-control">
          <IconButton label="volume" onClick={toggleMute}>
            <VolumeIcon size={18} />
          </IconButton>
          <input
            aria-label="volume"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
        </div>
        <IconButton label="fullscreen" onClick={() => document.documentElement.requestFullscreen?.()}>
          <Maximize2 size={17} />
        </IconButton>
      </div>
    </footer>
  );
}

function QueuePanel({
  tracks,
  currentIndex,
  selectTrack,
  urQueueIds,
  toggleUrQueue,
  activeTab,
  setActiveTab,
  close,
  dict,
}: {
  tracks: Track[];
  currentIndex: number;
  selectTrack: (index: number) => void;
  urQueueIds: number[];
  toggleUrQueue: (id: number) => void;
  activeTab: "upNext" | "urQueue";
  setActiveTab: (tab: "upNext" | "urQueue") => void;
  close: () => void;
  dict: Dict;
}) {
  const displayTracks = activeTab === "urQueue" ? tracks.filter((t) => urQueueIds.includes(t.id)) : tracks;
  /* PHASE-2 PERF FIX: O(1) id→index lookup replaces per-row findIndex */
  const indexById = useMemo(() => {
    const map = new Map<number, number>();
    tracks.forEach((item, i) => map.set(item.id, i));
    return map;
  }, [tracks]);

  return (
    <motion.aside
      className="queue-panel"
      initial={{ x: 390, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 390, opacity: 0 }}
      transition={{ type: "spring", damping: 28, stiffness: 260 }}
    >
      <div className="queue-header-top">
        <div className="queue-tabs">
          <button type="button" className={activeTab === "upNext" ? "active" : ""} onClick={() => setActiveTab("upNext")}>
            {dict.queue.upNextTab}
          </button>
          <button type="button" className={activeTab === "urQueue" ? "active" : ""} onClick={() => setActiveTab("urQueue")}>
            <span>{dict.queue.urQueueTab}</span>
            {urQueueIds.length > 0 && <small className="queue-badge">{urQueueIds.length}</small>}
          </button>
        </div>
        <IconButton label="close" onClick={close}>
          <X size={18} />
        </IconButton>
      </div>

      <div className="queue-list">
        {displayTracks.length === 0 && (
          <div className="queue-empty-msg">
            <ListMusic size={32} />
            <p>{dict.queue.emptyUrQueue}</p>
          </div>
        )}

        {displayTracks.map((item) => {
          const idx = indexById.get(item.id) ?? 0;
          return (
            <div key={item.id} className={`queue-item-row ${idx === currentIndex ? "active" : ""}`}>
              <button type="button" className="queue-item-btn" onClick={() => selectTrack(idx)}>
                <img src={item.cover} alt="" />
                <span>
                  <strong dir="ltr">{item.title}</strong>
                  <small dir="ltr">{item.artist}</small>
                </span>
                <time>{item.durationLabel}</time>
              </button>
              {activeTab === "urQueue" && (
                <button
                  type="button"
                  className="queue-item-delete"
                  onClick={() => toggleUrQueue(item.id)}
                  title={dict.queue.removeFromQueue}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="queue-footer">
        <Redo2 size={15} />
        <span>NOBODY AUTOPLAY • EPODONIOS</span>
      </div>
    </motion.aside>
  );
}

/* ————————————————— REQ 2 — NEW ULTRA-LUXURY GLASS PLAYLIST MODAL ————————————————— */
function CreatePlaylistModal({
  dict,
  close,
  create,
}: {
  dict: Dict;
  close: () => void;
  create: (name: string, color?: string, emoji?: string) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PLAYLIST_COLORS[0]);
  const [emoji, setEmoji] = useState(PLAYLIST_EMOJIS[0]);

  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
      <motion.div
        className="playlist-modal-card luxury-glass"
        initial={{ scale: 0.9, y: 26, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 26, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        style={{ "--playlist-color": color } as CSSProperties}
      >
        <div className="pm-glow" style={{ background: color }} />
        <div className="pm-icon-emblem" style={{ background: color }}>
          <span>{emoji}</span>
        </div>
        <h3>{dict.playlists.createTitle}</h3>
        <p>{dict.playlists.createSubtitle}</p>
        
        <div className="pm-input-wrapper">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create(name || dict.playlists.namePlaceholder, color, emoji)}
            placeholder={dict.playlists.namePlaceholder}
            className="pm-input"
          />
        </div>

        <div className="pm-options-grid">
          <div className="pm-option-block">
            <label>{dict.playlists.colorLabel || "COLOR PALETTE"}</label>
            <div className="pm-color-row">
              {PLAYLIST_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`pm-color-dot ${color === item ? "active" : ""}`}
                  style={{ background: item }}
                  onClick={() => setColor(item)}
                  title={item}
                />
              ))}
            </div>
          </div>
          <div className="pm-option-block">
            <label>{dict.playlists.iconLabel || "ICON EMBLEM"}</label>
            <div className="pm-emoji-row">
              {PLAYLIST_EMOJIS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`pm-emoji-pick ${emoji === item ? "active" : ""}`}
                  onClick={() => setEmoji(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="pm-preview-strip">
          <span style={{ background: color, color: "#0d0a10" }}>{emoji}</span>
          <div>
            <b>{name || dict.playlists.namePlaceholder}</b>
            <small>CUSTOM PLAYLIST BY EPODONIOS</small>
          </div>
        </div>

        <div className="pm-actions">
          <button type="button" className="text-action" onClick={close}>
            {dict.playlists.cancel}
          </button>
          <button
            type="button"
            className="primary-action"
            onClick={() => create(name || dict.playlists.namePlaceholder, color, emoji)}
          >
            <Plus size={16} />
            {dict.playlists.createConfirm}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AddToPlaylistModal({
  dict,
  track,
  playlists,
  toggle,
  openCreate,
  close,
}: {
  dict: Dict;
  track: Track;
  playlists: Playlist[];
  toggle: (playlistId: string, trackId: number) => void;
  openCreate: () => void;
  close: () => void;
}) {
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
      <motion.div
        className="playlist-modal-card wide luxury-glass"
        initial={{ scale: 0.9, y: 26, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 26, opacity: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pm-glow" />
        <div className="pm-track-head">
          <img src={track.cover} alt="" />
          <div>
            <strong dir="ltr">{track.title}</strong>
            <small dir="ltr">{track.artist} • EPODONIOS</small>
          </div>
        </div>
        <h3>{dict.playlists.addTo}</h3>
        <div className="pm-list">
          {playlists.map((pl) => {
            const inside = pl.trackIds.includes(track.id);
            return (
              <motion.button
                key={pl.id}
                type="button"
                className={`pm-list-item ${inside ? "added" : ""}`}
                onClick={() => toggle(pl.id, track.id)}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                style={{ "--pl-color": pl.color ?? "#ef4c78" } as CSSProperties}
              >
                <span className="pm-emoji" style={{ background: pl.color ?? "#ef4c78" }}>
                  {pl.system === "liked" ? "♥" : pl.emoji ?? "✧"}
                </span>
                <span className="pm-name">{pl.system === "liked" ? dict.playlists.likedName : pl.name}</span>
                <span className="pm-count">
                  {pl.trackIds.length} {dict.playlists.tracks}
                </span>
                <span className="pm-check">{inside ? <Check size={15} /> : <Plus size={15} />}</span>
              </motion.button>
            );
          })}
        </div>
        <div className="pm-actions">
          <button type="button" className="text-action" onClick={openCreate}>
            <Plus size={15} />
            {dict.playlists.createBtn}
          </button>
          <button type="button" className="primary-action" onClick={close}>
            {dict.playlists.doneBtn}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

type LrcSyncStatus = "idle" | "searching" | "saved" | "not-found" | "instrumental" | "error" | "skipped";

const LRC_SYNC_CONCURRENCY = 2;

function LrcSyncModal({
  folder,
  folderPaths,
  tracks,
  dict,
  lang,
  close,
  onLyricsFetched,
}: {
  folder: string;
  folderPaths: string[];
  tracks: Track[];
  dict: Dict;
  lang: Language;
  close: () => void;
  onLyricsFetched: (trackId: number, lyrics: LyricLine[], sourceLabel: string) => void;
}) {
  void dict; // labels are rendered inline via lang ternaries (parity with DownloadCenter)
  const ALL_SCOPE = "__ALL__";
  const [scope, setScope] = useState<string>(folder);
  const [minimized, setMinimized] = useState(false);
  const [statuses, setStatuses] = useState<Record<number, LrcSyncStatus>>({});
  const [running, setRunning] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [connCheck, setConnCheck] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scopeOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (scopeMenuRef.current && !scopeMenuRef.current.contains(event.target as Node)) {
        setScopeOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [scopeOpen]);
  const stopRef = useRef(false);

  const targetTracks = useMemo(
    () => (scope === ALL_SCOPE ? tracks : tracks.filter((t) => t.folderPath === scope)),
    [scope, tracks],
  );
  const scopeName =
    scope === ALL_SCOPE ? null : scope.split(/[\\/]/).filter(Boolean).pop() || scope;

  useEffect(
    () => () => {
      stopRef.current = true;
    },
    [],
  );

  const setStatus = (id: number, status: LrcSyncStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  };

  const syncOneTrack = async (item: Track, force = false) => {
    const hasRealLyrics = !item.isFallbackLyric && item.lyrics.length > 1;
    if (!force && skipExisting && hasRealLyrics) {
      setStatus(item.id, "skipped");
      return;
    }
    if (!item.sourcePath) {
      setStatus(item.id, "error");
      return;
    }
    setStatus(item.id, "searching");
    try {
      const result: LrclibResult | null = await fetchLrclibLyrics({
        trackName: item.title,
        artistName: item.artist,
        albumName: item.album,
        duration: item.duration,
      });
      if (!result) {
        setStatus(item.id, "not-found");
      } else if (result.syncedLyrics) {
        await saveLrcFile(item.sourcePath, result.syncedLyrics);
        const parsed = parseLrc(result.syncedLyrics);
        onLyricsFetched(item.id, parsed, "LRCLIB.net");
        setStatus(item.id, "saved");
      } else if (result.instrumental) {
        setStatus(item.id, "instrumental");
      } else {
        setStatus(item.id, "not-found");
      }
    } catch {
      setStatus(item.id, "error");
    }
  };

  const startSync = async () => {
    setRunning(true);
    stopRef.current = false;
    const queue = [...targetTracks];
    let cursor = 0;
    // A small worker pool fetches several tracks in parallel — LRCLIB has no
    // hard rate limit, so this is several times faster than one-by-one on a
    // library-sized batch while still being a reasonable number of
    // concurrent requests.
    const worker = async () => {
      while (cursor < queue.length) {
        if (stopRef.current) return;
        const item = queue[cursor++];
        await syncOneTrack(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(LRC_SYNC_CONCURRENCY, queue.length) }, worker));
    if (!stopRef.current) setRunning(false);
  };

  const stopSync = () => {
    stopRef.current = true;
    setRunning(false);
  };

  const runConnectionCheck = async () => {
    setConnCheck("checking");
    const ok = await checkLrclibConnection();
    setConnCheck(ok ? "ok" : "fail");
    window.setTimeout(() => setConnCheck("idle"), 4000);
  };

  const doneCount = Object.keys(statuses).length;
  const counts = useMemo(() => {
    const values = Object.values(statuses);
    return {
      saved: values.filter((v) => v === "saved").length,
      missing: values.filter((v) => v === "not-found" || v === "instrumental").length,
      error: values.filter((v) => v === "error").length,
      skipped: values.filter((v) => v === "skipped").length,
    };
  }, [statuses]);

  const t = {
    title: lang === "fa" ? "دانلود لیریک همگام‌شده" : lang === "tr" ? "Senkronize Söz İndirme" : lang === "ru" ? "Загрузка синхронизированных текстов" : "Synced Lyrics Downloader",
    subtitle: lang === "fa" ? "با LRCLIB.net · متن‌باز و رایگان" : lang === "tr" ? "LRCLIB.net ile · Ücretsiz ve açık kaynak" : lang === "ru" ? "Работает на LRCLIB.net · бесплатно и с открытым кодом" : "Powered by LRCLIB.net · free & open-source",
    scopeLabel: lang === "fa" ? "دانلود برای:" : lang === "tr" ? "İndirme kapsamı:" : lang === "ru" ? "Загрузить для:" : "Download for:",
    allTracks: lang === "fa" ? "همه آهنگ‌ها" : lang === "tr" ? "Tüm şarkılar" : lang === "ru" ? "Все треки" : "All tracks",
    skipLabel:
      lang === "fa"
        ? "رد کردن آهنگ‌هایی که از قبل لیریک دارند"
        : lang === "tr"
          ? "Zaten sözü olan şarkıları atla"
          : lang === "ru" ? "Пропустить треки, у которых уже есть текст" : "Skip tracks that already have lyrics",
    start: doneCount > 0 ? (lang === "fa" ? "شروع دوباره" : lang === "tr" ? "Yeniden Başlat" : lang === "ru" ? "Начать заново" : "Restart") : lang === "fa" ? "شروع دانلود" : lang === "tr" ? "İndirmeyi Başlat" : lang === "ru" ? "Начать загрузку" : "Start Sync",
    stop: lang === "fa" ? "توقف" : lang === "tr" ? "Durdur" : lang === "ru" ? "Остановить" : "Stop",
    close: lang === "fa" ? "بستن" : lang === "tr" ? "Kapat" : lang === "ru" ? "Закрыть" : "Close",
    minimize: lang === "fa" ? "کوچک کردن" : lang === "tr" ? "Küçült" : lang === "ru" ? "Свернуть" : "Minimize",
    empty: lang === "fa" ? "این پوشه هیچ آهنگی ندارد" : lang === "tr" ? "Bu klasörde şarkı yok" : lang === "ru" ? "В этой папке нет треков" : "This folder has no tracks",
    waiting: lang === "fa" ? "در انتظار" : lang === "tr" ? "Bekliyor" : lang === "ru" ? "Ожидание" : "Waiting",
    searching: lang === "fa" ? "در حال جست‌وجو" : lang === "tr" ? "Aranıyor" : lang === "ru" ? "Поиск" : "Searching",
    saved: lang === "fa" ? "ذخیره شد" : lang === "tr" ? "Kaydedildi" : lang === "ru" ? "Сохранено" : "Saved",
    skipped: lang === "fa" ? "رد شد" : lang === "tr" ? "Atlandı" : lang === "ru" ? "Пропущено" : "Skipped",
    notFound: lang === "fa" ? "پیدا نشد" : lang === "tr" ? "Bulunamadı" : lang === "ru" ? "Не найдено" : "Not found",
    instrumental: lang === "fa" ? "بی‌کلام" : lang === "tr" ? "Enstrümantal" : lang === "ru" ? "Инструментал" : "Instrumental",
    error: lang === "fa" ? "خطا" : lang === "tr" ? "Hata" : lang === "ru" ? "Ошибка" : "Error",
    summary:
      lang === "fa"
        ? `${counts.saved} لیریک ذخیره شد · ${counts.skipped} رد شد · ${counts.missing} پیدا نشد`
        : lang === "tr"
          ? `${counts.saved} kaydedildi · ${counts.skipped} atlandı · ${counts.missing} bulunamadı`
          : lang === "ru"
            ? `${counts.saved} сохранено · ${counts.skipped} пропущено · ${counts.missing} не найдено`
            : `${counts.saved} saved · ${counts.skipped} skipped · ${counts.missing} not found`,
  };

  const progressPct = Math.round((doneCount / Math.max(1, targetTracks.length)) * 100);

  if (minimized) {
    return (
      <motion.div
        className="lrc-sync-mini"
        initial={{ opacity: 0, y: 24, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={() => setMinimized(false)}
        role="button"
        tabIndex={0}
        title={lang === "fa" ? "برای مشاهده جزئیات کلیک کن" : lang === "ru" ? "Нажмите, чтобы посмотреть подробности" : "Click to view details"}
      >
        <div className="lrc-sync-mini-ring">
          {running ? <Loader2 size={16} className="spin-icon" /> : <Download size={16} />}
        </div>
        <div className="lrc-sync-mini-text">
          <strong>{running ? `${doneCount}/${targetTracks.length}` : t.title}</strong>
          <span>{running ? (lang === "fa" ? "در حال دانلود لیریک…" : lang === "ru" ? "Загружаем тексты…" : "Syncing lyrics…") : t.summary}</span>
        </div>
        <div className="lrc-sync-mini-bar">
          <div className="lrc-sync-mini-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => {
        if (running) setMinimized(true);
        else close();
      }}
    >
      <motion.div
        className="lrc-sync-modal-card"
        initial={{ scale: 0.94, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-left">
            <div className="lrc-sync-header-icon">
              <Download size={19} />
            </div>
            <div>
              <h3>{t.title}</h3>
              <small>{t.subtitle}</small>
            </div>
          </div>
          <div className="lrc-sync-header-actions">
            {running && (
              <IconButton label="minimize" onClick={() => setMinimized(true)}>
                <ChevronLeft size={16} style={{ transform: "rotate(-90deg)" }} />
              </IconButton>
            )}
            {!running && (
              <IconButton label="close" onClick={close}>
                <X size={18} />
              </IconButton>
            )}
          </div>
        </div>

        <div className="lrc-sync-scope-row" ref={scopeMenuRef}>
          <span className="lrc-sync-scope-label">{t.scopeLabel}</span>
          <div className="lrc-sync-scope-dropdown">
            <button
              type="button"
              className="lrc-sync-scope-trigger"
              disabled={running}
              onClick={() => setScopeOpen((v) => !v)}
            >
              <span>
                {scopeName ?? t.allTracks} ({targetTracks.length})
              </span>
              <ChevronLeft size={13} style={{ transform: scopeOpen ? "rotate(90deg)" : "rotate(-90deg)" }} />
            </button>
            <AnimatePresence>
              {scopeOpen && (
                <motion.div
                  className="lrc-sync-scope-menu"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                >
                  <button
                    type="button"
                    className={scope === ALL_SCOPE ? "active" : ""}
                    onClick={() => {
                      setScope(ALL_SCOPE);
                      setScopeOpen(false);
                    }}
                  >
                    {t.allTracks} ({tracks.length})
                  </button>
                  {folderPaths.map((path) => {
                    const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
                    const count = tracks.filter((tr) => tr.folderPath === path).length;
                    return (
                      <button
                        type="button"
                        key={path}
                        className={scope === path ? "active" : ""}
                        onClick={() => {
                          setScope(path);
                          setScopeOpen(false);
                        }}
                      >
                        {name} ({count})
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            className={`lrc-sync-conn-btn conn-${connCheck}`}
            onClick={runConnectionCheck}
            disabled={connCheck === "checking"}
            title={lang === "fa" ? "بررسی اتصال به LRCLIB.net" : lang === "ru" ? "Проверить соединение с LRCLIB.net" : "Check connection to LRCLIB.net"}
          >
            {connCheck === "checking" && <Loader2 size={13} className="spin-icon" />}
            {connCheck === "ok" && <CheckCircle2 size={13} />}
            {connCheck === "fail" && <AlertCircle size={13} />}
            {connCheck === "idle" && <RefreshCw size={13} />}
            <span>
              {connCheck === "checking"
                ? (lang === "fa" ? "در حال بررسی…" : lang === "ru" ? "Проверяем…" : "Checking…")
                : connCheck === "ok"
                  ? (lang === "fa" ? "متصل است" : lang === "ru" ? "Подключено" : "Connected")
                  : connCheck === "fail"
                    ? (lang === "fa" ? "قطع است" : lang === "ru" ? "Нет соединения" : "Unreachable")
                    : (lang === "fa" ? "بررسی اتصال" : lang === "ru" ? "Проверить соединение" : "Check connection")}
            </span>
          </button>
        </div>

        <label className="lrc-sync-toggle">
          <input
            type="checkbox"
            className="sr-only-checkbox"
            checked={skipExisting}
            disabled={running}
            onChange={(event) => setSkipExisting(event.target.checked)}
          />
          <span className="lrc-sync-toggle-switch" aria-hidden="true">
            <span className="lrc-sync-toggle-knob" />
          </span>
          <span>{t.skipLabel}</span>
        </label>

        {doneCount > 0 && (
          <div className="lrc-sync-progressbar">
            <motion.div
              className="lrc-sync-progressbar-fill"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
          </div>
        )}

        <div className="modal-body lrc-sync-list">
          {targetTracks.length === 0 && <p className="lrc-sync-empty">{t.empty}</p>}
          {targetTracks.map((item) => {
            const status = statuses[item.id] ?? "idle";
            return (
              <div key={item.id} className={`lrc-sync-row status-${status}`}>
                <div className="lrc-sync-row-art">
                  <img src={item.cover} alt="" />
                </div>
                <div className="lrc-sync-row-info">
                  <strong>{item.title}</strong>
                  <span>{item.artist}</span>
                </div>
                <div className="lrc-sync-row-status">
                  {status === "idle" && <span className="lrc-status-pill idle">{t.waiting}</span>}
                  {status === "searching" && (
                    <span className="lrc-status-pill searching">
                      <Loader2 size={12} className="spin-icon" />
                      {t.searching}
                    </span>
                  )}
                  {status === "saved" && (
                    <span className="lrc-status-pill saved">
                      <CheckCircle2 size={12} />
                      {t.saved}
                    </span>
                  )}
                  {status === "skipped" && <span className="lrc-status-pill skipped">{t.skipped}</span>}
                  {status === "not-found" && (
                    <span className="lrc-status-pill missing">
                      <AlertCircle size={12} />
                      {t.notFound}
                    </span>
                  )}
                  {status === "instrumental" && (
                    <span className="lrc-status-pill missing">
                      <FileText size={12} />
                      {t.instrumental}
                    </span>
                  )}
                  {status === "error" && (
                    <span className="lrc-status-pill error">
                      <AlertCircle size={12} />
                      {t.error}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="lrc-sync-row-download"
                  disabled={status === "searching"}
                  onClick={() => syncOneTrack(item, true)}
                  title={lang === "fa" ? "دانلود دستی برای این آهنگ" : lang === "ru" ? "Скачать вручную для этого трека" : "Manually download for this track"}
                >
                  <Download size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {doneCount > 0 && doneCount === targetTracks.length && !running && (
          <div className="lrc-sync-summary">
            <CheckCircle2 size={15} />
            <span>{t.summary}</span>
          </div>
        )}

        <div className="modal-footer">
          <span className="epodonios-badge">DESIGNED BY EPODONIOS</span>
          <div className="lrc-sync-actions">
            <button type="button" className="text-action" onClick={close} disabled={running}>
              {t.close}
            </button>
            {running ? (
              <button type="button" className="primary-action lrc-sync-stop" onClick={stopSync}>
                <Loader2 size={16} className="spin-icon" />
                {t.stop}
              </button>
            ) : (
              <button type="button" className="primary-action" onClick={startSync} disabled={targetTracks.length === 0}>
                <Download size={16} />
                {t.start}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

const COVER_SYNC_CONCURRENCY = 3;
type CoverSyncStatus = "idle" | "searching" | "saved" | "not-found" | "error" | "skipped";

function CoverArtSyncModal({
  folder,
  folderPaths,
  tracks,
  dict,
  lang,
  close,
  onCoverFetched,
}: {
  folder: string;
  folderPaths: string[];
  tracks: Track[];
  dict: Dict;
  lang: Language;
  close: () => void;
  onCoverFetched: (trackId: number, coverUrl: string) => void;
}) {
  void dict; // labels are rendered inline via lang ternaries (parity with DownloadCenter)
  const ALL_SCOPE = "__ALL__";
  const [scope, setScope] = useState<string>(folder);
  const [minimized, setMinimized] = useState(false);
  const [statuses, setStatuses] = useState<Record<number, CoverSyncStatus>>({});
  const [running, setRunning] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeMenuRef = useRef<HTMLDivElement | null>(null);
  const stopRef = useRef(false);

  const targetTracks = useMemo(
    () => (scope === ALL_SCOPE ? tracks : tracks.filter((t) => t.folderPath === scope)),
    [scope, tracks],
  );
  const scopeName = scope === ALL_SCOPE ? null : scope.split(/[\\/]/).filter(Boolean).pop() || scope;

  useEffect(() => {
    if (!scopeOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      if (scopeMenuRef.current && !scopeMenuRef.current.contains(event.target as Node)) setScopeOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [scopeOpen]);

  useEffect(
    () => () => {
      stopRef.current = true;
    },
    [],
  );

  const setStatus = (id: number, status: CoverSyncStatus) => {
    setStatuses((current) => ({ ...current, [id]: status }));
  };

  const syncOneTrack = async (item: Track, force = false) => {
    const hasRealCover = !item.isFallbackCover;
    if (!force && skipExisting && hasRealCover) {
      setStatus(item.id, "skipped");
      return;
    }
    if (!item.sourcePath) {
      setStatus(item.id, "error");
      return;
    }
    setStatus(item.id, "searching");
    try {
      const url = await findCoverArtUrl(item.artist, item.title);
      if (!url) {
        setStatus(item.id, "not-found");
        return;
      }
      const downloaded = await downloadCoverArt(url);
      if (!downloaded) {
        setStatus(item.id, "error");
        return;
      }
      await saveCoverImage(item.sourcePath, downloaded.bytes, downloaded.ext);
      const objectUrl = createManagedBlobUrl(
        new Blob([downloaded.bytes as unknown as BlobPart], { type: `image/${downloaded.ext}` }),
      );
      onCoverFetched(item.id, objectUrl);
      setStatus(item.id, "saved");
    } catch {
      setStatus(item.id, "error");
    }
  };

  const startSync = async () => {
    setRunning(true);
    stopRef.current = false;
    const queue = [...targetTracks];
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        if (stopRef.current) return;
        const item = queue[cursor++];
        await syncOneTrack(item);
      }
    };
    await Promise.all(Array.from({ length: Math.min(COVER_SYNC_CONCURRENCY, queue.length) }, worker));
    if (!stopRef.current) setRunning(false);
  };

  const stopSync = () => {
    stopRef.current = true;
    setRunning(false);
  };

  const doneCount = Object.keys(statuses).length;
  const counts = useMemo(() => {
    const values = Object.values(statuses);
    return {
      saved: values.filter((v) => v === "saved").length,
      missing: values.filter((v) => v === "not-found").length,
      error: values.filter((v) => v === "error").length,
      skipped: values.filter((v) => v === "skipped").length,
    };
  }, [statuses]);

  const t = {
    title: lang === "fa" ? "دانلود خودکار کاور آلبوم" : lang === "tr" ? "Otomatik Albüm Kapağı" : lang === "ru" ? "Автоматические обложки" : "Automatic Cover Art",
    subtitle: lang === "fa" ? "با iTunes و Deezer · رایگان" : lang === "tr" ? "iTunes ve Deezer ile · Ücretsiz" : lang === "ru" ? "Работает на iTunes и Deezer · бесплатно" : "Powered by iTunes & Deezer · free",
    scopeLabel: lang === "fa" ? "دانلود برای:" : lang === "tr" ? "İndirme kapsamı:" : lang === "ru" ? "Загрузить для:" : "Download for:",
    allTracks: lang === "fa" ? "همه آهنگ‌ها" : lang === "tr" ? "Tüm şarkılar" : lang === "ru" ? "Все треки" : "All tracks",
    skipLabel:
      lang === "fa" ? "رد کردن آهنگ‌هایی که از قبل کاور واقعی دارند" : lang === "tr" ? "Zaten gerçek kapağı olan şarkıları atla" : lang === "ru" ? "Пропустить треки, у которых уже есть настоящая обложка" : "Skip tracks that already have real artwork",
    start: doneCount > 0 ? (lang === "fa" ? "شروع دوباره" : lang === "ru" ? "Начать заново" : "Restart") : lang === "fa" ? "شروع دانلود" : lang === "ru" ? "Начать загрузку" : "Start",
    stop: lang === "fa" ? "توقف" : lang === "ru" ? "Остановить" : "Stop",
    close: lang === "fa" ? "بستن" : lang === "ru" ? "Закрыть" : "Close",
    empty: lang === "fa" ? "این پوشه هیچ آهنگی ندارد" : lang === "ru" ? "В этой папке нет треков" : "This folder has no tracks",
    waiting: lang === "fa" ? "در انتظار" : lang === "ru" ? "Ожидание" : "Waiting",
    searching: lang === "fa" ? "در حال جست‌وجو" : lang === "ru" ? "Поиск" : "Searching",
    saved: lang === "fa" ? "ذخیره شد" : lang === "ru" ? "Сохранено" : "Saved",
    skipped: lang === "fa" ? "رد شد" : lang === "ru" ? "Пропущено" : "Skipped",
    notFound: lang === "fa" ? "پیدا نشد" : lang === "ru" ? "Не найдено" : "Not found",
    error: lang === "fa" ? "خطا" : lang === "ru" ? "Ошибка" : "Error",
    summary:
      lang === "fa"
        ? `${counts.saved} کاور ذخیره شد · ${counts.skipped} رد شد · ${counts.missing} پیدا نشد`
        : lang === "ru"
          ? `${counts.saved} ${ruPlural(counts.saved, "обложка", "обложки", "обложек")} сохранено · ${counts.skipped} пропущено · ${counts.missing} не найдено`
          : `${counts.saved} saved · ${counts.skipped} skipped · ${counts.missing} not found`,
  };

  const progressPct = Math.round((doneCount / Math.max(1, targetTracks.length)) * 100);

  if (minimized) {
    return (
      <motion.div
        className="lrc-sync-mini"
        initial={{ opacity: 0, y: 24, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={() => setMinimized(false)}
        role="button"
        tabIndex={0}
      >
        <div className="lrc-sync-mini-ring">
          {running ? <Loader2 size={16} className="spin-icon" /> : <ImageIcon size={16} />}
        </div>
        <div className="lrc-sync-mini-text">
          <strong>{running ? `${doneCount}/${targetTracks.length}` : t.title}</strong>
          <span>{running ? (lang === "fa" ? "در حال دانلود کاور…" : lang === "ru" ? "Загружаем обложки…" : "Fetching covers…") : t.summary}</span>
        </div>
        <div className="lrc-sync-mini-bar">
          <div className="lrc-sync-mini-bar-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => {
        if (running) setMinimized(true);
        else close();
      }}
    >
      <motion.div
        className="lrc-sync-modal-card"
        initial={{ scale: 0.94, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.94, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 340, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-left">
            <div className="lrc-sync-header-icon">
              <ImageIcon size={19} />
            </div>
            <div>
              <h3>{t.title}</h3>
              <small>{t.subtitle}</small>
            </div>
          </div>
          <div className="lrc-sync-header-actions">
            {running && (
              <IconButton label="minimize" onClick={() => setMinimized(true)}>
                <ChevronLeft size={16} style={{ transform: "rotate(-90deg)" }} />
              </IconButton>
            )}
            {!running && (
              <IconButton label="close" onClick={close}>
                <X size={18} />
              </IconButton>
            )}
          </div>
        </div>

        <div className="lrc-sync-scope-row" ref={scopeMenuRef}>
          <span className="lrc-sync-scope-label">{t.scopeLabel}</span>
          <div className="lrc-sync-scope-dropdown">
            <button type="button" className="lrc-sync-scope-trigger" disabled={running} onClick={() => setScopeOpen((v) => !v)}>
              <span>
                {scopeName ?? t.allTracks} ({targetTracks.length})
              </span>
              <ChevronLeft size={13} style={{ transform: scopeOpen ? "rotate(90deg)" : "rotate(-90deg)" }} />
            </button>
            <AnimatePresence>
              {scopeOpen && (
                <motion.div
                  className="lrc-sync-scope-menu"
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.16 }}
                >
                  <button type="button" className={scope === ALL_SCOPE ? "active" : ""} onClick={() => { setScope(ALL_SCOPE); setScopeOpen(false); }}>
                    {t.allTracks} ({tracks.length})
                  </button>
                  {folderPaths.map((path) => {
                    const name = path.split(/[\\/]/).filter(Boolean).pop() || path;
                    const count = tracks.filter((tr) => tr.folderPath === path).length;
                    return (
                      <button type="button" key={path} className={scope === path ? "active" : ""} onClick={() => { setScope(path); setScopeOpen(false); }}>
                        {name} ({count})
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <label className="lrc-sync-toggle">
          <input
            type="checkbox"
            className="sr-only-checkbox"
            checked={skipExisting}
            disabled={running}
            onChange={(event) => setSkipExisting(event.target.checked)}
          />
          <span className="lrc-sync-toggle-switch" aria-hidden="true">
            <span className="lrc-sync-toggle-knob" />
          </span>
          <span>{t.skipLabel}</span>
        </label>

        {doneCount > 0 && (
          <div className="lrc-sync-progressbar">
            <motion.div className="lrc-sync-progressbar-fill" animate={{ width: `${progressPct}%` }} transition={{ duration: 0.3, ease: "easeOut" }} />
          </div>
        )}

        <div className="modal-body lrc-sync-list">
          {targetTracks.length === 0 && <p className="lrc-sync-empty">{t.empty}</p>}
          {targetTracks.map((item) => {
            const status = statuses[item.id] ?? "idle";
            return (
              <div key={item.id} className={`lrc-sync-row status-${status}`}>
                <div className="lrc-sync-row-art">
                  <img src={item.cover} alt="" />
                </div>
                <div className="lrc-sync-row-info">
                  <strong>{item.title}</strong>
                  <span>{item.artist}</span>
                </div>
                <div className="lrc-sync-row-status">
                  {status === "idle" && <span className="lrc-status-pill idle">{t.waiting}</span>}
                  {status === "searching" && (
                    <span className="lrc-status-pill searching">
                      <Loader2 size={12} className="spin-icon" />
                      {t.searching}
                    </span>
                  )}
                  {status === "saved" && (
                    <span className="lrc-status-pill saved">
                      <CheckCircle2 size={12} />
                      {t.saved}
                    </span>
                  )}
                  {status === "skipped" && <span className="lrc-status-pill skipped">{t.skipped}</span>}
                  {status === "not-found" && (
                    <span className="lrc-status-pill missing">
                      <AlertCircle size={12} />
                      {t.notFound}
                    </span>
                  )}
                  {status === "error" && (
                    <span className="lrc-status-pill error">
                      <AlertCircle size={12} />
                      {t.error}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="lrc-sync-row-download"
                  disabled={status === "searching"}
                  onClick={() => syncOneTrack(item, true)}
                  title={lang === "fa" ? "دانلود دستی برای این آهنگ" : lang === "ru" ? "Скачать вручную для этого трека" : "Manually download for this track"}
                >
                  <Download size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {doneCount > 0 && doneCount === targetTracks.length && !running && (
          <div className="lrc-sync-summary">
            <CheckCircle2 size={15} />
            <span>{t.summary}</span>
          </div>
        )}

        <div className="modal-footer">
          <span className="epodonios-badge">DESIGNED BY EPODONIOS</span>
          <div className="lrc-sync-actions">
            <button type="button" className="text-action" onClick={close} disabled={running}>
              {t.close}
            </button>
            {running ? (
              <button type="button" className="primary-action lrc-sync-stop" onClick={stopSync}>
                <Loader2 size={16} className="spin-icon" />
                {t.stop}
              </button>
            ) : (
              <button type="button" className="primary-action" onClick={startSync} disabled={targetTracks.length === 0}>
                <Download size={16} />
                {t.start}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
