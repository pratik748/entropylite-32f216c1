import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const BenchmarkModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const { stats, attribution, perStock } = useMemo(() => {
    if (analyzed.length === 0) {
      return { stats: null, attribution: [], perStock: [] };
    }

    // Compute real weighted portfolio return
    const holdings = analyzed.map(s => {
      const currentPrice = s.analysis?.currentPrice || s.buyPrice;
      const value = currentPrice * s.quantity;
      const ret = ((currentPrice - s.buyPrice) / s.buyPrice) * 100;
      const beta = s.analysis?.beta || 1;
      const sector = s.analysis?.sector || "Unknown";
      return { ticker: s.ticker.replace(".NS", "").replace(".BO", ""), value, ret, beta, sector };
    });

    const totalVal = holdings.reduce((s, h) => s + h.value, 0);
    if (totalVal === 0) return { stats: null, attribution: [], perStock: [] };

    const weights = holdings.map(h => h.value / totalVal);
    const portfolioReturn = holdings.reduce((s, h, i) => s + h.ret * weights[i], 0);
    const portfolioBeta = holdings.reduce((s, h, i) => s + h.beta * weights[i], 0);

    // Benchmark return estimation: portfolio return / beta (decomposition)
    const benchmarkReturn = portfolioBeta !== 0 ? portfolioReturn / portfolioBeta : portfolioReturn;
    const alpha = portfolioReturn - (benchmarkReturn * portfolioBeta);
    const activeReturn = portfolioReturn - benchmarkReturn;

    // Tracking error from variance of active returns
    const activeReturns = holdings.map((h, i) => h.ret - benchmarkReturn);
    const avgActive = activeReturns.reduce((s, a) => s + a, 0) / activeReturns.length;
    const trackingError = Math.sqrt(activeReturns.reduce((s, a) => s + (a - avgActive) ** 2, 0) / Math.max(activeReturns.length - 1, 1));
    const infoRatio = trackingError > 0 ? activeReturn / trackingError : 0;

    // Sector attribution
    const sectorMap: Record<string, { weight: number; return: number; benchWeight: number }> = {};
    holdings.forEach((h, i) => {
      if (!sectorMap[h.sector]) sectorMap[h.sector] = { weight: 0, return: 0, benchWeight: 0 };
      sectorMap[h.sector].weight += weights[i];
      sectorMap[h.sector].return += h.ret * weights[i];
    });
    const numSectors = Object.keys(sectorMap).length;
    Object.values(sectorMap).forEach(s => { s.benchWeight = 1 / numSectors; });

    // Brinson attribution: allocation + selection
    const attrib = Object.entries(sectorMap).map(([sector, data]) => {
      const sectorBenchReturn = benchmarkReturn; // simplified
      const allocationEffect = (data.weight - data.benchWeight) * sectorBenchReturn;
      const selectionEffect = data.weight * (data.return / data.weight - sectorBenchReturn);
      return {
        factor: sector,
        allocation: +allocationEffect.toFixed(2),
        selection: +selectionEffect.toFixed(2),
        total: +(allocationEffect + selectionEffect).toFixed(2),
        fill: (allocationEffect + selectionEffect) >= 0 ? "hsl(152, 82%, 42%)" : "hsl(0, 84%, 55%)",
      };
    }).sort((a, b) => b.total - a.total);

    const stockData = holdings.map(h => ({
      ticker: h.ticker,
      ret: h.ret,
    })).sort((a, b) => b.ret - a.ret);

    return {
      stats: {
        portfolioReturn,
        benchmarkReturn,
        alpha: activeReturn,
        beta: portfolioBeta,
        trackingError,
        infoRatio,
      },
      attribution: attrib,
      perStock: stockData,
    };
  }, [analyzed]);

  if (!stats) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze assets to see real benchmark attribution.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Portfolio Return", value: `${stats.portfolioReturn >= 0 ? "+" : ""}${stats.portfolioReturn.toFixed(2)}%`, color: stats.portfolioReturn >= 0 ? "text-gain" : "text-loss" },
          { label: "Benchmark Est.", value: `${stats.benchmarkReturn >= 0 ? "+" : ""}${stats.benchmarkReturn.toFixed(2)}%`, color: "text-foreground" },
          { label: "Active Return (α)", value: `${stats.alpha >= 0 ? "+" : ""}${stats.alpha.toFixed(2)}%`, color: stats.alpha >= 0 ? "text-gain" : "text-loss" },
          { label: "Portfolio Beta", value: stats.beta.toFixed(3), color: "text-foreground" },
          { label: "Tracking Error", value: `${stats.trackingError.toFixed(2)}%`, color: "text-foreground" },
          { label: "Information Ratio", value: stats.infoRatio.toFixed(3), color: stats.infoRatio >= 0.5 ? "text-gain" : "text-foreground" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={`mt-1 font-mono text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Sector Attribution (Brinson)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attribution} layout="vertical" margin={{ left: 90 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,12%,13%)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(210,8%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(220,12%,13%)" }} tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                <YAxis dataKey="factor" type="category" tick={{ fill: "hsl(210,8%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(220,12%,13%)" }} width={85} />
                <Tooltip contentStyle={{ background: "hsl(220,14%,7%)", border: "1px solid hsl(220,12%,13%)", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} name="Attribution">
                  {attribution.map((a, i) => <Cell key={i} fill={a.fill} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Per-Asset Returns</h3>
          <div className="space-y-2">
            {perStock.map(s => (
              <div key={s.ticker} className="flex items-center gap-3">
                <span className="w-20 font-mono text-xs font-semibold text-foreground">{s.ticker}</span>
                <div className="flex-1 h-2.5 rounded-full bg-surface-3 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${s.ret >= 0 ? "bg-gain" : "bg-loss"}`} style={{ width: `${Math.min(Math.abs(s.ret), 100)}%` }} />
                </div>
                <span className={`font-mono text-xs w-16 text-right font-semibold ${s.ret >= 0 ? "text-gain" : "text-loss"}`}>
                  {s.ret >= 0 ? "+" : ""}{s.ret.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Attribution Detail</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Sector", "Allocation Effect", "Selection Effect", "Total Contribution"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attribution.map(a => (
                <tr key={a.factor} className="border-b border-border/50">
                  <td className="px-3 py-2 font-mono text-foreground">{a.factor}</td>
                  <td className={`px-3 py-2 font-mono ${a.allocation >= 0 ? "text-gain" : "text-loss"}`}>{a.allocation >= 0 ? "+" : ""}{a.allocation}%</td>
                  <td className={`px-3 py-2 font-mono ${a.selection >= 0 ? "text-gain" : "text-loss"}`}>{a.selection >= 0 ? "+" : ""}{a.selection}%</td>
                  <td className={`px-3 py-2 font-mono font-bold ${a.total >= 0 ? "text-gain" : "text-loss"}`}>{a.total >= 0 ? "+" : ""}{a.total}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BenchmarkModule;
