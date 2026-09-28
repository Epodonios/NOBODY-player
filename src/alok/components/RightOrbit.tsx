// ── NOBODY ALOK · right orbit ────────────────────────────────────────────────
// The vertical stack of five circular instruments from the mock:
//   T → lyrics sheet · sparkle-wand → Aura fullscreen · layers → queue sheet
//   lightning → FX bottom sheet · music-note → Mood sheet (ring palette).
// Each button can carry a live detail: queue count badge, EQ activity LED and
// the current palette color on the mood key.

import { Wand2, Layers, Zap, Music2 } from "lucide-react";
import { useT } from "../../cinema/lib/useT";
import { useUi } from "../../cinema/store/ui";
import { useSettings } from "../../cinema/store/settings";
import { useAlokUi } from "../store/alokUi";
import { ringSolid } from "../lib/palette";

export function RightOrbit({ accent }: { accent: string }) {
  const t = useT();
  const showLyrics = useAlokUi((s) => s.showLyrics);
  const setShowLyrics = useAlokUi((s) => s.setShowLyrics);
  const showAura = useAlokUi((s) => s.showAura);
  const setShowAura = useAlokUi((s) => s.setShowAura);
  const showQueue = useAlokUi((s) => s.showQueue);
  const setShowQueue = useAlokUi((s) => s.setShowQueue);
  const showFx = useAlokUi((s) => s.showFx);
  const setShowFx = useAlokUi((s) => s.setShowFx);
  const showMood = useAlokUi((s) => s.showMood);
  const setShowMood = useAlokUi((s) => s.setShowMood);
  const queueCount = useUi((s) => s.queueIds.length);
  const eqOn = useSettings((s) => s.eqEnabled ?? false);
  const ring = useSettings((s) => s.alokRing ?? "cover");

  return (
    <div className="na-orbit" role="toolbar" aria-label="instruments" aria-orientation="vertical">
      <button
        className="na-orbit-btn"
        data-on={showLyrics}
        onClick={() => setShowLyrics(!showLyrics)}
        title={t("alLyrics")}
        aria-label={t("alLyrics")}
        aria-pressed={showLyrics}
      >
        <span className="na-orbit-t" aria-hidden>T</span>
      </button>
      <button
        className="na-orbit-btn"
        onClick={() => setShowAura(true)}
        title={t("alAura")}
        aria-label={t("alAura")}
        disabled={showAura}
      >
        <Wand2 size={18} strokeWidth={1.7} />
      </button>
      <button
        className="na-orbit-btn"
        data-on={showQueue}
        onClick={() => setShowQueue(!showQueue)}
        title={t("alQueue")}
        aria-label={t("alQueue")}
        aria-pressed={showQueue}
      >
        <Layers size={18} strokeWidth={1.7} />
        {queueCount > 0 && <span className="na-orbit-badge" aria-hidden>{queueCount > 99 ? "99+" : queueCount}</span>}
      </button>
      <button
        className="na-orbit-btn"
        data-on={showFx}
        onClick={() => setShowFx(!showFx)}
        title={t("alFx")}
        aria-label={t("alFx")}
        aria-pressed={showFx}
      >
        <Zap size={18} strokeWidth={1.7} />
        {eqOn && !showFx && <span className="na-orbit-led" style={{ background: "var(--na-accent)" }} aria-hidden />}
      </button>
      <button
        className="na-orbit-btn"
        data-on={showMood}
        onClick={() => setShowMood(!showMood)}
        title={t("alMood")}
        aria-label={t("alMood")}
        aria-pressed={showMood}
      >
        <Music2 size={18} strokeWidth={1.7} />
        {!showMood && <span className="na-orbit-led" style={{ background: ringSolid(ring, accent) }} aria-hidden />}
      </button>
    </div>
  );
}
