import { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };
const PIE_COLORS = ["hsl(0,0%,90%)", "hsl(0,0%,75%)", "hsl(0,0%,60%)", "hsl(0,0%,48%)", "hsl(0,0%,36%)", "hsl(0,0%,25%)"];

const ExposureDashboardModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);

  const { sectorExposure, hhi, riskHeatmap, pieData, riskBarData } = useMemo(() => {
    if (holdings.length === 0) return { sectorExposure: [], hhi: 0, riskHeatmap: [], pieData: [], riskBarData: [] };

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

    const pie = sectors.map(s => ({ name: s.sector, value: +s.net.toFixed(1) }));

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

    const riskBars = heatmap.map(r => ({
      name: r.factor, value: r.current,
      fill: r.current >= 60 ? "hsl(0,90%,55%)" : r.current >= 40 ? "hsl(38,92%,55%)" : "hsl(152,90%,45%)",
    }));

    return { sectorExposure: sectors, hhi: Math.round(hhiVal), riskHeatmap: heatmap, pieData: pie, riskBarData: riskBars };
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

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Sector Allocation</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} strokeWidth={2} stroke={CARD_BG}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Weight"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1">
            {pieData.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground">{p.name}</span>
                </div>
                <span className="font-mono text-foreground">{p.value}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Risk Factor Exposure</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskBarData} layout="vertical" margin={{ left: 90 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <YAxis dataKey="name" type="category" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} width={85} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {riskBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
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
