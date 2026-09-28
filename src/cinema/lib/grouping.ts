// ── NOBODY · library group-by ────────────────────────────────────────────────
// Pure grouping shared by BOTH library faces (cinema rêve + EELA paper).
// The input list must already be filtered and sorted by the caller —
// within-group order is preserved exactly, so each face keeps its own sort.
// Groups come back sorted by display label (localeCompare → Persian sorts
// naturally) with a deterministic tie-break on the raw group key.

import type { Batch, Track } from "../types";

export type GroupBy = "none" | "artist" | "album" | "folder";

/** Localized fallback labels (from i18n) for tracks whose metadata is empty. */
export interface GroupLabels {
  unknownArtist: string;
  unknownAlbum: string;
  unknownFolder: string;
}

export interface TrackGroup {
  key: string; // stable React key
  label: string; // display title
  tracks: Track[]; // caller's current sort order preserved
}

export function groupTracks(
  list: Track[],
  groupBy: GroupBy,
  batches: Batch[],
  labels: GroupLabels
): TrackGroup[] {
  if (groupBy === "none") return [{ key: "all", label: "", tracks: list }];

  const batchName = new Map(batches.map((b) => [b.id, b.name]));
  const map = new Map<string, TrackGroup>();

  for (const tr of list) {
    const key =
      groupBy === "artist"
        ? tr.artist
        : groupBy === "album"
          ? `${tr.artist}|||${tr.album}`
          : tr.batchId;
    let group = map.get(key);
    if (!group) {
      group = { key, label: "", tracks: [] };
      map.set(key, group);
    }
    group.tracks.push(tr);
  }

  const groups = [...map.values()];
  for (const group of groups) {
    const first = group.tracks[0];
    group.label =
      groupBy === "artist"
        ? first.artist || labels.unknownArtist
        : groupBy === "album"
          ? first.album || labels.unknownAlbum
          : (batchName.get(first.batchId) ?? labels.unknownFolder);
  }
  return groups.sort(
    (a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key)
  );
}
