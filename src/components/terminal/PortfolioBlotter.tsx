import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, AlertTriangle, FileSearch } from "lucide-react";
import { workstationPath } from "@/components/workstation/registry";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { type PriceStatusMap } from "@/pages/Index";
import { type TickerThreat } from "@/hooks/useGeoIntelligence";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { getCurrencySymbol } from "@/lib/currency";
import StockInput from "@/components/StockInput";

interface PortfolioBlotterProps {
  stocks: PortfolioStock[];
  activeStockId: string | null;
  onSelectStock: (id: string) => void;
  onRemoveStock: (id: string) => void;
  onAnalyze: (ticker: string, buyPrice: number, quantity: number) => void;
  isLoading: boolean;
  priceStatus: PriceStatusMap;
  tickerThreats?: Record<string, TickerThreat>;
}

const THREAT_COLORS: Record<string, string> = {
  critical: "text-loss bg-loss/15",
  high: "text-warning bg-warning/15",
  medium: "text-warning/70 bg-warning/10",
  low: "text-muted-foreground bg-surface-3",
};

/**
 * The desk ledger. Valuation comes exclusively from useNormalizedPortfolio
 * — the same spine Book mode and Augment read — so the TOTAL here can never
 * disagree with any other module. Every position appears, including ones
 * awaiting analysis (priced at cost, marked "cost").
 */
const PortfolioBlotter = ({ stocks, activeStockId, onSelectStock, onRemoveStock, onAnalyze, isLoading, priceStatus, tickerThreats }: PortfolioBlotterProps) => {
  const navigate = useNavigate();
  const { baseCurrency, holdings, totalValue, fmt, fxAllLive } = useNormalizedPortfolio(stocks);
  const [flashMap, setFlashMap] = useState<Record<string, "gain" | "loss">>({});
  const prevPrices = useRef<Record<string, number>>({});
  const baseSym = getCurrencySymbol(baseCurrency);

  useEffect(() => {
    const newFlash: Record<string, "gain" | "loss"> = {};
    stocks.forEach(s => {
      if (s.analysis?.currentPrice) {
        const prev = prevPrices.current[s.id];
        if (prev && prev !== s.analysis.currentPrice) {
          newFlash[s.id] = s.analysis.currentPrice > prev ? "gain" : "loss";
        }
        prevPrices.current[s.id] = s.analysis.currentPrice;
      }
    });
    if (Object.keys(newFlash).length > 0) {
      setFlashMap(newFlash);
      const t = setTimeout(() => setFlashMap({}), 600);
      return () => clearTimeout(t);
    }
  }, [stocks]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border" data-tour="stock-input">
        <StockInput onAnalyze={onAnalyze} isLoading={isLoading} compact />
      </div>

      {/* Base currency indicator */}
      <div className="px-2 py-1 border-b border-border/50 flex items-center justify-between">
        <span className="font-mono text-[8px] text-muted-foreground">BASE</span>
        <span className="font-mono text-[9px] text-primary font-semibold">
          {baseCurrency} {baseSym}
          {!fxAllLive && (
            <span className="ml-1 text-warning" title="One or more holdings converted with a static fallback FX rate — live feed pending">FX~</span>
          )}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full font-mono text-[10px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left px-2 py-1 font-semibold">ASSET</th>
              <th className="text-right px-2 py-1 font-semibold">PRICE</th>
              <th className="text-right px-2 py-1 font-semibold">CHG%</th>
              <th className="text-right px-2 py-1 font-semibold">QTY</th>
              <th className="text-right px-2 py-1 font-semibold">PNL</th>
              <th className="text-right px-2 py-1 font-semibold">WT%</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map(h => {
              const nativeSym = getCurrencySymbol(h.currency);
              const weight = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
              const flash = flashMap[h.id];
              const isActive = h.id === activeStockId;

              return (
                <tr
                  key={h.id}
                  onClick={() => onSelectStock(h.id)}
                  className={`border-b border-border/30 cursor-pointer transition-colors h-6 group/row
                    ${isActive ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-surface-2"}
                    ${flash === "gain" ? "flash-green" : flash === "loss" ? "flash-red" : ""}`}
                >
                  <td className="px-2 py-0.5 flex items-center">
                    <span className="font-semibold text-foreground">{h.rawTicker}</span>
                    {h.currency !== baseCurrency && (
                      <span className="text-[7px] text-muted-foreground/60 ml-0.5">{h.currency}</span>
                    )}
                    {h.priceBasis === "cost" && (
                      <span className="ml-1 rounded bg-surface-3 px-1 text-[7px] uppercase text-muted-foreground" title="No live price yet — valued at cost basis until analysis runs">
                        cost
                      </span>
                    )}
                    {tickerThreats?.[h.rawTicker] && tickerThreats[h.rawTicker].threatLevel !== "none" && (
                      <span className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 py-0 text-[7px] font-bold uppercase ${THREAT_COLORS[tickerThreats[h.rawTicker].threatLevel] || ""}`} title={tickerThreats[h.rawTicker].threats.join(", ")}>
                        <AlertTriangle className="h-2 w-2" />
                        {tickerThreats[h.rawTicker].threatLevel === "critical" ? "!" : tickerThreats[h.rawTicker].score}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(workstationPath(h.rawTicker)); }}
                      className="ml-auto p-0.5 rounded text-muted-foreground/60 transition-colors hover:bg-surface-3 hover:text-foreground"
                      title="Open Equity Workstation"
                    >
                      <FileSearch className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveStock(h.id); }}
                      className="opacity-0 group-hover/row:opacity-100 transition-opacity p-0.5 rounded hover:bg-loss/10 hover:text-loss text-muted-foreground"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="px-2 py-0.5 text-right text-foreground tabular-nums">
                    <span>{nativeSym}{h.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {h.currency !== baseCurrency && h.quantity > 0 && (
                      <span className="text-[7px] text-muted-foreground/50 ml-0.5">≈{baseSym}{(h.value / h.quantity).toFixed(2)}</span>
                    )}
                  </td>
                  <td className={`px-2 py-0.5 text-right font-semibold tabular-nums ${h.priceBasis === "cost" ? "text-muted-foreground/50" : h.pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                    {h.priceBasis === "cost" ? "—" : `${h.pnlPct >= 0 ? "+" : ""}${h.pnlPct.toFixed(2)}%`}
                  </td>
                  <td className="px-2 py-0.5 text-right text-muted-foreground tabular-nums">{h.quantity}</td>
                  <td className={`px-2 py-0.5 text-right font-semibold tabular-nums ${h.priceBasis === "cost" ? "text-muted-foreground/50" : h.pnl >= 0 ? "text-gain" : "text-loss"}`}>
                    {h.priceBasis === "cost" ? "—" : `${h.pnl >= 0 ? "+" : ""}${baseSym}${Math.abs(h.pnl).toFixed(0)}`}
                  </td>
                  <td className="px-2 py-0.5 text-right text-muted-foreground tabular-nums">{weight.toFixed(1)}%</td>
                </tr>
              );
            })}
            {holdings.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-muted-foreground text-[10px]">
                  No positions. Add assets above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {holdings.length > 0 && (
        <>
          <div className="border-t border-border px-2 py-1.5 font-mono text-[9px] flex justify-between text-muted-foreground">
            <span>TOTAL ({baseCurrency})</span>
            <span className="text-foreground font-semibold tabular-nums">{fmt(totalValue)}</span>
          </div>
        </>
      )}
    </div>
  );
};

export default PortfolioBlotter;
