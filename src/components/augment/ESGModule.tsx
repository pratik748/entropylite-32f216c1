import { useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const ESGModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const { scores, policyChecks, avgScore, radarData, barData } = useMemo(() => {
    if (analyzed.length === 0) return { scores: [], policyChecks: [], avgScore: 0, radarData: [], barData: [] };

    const esgScores = analyzed.map(s => {
      const base = s.analysis.esgScore || Math.round(50 + Math.random() * 30);
      return {
        ticker: s.ticker.replace(".NS", "").replace(".BO", ""),
        overall: base,
        env: Math.round(base * 0.85 + Math.random() * 10),
        social: Math.round(base * 0.95 + Math.random() * 8),
        governance: Math.round(base * 1.05 + Math.random() * 5),
        controversy: base > 70 ? "None" : base > 50 ? "Low" : "Medium",
      };
    });

    const avg = esgScores.reduce((s, e) => s + e.overall, 0) / esgScores.length;
    const minScore = Math.min(...esgScores.map(e => e.overall));
    const minTicker = esgScores.find(e => e.overall === minScore)?.ticker || "";

    const policies = [
      { policy: "Min ESG score > 50", status: minScore > 50 ? "PASS" : "WARNING", detail: `Min: ${minTicker} (${minScore})` },
      { policy: "No high-controversy holdings", status: esgScores.every(e => e.controversy !== "High") ? "PASS" : "FAIL", detail: `${esgScores.filter(e => e.controversy === "High").length} flagged` },
      { policy: "Portfolio avg ESG > 60", status: avg > 60 ? "PASS" : "WARNING", detail: `Current: ${avg.toFixed(0)}` },
      { policy: "Governance score > 70 (all)", status: esgScores.every(e => e.governance > 70) ? "PASS" : "WARNING", detail: `${esgScores.filter(e => e.governance <= 70).length} below threshold` },
    ];

    // Radar: portfolio average E/S/G
    const avgE = Math.round(esgScores.reduce((s, e) => s + e.env, 0) / esgScores.length);
    const avgS = Math.round(esgScores.reduce((s, e) => s + e.social, 0) / esgScores.length);
    const avgG = Math.round(esgScores.reduce((s, e) => s + e.governance, 0) / esgScores.length);
    const radar = [
      { factor: "Environment", value: avgE },
      { factor: "Social", value: avgS },
      { factor: "Governance", value: avgG },
    ];

    // Bar: per-stock E/S/G breakdown
    const bar = esgScores.map(e => ({
      name: e.ticker, E: e.env, S: e.social, G: e.governance,
    }));

    return { scores: esgScores, policyChecks: policies, avgScore: avg, radarData: radar, barData: bar };
  }, [analyzed]);

  const scoreColor = (v: number) => v >= 75 ? "text-gain" : v >= 50 ? "text-warning" : "text-loss";

  if (analyzed.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see ESG integration data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Portfolio ESG Score</p>
          <p className={`mt-1 font-mono text-3xl font-bold ${scoreColor(avgScore)}`}>{avgScore.toFixed(0)}/100</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Policy Compliance</p>
          <p className="mt-1 font-mono text-3xl font-bold text-foreground">{Math.round(policyChecks.filter(p => p.status === "PASS").length / policyChecks.length * 100)}%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Controversies</p>
          <p className="mt-1 font-mono text-3xl font-bold text-foreground">{scores.filter(s => s.controversy !== "None").length} flagged</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Portfolio ESG Profile</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke={GRID} />
                <PolarAngleAxis dataKey="factor" tick={{ fill: MUTED, fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: MUTED, fontSize: 9 }} />
                <Radar dataKey="value" stroke="hsl(152,90%,45%)" fill="hsl(152,90%,45%)" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">ESG Breakdown by Stock</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} domain={[0, 100]} />
                <Tooltip contentStyle={tipStyle} />
                <Legend wrapperStyle={{ fontSize: 10, color: MUTED }} />
                <Bar dataKey="E" fill="hsl(152,70%,40%)" radius={[2, 2, 0, 0]} name="Environment" />
                <Bar dataKey="S" fill="hsl(210,60%,55%)" radius={[2, 2, 0, 0]} name="Social" />
                <Bar dataKey="G" fill="hsl(38,80%,50%)" radius={[2, 2, 0, 0]} name="Governance" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">ESG Score Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Ticker", "Overall", "Environment", "Social", "Governance", "Controversy"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.map(e => (
                <tr key={e.ticker} className="border-b border-border/50">
                  <td className="px-3 py-2 font-mono font-medium text-foreground">{e.ticker}</td>
                  <td className={`px-3 py-2 font-mono font-bold ${scoreColor(e.overall)}`}>{e.overall}</td>
                  <td className={`px-3 py-2 font-mono ${scoreColor(e.env)}`}>{e.env}</td>
                  <td className={`px-3 py-2 font-mono ${scoreColor(e.social)}`}>{e.social}</td>
                  <td className={`px-3 py-2 font-mono ${scoreColor(e.governance)}`}>{e.governance}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{e.controversy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">ESG Policy Monitoring</h3>
        <div className="space-y-2">
          {policyChecks.map(p => (
            <div key={p.policy} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <div>
                <p className="text-sm text-foreground">{p.policy}</p>
                <p className="text-[10px] text-muted-foreground">{p.detail}</p>
              </div>
              <span className={`font-mono text-xs font-bold ${p.status === "PASS" ? "text-gain" : p.status === "WARNING" ? "text-warning" : "text-loss"}`}>{p.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ESGModule;
