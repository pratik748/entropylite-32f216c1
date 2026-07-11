// Discover — the institutional research workspace.
//
// This module renders validated opportunities from the shared Opportunity
// Engine (`useOpportunities` → OpportunityRepository → opportunity-engine).
// It performs NO generation, scoring or ranking of its own: what appears
// here is exactly what Direct Profit, alerts and every other consumer see,
// in the same canonical order (expected risk-adjusted edge, diversification-
// adjusted when a portfolio is registered).
//
// Design intent: conservative and evidence-driven. The environment (macro
// context) is shown before the ideas; every idea shows its drivers, its
// contradicting evidence, its historical base rates, its sizing math, its
// lifecycle state and what would invalidate it. When nothing survives the
// validation pipeline, this board shows nothing — with the pipeline's own
// rejection accounting — rather than inventing ideas.

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  Brain,
  ChevronDown,
  Database,
  Eye,
  Landmark,
  Plus,
  RefreshCw,
  Scale,
  ShieldAlert,
  Target,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/currency";
import { useOpportunities } from "@/hooks/useOpportunities";
import {
  EMPTY_STATE_MESSAGE,
  type AssetClass,
  type MacroSnapshot,
  type ModelScore,
  type NearMiss,
  type ValidatedOpportunity,
} from "@/lib/opportunities/types";
import {
  getLifecycleMap,
  recentlyInvalidated,
  type LifecycleEntry,
  type LifecycleState,
} from "@/lib/opportunities/lifecycle";
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
  preliminary_signal_too_weak: "preliminary signal too weak",
  too_few_models: "too few models with a view",
  insufficient_bucket_coverage: "not enough independent info-buckets voting",
  bucket_disagreement: "independent info-buckets disagree",
  confidence_below_threshold: "calibrated confidence below threshold",
  agreement_below_threshold: "model agreement below threshold",
  insufficient_expected_r: "expected return after costs/fat-tails too small",
  non_positive_expected_edge: "no positive expected edge after costs",
  non_positive_risk_adjusted_edge: "no positive risk-adjusted edge",
};

const LIFECYCLE_STYLE: Record<LifecycleState, { label: string; cls: string }> = {
  validated: { label: "NEW", cls: "bg-primary/10 text-primary" },
  high_conviction: { label: "HIGH CONVICTION", cls: "bg-gain/15 text-gain" },
  active: { label: "ACTIVE", cls: "bg-primary/15 text-primary" },
  weakening: { label: "WEAKENING", cls: "bg-warning/15 text-warning" },
  invalidated: { label: "INVALIDATED", cls: "bg-loss/10 text-loss" },
  archived: { label: "ARCHIVED", cls: "bg-surface-3 text-muted-foreground" },
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

// Conviction history sparkline (from the lifecycle store).
const ConvictionSpark = ({ entry }: { entry: LifecycleEntry }) => {
  const pts = entry.history;
  if (pts.length < 2) return null;
  const w = 64, h = 18;
  const min = Math.min(...pts.map((p) => p.confidence));
  const max = Math.max(...pts.map((p) => p.confidence));
  const range = max - min || 0.01;
  const path = pts
    .map((p, i) => `${(i / (pts.length - 1)) * w},${h - ((p.confidence - min) / range) * (h - 2) - 1}`)
    .join(" ");
  const rising = pts[pts.length - 1].confidence >= pts[0].confidence;
  return (
    <svg width={w} height={h} aria-label="conviction history">
      <polyline points={path} fill="none" stroke={rising ? "hsl(var(--gain))" : "hsl(var(--warning))"} strokeWidth="1.5" />
    </svg>
  );
};

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

// ── Macro environment strip ─────────────────────────────────────────

const MacroStat = ({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" | "warning" }) => (
  <div className="rounded-lg bg-surface-2 px-2.5 py-1.5 min-w-[92px]">
    <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className={`font-mono text-xs ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : tone === "warning" ? "text-warning" : "text-foreground"}`}>{value}</div>
  </div>
);

const MacroStrip = ({ macro }: { macro: MacroSnapshot }) => {
  const [expanded, setExpanded] = useState(false);
  const slope = macro.rates.curveSlopePct;
  const d10 = macro.rates.tenYearChange63dPct;
  const dollar = macro.dollar.ret63d;
  const credit = macro.credit.highYieldRelStrength63d;
  const vixP = macro.volatility.vixPercentile1y;
  const leaders = macro.sectors.ranked.slice(0, 3);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <button onClick={() => setExpanded((v) => !v)} className="flex w-full items-center gap-2">
        <Landmark className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">Macro environment</span>
        <span className="text-[9px] font-mono text-muted-foreground">measured before any security is scored</span>
        <ChevronDown className={`ml-auto h-3 w-3 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      <div className="mt-2 flex flex-wrap gap-2">
        <MacroStat
          label="10Y yield"
          value={macro.rates.tenYearPct != null ? `${macro.rates.tenYearPct}%${d10 != null ? ` (${d10 >= 0 ? "+" : ""}${d10}pt)` : ""}` : "n/a"}
          tone={d10 != null ? (d10 > 0 ? "loss" : "gain") : undefined}
        />
        <MacroStat
          label="Curve 10Y−3M"
          value={slope != null ? `${slope >= 0 ? "+" : ""}${slope}pt` : "n/a"}
          tone={slope != null && slope < 0 ? "warning" : undefined}
        />
        <MacroStat
          label="Dollar 63d"
          value={dollar != null ? `${dollar >= 0 ? "+" : ""}${fmtPct(dollar)}` : "n/a"}
        />
        <MacroStat
          label="VIX"
          value={macro.volatility.vix != null ? `${macro.volatility.vix.toFixed(1)}${vixP != null ? ` · p${Math.round(vixP * 100)}` : ""}` : "n/a"}
          tone={vixP != null && vixP > 0.7 ? "loss" : vixP != null && vixP < 0.3 ? "gain" : undefined}
        />
        <MacroStat
          label="Credit HY−IG"
          value={credit != null ? `${credit >= 0 ? "+" : ""}${fmtPct(credit)}` : "n/a"}
          tone={credit != null ? (credit > 0.01 ? "gain" : credit < -0.01 ? "loss" : undefined) : undefined}
        />
        {leaders.length > 0 && (
          <MacroStat label="Leading sectors" value={leaders.map((s) => s.symbol).join(" ")} />
        )}
      </div>
      {expanded && (
        <ul className="mt-2 space-y-0.5 border-t border-border/50 pt-2">
          {macro.evidence.map((e, i) => (
            <li key={i} className="text-[11px] text-foreground/90">• {e}</li>
          ))}
          {macro.missing.length > 0 && (
            <li className="text-[10px] font-mono text-warning">Unavailable instruments: {macro.missing.join(", ")}</li>
          )}
        </ul>
      )}
    </div>
  );
};

// ── Opportunity research card ───────────────────────────────────────

function OpportunityCard({
  o,
  owned,
  lifecycle,
  onAdd,
}: {
  o: ValidatedOpportunity;
  owned: boolean;
  lifecycle: LifecycleEntry | null;
  onAdd: () => void;
}) {
  const [showModels, setShowModels] = useState(false);
  const [showInvalidation, setShowInvalidation] = useState(false);
  const [showConfidence, setShowConfidence] = useState(false);
  const sym = getCurrencySymbol(o.currency);

  // Primary drivers = the strongest agreeing models, by conviction.
  const dominantDir = o.direction === "long" ? 1 : -1;
  const drivers = o.models
    .filter((m) => m.hasSignal && m.direction === dominantDir)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
  const lifecycleStyle = lifecycle ? LIFECYCLE_STYLE[lifecycle.state] : null;

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
            {lifecycleStyle && (
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${lifecycleStyle.cls}`} title={lifecycle ? `First validated ${new Date(lifecycle.firstSeen).toLocaleString()} · ${lifecycle.consecutiveRuns} consecutive runs` : undefined}>
                {lifecycleStyle.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{o.name}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-sm font-semibold text-foreground">{sym}{o.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div className="text-[9px] font-mono text-muted-foreground">{o.horizonDays}d horizon</div>
          {lifecycle && lifecycle.history.length >= 2 && <ConvictionSpark entry={lifecycle} />}
        </div>
      </div>

      {/* Core metrics */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <button className="rounded-lg bg-surface-2 px-2 py-1.5 text-left" onClick={() => setShowConfidence((v) => !v)} title="Tap for confidence drivers">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Confidence</div>
          <div className="font-mono text-sm text-foreground">{fmtPct(o.confidence, 0)}</div>
        </button>
        <div className="rounded-lg bg-surface-2 px-2 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Exp. edge</div>
          <div className={`font-mono text-sm ${o.expectedEdgePct >= 0 ? "text-gain" : "text-loss"}`}>{o.expectedEdgePct >= 0 ? "+" : ""}{fmtPct(o.expectedEdgePct)}</div>
        </div>
        <div className="rounded-lg bg-surface-2 px-2 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">95% VaR</div>
          <div className="font-mono text-sm text-warning">−{fmtPct(o.downsideRiskPct)}</div>
        </div>
        <div className="rounded-lg bg-surface-2 px-2 py-1.5" title={`Ranking objective: |expected edge| × confidence ÷ downside risk${o.portfolioAdjustedScore != null ? " × diversification vs your portfolio" : ""}`}>
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Edge/Risk</div>
          <div className="font-mono text-sm text-primary">{(o.portfolioAdjustedScore ?? o.riskAdjustedScore).toFixed(2)}</div>
        </div>
      </div>

      {/* Confidence drivers (auditable) */}
      {showConfidence && (
        <ul className="mt-2 space-y-0.5 rounded-lg border border-border/60 bg-surface-1 px-3 py-2">
          {o.confidenceDrivers.map((d, i) => (
            <li key={i} className="text-[10px] leading-snug text-muted-foreground">• {d}</li>
          ))}
        </ul>
      )}

      {/* Primary drivers */}
      {drivers.length > 0 && (
        <div className="mt-3">
          <div className="text-[9px] font-bold uppercase tracking-wider text-gain">Primary drivers</div>
          <ul className="mt-1 space-y-0.5">
            {drivers.map((m) => (
              <li key={m.id} className="text-[11px] leading-snug text-foreground/90">
                • <span className="font-medium">{m.label}</span>{m.rationale[0] ? ` — ${m.rationale[0]}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contradicting evidence */}
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

      {/* Historical base rates + portfolio fit + sizing */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {o.historicalStats && (
          <div className="rounded-lg border border-border/60 bg-surface-1 px-3 py-2">
            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Historical similar setups</div>
            <p className="mt-0.5 text-[11px] text-foreground/90">
              {o.historicalStats.sampleSize} overlapping {o.historicalStats.horizonDays}-day windows on this symbol ·
              win rate {o.historicalStats.hitRatePct}% · mean {o.historicalStats.meanReturnPct >= 0 ? "+" : ""}{o.historicalStats.meanReturnPct}% per window
            </p>
          </div>
        )}
        <div className="rounded-lg border border-border/60 bg-surface-1 px-3 py-2">
          <div className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3 w-3" /> Suggested size
          </div>
          <p className="mt-0.5 text-[11px] text-foreground/90">
            {o.sizing.suggestedWeightPct}% of capital
            {o.sizing.suggestedQty != null ? ` (≈${o.sizing.suggestedQty} units)` : ""} —
            bound by {o.sizing.basis === "fractional_kelly" ? "¼-Kelly" : "2% vol budget"} ·
            est. loss at VaR {o.sizing.estMaxLossPct}% of capital
          </p>
          <p className="text-[9px] font-mono text-muted-foreground mt-0.5">
            ¼-Kelly {o.sizing.fractionalKellyPct}% · vol-target {o.sizing.volTargetWeightPct}%
          </p>
        </div>
      </div>
      {o.portfolioFit && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          <span className="font-bold uppercase tracking-wider text-[9px]">Portfolio fit · </span>
          {o.portfolioFit.note}
        </p>
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

// ── Main module ─────────────────────────────────────────────────────

const Discover = ({ stocks, onAddToPortfolio }: Props) => {
  const [assetClasses, setAssetClasses] = useState<Set<AssetClass>>(new Set());
  const [direction, setDirection] = useState<"long" | "short" | "">("");
  const [minConfidence, setMinConfidence] = useState(0);
  const [showNearMisses, setShowNearMisses] = useState(false);

  const filters = useMemo(() => ({
    assetClasses: assetClasses.size > 0 ? Array.from(assetClasses) : undefined,
    direction: direction || undefined,
    minConfidence: minConfidence > 0 ? minConfidence : undefined,
  }), [assetClasses, direction, minConfidence]);

  const { opportunities, response, loading, error, fetchedAt, refresh } = useOpportunities(filters);

  // Lifecycle state re-read whenever a new response lands (the repository
  // folds each run into the store before notifying subscribers).
  const [lifecycleMap, setLifecycleMap] = useState(() => getLifecycleMap());
  const [invalidated, setInvalidated] = useState<LifecycleEntry[]>(() => recentlyInvalidated().slice(0, 6));
  useEffect(() => {
    setLifecycleMap(getLifecycleMap());
    setInvalidated(recentlyInvalidated().slice(0, 6));
  }, [response]);

  const existingTickers = useMemo(() => new Set(stocks.map((s) => s.ticker.toUpperCase())), [stocks]);
  const diagnostics = response?.diagnostics ?? null;
  const allValidated = response?.opportunities ?? [];
  const filteredOut = allValidated.length - opportunities.length;
  const nearMisses: NearMiss[] = diagnostics?.nearMisses ?? [];

  const handleAdd = (o: ValidatedOpportunity) => {
    const qty = o.sizing.suggestedQty && o.sizing.suggestedQty > 0 ? o.sizing.suggestedQty : 1;
    onAddToPortfolio(o.symbol, o.price, qty);
    toast({
      title: `Added ${o.symbol}`,
      description: `${qty} unit${qty === 1 ? "" : "s"} at ${getCurrencySymbol(o.currency)}${o.price.toLocaleString()} — full analysis will run on the Desk.`,
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
      .map(([code, count]) => `${count} × ${REJECTION_LABELS[code] || code.replace(/_/g, " ")}`);
  }, [diagnostics]);

  const nextReview = fetchedAt ? new Date(fetchedAt + 30 * 60 * 1000) : null;

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

      {/* Macro environment — shown before the ideas */}
      {response && <MacroStrip macro={response.macro} />}

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
            Macro context → whole-market universe → evidence collection →
            independent scoring → cross-bucket consensus → validation.
            Only survivors are shown.
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
              lifecycle={lifecycleMap[o.symbol.toUpperCase()] ?? null}
              onAdd={() => handleAdd(o)}
            />
          ))}
        </div>
      )}

      {/* Near-misses — auditable, explicitly NOT recommendations */}
      {nearMisses.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <button onClick={() => setShowNearMisses((v) => !v)} className="flex w-full items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">Watching — failed validation</span>
            <span className="text-[9px] font-mono text-muted-foreground">{nearMisses.length} near-miss{nearMisses.length === 1 ? "" : "es"} · not recommendations</span>
            <ChevronDown className={`ml-auto h-3 w-3 text-muted-foreground transition-transform ${showNearMisses ? "rotate-180" : ""}`} />
          </button>
          {showNearMisses && (
            <div className="mt-2 space-y-1.5 border-t border-border/50 pt-2">
              {nearMisses.map((n) => (
                <div key={n.symbol} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono font-semibold text-foreground">{n.symbol}</span>
                  {n.direction !== "none" && (
                    <span className={`text-[9px] font-mono ${n.direction === "long" ? "text-gain" : "text-loss"}`}>{n.direction.toUpperCase()} lean</span>
                  )}
                  <span className="text-muted-foreground">
                    rejected: {REJECTION_LABELS[n.code] || n.code.replace(/_/g, " ")}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {Math.round(n.calibratedProb * 100)}% cal · {Math.round(n.agreement * 100)}% agree
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Recently invalidated — conviction is a lifecycle, not a feed */}
      {invalidated.length > 0 && (
        <div className="rounded-xl border border-loss/15 bg-loss/5 p-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-loss">Recently invalidated</div>
          <div className="mt-1.5 space-y-1">
            {invalidated.map((e) => (
              <div key={e.symbol} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono font-semibold text-foreground">{e.symbol}</span>
                <span className="text-[9px] font-mono text-muted-foreground">{e.direction.toUpperCase()}</span>
                <span className="text-muted-foreground truncate">{e.invalidationReason}</span>
                <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">
                  {e.invalidatedAt ? new Date(e.invalidatedAt).toLocaleString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Learning health + review cadence footer */}
      {response && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Brain className="h-3 w-3" />
            Calibration: {response.learning.drift === "healthy" ? (
              <span className="text-gain">healthy</span>
            ) : response.learning.drift === "degrading" ? (
              <span className="text-warning">degrading (Brier {response.learning.calibration.brierScore.toFixed(3)})</span>
            ) : (
              <span className="text-warning">warming up ({response.learning.calibration.nSamples} settled outcomes)</span>
            )}
          </span>
          <span>Brier {response.learning.calibration.brierScore.toFixed(3)} on {response.learning.calibration.nSamples} outcomes</span>
          <span>{response.learning.reputationCells} model-reputation cells live</span>
          {response.learning.calibration.fitAt && <span>last refit {new Date(response.learning.calibration.fitAt).toLocaleDateString()}</span>}
          {nextReview && <span className="ml-auto">auto re-evaluation ≈ {nextReview.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        </div>
      )}
    </div>
  );
};

export default Discover;
