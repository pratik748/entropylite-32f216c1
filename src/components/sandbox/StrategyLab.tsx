import { useMemo, useState } from "react";
import { Brain } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

interface Strategy {
  name: string; type: string; sharpe: number; maxDrawdown: number;
  expectedReturn: number; capitalEfficiency: number; reflexivitySafety: number;
  liquidityScore: number; description: string;
}

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

const StrategyLab = ({ stocks }: Props) => {
  const [sortBy, setSortBy] = useState<keyof Strategy>("sharpe");
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);

  const strategies = useMemo(() => {
    if (holdings.length === 0) return [];

    const avgBeta = holdings.reduce((s, h) => s + h.beta, 0) / holdings.length;
    const avgRisk = holdings.reduce((s, h) => s + h.risk, 0) / holdings.length;
    const avgReturn = holdings.reduce((s, h) => s + h.pnlPct / 100, 0) / holdings.length;

    const dailyVol = (avgRisk / 100) * 0.02;
    const annualVol = dailyVol * Math.sqrt(252);
    const annualReturn = avgReturn * (252 / 90);
    const riskFreeRate = 0.065;

    const strats: Strategy[] = [
      { name: "Current Portfolio", type: "Baseline", sharpe: annualVol > 0 ? (annualReturn - riskFreeRate) / annualVol : 0, maxDrawdown: -(avgRisk / 100) * 2.5 * 100, expectedReturn: annualReturn * 100, capitalEfficiency: 1 / Math.max(avgBeta, 0.5), reflexivitySafety: Math.max(0, 100 - avgRisk), liquidityScore: Math.min(95, 60 + holdings.length * 5), description: "Your current portfolio as-is" },
      { name: "Uncorrelated Bundle", type: "Diversification", sharpe: annualVol > 0 ? (annualReturn * 0.9 - riskFreeRate) / (annualVol * 0.6) : 0, maxDrawdown: -(avgRisk / 100) * 1.5 * 100, expectedReturn: annualReturn * 0.9 * 100, capitalEfficiency: 1.4 / Math.max(avgBeta, 0.5), reflexivitySafety: Math.max(0, 100 - avgRisk * 0.6), liquidityScore: Math.min(90, 55 + holdings.length * 4), description: "Pair positions to minimize correlation, reduce portfolio vol by ~40%" },
      { name: "Factor-Neutral", type: "Market Neutral", sharpe: annualVol > 0 ? (annualReturn * 0.5 - riskFreeRate) / (annualVol * 0.3) : 0, maxDrawdown: -(avgRisk / 100) * 0.8 * 100, expectedReturn: annualReturn * 0.5 * 100, capitalEfficiency: 2.2, reflexivitySafety: 85, liquidityScore: 70, description: "Hedge market beta to zero, capture pure alpha from stock selection" },
      { name: "Volatility Harvest", type: "Options Overlay", sharpe: annualVol > 0 ? (annualReturn * 0.7 + 0.04 - riskFreeRate) / (annualVol * 0.8) : 0, maxDrawdown: -(avgRisk / 100) * 2.0 * 100, expectedReturn: (annualReturn * 0.7 + 0.04) * 100, capitalEfficiency: 1.3, reflexivitySafety: Math.max(0, 100 - avgRisk * 0.8), liquidityScore: 60, description: "Sell covered calls on high-vol holdings, buy protective puts" },
      { name: "Regime-Aware Dynamic", type: "Tactical", sharpe: annualVol > 0 ? (annualReturn * 1.1 - riskFreeRate) / (annualVol * 0.85) : 0, maxDrawdown: -(avgRisk / 100) * 1.8 * 100, expectedReturn: annualReturn * 1.1 * 100, capitalEfficiency: 1.5, reflexivitySafety: Math.max(0, 100 - avgRisk * 0.7), liquidityScore: 75, description: "Dynamically shift allocation based on current regime" },
      { name: "Carry + Momentum", type: "Multi-Factor", sharpe: annualVol > 0 ? (annualReturn * 1.15 - riskFreeRate) / (annualVol * 0.9) : 0, maxDrawdown: -(avgRisk / 100) * 2.1 * 100, expectedReturn: annualReturn * 1.15 * 100, capitalEfficiency: 1.3, reflexivitySafety: Math.max(0, 100 - avgRisk * 0.85), liquidityScore: 72, description: "Overweight high-dividend + positive momentum stocks" },
    ];

    return strats.sort((a, b) => (b[sortBy] as number) - (a[sortBy] as number));
  }, [holdings, sortBy, totalValue]);

  const chartData = strategies.map(s => ({
    name: s.name.length > 15 ? s.name.slice(0, 15) + "…" : s.name,
    sharpe: +s.sharpe.toFixed(2),
    fill: s.sharpe >= 1.5 ? "hsl(145, 70%, 45%)" : s.sharpe >= 0.5 ? "hsl(0, 0%, 80%)" : "hsl(0, 62%, 50%)",
  }));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-foreground" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Auto-Generated Strategies</h3>
            <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">{strategies.length} strategies · {fmt(totalValue)}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground mr-1">Sort:</span>
            {(["sharpe", "maxDrawdown", "expectedReturn", "reflexivitySafety"] as const).map(key => (
              <button key={key} onClick={() => setSortBy(key)}
                className={`rounded px-2 py-1 text-[10px] font-mono transition-colors ${sortBy === key ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"}`}>
                {key === "sharpe" ? "Sharpe" : key === "maxDrawdown" ? "Drawdown" : key === "expectedReturn" ? "Return" : "Safety"}
              </button>
            ))}
          </div>
        </div>
        <div className="h-48 mb-5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(0,0%,45%)", fontSize: 9 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} />
              <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="sharpe" radius={[4, 4, 0, 0]} name="Sharpe Ratio">
                {chartData.map((e, i) => <Cell key={i} fill={e.fill} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-2">
          {strategies.map((s, i) => (
            <div key={s.name} className={`rounded-lg border p-4 transition-all ${i === 0 ? "border-foreground/30 bg-foreground/5" : "border-border/50 bg-surface-2"}`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{s.name}</span>
                    <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">{s.type}</span>
                    {i === 0 && <span className="rounded bg-gain/20 px-1.5 py-0.5 text-[9px] font-mono text-gain">BEST</span>}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{s.description}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
                <MetricCell label="Sharpe" value={s.sharpe.toFixed(2)} good={s.sharpe >= 1} />
                <MetricCell label="Max DD" value={`${s.maxDrawdown.toFixed(1)}%`} good={s.maxDrawdown > -15} />
                <MetricCell label="Exp. Return" value={`${s.expectedReturn >= 0 ? "+" : ""}${s.expectedReturn.toFixed(1)}%`} good={s.expectedReturn > 0} />
                <MetricCell label="Cap. Efficiency" value={s.capitalEfficiency.toFixed(1) + "x"} good={s.capitalEfficiency > 1.2} />
                <MetricCell label="Reflexivity" value={s.reflexivitySafety.toFixed(0)} good={s.reflexivitySafety > 70} />
                <MetricCell label="Liquidity" value={s.liquidityScore.toFixed(0)} good={s.liquidityScore > 75} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MetricCell = ({ label, value, good }: { label: string; value: string; good: boolean }) => (
  <div>
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`font-mono text-sm font-bold ${good ? "text-gain" : "text-loss"}`}>{value}</p>
  </div>
);

export default StrategyLab;
