import { useEffect, useRef, useState } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { type PriceStatusMap } from "@/pages/Index";
import StockInput from "@/components/StockInput";

interface PortfolioBlotterProps {
  stocks: PortfolioStock[];
  activeStockId: string | null;
  onSelectStock: (id: string) => void;
  onRemoveStock: (id: string) => void;
  onAnalyze: (ticker: string, buyPrice: number, quantity: number) => void;
  isLoading: boolean;
  priceStatus: PriceStatusMap;
}

const PortfolioBlotter = ({ stocks, activeStockId, onSelectStock, onRemoveStock, onAnalyze, isLoading, priceStatus }: PortfolioBlotterProps) => {
  const [flashMap, setFlashMap] = useState<Record<string, "gain" | "loss">>({});
  const prevPrices = useRef<Record<string, number>>({});

  // Flash on price change
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
  const totalValue = analyzed.reduce((sum, s) => sum + (s.analysis!.currentPrice * s.quantity), 0);

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-border">
        <StockInput onAnalyze={onAnalyze} isLoading={isLoading} compact />
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
              const pnl = (a.currentPrice - s.buyPrice) * s.quantity;
              const pnlPct = ((a.currentPrice - s.buyPrice) / s.buyPrice) * 100;
              const weight = totalValue > 0 ? ((a.currentPrice * s.quantity) / totalValue) * 100 : 0;
              const flash = flashMap[s.id];
              const isActive = s.id === activeStockId;

              return (
                <tr
                  key={s.id}
                  onClick={() => onSelectStock(s.id)}
                  className={`border-b border-border/30 cursor-pointer transition-colors h-6
                    ${isActive ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-surface-2"}
                    ${flash === "gain" ? "flash-green" : flash === "loss" ? "flash-red" : ""}`}
                >
                  <td className="px-2 py-0.5 font-semibold text-foreground">{s.ticker}</td>
                  <td className="px-2 py-0.5 text-right text-foreground tabular-nums">{a.currentPrice.toFixed(2)}</td>
                  <td className={`px-2 py-0.5 text-right font-semibold tabular-nums ${pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                    {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                  </td>
                  <td className="px-2 py-0.5 text-right text-muted-foreground tabular-nums">{s.quantity}</td>
                  <td className={`px-2 py-0.5 text-right font-semibold tabular-nums ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(0)}
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
        <div className="border-t border-border px-2 py-1.5 font-mono text-[9px] flex justify-between text-muted-foreground">
          <span>TOTAL VALUE</span>
          <span className="text-foreground font-semibold tabular-nums">${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
      )}
    </div>
  );
};

export default PortfolioBlotter;
