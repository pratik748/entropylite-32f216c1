import { Plus, Trash2, TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrencySymbol, formatCurrency, formatCompact, getPortfolioCurrency, isMultiCurrency } from "@/lib/currency";

export interface PortfolioStock {
  id: string;
  ticker: string;
  buyPrice: number;
  quantity: number;
  analysis?: any;
  isLoading?: boolean;
}

interface PortfolioPanelProps {
  stocks: PortfolioStock[];
  activeStockId: string | null;
  onSelectStock: (id: string) => void;
  onRemoveStock: (id: string) => void;
  onAddNew: () => void;
}

const PortfolioPanel = ({ stocks, activeStockId, onSelectStock, onRemoveStock, onAddNew }: PortfolioPanelProps) => {
  const analyzed = stocks.filter(s => s.analysis);
  const baseCurrency = getPortfolioCurrency(analyzed);
  const multi = isMultiCurrency(analyzed);
  const sym = getCurrencySymbol(baseCurrency);

  // Group by currency for accurate totals
  const byCurrency: Record<string, { invested: number; current: number }> = {};
  stocks.forEach(s => {
    const cur = s.analysis?.currency || baseCurrency;
    if (!byCurrency[cur]) byCurrency[cur] = { invested: 0, current: 0 };
    byCurrency[cur].invested += s.buyPrice * s.quantity;
    byCurrency[cur].current += (s.analysis?.currentPrice ?? s.buyPrice) * s.quantity;
  });

  const primaryCur = byCurrency[baseCurrency] || { invested: 0, current: 0 };
  const totalPnL = primaryCur.current - primaryCur.invested;
  const totalPnLPct = primaryCur.invested > 0 ? (totalPnL / primaryCur.invested) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-slide-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Portfolio</h2>
          <span className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {stocks.length} assets
          </span>
          {multi && <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning font-mono">MULTI-CCY</span>}
        </div>
        <Button size="sm" variant="outline" onClick={onAddNew} className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>

      {analyzed.length > 0 && (
        <div className="mb-4 rounded-lg bg-surface-2 p-3">
          {multi ? (
            <div className="space-y-1.5">
              {Object.entries(byCurrency).map(([cur, data]) => {
                const pnl = data.current - data.invested;
                const pct = data.invested > 0 ? (pnl / data.invested) * 100 : 0;
                const s = getCurrencySymbol(cur);
                return (
                  <div key={cur} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-mono">{cur} {s}{data.current.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    <span className={`font-mono font-semibold ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                      {pnl >= 0 ? "+" : ""}{s}{Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Portfolio Value</span>
                <span>P&L</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {sym}{primaryCur.current.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
                <span className={`font-mono text-sm font-semibold ${totalPnL >= 0 ? "text-gain" : "text-loss"}`}>
                  {totalPnL >= 0 ? "+" : ""}{sym}{Math.abs(totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({totalPnLPct >= 0 ? "+" : ""}{totalPnLPct.toFixed(1)}%)
                </span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {stocks.map((stock) => {
          const cur = stock.analysis?.currency;
          const s = getCurrencySymbol(cur);
          const pnl = stock.analysis ? (stock.analysis.currentPrice - stock.buyPrice) * stock.quantity : 0;
          const pnlPct = stock.analysis ? ((stock.analysis.currentPrice - stock.buyPrice) / stock.buyPrice) * 100 : 0;
          const isActive = stock.id === activeStockId;

          return (
            <div
              key={stock.id}
              onClick={() => onSelectStock(stock.id)}
              className={`group flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-all ${
                isActive ? "border-primary/40 bg-primary/5" : "border-border/50 bg-surface-2 hover:border-border hover:bg-surface-3"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-foreground truncate">{stock.ticker}</span>
                  {stock.isLoading && <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
                  {stock.analysis && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      stock.analysis.suggestion === "Add" ? "bg-gain/10 text-gain" :
                      stock.analysis.suggestion === "Exit" ? "bg-loss/10 text-loss" : "bg-warning/10 text-warning"
                    }`}>{stock.analysis.suggestion}</span>
                  )}
                  {cur && cur !== "USD" && <span className="text-[9px] text-muted-foreground font-mono">{cur}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  <span>{stock.quantity} qty</span>
                  <span>@ {s}{stock.buyPrice.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {stock.analysis && (
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      {pnl >= 0 ? <TrendingUp className="h-3 w-3 text-gain" /> : <TrendingDown className="h-3 w-3 text-loss" />}
                      <span className={`font-mono text-xs font-semibold ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                        {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {s}{stock.analysis.currentPrice.toLocaleString()}
                    </span>
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveStock(stock.id); }}
                  className="ml-1 rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-loss/10 hover:text-loss"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {stocks.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No assets in portfolio</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add any global asset using the form above</p>
        </div>
      )}
    </div>
  );
};

export default PortfolioPanel;
