import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const MultiAssetModule = ({ stocks }: Props) => {
  const { totalValue, totalPnl, holdings, fmt, sym } = useNormalizedPortfolio(stocks);

  const assetBreakdown = useMemo(() => {
    if (holdings.length === 0) return [];
    const sectorMap: Record<string, { value: number; pnl: number }> = {};
    holdings.forEach(h => {
      const sector = h.analysis?.sector || h.analysis?.marketCap || "Equity";
      if (!sectorMap[sector]) sectorMap[sector] = { value: 0, pnl: 0 };
      sectorMap[sector].value += h.value;
      sectorMap[sector].pnl += h.pnl;
    });
    return Object.entries(sectorMap)
      .map(([asset, data]) => ({
        asset,
        nav: fmt(data.value),
        weight: `${(data.value / totalValue * 100).toFixed(1)}%`,
        dayPnl: `${data.pnl >= 0 ? "+" : ""}${fmt(data.pnl)}`,
        pnlSign: data.pnl >= 0,
      }))
      .sort((a, b) => parseFloat(b.weight) - parseFloat(a.weight));
  }, [holdings, totalValue, fmt]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see multi-asset breakdown.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total NAV</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{fmt(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Asset Classes</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{assetBreakdown.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total P&L</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${totalPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Asset Class Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Asset Class", "NAV", "Weight", "P&L"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assetBreakdown.map(a => (
                <tr key={a.asset} className="border-b border-border/50">
                  <td className="px-3 py-2 font-medium text-foreground">{a.asset}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{a.nav}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{a.weight}</td>
                  <td className={`px-3 py-2 font-mono ${a.pnlSign ? "text-gain" : "text-loss"}`}>{a.dayPnl}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default MultiAssetModule;
