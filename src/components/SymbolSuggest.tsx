import { useEffect, useMemo, useRef, useState } from "react";
import { searchSymbols, type SymbolEntry } from "@/lib/symbolDirectory";

const KIND_LABELS: Record<SymbolEntry["kind"], string> = {
  equity: "EQ",
  crypto: "CRY",
  fx: "FX",
  commodity: "CMD",
  etf: "ETF",
  index: "IDX",
};

interface UseSymbolSuggestOpts {
  limit?: number;
}

/**
 * Ticker auto-suggest hook. Returns props to spread onto an <Input>,
 * a wrapRef to attach to the input's container (for click-outside),
 * and a `Dropdown` element to render inside that same container.
 */
export function useSymbolSuggest(
  value: string,
  setValue: (v: string) => void,
  opts: UseSymbolSuggestOpts = {},
) {
  const limit = opts.limit ?? 8;
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const suggestions = useMemo<SymbolEntry[]>(
    () => (value.trim().length >= 1 ? searchSymbols(value, limit) : []),
    [value, limit],
  );

  useEffect(() => setActiveIdx(0), [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pick = (entry: SymbolEntry) => {
    setValue(entry.ticker);
    setOpen(false);
  };

  const inputProps = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setValue(e.target.value);
      setOpen(true);
    },
    onFocus: () => setOpen(true),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open || suggestions.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === "Enter") {
        if (suggestions[activeIdx]) {
          e.preventDefault();
          pick(suggestions[activeIdx]);
        }
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    autoComplete: "off" as const,
  };

  const dropdown =
    open && suggestions.length > 0 ? (
      <SuggestList suggestions={suggestions} activeIdx={activeIdx} onPick={pick} />
    ) : null;

  return { inputProps, dropdown, wrapRef, close: () => setOpen(false) };
}

interface SuggestListProps {
  suggestions: SymbolEntry[];
  activeIdx: number;
  onPick: (entry: SymbolEntry) => void;
}

export const SuggestList = ({ suggestions, activeIdx, onPick }: SuggestListProps) => (
  <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-border bg-popover shadow-lg overflow-hidden animate-fade-in">
    <ul className="max-h-72 overflow-auto py-1">
      {suggestions.map((s, i) => {
        const active = i === activeIdx;
        return (
          <li key={s.ticker}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(s);
              }}
              className={`w-full text-left px-2 py-1.5 flex items-center gap-2 transition-colors ${
                active ? "bg-primary/10" : "hover:bg-surface-2"
              }`}
            >
              <span className="font-mono text-[11px] font-semibold text-foreground min-w-[80px]">
                {s.ticker}
              </span>
              <span className="text-[10px] text-muted-foreground truncate flex-1">{s.name}</span>
              <span className="font-mono text-[8px] text-muted-foreground/60 px-1 py-0.5 rounded bg-surface-2 border border-border/50">
                {KIND_LABELS[s.kind]} · {s.exchange}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  </div>
);