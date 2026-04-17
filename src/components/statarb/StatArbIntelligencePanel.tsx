/**
 * Decision-Cockpit Intelligence Overlay for StatArb.
 * Pure overlay — never mutates S_base. Shows S_base alongside S_final,
 * regime/kill-switch state, and the "Why this trade?" narrative.
 */
import { useMemo, useState } from "react";
import { ShieldAlert, Brain, AlertTriangle, ChevronDown, ChevronRight, BookOpenCheck } from "lucide-react";
import { useStatArbIntelligence, type PairInput, type PairIntel } from "@/hooks/useStatArbIntelligence";
import OUBandChart from "./OUBandChart";
import ProbabilityCone from "./ProbabilityCone";
import LearningLoopPanel from "./LearningLoopPanel";
import type { RegimeState } from "@/lib/statarb/types";

interface Props {
  /** Tickers in the user's portfolio. We auto-build pairs (top N by ranking). */
  tickers: string[];
  /** Optional pre-computed base signals per pair id (`A|B`). */
  baseSignals?: Record<string, number>;
  /** Cap how many pairs to evaluate to keep things responsive. */
  maxPairs?: number;
}

const REGIME_TONE: Record<RegimeState, string> = {
  "mean-reverting": "text-gain border-gain/40 bg-gain/10",
  trending: "text-primary border-primary/40 bg-primary/10",
  volatile: "text-warning border-warning/40 bg-warning/10",
  broken: "text-loss border-loss/40 bg-loss/10",
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

function intentLabel(s: number): { text: string; tone: string } {
  if (Math.abs(s) < 0.1) return { text: "NO TRADE", tone: "text-muted-foreground" };
  return s > 0
    ? { text: "LONG SPREAD", tone: "text-gain" }
    : { text: "SHORT SPREAD", tone: "text-loss" };
}

function SignalCard({ pair }: { pair: PairIntel }) {
  const intent = intentLabel(pair.signal.sFinal);
  const conf = Math.round(Math.abs(pair.signal.sFinal) * 100);
  const horizonDays = Number.isFinite(pair.ou.halfLife) ? Math.max(1, Math.round(pair.ou.halfLife)) : 0;

  return (
    <div className="glass-panel rounded-lg p-3 sm:p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-mono text-muted-foreground tracking-wider">PAIR</div>
          <div className="text-sm sm:text-base font-bold text-foreground">
            {pair.tickerA} <span className="text-muted-foreground">/</span> {pair.tickerB}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className={`text-[10px] font-mono font-bold ${intent.tone}`}>{intent.text}</div>
          <div className="text-[9px] font-mono text-muted-foreground">conf ≈ {conf}%</div>
        </div>
      </div>

      {/* Chips */}
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

      {/* S_base vs S_final bars */}
      <div className="space-y-1.5">
        <SignalBar label="S_base" value={pair.signal.sBase} muted />
        <SignalBar label="S_final" value={pair.signal.sFinal} />
      </div>

      {/* Gates */}
      <div className="grid grid-cols-3 gap-1.5 text-[9px] font-mono">
        <GateChip label="Regime" v={pair.signal.gates.regimeFilter} />
        <GateChip label="Reversion" v={pair.signal.gates.reversionConfidence} />
        <GateChip label="Robustness" v={pair.signal.gates.monteCarloRobustness} />
      </div>

      {/* Why this trade */}
      <div className="rounded border border-border/60 bg-muted/20 p-2 space-y-0.5 text-[10px] leading-snug">
        <div className="text-[9px] font-mono uppercase text-muted-foreground tracking-wider mb-1">
          Why this trade
        </div>
        <p className="text-foreground/80">• {pair.signal.why.spreadDeviation}</p>
        <p className="text-foreground/80">• {pair.signal.why.regimeAlignment}</p>
        <p className="text-foreground/80">• {pair.signal.why.monteCarloConfidence}</p>
        <p className="text-foreground/80">• {pair.signal.why.tailRisk}</p>
      </div>

      {/* Visuals */}
      <div className="space-y-3">
        <OUBandChart spread={pair.spread} ou={pair.ou} label={`${pair.tickerA}/${pair.tickerB}`} />
        <ProbabilityCone mc={pair.mc} ou={pair.ou} />
      </div>
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

export default function StatArbIntelligencePanel({ tickers, baseSignals, maxPairs = 6 }: Props) {
  const pairs = useMemo(() => buildPairs(tickers, maxPairs, baseSignals), [tickers, maxPairs, baseSignals]);
  const { intel, suppressed, loading, error } = useStatArbIntelligence(pairs, "1y");

  const killCount = suppressed.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
            <Brain className="h-4 w-4 text-primary" />
            Intelligence Overlay
            <span className="rounded border border-border/60 px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">
              non-destructive
            </span>
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Probabilistic gating layered on top of the base StatArb engine. S_base is preserved — S_final is
            scaled by regime, OU reversion confidence, and Monte Carlo robustness.
          </p>
        </div>
        {loading && (
          <span className="text-[10px] font-mono text-muted-foreground animate-pulse">fitting…</span>
        )}
      </div>

      {/* Kill-switch banner (if anything suppressed) */}
      {killCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-loss/40 bg-loss/10 px-3 py-2">
          <ShieldAlert className="h-4 w-4 text-loss flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-[11px]">
            <div className="font-bold text-loss">Kill-Switch active on {killCount} pair{killCount > 1 ? "s" : ""}</div>
            <div className="text-loss/80 text-[10px]">
              Probabilistic gates fired — see audit drawer below for the per-pair reasons.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          <AlertTriangle className="h-3 w-3" /> {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && intel.length === 0 && killCount === 0 && pairs.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-6 text-center text-[11px] text-muted-foreground">
          <BookOpenCheck className="h-5 w-5 mx-auto mb-2 opacity-50" />
          No pair has enough history yet to fit a stable HMM/OU. Add more analysed assets or extend lookback.
        </div>
      )}

      {pairs.length === 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-6 text-center text-[11px] text-muted-foreground">
          Need at least 2 analysed tickers to form a pair.
        </div>
      )}

      {/* Pair grid */}
      {intel.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
          {intel.map((p) => (
            <SignalCard key={p.id} pair={p} />
          ))}
        </div>
      )}

      {/* Suppressed drawer */}
      <SuppressedDrawer pairs={suppressed} />

      {/* Learning loop */}
      <LearningLoopPanel />
    </div>
  );
}
