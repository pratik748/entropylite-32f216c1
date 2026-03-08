import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const ExposureDashboardModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);

  const { sectorExposure, hhi, riskHeatmap } = useMemo(() => {
    if (holdings.length === 0) return { sectorExposure: [], hhi: 0, riskHeatmap: [] };

    const sectorMap: Record<string, number> = {};
    holdings.forEach(h => {
      const sector = h.sector || "Unknown";
      sectorMap[sector] = (sectorMap[sector] || 0) + h.value;
    });

    const sectors = Object.entries(sectorMap)
      .map(([sector, val]) => ({ sector, long: (val / totalValue) * 100, short: 0, net: (val / totalValue) * 100 }))
      .sort((a, b) => b.net - a.net);

    const weights = sectors.map(s => s.net / 100);
    const hhiVal = weights.reduce((s, w) => s + w * w, 0) * 10000;

    const avgVolatility = holdings.reduce((s, h) => s + (h.analysis?.riskBreakdown?.volatilityRisk || 40), 0) / holdings.length;
    const avgCredit = holdings.reduce((s, h) => s + (h.analysis?.riskBreakdown?.financialRisk || 30), 0) / holdings.length;
    const avgLiquidity = holdings.reduce((s, h) => s + (h.analysis?.riskBreakdown?.sectorRisk || 25), 0) / holdings.length;
    const avgFx = holdings.reduce((s, h) => s + (h.analysis?.riskBreakdown?.macroRisk || 20), 0) / holdings.length;
    const concentration = hhiVal > 5000 ? 70 : hhiVal > 2500 ? 50 : 30;

    const heatmap = [
      { factor: "Market Risk", current: Math.round(avgVolatility) },
      { factor: "Credit Risk", current: Math.round(avgCredit) },
      { factor: "Liquidity Risk", current: Math.round(avgLiquidity) },
      { factor: "FX Risk", current: Math.round(avgFx) },
      { factor: "Concentration", current: Math.round(concentration) },
    ];

    return { sectorExposure: sectors, hhi: Math.round(hhiVal), riskHeatmap: heatmap };
  }, [holdings, totalValue]);

  const heatColor = (v: number) => {
    if (v >= 60) return "bg-loss/30 text-loss";
    if (v >= 40) return "bg-warning/20 text-warning";
    return "bg-gain/10 text-gain";
  };

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see real exposure data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: "Portfolio Value", value: fmt(totalValue) },
          { label: "HHI Concentration", value: hhi.toString() },
          { label: "Sectors", value: sectorExposure.length.toString() },
          { label: "Holdings", value: holdings.length.toString() },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-lg font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Sector Exposure</h3>
        <div className="space-y-2">
          {sectorExposure.map(s => (
            <div key={s.sector} className="flex items-center gap-3">
              <span className="w-24 text-sm text-muted-foreground truncate">{s.sector}</span>
              <div className="flex-1 h-3 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full rounded-full bg-foreground" style={{ width: `${s.net}%` }} />
              </div>
              <span className="font-mono text-xs text-foreground w-12 text-right">{s.net.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Risk Heatmap</h3>
        <div className="grid gap-3 md:grid-cols-5">
          {riskHeatmap.map(r => (
            <div key={r.factor} className="rounded-lg bg-surface-2 p-4 text-center">
              <p className="text-xs text-muted-foreground mb-2">{r.factor}</p>
              <span className={`inline-block rounded-lg px-3 py-1.5 font-mono text-lg font-bold ${heatColor(r.current)}`}>
                {r.current}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ExposureDashboardModule;
