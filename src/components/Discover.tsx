// Discover — the institutional opportunity board.
//
// This module renders validated opportunities from the shared Opportunity
// Engine (`useOpportunities` → OpportunityRepository → opportunity-engine).
// It performs NO generation, scoring or ranking of its own: what appears
// here is exactly what Direct Profit, alerts and every other consumer see,
// in the same canonical order (expected risk-adjusted edge).
//
// Design intent: conservative and evidence-driven. When nothing survives
// the validation pipeline, this board shows nothing — with the pipeline's
// own rejection accounting — rather than inventing ideas.

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  ChevronDown,
  Database,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/currency";
import { useOpportunities } from "@/hooks/useOpportunities";
import { EMPTY_STATE_MESSAGE, type AssetClass, type ModelScore, type ValidatedOpportunity } from "@/lib/opportunities/types";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props {
  stocks: PortfolioStock[];
  onAddToPortfolio: (ticker: string, price: number, qty: number) => void;
}

const ASSET_CLASS_OPTIONS: { key: AssetClass; label: string }[] = [
  { key: "equity", label: "Stocks" },
  { key: "etf", label: "ETFs" },
  { key: "index", label: "Indices" },
  { key: "commodity", label: "Commodities" },
  { key: "bond", label: "Bonds" },
  { key: "crypto", label: "Crypto" },
];

const REJECTION_LABELS: Record<string, string> = {
  no_price_history: "no usable price history",
  insufficient_history: "insufficient trading history",
  invalid_price: "invalid last price",
  below_liquidity_floor: "below the liquidity floor",
  preliminary_signal_too_weak: "preliminary signal too weak to justify deep evidence collection",
  non_positive_expected_edge: "no positive expected edge after costs",
  non_positive_risk_adjusted_edge: "no positive risk-adjusted edge",
};

const fmtPct = (v: number, digits = 1) => `${(v * 100).toFixed(digits)}%`;

function directionBadge(direction: "long" | "short") {
  return direction === "long" ? (
    <span className="inline-flex items-center gap-1 rounded bg-gain/10 px-1.5 py-0.5 text-[9px] font-mono text-gain">
      <ArrowUpRight className="h-3 w-3" /> LONG
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-loss/10 px-1.5 py-0.5 text-[9px] font-mono text-loss">
      <ArrowDownRight className="h-3 w-3" /> SHORT
    </span>
  );
}

function bucketChip(o: ValidatedOpportunity) {
  const { bucketConsensus, bucketDirs, agreement } = o.consensus;
  const label = bucketConsensus === "ALL_3" ? "3/3 buckets" : bucketConsensus === "TWO_OF_3" ? "2/3 buckets" : bucketConsensus;
  const dir = (d: -1 | 0 | 1) => (d === 1 ? "↑" : d === -1 ? "↓" : "—");
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${bucketConsensus === "ALL_3" ? "bg-gain/15 text-gain" : "bg-primary/15 text-primary"}`}
      title={`Independent info-buckets — price/flow ${dir(bucketDirs.A)} · fundamental/intel ${dir(bucketDirs.B)} · risk/regime ${dir(bucketDirs.C)} · engine agreement ${fmtPct(agreement, 0)}`}
    >
      {label}
    </span>
  );
}

function ModelRow({ m }: { m: ModelScore }) {
  const width = Math.round(Math.min(Math.abs(m.score), 1) * 50);
  return (
    <div className="py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-center gap-2">
        <span className="w-36 shrink-0 text-[11px] text-foreground">{m.label}</span>
        <div className="relative h-1.5 flex-1 rounded bg-surface-2 overflow-hidden">
          <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
          {m.hasSignal && m.direction !== 0 && (
            <div
              className={`absolute inset-y-0 ${m.score >= 0 ? "left-1/2 bg-gain" : "right-1/2 bg-loss"}`}
              style={{ width: `${width}%` }}
            />
          )}
        </div>
        <span className={`w-14 shrink-0 text-right text-[10px] font-mono ${!m.hasSignal || m.direction === 0 ? "text-muted-foreground" : m.direction === 1 ? "text-gain" : "text-loss"}`}>
          {!m.hasSignal ? "NO DATA" : m.direction === 0 ? "ABSTAIN" : m.score.toFixed(2)}
        </span>
      </div>
      {m.rationale[0] && (
        <p className="mt-0.5 pl-0 text-[10px] leading-snug text-muted-foreground">{m.rationale[0]}</p>
      )}
    </div>
  );
}

function OpportunityCard({
  o,
  owned,
  onAdd,
}: {
  o: ValidatedOpportunity;
  owned: boolean;
  onAdd: () => void;
}) {
  const [showModels, setShowModels] = useState(false);
  const [showInvalidation, setShowInvalidation] = useState(false);
  const sym = getCurrencySymbol(o.currency);

  return (
    <div className="glass-panel rounded-xl p-5">
      {/* Identity */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base font-bold text-foreground">{o.symbol}</span>
            {directionBadge(o.direction)}
            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] font-mono uppercase text-muted-foreground">{o.assetClass}</span>
            {bucketChip(o)}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{o.name}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm font-semibold text-foreground">{sym}{o.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div className="text-[9px] font-mono text-muted-foreground">{o.horizonDays}d horizon</div>
        </div>
      </div>

      {/* Core metrics — confidence, edge, risk, score */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-surface-2 px-2 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Confidence</div>
          <div className="font-mono text-sm text-foreground">{fmtPct(o.confidence, 0)}</div>
        </div>
        <div className="rounded-lg bg-surface-2 px-2 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Exp. edge</div>
          <div className={`font-mono text-sm ${o.expectedEdgePct >= 0 ? "text-gain" : "text-loss"}`}>{o.expectedEdgePct >= 0 ? "+" : ""}{fmtPct(o.expectedEdgePct)}</div>
        </div>
        <div className="rounded-lg bg-surface-2 px-2 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">95% VaR</div>
          <div className="font-mono text-sm text-warning">−{fmtPct(o.downsideRiskPct)}</div>
        </div>
        <div className="rounded-lg bg-surface-2 px-2 py-1.5" title="Ranking objective: |expected edge| × confidence ÷ downside risk">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Edge/Risk</div>
          <div className="font-mono text-sm text-primary">{o.riskAdjustedScore.toFixed(2)}</div>
        </div>
      </div>

      {/* Why is this appearing / what argues against it */}
      {o.supportingEvidence.length > 0 && (
        <div className="mt-3">
          <div className="text-[9px] font-bold uppercase tracking-wider text-gain">Supporting evidence</div>
          <ul className="mt-1 space-y-0.5">
            {o.supportingEvidence.slice(0, 4).map((e, i) => (
              <li key={i} className="text-[11px] leading-snug text-foreground/90">• {e}</li>
            ))}
          </ul>
        </div>
      )}
      {o.contradictingEvidence.length > 0 && (
        <div className="mt-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-loss">Contradicting evidence</div>
          <ul className="mt-1 space-y-0.5">
            {o.contradictingEvidence.slice(0, 3).map((e, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted-foreground">• {e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* What changed recently */}
      <div className="mt-3 rounded-lg border border-border/60 bg-surface-1 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
          <Activity className="h-3 w-3" /> Recent change
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-foreground/90">{o.recentChange}</p>
      </div>

      {/* Independent models */}
      <button
        onClick={() => setShowModels((v) => !v)}
        className="mt-3 flex w-full items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
        <Scale className="h-3 w-3" />
        {o.consensus.engineCount} independent models voted · agreement {fmtPct(o.consensus.agreement, 0)}
        <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${showModels ? "rotate-180" : ""}`} />
      </button>
      {showModels && (
        <div className="mt-1 rounded-lg border border-border/60 bg-surface-1 px-3 py-1">
          {o.models.map((m) => <ModelRow key={m.id} m={m} />)}
        </div>
      )}

      {/* Invalidation conditions */}
      <button
        onClick={() => setShowInvalidation((v) => !v)}
        className="mt-2 flex w-full items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
      >
        <ShieldAlert className="h-3 w-3" />
        What would invalidate this
        <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${showInvalidation ? "rotate-180" : ""}`} />
      </button>
      {showInvalidation && (
        <ul className="mt-1 space-y-0.5 rounded-lg border border-border/60 bg-surface-1 px-3 py-2">
          {o.invalidation.map((c, i) => (
            <li key={i} className="text-[11px] leading-snug text-muted-foreground">• {c}</li>
          ))}
        </ul>
      )}

      {/* Provenance + action */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
        <div
          className="flex items-center gap-1.5 text-[9px] font-mono text-muted-foreground"
          title={`${o.origin.reason} Liquidity tier ${o.liquidityTier}; est. round-trip cost ${o.costHaircutPct}%. ${o.dataQuality.priceBars} price bars; collectors: ${o.dataQuality.collectors.join(", ")}${o.dataQuality.missing.length ? `; missing: ${o.dataQuality.missing.join(", ")}` : ""}.`}
        >
          <Database className="h-3 w-3" />
          {o.origin.source} · cost {o.costHaircutPct}%
          {o.dataQuality.missing.length > 0 && <span className="text-warning">· {o.dataQuality.missing.length} source(s) unavailable</span>}
        </div>
        <Button
          size="sm"
          variant={owned ? "secondary" : "default"}
          disabled={owned}
          onClick={onAdd}
          className="h-7 gap-1 text-xs"
        >
          <Plus className="h-3 w-3" /> {owned ? "In portfolio" : "Add"}
        </Button>
      </div>
    </div>
  );
}

const Discover = ({ stocks, onAddToPortfolio }: Props) => {
  const [assetClasses, setAssetClasses] = useState<Set<AssetClass>>(new Set());
  const [direction, setDirection] = useState<"long" | "short" | "">("");
  const [minConfidence, setMinConfidence] = useState(0);

  const filters = useMemo(() => ({
    assetClasses: assetClasses.size > 0 ? Array.from(assetClasses) : undefined,
    direction: direction || undefined,
    minConfidence: minConfidence > 0 ? minConfidence : undefined,
  }), [assetClasses, direction, minConfidence]);

  const { opportunities, response, loading, error, fetchedAt, refresh } = useOpportunities(filters);

  const existingTickers = useMemo(() => new Set(stocks.map((s) => s.ticker.toUpperCase())), [stocks]);
  const diagnostics = response?.diagnostics ?? null;
  const allValidated = response?.opportunities ?? [];
  const filteredOut = allValidated.length - opportunities.length;

  const handleAdd = (o: ValidatedOpportunity) => {
    onAddToPortfolio(o.symbol, o.price, 1);
    toast({
      title: `Added ${o.symbol}`,
      description: `1 unit at ${getCurrencySymbol(o.currency)}${o.price.toLocaleString()} — full analysis will run on the Desk.`,
    });
  };

  const toggleAssetClass = (key: AssetClass) => {
    setAssetClasses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const rejectionLines = useMemo(() => {
    if (!diagnostics) return [];
    return Object.entries(diagnostics.rejectionSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([reason, count]) => `${count} ${REJECTION_LABELS[reason] || reason.replace(/_/g, " ")}`);
  }, [diagnostics]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Discover</h2>
            <p className="text-[10px] font-mono tracking-wider text-muted-foreground">
              SHARED OPPORTUNITY ENGINE · EVIDENCE-VALIDATED
              {response && (
                <span className={`ml-2 uppercase ${response.regime.label === "risk-off" ? "text-loss" : response.regime.label === "risk-on" ? "text-gain" : "text-warning"}`}>
                  {response.regime.label}
                </span>
              )}
              {fetchedAt && <span className="ml-2">as of {new Date(fetchedAt).toLocaleTimeString()}</span>}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => refresh(true)}
          disabled={loading}
          className="h-7 gap-1.5 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Re-run pipeline
        </Button>
      </div>

      {/* Pipeline funnel — real counts from the engine, nothing simulated */}
      {diagnostics && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <span className="rounded-full bg-surface-2 px-2.5 py-1">Universe {diagnostics.universeSize}</span>
          <span>→</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1">Evidence {diagnostics.evidenceCollected}</span>
          <span>→</span>
          <span className="rounded-full bg-surface-2 px-2.5 py-1">Deep-scored {diagnostics.scored}</span>
          <span>→</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">Validated {diagnostics.validated}</span>
          {filteredOut > 0 && <span className="ml-1">({filteredOut} hidden by your filters)</span>}
        </div>
      )}

      {/* Regime evidence */}
      {response && response.regime.evidence.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Market regime — evidence</div>
          <ul className="mt-1 space-y-0.5">
            {response.regime.evidence.map((e, i) => (
              <li key={i} className="text-[11px] text-foreground/90">• {e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-3 flex flex-wrap items-center gap-2">
        {ASSET_CLASS_OPTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => toggleAssetClass(a.key)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              assetClasses.has(a.key)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50"
            }`}
          >
            {a.label}
          </button>
        ))}
        <div className="h-5 w-px bg-border mx-1" />
        {(["long", "short"] as const).map((d) => (
          <button
            key={d}
            onClick={() => setDirection(direction === d ? "" : d)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              direction === d
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50"
            }`}
          >
            {d === "long" ? "Long only" : "Short only"}
          </button>
        ))}
        <div className="h-5 w-px bg-border mx-1" />
        {[0.6, 0.65, 0.7].map((c) => (
          <button
            key={c}
            onClick={() => setMinConfidence(minConfidence === c ? 0 : c)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              minConfidence === c
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50"
            }`}
          >
            ≥{Math.round(c * 100)}% conf
          </button>
        ))}
      </div>

      {/* Loading — a single honest state; no simulated stage theater */}
      {loading && opportunities.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Target className="h-6 w-6 animate-pulse text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">Running the validation pipeline</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Universe generation → evidence collection → independent scoring →
            cross-bucket consensus → validation. Only survivors are shown.
          </p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-xl border border-loss/20 bg-loss/5 p-4 flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Engine unreachable</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error} Nothing is shown as a substitute — this board never fabricates opportunities.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refresh(true)}>Retry</Button>
        </div>
      )}

      {/* Honest empty state */}
      {!loading && !error && opportunities.length === 0 && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-6 text-center">
          <Ban className="mx-auto h-6 w-6 text-warning" />
          <p className="mt-3 text-sm font-semibold text-foreground">{EMPTY_STATE_MESSAGE}</p>
          {allValidated.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {allValidated.length} opportunit{allValidated.length === 1 ? "y" : "ies"} passed validation but are hidden by your filters.
            </p>
          ) : rejectionLines.length > 0 ? (
            <div className="mt-2 text-xs text-muted-foreground">
              <p>The pipeline ran and rejected every candidate. Top reasons:</p>
              <p className="mt-1 font-mono text-[11px]">{rejectionLines.join(" · ")}</p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing nothing is the correct output when the evidence is weak — re-run later or after the market moves.
            </p>
          )}
        </div>
      )}

      {/* Validated opportunities */}
      {opportunities.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {opportunities.map((o) => (
            <OpportunityCard
              key={o.symbol}
              o={o}
              owned={existingTickers.has(o.symbol.toUpperCase())}
              onAdd={() => handleAdd(o)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Discover;
