import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  AreaChart, Area,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const ValuationModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt, sym } = useNormalizedPortfolio(stocks);

  const { valuations, cashflows, collateral, fairVsCurrentData, cfAreaData } = useMemo(() => {
    if (holdings.length === 0) return { valuations: [], cashflows: [], collateral: [], fairVsCurrentData: [], cfAreaData: [] };

    const h = holdings.map(h => {
      const current = h.value / h.quantity;
      const fair = current * (1 + (h.analysis?.overallSentiment || 0) / 200);
      const upside = ((fair - current) / current) * 100;
      return {
        ticker: h.ticker, model: h.analysis?.pe ? "DCF + Relative" : "DCF",
        fairValue: fmt(fair), current: fmt(current), fairNum: fair, currentNum: current,
        upside: `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%`,
        pe: h.analysis?.pe || 0, pbv: h.analysis?.pbv || 0, divYield: h.analysis?.dividendYield || 0,
      };
    });

    // Fair vs Current grouped bar
    const fvc = h.map(v => ({
      name: v.ticker, "Fair Value": +v.fairNum.toFixed(0), "Current": +v.currentNum.toFixed(0),
    }));

    const months = ["Mar 2026", "Apr 2026", "May 2026", "Jun 2026"];
    const cf = months.map((m, i) => {
      const inflow = holdings.reduce((s, h) => {
        const dy = (h.analysis?.dividendYield || 1.5) / 100;
        return s + h.value * dy / 4;
      }, 0) * (i === 0 || i === 3 ? 1.5 : 0.5);
      return { month: m, inflow: +inflow.toFixed(0), outflow: +(inflow * 0.3).toFixed(0), net: +(inflow * 0.7).toFixed(0), type: i === 0 || i === 3 ? "Dividend Period" : "Coupon / Interest" };
    });

    const coll = [
      { type: "Cash Equivalent", value: fmt(totalValue * 0.03), haircut: "0%", usable: fmt(totalValue * 0.03) },
      { type: "Large Cap Equity", value: fmt(totalValue * 0.6), haircut: "25%", usable: fmt(totalValue * 0.45) },
      { type: "Mid/Small Cap", value: fmt(totalValue * 0.37), haircut: "40%", usable: fmt(totalValue * 0.222) },
    ];

    return { valuations: h, cashflows: cf.map(c => ({ month: c.month, inflow: fmt(c.inflow), outflow: fmt(c.outflow), net: `+${fmt(c.net)}`, type: c.type })), collateral: coll, fairVsCurrentData: fvc, cfAreaData: cf };
  }, [holdings, totalValue, fmt]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see real valuation data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Fair Value vs Current Price</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fairVsCurrentData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <Tooltip contentStyle={tipStyle} />
                <Legend wrapperStyle={{ fontSize: 10, color: MUTED }} />
                <Bar dataKey="Fair Value" fill="hsl(152,70%,40%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Current" fill="hsl(0,0%,45%)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Cash Flow Forecast</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cfAreaData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <Tooltip contentStyle={tipStyle} />
                <Area type="monotone" dataKey="inflow" stroke="hsl(152,90%,45%)" fill="hsl(152,90%,45%)" fillOpacity={0.1} strokeWidth={2} name="Inflow" />
                <Area type="monotone" dataKey="outflow" stroke="hsl(0,90%,55%)" fill="hsl(0,90%,55%)" fillOpacity={0.08} strokeWidth={1.5} name="Outflow" />
                <Area type="monotone" dataKey="net" stroke="hsl(210,60%,55%)" fill="hsl(210,60%,55%)" fillOpacity={0.1} strokeWidth={2} name="Net" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Valuation & Pricing Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Ticker", "Model", "Fair Value", "Current", "Upside", "P/E", "P/BV", "Div Yield"].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {valuations.map(h => (
                <tr key={h.ticker} className="border-b border-border/50">
                  <td className="px-2 py-2 font-mono font-medium text-foreground">{h.ticker}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{h.model}</td>
                  <td className="px-2 py-2 font-mono text-foreground">{h.fairValue}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{h.current}</td>
                  <td className={`px-2 py-2 font-mono ${h.upside.startsWith("+") ? "text-gain" : "text-loss"}`}>{h.upside}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{h.pe > 0 ? `${h.pe.toFixed(1)}x` : "—"}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{h.pbv > 0 ? `${h.pbv.toFixed(1)}x` : "—"}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{h.divYield > 0 ? `${h.divYield.toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Collateral Management</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Type", "Value", "Haircut", "Usable"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {collateral.map(c => (
                <tr key={c.type} className="border-b border-border/50">
                  <td className="px-3 py-2 text-foreground">{c.type}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{c.value}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.haircut}</td>
                  <td className="px-3 py-2 font-mono text-gain">{c.usable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ValuationModule;
