/**
 * StatArb Intelligence Panel — Decision cockpit overlay.
 *
 * Visually aligned with the rest of StatArb (header + subtitle + bar chart +
 * dense ranked table + per-pair cards). Emoji-free. Pure overlay — never
 * mutates S_base.
 *
 * Layout (top → bottom):
 *   1. Portfolio-level summary metrics (5 KPIs).
 *   2. Conviction bar chart — every pair, ranked by |S_final|.
 *   3. Ranked opportunities table (sortable info: regime, half-life, P(rev), tail, gates, action).
 *   4. Recommended actions list — concrete, probabilistic instructions.
 *   5. Detailed pair cards with OU bands + Monte Carlo cone.
 *   6. Suppressed-by-kill-switch audit drawer.
 *   7. Learning loop (win-rate by regime + confidence vs realised P&L).
 */
import { useMemo, useState } from "react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from "recharts";
import { ShieldAlert, Brain, AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { useStatArbIntelligence, type PairInput, type PairIntel } from "@/hooks/useStatArbIntelligence";
import OUBandChart from "./OUBandChart";
import ProbabilityCone from "./ProbabilityCone";
import LearningLoopPanel from "./LearningLoopPanel";
import type { RegimeState } from "@/lib/statarb/types";

interface Props {
  tickers: string[];
  baseSignals?: Record<string, number>;
  maxPairs?: number;
}

const REGIME_TONE: Record<RegimeState, string> = {
  "mean-reverting": "text-gain border-gain/40 bg-gain/10",
  trending: "text-primary border-primary/40 bg-primary/10",
  volatile: "text-warning border-warning/40 bg-warning/10",
  broken: "text-loss border-loss/40 bg-loss/10",
};

const REGIME_FILL: Record<RegimeState, string> = {
  "mean-reverting": "hsl(var(--gain))",
  trending: "hsl(var(--primary))",
  volatile: "hsl(var(--warning))",
  broken: "hsl(var(--loss))",
};

function buildPairs(tickers: string[], max: number, baseSignals?: Record<string, number>): PairInput[] {
  const clean = Array.from(new Set(tickers.map((t) => t.toUpperCase()))).filter(Boolean);
  const pairs: PairInput[] = [];
  for (let i = 0; i < clean.length && pairs.length < max; i++) {
    for (let j = i + 1; j < clean.length && pairs.length < max; j++) {
      const id = `${clean[i]}|${clean[j]}`;
      pairs.push({ id, tickerA: clean[i], tickerB: clean[j], sBase: baseSignals?.[id] ?? 0 });
    }
  }
  return pairs;
}

function intent(p: PairIntel): { text: string; tone: string; action: string } {
  if (p.signal.killSwitch.active) {
    return { text: "STAND DOWN", tone: "text-loss", action: "Suppressed — gates failed." };
  }
  const s = p.signal.sFinal;
  if (Math.abs(s) < 0.1) return { text: "NO TRADE", tone: "text-muted-foreground", action: "Edge too weak to act." };
  // Short the rich leg, long the cheap leg of the spread (residual = B - β·A)
  if (s > 0) {
    return {
      text: "LONG SPREAD",
      tone: "text-gain",
      action: `Long ${p.tickerB}, short ${p.tickerA} at β=${p.cointegration.beta.toFixed(2)}.`,
    };
  }
  return {
    text: "SHORT SPREAD",
    tone: "text-loss",
    action: `Short ${p.tickerB}, long ${p.tickerA} at β=${p.cointegration.beta.toFixed(2)}.`,
  };
}

// ─── Cards / sub-components ─────────────────────────────────────────

function MetricCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2">
      <div className="text-[8px] sm:text-[9px] font-mono uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className={`text-sm sm:text-base font-bold tabular-nums ${tone ?? "text-foreground"}`}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground/80 mt-0.5">{sub}</div>}
    </div>
  );
}

function GateChip({ label, v }: { label: string; v: number }) {
  const pct = Math.round(v * 100);
  const tone = v >= 0.66 ? "text-gain" : v >= 0.33 ? "text-warning" : "text-loss";
  return (
    <div className="rounded border border-border/60 bg-muted/20 px-1.5 py-1 text-center">
      <div className="text-[8px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className={`text-[11px] font-bold ${tone}`}>{pct}%</div>
    </div>
  );
}

function SignalBar({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  const pct = Math.min(100, Math.abs(value) * 100);
  const color = value > 0 ? "bg-gain" : "bg-loss";
  return (
    <div className="flex items-center gap-2 text-[9px] font-mono">
      <span className={`w-14 ${muted ? "text-muted-foreground/70" : "text-foreground"}`}>{label}</span>
      <div className="relative h-1.5 flex-1 rounded-full bg-muted/40 overflow-hidden">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <div
          className={`absolute inset-y-0 ${value >= 0 ? "left-1/2" : "right-1/2"} ${color} ${muted ? "opacity-40" : "opacity-90"}`}
          style={{ width: `${pct / 2}%` }}
        />
      </div>
      <span className={`w-10 text-right ${muted ? "text-muted-foreground/70" : "text-foreground"}`}>
        {value.toFixed(2)}
      </span>
    </div>
  );
}

function SignalCard({ pair }: { pair: PairIntel }) {
  const a = intent(pair);
  const conf = Math.round(Math.abs(pair.signal.sFinal) * 100);
  const horizonDays = Number.isFinite(pair.ou.halfLife) ? Math.max(1, Math.round(pair.ou.halfLife)) : 0;

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-mono text-muted-foreground tracking-wider">PAIR</div>
          <div className="text-sm sm:text-base font-bold text-foreground">
            {pair.tickerA} <span className="text-muted-foreground">/</span> {pair.tickerB}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className={`text-[10px] font-mono font-bold ${a.tone}`}>{a.text}</div>
          <div className="text-[9px] font-mono text-muted-foreground">conf ≈ {conf}%</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[9px] font-mono">
        <span className={`rounded border px-1.5 py-0.5 capitalize ${REGIME_TONE[pair.regime.state]}`}>
          {pair.regime.state}
        </span>
        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
          half-life ≈ {horizonDays}d
        </span>
        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
          P(rev) ≈ {(pair.mc.pReversion * 100).toFixed(0)}%
        </span>
        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5 text-muted-foreground">
          tail5 ≈ {(pair.mc.tailRisk5 * 100).toFixed(1)}%
        </span>
      </div>

      <div className="space-y-1.5">
        <SignalBar label="S_base" value={pair.signal.sBase} muted />
        <SignalBar label="S_final" value={pair.signal.sFinal} />
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-[9px] font-mono">
        <GateChip label="Regime" v={pair.signal.gates.regimeFilter} />
        <GateChip label="Reversion" v={pair.signal.gates.reversionConfidence} />
        <GateChip label="Robustness" v={pair.signal.gates.monteCarloRobustness} />
      </div>

      <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-0.5 text-[10px] leading-snug">
        <div className="text-[9px] font-mono uppercase text-muted-foreground tracking-wider mb-1">
          Why this trade
        </div>
        <p className="text-foreground/80">- {pair.signal.why.spreadDeviation}</p>
        <p className="text-foreground/80">- {pair.signal.why.regimeAlignment}</p>
        <p className="text-foreground/80">- {pair.signal.why.monteCarloConfidence}</p>
        <p className="text-foreground/80">- {pair.signal.why.tailRisk}</p>
        <p className="text-foreground/90 pt-1 border-t border-border/40 mt-1">
          <span className="text-muted-foreground">Action: </span>{a.action}
        </p>
      </div>

      <div className="space-y-3">
        <OUBandChart spread={pair.spread} ou={pair.ou} label={`${pair.tickerA}/${pair.tickerB}`} />
        <ProbabilityCone mc={pair.mc} ou={pair.ou} />
      </div>
    </div>
  );
}

function SuppressedDrawer({ pairs }: { pairs: PairIntel[] }) {
  const [open, setOpen] = useState(false);
  if (pairs.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-[11px] font-bold text-foreground">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Suppressed by Kill-Switch
          <span className="rounded bg-loss/15 text-loss px-1.5 py-0.5 text-[9px] font-mono">{pairs.length}</span>
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">audit trail</span>
      </button>
      {open && (
        <div className="border-t border-border/60 px-3 py-2 space-y-2">
          {pairs.map((p) => (
            <div key={p.id} className="text-[10px] space-y-0.5">
              <div className="font-mono text-foreground/90">
                {p.tickerA}/{p.tickerB} ·{" "}
                <span className="capitalize text-muted-foreground">{p.regime.state}</span>
              </div>
              <ul className="ml-3 list-disc text-muted-foreground space-y-0.5">
                {p.signal.killSwitch.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ─────────────────────────────────────────────────────

export default function StatArbIntelligencePanel({ tickers, baseSignals, maxPairs = 8 }: Props) {
  const pairs = useMemo(() => buildPairs(tickers, maxPairs, baseSignals), [tickers, maxPairs, baseSignals]);
  const { intel, suppressed, loading, error } = useStatArbIntelligence(pairs, "1y");

  // Aggregate insights across all pairs (live + suppressed)
  const insights = useMemo(() => {
    const all = [...intel, ...suppressed];
    if (all.length === 0) return null;

    const cointCount = all.filter((p) => p.cointegration.isCointegrated).length;
    const stableCount = all.filter((p) => p.regime.stability >= 0.5).length;
    const dominantRegime = (() => {
      const tally: Record<RegimeState, number> = { "mean-reverting": 0, trending: 0, volatile: 0, broken: 0 };
      all.forEach((p) => { tally[p.regime.state] += 1; });
      let best: RegimeState = "mean-reverting", bestN = -1;
      (Object.keys(tally) as RegimeState[]).forEach((k) => { if (tally[k] > bestN) { best = k; bestN = tally[k]; } });
      return { state: best, count: bestN };
    })();

    const avgPRev = intel.length > 0
      ? intel.reduce((s, p) => s + p.mc.pReversion, 0) / intel.length
      : 0;
    const avgTail = intel.length > 0
      ? intel.reduce((s, p) => s + p.mc.tailRisk5, 0) / intel.length
      : 0;

    // Ranked opportunities (only live, non-killed, sorted by |S_final|)
    const ranked = [...intel].sort((a, b) => Math.abs(b.signal.sFinal) - Math.abs(a.signal.sFinal));

    const chart = ranked.map((p) => ({
      pair: `${p.tickerA}/${p.tickerB}`,
      sFinal: Number((p.signal.sFinal * 100).toFixed(1)),
      regime: p.regime.state,
      conf: Math.round(Math.abs(p.signal.sFinal) * 100),
    }));

    // Recommended actions: top 3 with non-trivial conviction
    const actionable = ranked.filter((p) => Math.abs(p.signal.sFinal) >= 0.15).slice(0, 3);

    return { cointCount, stableCount, dominantRegime, avgPRev, avgTail, ranked, chart, actionable, total: all.length };
  }, [intel, suppressed]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
            <Brain className="h-3.5 w-3.5 text-primary" />
            Intelligence Overlay — {pairs.length} Pairs
          </h3>
          <p className="text-[9px] sm:text-[10px] text-muted-foreground mt-0.5">
            HMM regime · Engle-Granger cointegration · OU mean-reversion · Monte Carlo robustness ·
            S_final = S_base × Regime × Reversion × Robustness (S_base preserved).
          </p>
        </div>
        {loading && (
          <span className="text-[10px] font-mono text-muted-foreground animate-pulse">fitting models…</span>
        )}
      </div>

      {/* Error / empty states */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3" /> {error}
        </div>
      )}
      {pairs.length === 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-6 text-center text-[11px] text-muted-foreground">
          Need at least 2 analysed tickers to form a pair.
        </div>
      )}

      {/* Portfolio-level summary KPIs */}
      {insights && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <MetricCard
            label="Actionable"
            value={`${intel.length}`}
            sub={`${suppressed.length} suppressed`}
            tone={intel.length > 0 ? "text-gain" : "text-muted-foreground"}
          />
          <MetricCard
            label="Cointegrated"
            value={`${insights.cointCount}/${insights.total}`}
            sub="p < 0.05"
          />
          <MetricCard
            label="Dominant Regime"
            value={insights.dominantRegime.state}
            sub={`${insights.dominantRegime.count} pair${insights.dominantRegime.count === 1 ? "" : "s"}`}
            tone={
              insights.dominantRegime.state === "mean-reverting" ? "text-gain"
              : insights.dominantRegime.state === "trending" ? "text-primary"
              : insights.dominantRegime.state === "volatile" ? "text-warning"
              : "text-loss"
            }
          />
          <MetricCard
            label="Avg P(reversion)"
            value={`${(insights.avgPRev * 100).toFixed(0)}%`}
            sub="across actionable"
            tone={insights.avgPRev >= 0.6 ? "text-gain" : insights.avgPRev >= 0.4 ? "text-warning" : "text-loss"}
          />
          <MetricCard
            label="Avg Tail Risk (5%)"
            value={`${(insights.avgTail * 100).toFixed(1)}%`}
            sub="of entry distance"
            tone={insights.avgTail <= 0.5 ? "text-gain" : insights.avgTail <= 1.0 ? "text-warning" : "text-loss"}
          />
        </div>
      )}

      {/* Kill-switch banner */}
      {suppressed.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-loss/40 bg-loss/10 px-3 py-2">
          <ShieldAlert className="h-4 w-4 text-loss flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px]">
            <div className="font-bold text-loss">
              Kill-Switch active on {suppressed.length} pair{suppressed.length > 1 ? "s" : ""}
            </div>
            <div className="text-loss/80 text-[10px]">
              Probabilistic gates fired — see audit drawer below for the per-pair reasons.
            </div>
          </div>
        </div>
      )}

      {/* Conviction bar chart */}
      {insights && insights.chart.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-foreground">
              Conviction by Pair (S_final, %)
            </h4>
            <span className="text-[9px] font-mono text-muted-foreground">positive = long spread</span>
          </div>
          <div className="h-44 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insights.chart}>
                <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                <XAxis dataKey="pair" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={35}
                  tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "S_final"]}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                <ReferenceLine y={10} stroke="hsl(var(--gain))" strokeDasharray="3 3" strokeOpacity={0.4} />
                <ReferenceLine y={-10} stroke="hsl(var(--loss))" strokeDasharray="3 3" strokeOpacity={0.4} />
                <Bar dataKey="sFinal" radius={[3, 3, 0, 0]}>
                  {insights.chart.map((d, i) => (
                    <Cell key={i} fill={REGIME_FILL[d.regime as RegimeState]} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Ranked opportunities table */}
      {insights && insights.ranked.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-foreground">
            Ranked Opportunities
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-2 py-1 text-left text-muted-foreground">Pair</th>
                  <th className="px-2 py-1 text-center text-muted-foreground">Regime</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">β</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">z-score</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">Half-life</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">P(rev)</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">Tail5</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">S_base</th>
                  <th className="px-2 py-1 text-right text-muted-foreground">S_final</th>
                  <th className="px-2 py-1 text-center text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {insights.ranked.map((p) => {
                  const a = intent(p);
                  const z = p.ou.zScore;
                  const hl = Number.isFinite(p.ou.halfLife) ? p.ou.halfLife.toFixed(1) + "d" : "—";
                  return (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="px-2 py-1 font-bold text-foreground">{p.tickerA}/{p.tickerB}</td>
                      <td className="px-2 py-1 text-center">
                        <span className={`rounded border px-1.5 py-0.5 text-[8px] capitalize ${REGIME_TONE[p.regime.state]}`}>
                          {p.regime.state}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right text-foreground">{p.cointegration.beta.toFixed(2)}</td>
                      <td className={`px-2 py-1 text-right ${Math.abs(z) > 2 ? "text-warning font-bold" : "text-foreground"}`}>
                        {z.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-right text-foreground">{hl}</td>
                      <td className={`px-2 py-1 text-right ${p.mc.pReversion >= 0.6 ? "text-gain" : p.mc.pReversion >= 0.4 ? "text-warning" : "text-loss"}`}>
                        {(p.mc.pReversion * 100).toFixed(0)}%
                      </td>
                      <td className={`px-2 py-1 text-right ${p.mc.tailRisk5 <= 0.5 ? "text-gain" : p.mc.tailRisk5 <= 1.0 ? "text-warning" : "text-loss"}`}>
                        {(p.mc.tailRisk5 * 100).toFixed(1)}%
                      </td>
                      <td className="px-2 py-1 text-right text-muted-foreground">{p.signal.sBase.toFixed(2)}</td>
                      <td className={`px-2 py-1 text-right font-bold ${p.signal.sFinal > 0 ? "text-gain" : p.signal.sFinal < 0 ? "text-loss" : "text-muted-foreground"}`}>
                        {p.signal.sFinal.toFixed(2)}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${a.tone}`}>{a.text}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recommended actions */}
      {insights && (
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Info className="h-3 w-3 text-primary" />
            <h4 className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-foreground">
              Recommended Actions
            </h4>
          </div>
          {insights.actionable.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">
              No pair currently clears the conviction threshold. Probabilistic gates are blocking weak signals — wait for
              spreads to deviate further from equilibrium or for regimes to stabilise.
            </p>
          ) : (
            <ol className="space-y-1.5 text-[10px]">
              {insights.actionable.map((p, i) => {
                const a = intent(p);
                const hl = Number.isFinite(p.ou.halfLife) ? Math.round(p.ou.halfLife) : 0;
                return (
                  <li key={p.id} className="flex items-start gap-2">
                    <span className="font-mono text-muted-foreground">{i + 1}.</span>
                    <div className="flex-1">
                      <span className={`font-bold ${a.tone}`}>{p.tickerA}/{p.tickerB}</span>
                      <span className="text-muted-foreground"> — {a.action} </span>
                      <span className="text-foreground/80">
                        Expected reversion within ≈{hl} day{hl === 1 ? "" : "s"} with{" "}
                        {(p.mc.pReversion * 100).toFixed(0)}% probability; tail-risk (5%) ≈
                        {" "}{(p.mc.tailRisk5 * 100).toFixed(1)}% of entry distance.
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {/* Detailed pair cards */}
      {intel.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-foreground">
            Per-Pair Detail
          </h4>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {intel.map((p) => <SignalCard key={p.id} pair={p} />)}
          </div>
        </div>
      )}

      {/* Suppressed drawer */}
      <SuppressedDrawer pairs={suppressed} />

      {/* Learning loop */}
      <LearningLoopPanel />
    </div>
  );
}
