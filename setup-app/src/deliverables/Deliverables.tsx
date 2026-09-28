/**
 * Source viewer for the deliverables. Sits outside the installer window on
 * purpose — it is scaffolding for the reviewer, not part of the experience.
 */
import { useMemo, useState } from "react";
import { DELIVERABLES, type Deliverable } from "./index";
import { cn } from "@/utils/cn";

const KIND_COLOR: Record<Deliverable["kind"], string> = {
  nsis: "#FF2D78",
  script: "#FF9EC4",
  config: "#8A8492",
  doc: "#55505C",
};

export default function Deliverables({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const file = DELIVERABLES[active];
  const lines = useMemo(() => file.content.replace(/\n$/, "").split("\n"), [file]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(file.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([file.content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = file.path.split("/").pop() ?? "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="nb-fade absolute inset-0 bg-black/80" onClick={onClose} />
      <div
        className="nb-rise relative flex h-full max-h-[880px] w-full max-w-[1340px] overflow-hidden rounded-2xl border border-white/10 bg-[#0A090E]"
        style={{ boxShadow: "0 50px 140px rgba(0,0,0,0.8)" }}
      >
        {/* index */}
        <aside className="flex w-[320px] shrink-0 flex-col border-e border-white/[0.07]">
          <div className="px-6 pb-4 pt-7">
            <div className="nb-font-mono text-[10px] tracking-[0.3em] text-nb-a1/80 uppercase">
              Deliverables
            </div>
            <p className="mt-3 text-[11.5px] leading-5 text-nb-muted">
              Imported from disk with Vite&nbsp;<span className="nb-font-mono">?raw</span> — the
              viewer shows the file that actually ships.
            </p>
          </div>
          <div className="nb-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            {DELIVERABLES.map((d, i) => (
              <button
                key={d.path}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "mb-0.5 flex w-full items-start gap-3 px-3 py-2.5 text-start transition-colors duration-150",
                  i === active ? "rounded-lg bg-nb-a1/12" : "rounded-lg hover:bg-white/[0.03]",
                )}
              >
                <span
                  className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: KIND_COLOR[d.kind] }}
                />
                <span className="min-w-0">
                  <span
                    className="nb-font-mono block truncate text-[11px]"
                    style={{ color: i === active ? "#F4F1F5" : "#8A8492" }}
                  >
                    {d.path}
                  </span>
                  <span className="nb-font-mono mt-1 block text-[9.5px] text-nb-dim/60">
                    {d.content.split("\n").length} lines ·{" "}
                    {(new Blob([d.content]).size / 1024).toFixed(1)} kB
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* content */}
        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-start justify-between gap-6 border-b border-white/[0.07] px-8 py-6">
            <div className="min-w-0">
              <h2 className="nb-font-mono truncate text-[14px] text-nb-ink">{file.path}</h2>
              <p className="mt-2 max-w-[70ch] text-[11.5px] leading-5 text-nb-muted">{file.role}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="nb-focus rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] text-nb-muted transition-colors hover:border-nb-a1/50 hover:text-nb-ink"
              >
                {copied ? "copied ✓" : "copy"}
              </button>
              <button
                type="button"
                onClick={download}
                className="nb-focus rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] text-nb-muted transition-colors hover:border-nb-a1/50 hover:text-nb-ink"
              >
                download
              </button>
              <button
                type="button"
                onClick={onClose}
                className="nb-focus rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] text-nb-muted transition-colors hover:border-nb-a1/50 hover:text-nb-ink"
              >
                close
              </button>
            </div>
          </header>

          <div className="nb-scroll min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse">
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="nb-font-mono w-[1%] select-none border-e border-white/[0.06] px-3 py-[1px] text-end align-top text-[10px] leading-[1.55] text-nb-dim/35">
                      {i + 1}
                    </td>
                    <td className="nb-font-mono whitespace-pre px-4 py-[1px] text-[11px] leading-[1.55] text-nb-ink/75">
                      {l || " "}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
