// ── NOBODY · DreamField — the living aurora that backs the rêve edition ──────
// Pure presentational layers: four accent-anchored light blobs, two stardust
// veils and a horizon glow. All motion is CSS (transform/opacity only) and the
// whole field reacts to playback through [data-playing="true"] on #nc-root.
// Nothing here ever re-renders — it mounts once and lets the stylesheet run.

export function DreamField({ strong = false }: { strong?: boolean }) {
  return (
    <div className="nc-dream" aria-hidden={true} style={strong ? ({ ["--blob-o" as any]: 0.22, ["--dust-o" as any]: 0.7 } as React.CSSProperties) : undefined}>
      <div className="nc-dream-blob b1" />
      <div className="nc-dream-blob b2" />
      <div className="nc-dream-blob b3" />
      <div className="nc-dream-blob b4" />
      <div className="nc-dust" />
      <div className="nc-dust2" />
      <div className="nc-horizon" />
    </div>
  );
}
