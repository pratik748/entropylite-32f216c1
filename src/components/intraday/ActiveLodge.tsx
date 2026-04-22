import { useEffect, useState } from "react";
import { Activity, X, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { ValidatorResult } from "@/hooks/useIntradayValidator";

export interface OpenLodge {
  id: string;
  ticker: string;
  side: "long" | "short";
  entryPx: number;
  qty: number;
  entryTs: number;
  expected: ValidatorResult;
  liquidityScore: number;
  reflexScore: number;
  regime: string;
}

interface Props {
  lodges: OpenLodge[];
  livePriceFor: (ticker: string) => number | null;
  onClose: (id: string, exitPx: number, latencyMs: number) => void;
}

const ActiveLodge = ({ lodges, livePriceFor, onClose }: Props) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (lodges.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-card/50 p-4 text-center">
        <Activity className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
        <p className="text-[10px] font-mono text-muted-foreground">No active lodges. Validate a trade and open a lodge to start.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {lodges.map(l => {
        const live = livePriceFor(l.ticker);
        const px = live ?? l.entryPx;
        const pnlPct = l.side === "long"
          ? ((px - l.entryPx) / l.entryPx) * 100
          : ((l.entryPx - px) / l.entryPx) * 100;
        const ageMin = (Date.now() - l.entryTs) / 60_000;
        const expectedPct = l.expected.expectedReturnPct;
        const divergence = pnlPct - expectedPct;
        const optimalHold = l.expected.expectedHoldMin;
        const holdRatio = Math.min(1.5, ageMin / Math.max(1, optimalHold));
        const edgeRemaining = Math.max(0, 1 - holdRatio);
        const exitNudge = holdRatio >= 1 || pnlPct >= l.expected.expectedReturnPct;

        return (
          <div key={l.id} className="rounded-sm border border-border bg-card p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-mono font-bold text-foreground">{l.ticker}</span>
                <Badge variant="outline" className="text-[8px] font-mono uppercase">{l.side}</Badge>
                <span className="text-[9px] font-mono text-muted-foreground">{l.regime}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[12px] font-mono font-bold ${pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                  {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                </span>
                {pnlPct >= 0 ? <TrendingUp className="h-3 w-3 text-gain" /> : <TrendingDown className="h-3 w-3 text-loss" />}
                <Button
                  size="sm" variant="ghost"
                  className="h-6 px-2 text-[9px] font-mono uppercase tracking-wider hover:bg-loss/10 hover:text-loss"
                  onClick={() => onClose(l.id, px, 50)}
                >
                  <X className="h-3 w-3 mr-0.5" /> Close
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-[9px] font-mono mb-1.5">
              <Mini label="Entry" value={l.entryPx.toFixed(2)} />
              <Mini label="Live" value={px.toFixed(2)} />
              <Mini label="Age" value={`${ageMin.toFixed(1)}m`} />
              <Mini label="Optimal" value={`${optimalHold.toFixed(0)}m`} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-[9px] font-mono mb-1.5">
              <Mini label="Expected" value={`${expectedPct >= 0 ? "+" : ""}${expectedPct.toFixed(2)}%`} />
              <Mini label="Divergence" value={`${divergence >= 0 ? "+" : ""}${divergence.toFixed(2)}%`} accent={divergence >= 0 ? "gain" : "loss"} />
              <Mini label="Liquidity" value={`${(l.liquidityScore * 100).toFixed(0)}/100`} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                <span>Edge decay</span>
                <span className={exitNudge ? "text-warning animate-pulse" : ""}>
                  {exitNudge ? "EXIT WINDOW" : `${(edgeRemaining * 100).toFixed(0)}% edge left`}
                </span>
              </div>
              <Progress value={edgeRemaining * 100} className="h-1" />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const Mini = ({ label, value, accent }: { label: string; value: string; accent?: "gain" | "loss" }) => (
  <div className="rounded-sm bg-surface-1 px-1.5 py-1 border border-border/40">
    <div className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`${accent === "gain" ? "text-gain" : accent === "loss" ? "text-loss" : "text-foreground"} font-bold`}>{value}</div>
  </div>
);

export default ActiveLodge;