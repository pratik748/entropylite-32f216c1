import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const MultiAssetModule = ({ stocks }: Props) => {
  const { totalValue, totalPnl, holdings, fmt, sym } = useNormalizedPortfolio(stocks);

  const { assetBreakdown, weightBarData, pnlAreaData } = useMemo(() => {
    if (holdings.length === 0) return { assetBreakdown: [], weightBarData: [], pnlAreaData: [] };
    const sectorMap: Record<string, { value: number; pnl: number }> = {};
    holdings.forEach(h => {
      const sector = h.analysis?.sector || h.analysis?.marketCap || "Equity";
      if (!sectorMap[sector]) sectorMap[sector] = { value: 0, pnl: 0 };
      sectorMap[sector].value += h.value;
      sectorMap[sector].pnl += h.pnl;
    });

    const breakdown = Object.entries(sectorMap)
      .map(([asset, data]) => ({
        asset,
        nav: fmt(data.value),
        weight: `${(data.value / totalValue * 100).toFixed(1)}%`,
        weightNum: +(data.value / totalValue * 100).toFixed(1),
        dayPnl: `${data.pnl >= 0 ? "+" : ""}${fmt(data.pnl)}`,
        pnlNum: data.pnl,
        pnlSign: data.pnl >= 0,
      }))
      .sort((a, b) => b.weightNum - a.weightNum);

    const bars = breakdown.map(b => ({ name: b.asset.length > 10 ? b.asset.slice(0, 10) + "…" : b.asset, weight: b.weightNum }));

    // Cumulative P&L area by asset class
    let cumPnl = 0;
    const area = breakdown.map(b => {
      cumPnl += b.pnlNum;
      return { name: b.asset.length > 10 ? b.asset.slice(0, 10) + "…" : b.asset, pnl: +b.pnlNum.toFixed(0), cumPnl: +cumPnl.toFixed(0) };
    });

    return { assetBreakdown: breakdown, weightBarData: bars, pnlAreaData: area };
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

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Asset Class Weights</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weightBarData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v}%`} />
                <YAxis dataKey="name" type="category" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} width={75} />
                <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Weight"]} />
                <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
                  {weightBarData.map((_, i) => <Cell key={i} fill={`hsl(0,0%,${85 - i * 10}%)`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Cumulative P&L by Class</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={pnlAreaData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 8 }} axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <Tooltip contentStyle={tipStyle} />
                <Area type="monotone" dataKey="cumPnl" stroke="hsl(152,90%,45%)" fill="hsl(152,90%,45%)" fillOpacity={0.1} strokeWidth={2} name="Cumulative P&L" />
                <Area type="monotone" dataKey="pnl" stroke="hsl(210,60%,55%)" fill="hsl(210,60%,55%)" fillOpacity={0.08} strokeWidth={1.5} name="Per-Class P&L" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
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
