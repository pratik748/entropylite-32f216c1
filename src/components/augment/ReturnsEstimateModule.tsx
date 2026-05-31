import { useMemo } from "react";
import { TrendingUp, Info } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useQuantSnapshot } from "@/hooks/useQuantSnapshot";
import { MethodologyTooltip } from "@/components/quant/MethodologyTooltip";

interface Props { stocks: PortfolioStock[]; }

// Seeded RNG so the bootstrap is deterministic per portfolio
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

/**
 * Stationary block bootstrap of daily log-returns → annualized return distribution.
 * Politis & Romano (1994). Block length ≈ √n preserves serial correlation.
 */
function bootstrapAnnualReturns(rets: number[], iters = 2000, seed = 42): number[] {
  const n = rets.length;
  if (n < 60) return [];
  const rng = mulberry32(seed);
  const blockLen = Math.max(5, Math.round(Math.sqrt(n)));
  const horizon = 252;
  const out: number[] = [];
  for (let it = 0; it < iters; it++) {
    let logSum = 0;
    let drawn = 0;
    while (drawn < horizon) {
      const start = Math.floor(rng() * n);
      const len = Math.min(blockLen, horizon - drawn);
      for (let k = 0; k < len; k++) logSum += rets[(start + k) % n];
      drawn += len;
    }
    out.push(Math.exp(logSum) - 1);
  }
  return out.sort((a, b) => a - b);
}

const ReturnsEstimateModule = ({ stocks }: Props) => {
  const snap = useQuantSnapshot(stocks);

  const result = useMemo(() => {
    if (!snap.ready || snap.portfolio.returns.length < 60) return null;
    const rets = snap.portfolio.returns;
    const muAnnual = snap.portfolio.muAnnual;
    const sigmaAnnual = snap.portfolio.sigmaAnnual;
    const dist = bootstrapAnnualReturns(rets);
    if (dist.length === 0) return null;
    return {
      muAnnual,
      sigmaAnnual,
      sharpe: snap.portfolio.sharpe,
      sortino: snap.portfolio.sortino,
      p05: percentile(dist, 0.05),
      p50: percentile(dist, 0.50),
      p95: percentile(dist, 0.95),
      lookbackDays: snap.lookbackDays,
      historicalCAGR: Math.exp(muAnnual) - 1,
    };
  }, [snap]);

  const fmt = (x: number) => `${(x * 100).toFixed(2)}%`;

  return (
    <div className="rounded-xl border border-border/70 bg-card p-5 shadow-soft space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-foreground" />
            <h3 className="text-sm font-semibold uppercase tracking-wider">Annual Returns Estimate</h3>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Forward-12m distribution from stationary block bootstrap of your portfolio's real daily log-returns.
          </p>
        </div>
        <MethodologyTooltip
          title="Returns Estimate"
          methods={[{
            label: "Block Bootstrap Annual Return",
            formula: "r_year = exp(Σ blocks(r_daily)) − 1, resampled 2,000× with block ≈ √n",
            source: "Politis & Romano (1994) — Stationary Bootstrap",
            lookback: `${snap.lookbackDays} trading days`,
            notes: "Preserves serial correlation. Assumes stationary return process; no alpha, costs, or regime shifts modeled.",
          }]}
        />
      </div>

      {!result ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-2/40 p-6 text-center text-xs text-muted-foreground">
          Needs ≥ 60 days of historical data per holding to estimate. Currently insufficient.
        </div>
      ) : (
        <>
          {/* Hero band */}
          <div className="rounded-lg border border-border bg-surface-2/40 p-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggested annual return</div>
            <div className="mt-2 flex items-baseline gap-3">
              <div className="text-4xl font-semibold tabular-nums text-foreground">
                {fmt(result.p50)}
              </div>
              <div className="text-xs text-muted-foreground">median (50th pctile)</div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-md bg-card/60 p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Pessimistic · p05</div>
                <div className={`mt-1 text-sm font-semibold tabular-nums ${result.p05 < 0 ? "text-loss" : "text-foreground"}`}>{fmt(result.p05)}</div>
              </div>
              <div className="rounded-md bg-card/60 p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Realistic · p50</div>
                <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">{fmt(result.p50)}</div>
              </div>
              <div className="rounded-md bg-card/60 p-2">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Optimistic · p95</div>
                <div className={`mt-1 text-sm font-semibold tabular-nums ${result.p95 > 0 ? "text-gain" : "text-foreground"}`}>{fmt(result.p95)}</div>
              </div>
            </div>
          </div>

          {/* Raw stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Historical μ (ann.)" value={fmt(result.historicalCAGR)} />
            <Stat label="Volatility σ (ann.)" value={fmt(result.sigmaAnnual)} />
            <Stat label="Sharpe" value={result.sharpe.toFixed(2)} />
            <Stat label="Sortino" value={result.sortino.toFixed(2)} />
          </div>

          {/* Honest disclosure */}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-amber-500">
              <Info className="h-3 w-3" /> What this is — and isn't
            </div>
            This is the forward-12m return distribution implied by resampling your portfolio's last {snap.lookbackDays} days
            of returns. It assumes the return-generating process is stationary. It does not include alpha from signals,
            taxes, slippage, or regime shifts. Use the band, not the median, as the honest answer.
          </div>
        </>
      )}
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border/60 bg-surface-2/30 p-3">
    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</div>
  </div>
);

export default ReturnsEstimateModule;