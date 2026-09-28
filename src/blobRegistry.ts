/* ————————————————— SHARED BLOB-URL REGISTRY —————————————————
   PHASE-3 MEMORY FIX (extracted verbatim from App.tsx so every module can
   route its object URLs through the same registry — the Download Center's
   applied covers must be revocable when a track is removed/replaced).

   The old code called URL.createObjectURL in several places and NEVER
   revoked anything — every import / rescan / cover download pinned bytes
   in RAM for the whole session (hundreds of MB over time). Every blob URL
   is created through the registry and released as soon as the track or
   cover it belongs to is removed or replaced. */

const MANAGED_BLOB_URLS = new Set<string>();

export function createManagedBlobUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  MANAGED_BLOB_URLS.add(url);
  return url;
}

export function revokeManagedBlobUrl(url?: string | null) {
  if (!url || !url.startsWith("blob:") || !MANAGED_BLOB_URLS.has(url)) return;
  MANAGED_BLOB_URLS.delete(url);
  URL.revokeObjectURL(url);
}

/** Converts a huge base64 `data:` URL (embedded cover art) into a compact
 *  Blob URL. The base64 string (~1.37x the binary size) used to be retained
 *  in track state for the whole session; blobs can be paged out by the
 *  browser and are revocable through the registry. */
export async function dataUrlToBlobUrl(dataUrl: string): Promise<string | null> {
  try {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return createManagedBlobUrl(blob);
  } catch {
    return null;
  }
}
