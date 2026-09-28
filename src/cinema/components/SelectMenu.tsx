// ── NOBODY · shared themed dropdown (replaces native <select>) ───────────────
// BUG FIX (user report): clicking the library sort <select> opened the
// Windows-native dropdown menu — an OS artifact that clashed with every
// NOBODY face ("it looks like Windows"). This listbox is drawn entirely by
// the app: it inherits whichever root's CSS variables it sits in (cinema
// glass / EELA paper / ALOK neon all define --card, --line, --fg, --mut,
// --accent), respects RTL via logical properties, and is keyboard-operable
// (Enter/Space/↑↓/Esc, proper listbox roles + aria-selected).

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../utils/cn";

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  className,
  menuClassName,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [cursor, setCursor] = useState(activeIndex);
  // close on outside press
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown, { capture: true });
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, { capture: true });
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [open]);

  // Flip the menu upward when there is no room below (library header sits
  // high). Decided at open time from the TRIGGER's rect — no post-layout
  // measurement needed, so no setState-in-effect (react-compiler clean).
  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = rootRef.current?.getBoundingClientRect();
    if (r) {
      const est = Math.min(options.length * 38 + 14, 330);
      setDropUp(window.innerHeight - r.bottom < est && r.top > est);
    }
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const commit = (index: number) => {
    const opt = options[index];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(options.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(cursor);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const current = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} className={cn("nb-select", className)}>
      <button
        type="button"
        className="nb-select-trigger"
        onClick={toggle}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="nb-select-value">{current?.label ?? ""}</span>
        <ChevronDown size={13} className="nb-select-chevron" aria-hidden data-open={open} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className={cn("nb-select-menu", dropUp && "nb-select-up", menuClassName)}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
        >
          {options.map((opt, i) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={selected}
                data-cursor-active={i === cursor}
                className="nb-select-option"
                onMouseEnter={() => setCursor(i)}
                onClick={() => commit(i)}
              >
                <span className="nb-select-check" aria-hidden>
                  {selected && <Check size={13} />}
                </span>
                <span className="nb-select-label">{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
