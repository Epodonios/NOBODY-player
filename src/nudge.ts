// ── NOBODY · support nudge scheduler (V1.4.0, user request #2) ───────────────
// "Every once in a while a small, beautiful, per-face popup appears asking
//  for a donation or a GitHub star."
//
// ONE shared scheduler (module singleton) — all four faces subscribe, but
// only the ACTIVE face renders the popup, so a UI switch mid-schedule never
// double-fires and the cadence is global to the app, not per face.
//
// Cadence:
//   • first appearance 4–8 min into a session (so it never nags at launch)
//   • afterwards every 15–25 min (random, feels organic)
//   • kind alternates randomly between "donate" and "star" (55/45)
//   • suppressed while the user is in fullscreen/ambient/compact modes
//     (each face checks its own state before rendering — see briefs)

import { useEffect, useState } from "react";
import { getUiMode, type UiMode } from "./uiMode";

export type NudgeKind = "donate" | "star";

const STORE_KEY = "nobody-nudge-v1";
const NUDGE_EVENT = "nobody-nudge-show";

const FIRST_MIN = 4 * 60_000;
const FIRST_MAX = 8 * 60_000;
const NEXT_MIN = 15 * 60_000;
const NEXT_MAX = 25 * 60_000;

interface NudgeStore {
  lastShown?: number; // epoch ms of the last actual popup
  count?: number; // total popups ever shown
}

function readStore(): NudgeStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as NudgeStore) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(s: NudgeStore) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* private mode / full quota → cadence just resets each boot */
  }
}

const randBetween = (a: number, b: number) => a + Math.random() * (b - a);

let schedulerStarted = false;

function ensureScheduler() {
  if (schedulerStarted || typeof window === "undefined") return;
  schedulerStarted = true;

  const plan = () => {
    const st = readStore();
    const since = Date.now() - (st.lastShown ?? 0);
    // fresh session with a recent popup → wait out most of the long interval;
    // otherwise this is the "first look" → the short friendly delay
    const delay = st.lastShown && since < NEXT_MAX ? Math.max(NEXT_MIN - since, 90_000) : randBetween(FIRST_MIN, FIRST_MAX);
    window.setTimeout(() => {
      const kind: NudgeKind = Math.random() < 0.55 ? "donate" : "star";
      const cur = readStore();
      writeStore({ lastShown: Date.now(), count: (cur.count ?? 0) + 1 });
      window.dispatchEvent(new CustomEvent(NUDGE_EVENT, { detail: { kind } }));
      plan(); // keep the cycle alive for long-running sessions
    }, delay);
  };
  plan();
}

export interface SupportNudge {
  /** null = hidden; otherwise the popup kind to render. */
  nudge: { kind: NudgeKind } | null;
  dismiss: () => void;
}

/**
 * Subscribe a face to the shared scheduler. Pass this face's UiMode — the
 * popup only materializes while that face is the active one.
 */
export function useSupportNudge(ui: UiMode): SupportNudge {
  const [nudge, setNudge] = useState<{ kind: NudgeKind } | null>(null);

  useEffect(() => {
    ensureScheduler();
    const onShow = (e: Event) => {
      const kind = (e as CustomEvent).detail?.kind as NudgeKind | undefined;
      if (kind && getUiMode() === ui) setNudge({ kind });
    };
    window.addEventListener(NUDGE_EVENT, onShow);
    return () => window.removeEventListener(NUDGE_EVENT, onShow);
  }, [ui]);

  return { nudge, dismiss: () => setNudge(null) };
}
