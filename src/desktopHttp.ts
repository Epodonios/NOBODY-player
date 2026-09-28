/* ————————————————— DESKTOP HTTP TRANSPORT (CORS bypass) —————————————————
 * Issue 1 of the migration brief: under Tauri, lrclib.ts / coverart.ts made
 * their requests from the Rust process via @tauri-apps/plugin-http, so
 * browser CORS never applied. Under Electron the equivalent is the
 * allow-listed `http:fetch` IPC proxy in electron/main.cjs (Electron's
 * net.fetch runs in the main process — no CORS).
 *
 * This module is the single transport choke point:
 *   Electron → window.electronAPI.httpFetch (allow-list: LRCLIB, iTunes
 *              Search + artwork CDN, Deezer API + image CDN — the exact
 *              scope the Tauri capability file enforced)
 *   Tauri    → @tauri-apps/plugin-http (unchanged behavior)
 *   Web      → window.fetch (as before)
 *
 * The Electron proxy returns { ok, status, headers, bodyBase64 }; we
 * rehydrate a real Response so every existing call site (res.json(),
 * res.arrayBuffer(), res.headers.get(), res.ok) keeps working untouched.
 * A hard timeout race replaces the AbortSignal that the proxy cannot
 * honor, so one stuck request can never hang a sync batch. */

import { isElectron, isTauri } from "./desktopWindow";

export type DesktopFetchOptions = {
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  /** Hard ceiling for the whole request. The Electron proxy additionally
   *  enforces its own (longer) timeout in the main process. */
  timeoutMs?: number;
  /** Honored on the Tauri/web transports; on Electron the timeoutMs race
   *  plays the same role (the IPC call itself cannot be aborted). */
  signal?: AbortSignal;
};

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function electronFetch(url: string, options: DesktopFetchOptions): Promise<Response> {
  const api = window.electronAPI!;
  const timeoutMs = options.timeoutMs ?? 20000;

  let timer: number | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`Desktop fetch timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  // The loser of the race must never surface an unhandled rejection later.
  timeoutPromise.catch(() => undefined);

  try {
    const payload = await Promise.race([
      api.httpFetch(url, {
        method: options.method ?? "GET",
        headers: options.headers,
        body: options.body,
      }),
      timeoutPromise,
    ]);
    const status = typeof payload?.status === "number" ? payload.status : 0;
    if (!status) throw new Error("Malformed desktop HTTP response");
    // Response() computes `ok` from the status and parses `headers` for us,
    // so res.ok / res.json() / res.arrayBuffer() all behave natively.
    // (The cast bridges TS 5.9's ArrayBufferLike variance only — the bytes
    // are a valid BodyInit at runtime, same pattern as fileFromBytes.)
    const body = base64ToBytes(payload.bodyBase64) as unknown as BodyInit;
    return new Response(body, {
      status,
      statusText: status === 200 ? "OK" : "",
      headers: payload.headers ?? {},
    });
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

/** Transport-aware fetch with the exact same call signature the codebase
 *  already uses. Remote (http/https) URLs are routed through the
 *  platform-appropriate CORS-free transport; local blob:/data:/asset:/app:
 *  URLs always go through window.fetch (no proxy needed). */
export async function desktopFetch(url: string, options: DesktopFetchOptions = {}): Promise<Response> {
  const isRemote = /^https?:/i.test(url);

  if (isRemote && isElectron()) {
    return electronFetch(url, options);
  }

  if (isRemote && isTauri()) {
    try {
      const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
      return await tauriFetch(url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: options.signal,
      });
    } catch {
      // Plugin not registered yet (e.g. app not rebuilt after this update) —
      // fall back to the webview's own fetch below.
    }
  }

  return fetch(url, {
    method: options.method,
    headers: options.headers,
    body: options.body,
    signal: options.signal,
  });
}
