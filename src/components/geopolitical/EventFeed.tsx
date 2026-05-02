import { memo } from "react";
import { Activity, Radio } from "lucide-react";
import type { ScoredGeoEvent } from "@/hooks/useGeoEvents";
import { cn } from "@/lib/utils";

interface Props {
  events: ScoredGeoEvent[];
  loading: boolean;
  lastTick: number | null;
  error: string | null;
  selectedId?: string | null;
  onSelect: (e: ScoredGeoEvent) => void;
}

const CAT_COLOR: Record<string, string> = {
  military: "text-loss border-loss/40 bg-loss/5",
  economic: "text-warning border-warning/40 bg-warning/5",
  political: "text-violet-400 border-violet-400/40 bg-violet-400/5",
  supply_chain: "text-sky-400 border-sky-400/40 bg-sky-400/5",
  cyber: "text-cyan-400 border-cyan-400/40 bg-cyan-400/5",
};

function formatAge(min: number): string {
  if (min < 1) return "now";
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 24 * 60) return `${Math.round(min / 60)}h`;
  return `${Math.round(min / 1440)}d`;
}

function EventRow({
  e,
  selected,
  onSelect,
}: { e: ScoredGeoEvent; selected: boolean; onSelect: () => void }) {
  const cat = CAT_COLOR[e.category] || CAT_COLOR.political;
  const tickers = e.entities?.tickers?.slice(0, 3) || [];
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left px-3 py-2.5 border-l-2 border-b border-border/40 hover:bg-muted/40 transition-colors",
        selected ? "bg-muted/60 border-l-primary" : "border-l-transparent",
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className={cn("font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border rounded-sm", cat)}>
          {e.category.replace("_", " ")}
        </span>
        <span className="font-mono text-[9px] text-muted-foreground/60 tabular-nums">
          {formatAge(e.ageMin)} · {e.source.slice(0, 14)}
        </span>
      </div>
      <div className="text-[12px] leading-snug text-foreground/90 line-clamp-2">
        {e.title}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {tickers.map(t => (
            <span key={t} className="font-mono text-[9px] text-muted-foreground bg-muted/50 px-1 rounded-sm">
              {t}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono text-[9px] text-muted-foreground/70 tabular-nums">
          <span>S {Math.round(e.severity * 100)}</span>
          <span>M {Math.round(e.market_relevance * 100)}</span>
          <span>V {Math.round(e.velocity * 100)}</span>
        </div>
      </div>
    </button>
  );
}

const MemoRow = memo(EventRow);

export default function EventFeed({ events, loading, lastTick, error, selectedId, onSelect }: Props) {
  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-1/60">
        <div className="flex items-center gap-1.5">
          <Radio className="h-3 w-3 text-primary animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-foreground">
            Live Wire
          </span>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground tabular-nums">
          {lastTick ? `↻ ${Math.max(0, Math.round((Date.now() - lastTick) / 1000))}s` : "—"}
          {" · "}{events.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && events.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-xs gap-2">
            <Activity className="h-3 w-3 animate-pulse" /> ingesting wires…
          </div>
        ) : error && events.length === 0 ? (
          <div className="px-3 py-6 text-[11px] text-muted-foreground text-center">
            Feed paused. Reconnecting…
          </div>
        ) : events.length === 0 ? (
          <div className="px-3 py-6 text-[11px] text-muted-foreground text-center">
            No high-signal events on the wire.
          </div>
        ) : (
          events.slice(0, 60).map(e => (
            <MemoRow key={e.id} e={e} selected={selectedId === e.id} onSelect={() => onSelect(e)} />
          ))
        )}
      </div>
    </div>
  );
}