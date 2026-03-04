import { History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface HistoryEntry {
  id: string;
  ticker: string;
  timestamp: number;
  suggestion: "Hold" | "Add" | "Exit";
  currentPrice: number;
  buyPrice: number;
  confidence: number;
}

interface AnalysisHistoryProps {
  entries: HistoryEntry[];
  onClear: () => void;
  onSelect: (entry: HistoryEntry) => void;
}

const AnalysisHistory = ({ entries, onClear, onSelect }: AnalysisHistoryProps) => {
  if (entries.length === 0) return null;

  return (
    <div className="glass-card rounded-2xl p-5 animate-slide-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">History</h2>
          <span className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {entries.length}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={onClear} className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-loss">
          <Trash2 className="h-3 w-3" />
          Clear
        </Button>
      </div>

      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
        {entries.map((entry) => {
          const pnlPct = ((entry.currentPrice - entry.buyPrice) / entry.buyPrice * 100);
          const suggestionColor =
            entry.suggestion === "Add"
              ? "text-gain"
              : entry.suggestion === "Exit"
              ? "text-loss"
              : "text-warning";

          return (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="w-full flex items-center justify-between rounded-lg border border-border/50 bg-surface-2 p-3 text-left transition-colors hover:bg-surface-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground">{entry.ticker}</span>
                  <span className={`text-xs font-medium ${suggestionColor}`}>{entry.suggestion}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="text-right">
                <span className={`font-mono text-xs font-semibold ${pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                  {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                </span>
                <p className="font-mono text-[10px] text-muted-foreground">{entry.confidence}% conf</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AnalysisHistory;
