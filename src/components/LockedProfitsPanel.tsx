import { useMemo, useState } from "react";
import { Lock, Trash2, ChevronDown, ChevronUp, Settings } from "lucide-react";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import { useAutoLockProfits, type LockedExit } from "@/hooks/useAutoLockProfits";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

const TRIGGER_LABELS: Record<string, string> = {
  chandelier: "Trailing Stop",
  drawdown: "Vol Drawdown",
  momentum: "Momentum Flip",
  risk: "Risk Spike",
  ai: "AI Verdict",
};

interface Props {
  stocks: PortfolioStock[];
}

const LockedProfitsPanel = ({ stocks }: Props) => {
  const { baseCurrency, convertToBase } = useFX();
  const baseSym = getCurrencySymbol(baseCurrency);
  const { config, setConfig, locked, clearLocked } = useAutoLockProfits(stocks);
  const [open, setOpen] = useState(true);

  const { totalBase, wins, losses } = useMemo(() => {
    let totalBase = 0, wins = 0, losses = 0;
    for (const l of locked) {
      const v = convertToBase(Number(l.pnl_abs || 0), l.currency || "USD");
      totalBase += v;
      if (v > 0) wins++; else if (v < 0) losses++;
    }
    return { totalBase, wins, losses };
  }, [locked, convertToBase]);

  return (
    <div className="border-t border-border bg-surface-1">
      <div className="px-2 py-1.5 flex items-center justify-between">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <Lock className="h-3 w-3" />
          <span>Locked Profits</span>
          <span className="text-muted-foreground/60">({locked.length})</span>
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[10px] font-semibold ${totalBase >= 0 ? "text-gain" : "text-loss"}`}>
            {totalBase >= 0 ? "+" : ""}{baseSym}{Math.abs(totalBase).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <Popover>
            <PopoverTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground" title="Auto-lock settings">
                <Settings className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <Label htmlFor="autolock-enabled" className="text-xs">Auto-lock</Label>
                <Switch id="autolock-enabled" checked={config.enabled} onCheckedChange={(v) => setConfig({ enabled: v })} />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Aggressiveness</Label>
                <div className="grid grid-cols-3 gap-1">
                  {(["conservative", "balanced", "aggressive"] as const).map(a => (
                    <button key={a}
                      onClick={() => setConfig({ aggressiveness: a })}
                      className={`text-[10px] font-mono py-1 rounded border ${config.aggressiveness === a ? "bg-primary/15 border-primary text-primary" : "border-border text-muted-foreground hover:bg-surface-2"}`}>
                      {a[0].toUpperCase() + a.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Min profit before lock: {config.minProfitPct.toFixed(1)}%</Label>
                <Slider value={[config.minProfitPct]} min={0} max={5} step={0.1} onValueChange={(v) => setConfig({ minProfitPct: v[0] })} />
              </div>
              <p className="text-[9px] text-muted-foreground leading-snug">
                Virtual sells use real 1y volatility (ATR + adaptive drawdown + momentum z-score) plus AI verdict. Your holdings are not touched.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {open && (
        <div className="max-h-48 overflow-auto border-t border-border/50">
          {locked.length === 0 ? (
            <div className="px-2 py-3 text-center text-[10px] text-muted-foreground font-mono">
              No exits yet. Engine watching {stocks.filter(s => s.analysis).length} positions.
              <div className="text-[9px] mt-1 text-muted-foreground/70">W {wins} / L {losses}</div>
            </div>
          ) : (
            <table className="w-full font-mono text-[10px]">
              <thead>
                <tr className="text-muted-foreground border-b border-border/40">
                  <th className="text-left px-2 py-1">TICKER</th>
                  <th className="text-right px-2 py-1">EXIT</th>
                  <th className="text-right px-2 py-1">P&L</th>
                  <th className="text-left px-2 py-1">TRIGGER</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {locked.map((l: LockedExit) => {
                  const sym = getCurrencySymbol(l.currency || "USD");
                  const pnl = Number(l.pnl_abs || 0);
                  const pnlPct = Number(l.pnl_pct || 0);
                  return (
                    <tr key={l.id} className="border-b border-border/20 hover:bg-surface-2 group/row">
                      <td className="px-2 py-0.5 font-semibold">{l.ticker}</td>
                      <td className="px-2 py-0.5 text-right tabular-nums">{sym}{Number(l.exit_price).toFixed(2)}</td>
                      <td className={`px-2 py-0.5 text-right tabular-nums font-semibold ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                        {pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                      </td>
                      <td className="px-2 py-0.5 text-muted-foreground text-[9px]">{TRIGGER_LABELS[l.trigger_reason] || l.trigger_reason}</td>
                      <td className="px-2 py-0.5 text-right">
                        <button onClick={() => clearLocked(l.id)} className="opacity-0 group-hover/row:opacity-100 text-muted-foreground hover:text-loss transition-opacity">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};

export default LockedProfitsPanel;
