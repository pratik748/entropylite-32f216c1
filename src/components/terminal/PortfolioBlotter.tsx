import { useEffect, useRef, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { type PriceStatusMap } from "@/pages/Index";
import { type TickerThreat } from "@/hooks/useGeoIntelligence";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import StockInput from "@/components/StockInput";
import PortfolioSparkline from "@/components/charts/PortfolioSparkline";

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

const PortfolioBlotter = ({ stocks, activeStockId, onSelectStock, onRemoveStock, onAnalyze, isLoading, priceStatus, tickerThreats }: PortfolioBlotterProps) => {
  const { baseCurrency, convertToBase } = useFX();
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

  const analyzed = stocks.filter(s => s.analysis);

  // Compute total value in base currency
  const totalValue = analyzed.reduce((sum, s) => {
    const ccy = s.analysis!.currency || "USD";
    return sum + convertToBase(s.analysis!.currentPrice * s.quantity, ccy);
  }, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border">
        <StockInput onAnalyze={onAnalyze} isLoading={isLoading} compact />
      </div>

      {/* Base currency indicator */}
      <div className="px-2 py-1 border-b border-border/50 flex items-center justify-between">
        <span className="font-mono text-[8px] text-muted-foreground">BASE</span>
        <span className="font-mono text-[9px] text-primary font-semibold">{baseCurrency} {baseSym}</span>
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
            {analyzed.map(s => {
              const a = s.analysis!;
              const ccy = a.currency || "USD";
              const nativeSym = getCurrencySymbol(ccy);
              const nativePrice = a.currentPrice ?? 0;
              const priceInBase = convertToBase(a.currentPrice, ccy);
              const buyInBase = convertToBase(s.buyPrice, ccy);
              const pnl = (priceInBase - buyInBase) * s.quantity;
              const pnlPct = buyInBase > 0 ? ((priceInBase - buyInBase) / buyInBase) * 100 : 0;
              const posValue = priceInBase * s.quantity;
              const weight = totalValue > 0 ? (posValue / totalValue) * 100 : 0;
              const flash = flashMap[s.id];
              const isActive = s.id === activeStockId;

              return (
                <tr
                  key={s.id}
                  onClick={() => onSelectStock(s.id)}
                  className={`border-b border-border/30 cursor-pointer transition-colors h-6 group/row
                    ${isActive ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-surface-2"}
                    ${flash === "gain" ? "flash-green" : flash === "loss" ? "flash-red" : ""}`}
                >
                  <td className="px-2 py-0.5 flex items-center">
                    <span className="font-semibold text-foreground">{s.ticker}</span>
                    {ccy !== baseCurrency && (
                      <span className="text-[7px] text-muted-foreground/60 ml-0.5">{ccy}</span>
                    )}
                    {tickerThreats?.[s.ticker] && tickerThreats[s.ticker].threatLevel !== "none" && (
                      <span className={`ml-1 inline-flex items-center gap-0.5 rounded px-1 py-0 text-[7px] font-bold uppercase ${THREAT_COLORS[tickerThreats[s.ticker].threatLevel] || ""}`} title={tickerThreats[s.ticker].threats.join(", ")}>
                        <AlertTriangle className="h-2 w-2" />
                        {tickerThreats[s.ticker].threatLevel === "critical" ? "⚠" : tickerThreats[s.ticker].score}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); onRemoveStock(s.id); }}
                      className="ml-auto opacity-0 group-hover/row:opacity-100 transition-opacity p-0.5 rounded hover:bg-loss/10 hover:text-loss text-muted-foreground"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </td>
                  <td className="px-2 py-0.5 text-right text-foreground tabular-nums">
                    <span>{nativeSym}{nativePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {ccy !== baseCurrency && (
                      <span className="text-[7px] text-muted-foreground/50 ml-0.5">≈{baseSym}{priceInBase.toFixed(2)}</span>
                    )}
                  </td>
                  <td className={`px-2 py-0.5 text-right font-semibold tabular-nums ${pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                    {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                  </td>
                  <td className="px-2 py-0.5 text-right text-muted-foreground tabular-nums">{s.quantity}</td>
                  <td className={`px-2 py-0.5 text-right font-semibold tabular-nums ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                    {pnl >= 0 ? "+" : ""}{baseSym}{Math.abs(pnl).toFixed(0)}
                  </td>
                  <td className="px-2 py-0.5 text-right text-muted-foreground tabular-nums">{weight.toFixed(1)}%</td>
                </tr>
              );
            })}
            {analyzed.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-muted-foreground text-[10px]">
                  No positions — add assets above
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {analyzed.length > 0 && (
        <>
          <PortfolioSparkline stocks={stocks} />
          <div className="border-t border-border px-2 py-1.5 font-mono text-[9px] flex justify-between text-muted-foreground">
            <span>TOTAL ({baseCurrency})</span>
            <span className="text-foreground font-semibold tabular-nums">
              {baseSym}{totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default PortfolioBlotter;
