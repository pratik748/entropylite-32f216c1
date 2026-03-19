import { Plus, Trash2, TrendingUp, TrendingDown, BarChart3, Wifi, WifiOff, Clock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getCurrencySymbol, formatCurrency, formatCompact, isMultiCurrency } from "@/lib/currency";
import { useFX, SUPPORTED_CURRENCIES } from "@/hooks/useFX";
import { type PriceStatusMap, type PriceFreshness } from "@/pages/Index";

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
  priceStatus?: PriceStatusMap;
}

const FreshnessIndicator = ({ status }: { status?: PriceFreshness }) => {
  if (!status || status === "LIVE") {
    return (
      <span className="flex items-center gap-0.5 text-[7px] font-mono text-gain" title="Real-time price feed active">
        <Wifi className="h-2 w-2" />
        <span>LIVE</span>
      </span>
    );
  }
  if (status === "DELAYED") {
    return (
      <span className="flex items-center gap-0.5 text-[7px] font-mono text-warning" title="Price update delayed">
        <Clock className="h-2 w-2" />
        <span>DELAY</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-0.5 text-[7px] font-mono text-loss" title="Price feed disconnected">
      <WifiOff className="h-2 w-2" />
      <span>OFF</span>
    </span>
  );
};

const PortfolioPanel = ({ stocks, activeStockId, onSelectStock, onRemoveStock, onAddNew, priceStatus }: PortfolioPanelProps) => {
  const { baseCurrency, setBaseCurrency, convertToBase } = useFX();
  const analyzed = stocks.filter(s => s.analysis);
  const multi = isMultiCurrency(analyzed);
  const baseSym = getCurrencySymbol(baseCurrency);

  // Normalize all to base currency
  let totalInvested = 0;
  let totalCurrent = 0;
  stocks.forEach(s => {
    const cur = s.analysis?.currency || "USD";
    const invested = s.buyPrice * s.quantity;
    const current = (s.analysis?.currentPrice ?? s.buyPrice) * s.quantity;
    totalInvested += convertToBase(invested, cur);
    totalCurrent += convertToBase(current, cur);
  });

  const totalPnL = totalCurrent - totalInvested;
  const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-slide-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Portfolio</h2>
          <span className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {stocks.length} assets
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            className="h-7 rounded-md bg-surface-2 border border-border px-1.5 text-[10px] font-mono text-muted-foreground focus:text-foreground focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
          >
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={onAddNew} className="h-7 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>

      {analyzed.length > 0 && (
        <div className="mb-4 rounded-lg bg-surface-2 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Portfolio Value ({baseCurrency})</span>
            <span>P&L</span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="font-mono text-sm font-semibold text-foreground">
              {baseSym}{totalCurrent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            <span className={`font-mono text-sm font-semibold ${totalPnL >= 0 ? "text-gain" : "text-loss"}`}>
              {totalPnL >= 0 ? "+" : ""}{baseSym}{Math.abs(totalPnL).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({totalPnLPct >= 0 ? "+" : ""}{totalPnLPct.toFixed(1)}%)
            </span>
          </div>
          {multi && (
            <div className="mt-2 pt-2 border-t border-border/30">
              <div className="flex flex-wrap gap-1">
                {Array.from(new Set(stocks.filter(s => s.analysis?.currency).map(s => s.analysis.currency))).map(cur => {
                  const curStocks = stocks.filter(s => s.analysis?.currency === cur);
                  const curVal = curStocks.reduce((sum, s) => sum + (s.analysis?.currentPrice ?? s.buyPrice) * s.quantity, 0);
                  const curValBase = convertToBase(curVal, cur);
                  const pct = totalCurrent > 0 ? (curValBase / totalCurrent * 100) : 0;
                  return (
                    <span key={cur} className="rounded bg-primary/10 px-1.5 py-0.5 text-[8px] font-mono text-primary">
                      {cur} {pct.toFixed(0)}%
                    </span>
                  );
                })}
              </div>
            </div>
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
          const pnlBase = cur && cur !== baseCurrency ? convertToBase(pnl, cur) : null;
          const freshness = priceStatus?.[stock.id]?.status;

          // Dual currency: show converted price if asset currency differs from base
          const convertedPrice = stock.analysis && cur && cur !== baseCurrency
            ? convertToBase(stock.analysis.currentPrice, cur)
            : null;

          // Max profit progress
          const maxTarget = stock.analysis?.targetPrice || 0;
          const hasMaxTarget = maxTarget > stock.buyPrice && stock.analysis?.currentPrice;
          const maxProgress = hasMaxTarget
            ? Math.max(0, Math.min(100, ((stock.analysis.currentPrice - stock.buyPrice) / (maxTarget - stock.buyPrice)) * 100))
            : 0;
          const maxUpsideLeft = hasMaxTarget ? ((maxTarget - stock.analysis.currentPrice) / stock.analysis.currentPrice * 100) : 0;

          return (
            <div
              key={stock.id}
              onClick={() => onSelectStock(stock.id)}
              className={`group rounded-lg border p-3 cursor-pointer transition-all ${
                isActive ? "border-primary/40 bg-primary/5" : "border-border/50 bg-surface-2 hover:border-border hover:bg-surface-3"
              }`}
            >
              <div className="flex items-center justify-between">
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
                    {cur && cur !== baseCurrency && <span className="text-[9px] text-muted-foreground font-mono">{cur}</span>}
                    {stock.analysis && <FreshnessIndicator status={freshness} />}
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
                      {convertedPrice !== null && (
                        <span className="block font-mono text-[8px] text-muted-foreground/70">
                          ≈ {baseSym}{convertedPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      )}
                      {pnlBase !== null && (
                        <span className={`block font-mono text-[8px] ${pnlBase >= 0 ? "text-gain/70" : "text-loss/70"}`}>
                          {pnlBase >= 0 ? "+" : ""}{baseSym}{Math.abs(pnlBase).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      )}
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
              {/* Max Profit Progress */}
              {hasMaxTarget && (
                <div className="mt-2 pt-2 border-t border-border/20">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <Target className="h-2.5 w-2.5 text-primary" />
                      <span className="text-[8px] font-mono text-muted-foreground uppercase">Max Profit</span>
                    </div>
                    <span className="text-[8px] font-mono text-muted-foreground">
                      {s}{maxTarget.toLocaleString()} ({maxUpsideLeft > 0 ? `${maxUpsideLeft.toFixed(1)}% left` : "reached"})
                    </span>
                  </div>
                  <Progress
                    value={maxProgress}
                    className={`h-1.5 bg-surface-3 [&>div]:transition-all ${
                      maxProgress >= 90 ? "[&>div]:bg-gain" : maxProgress >= 60 ? "[&>div]:bg-primary" : "[&>div]:bg-muted-foreground"
                    }`}
                  />
                  <div className="flex justify-between mt-0.5 text-[7px] font-mono text-muted-foreground/60">
                    <span>{s}{stock.buyPrice.toLocaleString()}</span>
                    <span className={`font-semibold ${maxProgress >= 90 ? "text-gain" : "text-primary"}`}>{maxProgress.toFixed(0)}%</span>
                    <span>{s}{maxTarget.toLocaleString()}</span>
                  </div>
                </div>
              )}
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
