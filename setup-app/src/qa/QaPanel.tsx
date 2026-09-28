/**
 * QA harness. This panel is reviewer scaffolding: it exists so the claims in
 * worklog.md can be checked in a browser — DPI scales, the 1366×768 floor, the
 * four languages, the upgrade path, the low-disk branch, and the uninstaller.
 */
import { useState } from "react";
import { LANGS } from "@/installer/i18n";
import { TOKENS } from "@/installer/tokens";
import { useSetup } from "@/installer/useSetup";
import { cn } from "@/utils/cn";

export default function QaPanel() {
  const s = useSetup();
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-none fixed inset-y-0 start-0 z-[90] flex">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="nb-focus pointer-events-auto flex w-8 items-center justify-center border-y border-e border-nb-hair bg-[#0a090c]/90 text-nb-dim transition-colors hover:text-nb-a2"
          style={{ writingMode: "vertical-rl" }}
        >
          <span className="nb-font-mono text-[10px] tracking-[0.3em] uppercase">QA</span>
        </button>
      )}

      {open && (
        <div className="nb-fade pointer-events-auto flex w-[302px] flex-col rounded-e-2xl border-e border-white/10 bg-[#0B0A0F]/95">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
            <span className="nb-font-mono text-[10px] tracking-[0.3em] text-nb-a1/80 uppercase">
              QA harness
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="nb-focus nb-font-mono text-[10px] text-nb-dim hover:text-nb-ink"
            >
              hide
            </button>
          </div>

          <div className="nb-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <Group label="DPI scale">
              <Seg
                options={[
                  { v: 1, l: "100%" },
                  { v: 1.25, l: "125%" },
                  { v: 1.5, l: "150%" },
                ]}
                value={s.scale}
                onChange={s.setScale}
              />
            </Group>

            <Group label="monitor">
              <Seg
                options={[
                  { v: 0, l: "native" },
                  { v: 1, l: "1366×768" },
                ]}
                value={s.narrow ? 1 : 0}
                onChange={(v) => s.setNarrow(v === 1)}
              />
            </Group>

            <Group label="language (mirrors layout for fa)">
              <div className="flex gap-1">
                {LANGS.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => s.setLang(l.code)}
                    className={cn(
                      "nb-focus nb-font-mono flex-1 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-[10px] transition-colors",
                      s.lang === l.code
                        ? "border-nb-a1/70 bg-nb-a1/10 text-nb-a2"
                        : "border-nb-hair text-nb-dim hover:text-nb-muted",
                    )}
                  >
                    {l.tag}
                  </button>
                ))}
              </div>
            </Group>

            <Group label="extraction speed (simulated)">
              <Seg
                options={[
                  { v: 0.35, l: "0.35×" },
                  { v: 1, l: "1×" },
                  { v: 3, l: "3×" },
                  { v: 12, l: "12×" },
                ]}
                value={s.speed}
                onChange={s.setSpeed}
              />
            </Group>

            <Group label="pre-existing install">
              <Toggle
                on={s.forceUpgrade}
                onChange={() => s.setForceUpgrade(!s.forceUpgrade)}
                label="V1.4.0 detected → upgrade path"
              />
              <Toggle
                on={s.lowDisk}
                onChange={() => s.setLowDisk(!s.lowDisk)}
                label="target drive nearly full"
              />
              <Toggle
                on={s.showDesktop}
                onChange={() => s.setShowDesktop(!s.showDesktop)}
                label="desktop backdrop"
              />
            </Group>

            <Group label="motion">
              <Seg
                options={[
                  { v: 1, l: "on" },
                  { v: 0, l: "reduced" },
                ]}
                value={s.motionOn ? 1 : 0}
                onChange={(v) => s.setMotionOn(v === 1)}
              />
              <div className="mt-2">
                <Toggle
                  on={s.ambient}
                  onChange={() => s.setAmbient(!s.ambient)}
                  label="ambient dust + aurora"
                />
              </div>
              <Row
                label="replay the curtain"
                hint="intro"
                onClick={s.replayCurtain}
              />
              <Row label="fire light burst" hint="finish fx" onClick={s.fireBurst} />
            </Group>

            <Group label="surfaces">
              <div className="flex flex-col gap-1.5">
                <Row
                  label="uninstaller"
                  hint="3 custom pages"
                  onClick={s.launchUninstaller}
                />
                <Row
                  label="deliverables"
                  hint="10 source files"
                  onClick={() => s.setDeliverablesOpen(true)}
                />
                <Row label="reset everything" hint="back to page 1" onClick={s.restart} />
              </div>
            </Group>

            <div className="nb-font-mono mt-6 border-t border-white/[0.07] pt-4 text-[9.5px] leading-5 text-nb-dim/70">
              ESC · leave / stop&nbsp;&nbsp;TAB · focus ring&nbsp;&nbsp;ENTER · primary
              <br />
              window {TOKENS.window.w}×{TOKENS.window.h} · {TOKENS.install.files} files ·{" "}
              {TOKENS.install.sizeMb} MB
              <br />
              accent {TOKENS.accent1} / {TOKENS.accent2} sampled from build/icon.png
              <br />
              <span className="text-nb-a2/70">
                progress in this harness is simulated — the .exe reads Nsis7z callbacks.
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="nb-font-mono mb-2 text-[9px] tracking-[0.24em] text-nb-dim/60 uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function Seg<T extends number>({
  options,
  value,
  onChange,
}: {
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.l}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "nb-focus nb-font-mono flex-1 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-[10px] transition-colors",
            value === o.v
              ? "border-nb-a1/70 bg-nb-a1/10 text-nb-a2"
              : "border-nb-hair text-nb-dim hover:text-nb-muted",
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="nb-focus mb-1.5 flex w-full items-center gap-3 rounded-lg py-1 text-start hover:bg-white/[0.03]"
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-md border transition-colors",
          on ? "border-nb-a1 bg-nb-a1/20" : "border-nb-hair",
        )}
      >
        {on && <span className="h-1 w-1 rounded-full" style={{ background: "#FF9EC4" }} />}
      </span>
      <span className={cn("text-[11px]", on ? "text-nb-muted" : "text-nb-dim")}>{label}</span>
    </button>
  );
}

function Row({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="nb-focus flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.022] px-3 py-2 text-start transition-colors hover:border-nb-a1/40"
    >
      <span className="text-[11px] text-nb-muted">{label}</span>
      <span className="nb-font-mono text-[9px] text-nb-dim/70">{hint}</span>
    </button>
  );
}
