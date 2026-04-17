/**
 * LearningLoopPanel — Visualises realised StatArb outcomes vs model confidence.
 * Reads from the user-scoped `statarb_outcomes` table (RLS-protected).
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Activity } from "lucide-react";

type Outcome = "reverted" | "did_not_revert" | "regime_flipped";

interface Row {
  id: string;
  pair: string;
  regime_at_entry: string;
  s_final: number;
  expected_half_life: number;
  actual_outcome: Outcome;
  pnl_bps: number;
  closed_at: string;
}

const OUTCOME_TONE: Record<Outcome, string> = {
  reverted: "text-gain",
  did_not_revert: "text-loss",
  regime_flipped: "text-warning",
};

export default function LearningLoopPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error } = await supabase
        .from("statarb_outcomes")
        .select("id,pair,regime_at_entry,s_final,expected_half_life,actual_outcome,pnl_bps,closed_at")
        .order("closed_at", { ascending: false })
        .limit(200);
      if (!live) return;
      if (error) {
        setError(error.message);
        setRows([]);
        return;
      }
      setRows((data as Row[]) ?? []);
    })();
    return () => { live = false; };
  }, []);

  const stats = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const byRegime = new Map<string, { wins: number; total: number; avgPnl: number }>();
    for (const r of rows) {
      const k = r.regime_at_entry;
      const cur = byRegime.get(k) ?? { wins: 0, total: 0, avgPnl: 0 };
      cur.total += 1;
      if (r.actual_outcome === "reverted") cur.wins += 1;
      cur.avgPnl += Number(r.pnl_bps) || 0;
      byRegime.set(k, cur);
    }
    const regimeRows = [...byRegime.entries()].map(([state, v]) => ({
      state,
      winRate: v.wins / v.total,
      avgPnl: v.avgPnl / v.total,
      n: v.total,
    }));

    const scatter = rows.map((r) => ({
      conf: Math.abs(Number(r.s_final) * 100),
      pnl: Number(r.pnl_bps),
      pair: r.pair,
      outcome: r.actual_outcome,
    }));

    return { regimeRows, scatter, total: rows.length };
  }, [rows]);

  if (rows === null) {
    return <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-[10px] text-muted-foreground">Loading learning loop…</div>;
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/60 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-foreground">
          <Activity className="h-3.5 w-3.5 text-primary" />
          Learning Loop
        </h4>
        <span className="text-[9px] font-mono text-muted-foreground">{rows.length} closed signals</span>
      </div>

      {error && (
        <div className="text-[10px] text-warning">Could not load outcomes: {error}</div>
      )}

      {!stats ? (
        <p className="text-[10px] text-muted-foreground">
          No closed StatArb signals logged yet. Outcomes will be recorded automatically as positions are closed,
          then this panel will show win rate by regime and how well model confidence tracked realised P&L.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Regime stats */}
          <div className="space-y-1.5">
            <div className="text-[9px] font-mono uppercase text-muted-foreground tracking-wider">Win rate by regime</div>
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-1 py-1 text-left text-muted-foreground">Regime</th>
                  <th className="px-1 py-1 text-right text-muted-foreground">N</th>
                  <th className="px-1 py-1 text-right text-muted-foreground">Win %</th>
                  <th className="px-1 py-1 text-right text-muted-foreground">Avg bps</th>
                </tr>
              </thead>
              <tbody>
                {stats.regimeRows.map((r) => (
                  <tr key={r.state} className="border-b border-border/30">
                    <td className="px-1 py-1 capitalize text-foreground">{r.state}</td>
                    <td className="px-1 py-1 text-right text-foreground">{r.n}</td>
                    <td className="px-1 py-1 text-right text-foreground">{(r.winRate * 100).toFixed(0)}%</td>
                    <td className={`px-1 py-1 text-right ${r.avgPnl >= 0 ? "text-gain" : "text-loss"}`}>
                      {r.avgPnl.toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Confidence vs realised P&L */}
          <div className="space-y-1.5">
            <div className="text-[9px] font-mono uppercase text-muted-foreground tracking-wider">
              Model confidence vs realised P&L (bps)
            </div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis
                    type="number" dataKey="conf" name="Confidence" unit="%"
                    tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]}
                  />
                  <YAxis
                    type="number" dataKey="pnl" name="P&L"
                    tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} width={32}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }}
                  />
                  <Scatter data={stats.scatter} fill="hsl(var(--primary))" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Recent outcomes */}
      {stats && stats.scatter.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] font-mono uppercase text-muted-foreground tracking-wider">Most recent</div>
          <div className="flex flex-wrap gap-1.5">
            {rows.slice(0, 8).map((r) => (
              <span key={r.id} className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[9px] font-mono">
                {r.pair} ·{" "}
                <span className={OUTCOME_TONE[r.actual_outcome]}>
                  {r.actual_outcome.replace(/_/g, " ")}
                </span>{" "}
                · {Number(r.pnl_bps).toFixed(0)}bps
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
