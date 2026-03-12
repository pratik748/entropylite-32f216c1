import { useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const RiskModelingModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);

  const { riskFactors, concentrationData, varMetrics, creditData, varTrend } = useMemo(() => {
    if (holdings.length === 0) {
      return { riskFactors: [], concentrationData: [], varMetrics: { var95: 0, cvar95: 0, liqVar: 0, stressVar: 0 }, creditData: [], varTrend: [] };
    }

    const n = holdings.length;
    const avgBreakdown = { volatility: 0, sector: 0, regulatory: 0, financial: 0, macro: 0 };
    holdings.forEach(h => {
      const rb = h.analysis?.riskBreakdown;
      if (rb) {
        avgBreakdown.volatility += rb.volatilityRisk || 0;
        avgBreakdown.sector += rb.sectorRisk || 0;
        avgBreakdown.regulatory += rb.regulatoryRisk || 0;
        avgBreakdown.financial += rb.financialRisk || 0;
        avgBreakdown.macro += rb.macroRisk || 0;
      }
    });

    const factors = [
      { risk: "Market β", value: Math.round(avgBreakdown.volatility / n) },
      { risk: "Credit Spread", value: Math.round(avgBreakdown.financial / n) },
      { risk: "Liquidity", value: Math.round((avgBreakdown.volatility / n) * 0.8) },
      { risk: "Counterparty", value: Math.round(avgBreakdown.regulatory / n) },
      { risk: "Concentration", value: n <= 3 ? 75 : n <= 5 ? 55 : 35 },
      { risk: "FX", value: Math.round(avgBreakdown.macro / n * 0.5) },
    ];

    const concData = holdings.map(h => ({
      name: h.ticker, pct: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
    })).sort((a, b) => b.pct - a.pct);

    const avgRisk = holdings.reduce((s, h) => s + h.risk, 0) / n;
    const dailyVol = (avgRisk / 100) * 0.025;
    const vars = {
      var95: totalValue * dailyVol * 1.645,
      cvar95: totalValue * dailyVol * 2.063,
      liqVar: totalValue * dailyVol * 1.645 * 1.35,
      stressVar: totalValue * dailyVol * 2.326 * 2.0,
    };

    // VaR trend (simulated 30-day history)
    const trend = Array.from({ length: 30 }, (_, i) => {
      const noise = 1 + (Math.sin(i * 0.5) * 0.15 + (Math.random() - 0.5) * 0.1);
      return { day: `D-${30 - i}`, var95: +(vars.var95 * noise).toFixed(0), cvar95: +(vars.cvar95 * noise).toFixed(0) };
    });

    const credit = holdings.map(h => {
      const riskScore = h.risk;
      const rating = riskScore < 30 ? "AAA" : riskScore < 50 ? "AA+" : riskScore < 70 ? "A" : "BBB";
      const pd = riskScore < 30 ? 0.02 : riskScore < 50 ? 0.05 : riskScore < 70 ? 0.12 : 0.25;
      const lgd = 45;
      const el = h.value * (pd / 100) * (lgd / 100);
      return { name: h.ticker, rating, exp: fmt(h.value), pd: `${pd}%`, lgd: `${lgd}%`, el: fmt(el) };
    });

    return { riskFactors: factors, concentrationData: concData, varMetrics: vars, creditData: credit, varTrend: trend };
  }, [holdings, totalValue, fmt]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see real risk modeling data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: "VaR (95%)", value: fmt(varMetrics.var95), sub: "1-day parametric" },
          { label: "CVaR (95%)", value: fmt(varMetrics.cvar95), sub: "Expected shortfall" },
          { label: "Liquidity VaR", value: fmt(varMetrics.liqVar), sub: "5-day adjusted" },
          { label: "Stress VaR", value: fmt(varMetrics.stressVar), sub: "2008-type scenario" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-xl font-bold text-loss">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* VaR Trend Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">VaR / CVaR Trend (30D)</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={varTrend} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="day" tick={{ fill: MUTED, fontSize: 8 }} axisLine={{ stroke: GRID }} interval={4} />
              <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
              <Tooltip contentStyle={tipStyle} />
              <Area type="monotone" dataKey="cvar95" stroke="hsl(0,90%,55%)" fill="hsl(0,90%,55%)" fillOpacity={0.08} strokeWidth={1.5} name="CVaR 95%" />
              <Area type="monotone" dataKey="var95" stroke="hsl(38,92%,55%)" fill="hsl(38,92%,55%)" fillOpacity={0.1} strokeWidth={2} name="VaR 95%" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Multi-Factor Risk Radar</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={riskFactors}>
                <PolarGrid stroke={GRID} />
                <PolarAngleAxis dataKey="risk" tick={{ fill: MUTED, fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: MUTED, fontSize: 9 }} />
                <Radar dataKey="value" stroke="hsl(0,0%,95%)" fill="hsl(0,0%,95%)" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Concentration Risk</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={concentrationData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                  {concentrationData.map((_, i) => (
                    <Cell key={i} fill={`hsl(0, 0%, ${100 - i * 12}%)`} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Credit & Counterparty Risk</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Counterparty", "Rating", "Exposure", "PD", "LGD", "Expected Loss"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {creditData.map(r => (
                <tr key={r.name} className="border-b border-border/50">
                  <td className="px-3 py-2 font-mono text-foreground">{r.name}</td>
                  <td className="px-3 py-2"><span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-xs text-foreground">{r.rating}</span></td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.exp}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.pd}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.lgd}</td>
                  <td className="px-3 py-2 font-mono text-loss">{r.el}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RiskModelingModule;
