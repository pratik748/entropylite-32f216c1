import { useMemo } from "react";
import {
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

  const { scores, policyChecks, avgScore, barData } = useMemo(() => {
    if (analyzed.length === 0) return { scores: [], policyChecks: [], avgScore: 0, barData: [] };

    // Honesty rule: the provider gives us ONE overall ESG score per name.
    // We do not manufacture E/S/G sub-scores from it — a decomposition we
    // don't have is shown as "unavailable", not invented (even deterministically).
    const esgScores = analyzed.map(s => {
      const real = typeof s.analysis?.esgScore === "number" ? s.analysis.esgScore : null;
      return {
        ticker: s.ticker.replace(".NS", "").replace(".BO", ""),
        overall: real,
        controversy: real == null ? "Unrated" : real > 70 ? "None" : real > 50 ? "Low" : "Medium",
        provenance: real != null ? "provider" : "unavailable",
      };
    });

    const rated = esgScores.filter(e => e.overall != null) as Array<typeof esgScores[number] & { overall: number }>;
    const avg = rated.length > 0 ? rated.reduce((s, e) => s + e.overall, 0) / rated.length : 0;
    const minScore = rated.length > 0 ? Math.min(...rated.map(e => e.overall)) : 0;
    const minTicker = rated.find(e => e.overall === minScore)?.ticker || "—";

    const policies = [
      { policy: "Min ESG score > 50", status: rated.length === 0 ? "N/A" : minScore > 50 ? "PASS" : "WARNING", detail: rated.length ? `Min: ${minTicker} (${minScore})` : "No rated holdings" },
      { policy: "No high-controversy holdings", status: rated.every(e => e.controversy !== "High") ? "PASS" : "FAIL", detail: `${rated.filter(e => e.controversy === "High").length} flagged` },
      { policy: "Portfolio avg ESG > 60", status: rated.length === 0 ? "N/A" : avg > 60 ? "PASS" : "WARNING", detail: rated.length ? `Current: ${avg.toFixed(0)}` : "No rated holdings" },
      { policy: "All holdings rated", status: rated.length === esgScores.length ? "PASS" : "WARNING", detail: `${esgScores.length - rated.length} unrated` },
    ];

    // Bar: per-stock overall score (the only figure we actually have)
    const bar = rated.map(e => ({ name: e.ticker, Overall: e.overall }));

    return { scores: esgScores, policyChecks: policies, avgScore: avg, barData: bar };
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
          <p className={`mt-1 font-mono text-3xl font-bold ${avgScore ? scoreColor(avgScore) : "text-muted-foreground"}`}>{avgScore ? `${avgScore.toFixed(0)}/100` : "—"}</p>
          <p className="text-[9px] text-muted-foreground">{scores.filter(s => s.provenance === "provider").length}/{scores.length} rated</p>
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

      {/* Chart Row — overall provider score only; E/S/G sub-scores are not
          available from the connected source and are never synthesized. */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-1">ESG Score by Stock</h3>
        <p className="text-[10px] text-muted-foreground mb-4">Provider overall score. E/S/G pillar sub-scores: no data source connected.</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
              <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} domain={[0, 100]} />
              <Tooltip contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 10, color: MUTED }} />
              <Bar dataKey="Overall" fill="hsl(152,70%,40%)" radius={[2, 2, 0, 0]} name="Overall (provider)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">ESG Score Detail</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Ticker", "Overall", "Controversy", "Source"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.map(e => (
                <tr key={e.ticker} className="border-b border-border/50">
                  <td className="px-3 py-2 font-mono font-medium text-foreground">{e.ticker}</td>
                  <td className={`px-3 py-2 font-mono font-bold ${e.overall != null ? scoreColor(e.overall) : "text-muted-foreground"}`}>{e.overall ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{e.controversy}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{e.provenance}</td>
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
