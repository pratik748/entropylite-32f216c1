// Desirable Assets — the classic board UI, now powered ENTIRELY by the
// shared Opportunity Engine. The presentation is the familiar one (header,
// Needs & Constraints, staged loader, glass cards with entry/target/stop
// and one-tap add); the architecture behind it changed completely:
//
//   • No AI-generated candidates, no reserve universes, no template theses.
//   • Every card is a ValidatedOpportunity from the shared pipeline
//     (universe → evidence → independent models → cross-bucket consensus →
//     validation), identical objects and ranking to Direct Profit's queue
//     and the alert feed.
//   • Entry zone / target / stop are volatility-derived display levels
//     (±0.25σ band, 1σ objective, 1.25σ invalidation), not predictions.
//   • When nothing survives validation the board says so instead of
//     inventing ideas.

import { useMemo, useState, useRef, useEffect } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Plus,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/currency";
import { useFX } from "@/hooks/useFX";
import { useOpportunities } from "@/hooks/useOpportunities";
import {
  EMPTY_STATE_MESSAGE,
  type AssetClass,
  type ValidatedOpportunity,
} from "@/lib/opportunities/types";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props {
  stocks: PortfolioStock[];
  onAddToPortfolio: (ticker: string, price: number, qty: number) => void;
}

const REGION_LABELS: Record<string, string> = {
  INR: "India + Global", EUR: "Europe + Global", GBP: "UK + Global", JPY: "Japan + Global",
  CNY: "China + Global", KRW: "Korea + Global", AUD: "Australia + Global", CAD: "Canada + Global",
  BRL: "Brazil + Global", HKD: "Hong Kong + Global", SGD: "Singapore + Global",
};

const ASSET_TYPES: Array<{ label: string; key: AssetClass }> = [
  { label: "Stocks", key: "equity" },
  { label: "ETFs", key: "etf" },
  { label: "Indices", key: "index" },
  { label: "Bonds", key: "bond" },
  { label: "Commodities", key: "commodity" },
  { label: "Crypto", key: "crypto" },
];

// Old sector chips → Yahoo sector names the engine reports.
const SECTORS: Array<{ label: string; matches: string[] }> = [
  { label: "Technology", matches: ["Technology", "Communication Services"] },
  { label: "Banking", matches: ["Financial Services"] },
  { label: "Healthcare", matches: ["Healthcare"] },
  { label: "Energy", matches: ["Energy"] },
  { label: "Consumer", matches: ["Consumer Cyclical", "Consumer Defensive"] },
  { label: "Infrastructure", matches: ["Industrials", "Utilities", "Real Estate"] },
  { label: "Pharma", matches: ["Healthcare"] },
  { label: "Auto", matches: ["Consumer Cyclical"] },
  { label: "FMCG", matches: ["Consumer Defensive"] },
  { label: "Metals", matches: ["Basic Materials"] },
];

const HORIZONS = [
  { key: "intraday", label: "Intraday", hint: "Same-day, hours", days: 5 },
  { key: "short_term", label: "Short-term", hint: "1d – 4 weeks", days: 10 },
  { key: "medium_term", label: "Medium-term", hint: "1 – 6 months", days: 21 },
  { key: "long_term", label: "Long-term", hint: "6 months+", days: 63 },
] as const;

// Real pipeline stages — labels match what the engine actually does; the
// timer only paces the bar, it does not invent work.
const LOADING_STAGES = [
  { at: 10, label: "Measuring macro environment (rates, dollar, vol, credit)..." },
  { at: 25, label: "Generating market universe..." },
  { at: 45, label: "Collecting price evidence..." },
  { at: 62, label: "Running independent scoring models..." },
  { at: 78, label: "Cross-validating across info-buckets..." },
  { at: 90, label: "Applying validation gates & ranking..." },
];

const REJECTION_LABELS: Record<string, string> = {
  no_price_history: "lacked usable price history",
  insufficient_history: "had too little trading history",
  invalid_price: "had invalid prices",
  below_liquidity_floor: "failed the liquidity bar",
  preliminary_signal_too_weak: "had signals too weak to score deeply",
  too_few_models: "had too few models with a view",
  insufficient_bucket_coverage: "lacked independent evidence coverage",
  bucket_disagreement: "had conflicting evidence across buckets",
  confidence_below_threshold: "fell below the confidence threshold",
  agreement_below_threshold: "had models too split to trade",
  insufficient_expected_r: "had insufficient reward after costs and fat tails",
  non_positive_expected_edge: "had no positive expected edge",
  non_positive_risk_adjusted_edge: "had no positive risk-adjusted edge",
};

// Mini sparkline component (classic look)
const Sparkline = ({ data, className = "" }: { data: number[]; className?: string }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80, h = 24;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  const isUp = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className={className}>
      <polyline points={points} fill="none" stroke={isUp ? "hsl(var(--gain))" : "hsl(var(--loss))"} strokeWidth="1.5" />
    </svg>
  );
};

function matchesSectorChips(o: ValidatedOpportunity, selected: Set<string>): boolean {
  if (selected.size === 0) return true;
  if (!o.sector) return false;
  for (const chip of SECTORS) {
    if (!selected.has(chip.label)) continue;
    if (chip.matches.some((m) => o.sector === m)) return true;
  }
  return false;
}

const DesirableAssets = ({ stocks, onAddToPortfolio }: Props) => {
  const { baseCurrency } = useFX();
  const [addedTickers, setAddedTickers] = useState<Set<string>>(new Set());
  const [showConstraints, setShowConstraints] = useState(true);
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());

  // Needs & Constraints state (classic controls)
  const [budget, setBudget] = useState("");
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<Set<AssetClass>>(new Set());
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set());
  const [selectedHorizon, setSelectedHorizon] = useState<string>("");

  const horizonDays = HORIZONS.find((h) => h.key === selectedHorizon)?.days ?? 21;
  const filters = useMemo(() => ({
    assetClasses: selectedAssetTypes.size > 0 ? Array.from(selectedAssetTypes) : undefined,
  }), [selectedAssetTypes]);

  const { opportunities: engineSlate, response, loading, error, fetchedAt, refresh } =
    useOpportunities(filters, { horizonDays });

  // Sector chips filter client-side (the engine reports Yahoo sector names).
  const recommendations = useMemo(
    () => engineSlate.filter((o) => matchesSectorChips(o, selectedSectors)),
    [engineSlate, selectedSectors],
  );

  // Staged loading bar — visual pacing over the single real request.
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStage, setLoadingStage] = useState("");
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (loading) {
      setLoadingProgress(LOADING_STAGES[0].at);
      setLoadingStage(LOADING_STAGES[0].label);
      let idx = 1;
      progressTimer.current = setInterval(() => {
        if (idx < LOADING_STAGES.length) {
          setLoadingProgress(LOADING_STAGES[idx].at);
          setLoadingStage(LOADING_STAGES[idx].label);
          idx++;
        }
      }, 2500);
    } else {
      setLoadingProgress(100);
      setLoadingStage("Complete");
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    }
    return () => {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    };
  }, [loading]);

  const existingTickers = useMemo(() => new Set(stocks.map((s) => s.ticker.toUpperCase())), [stocks]);
  const diagnostics = response?.diagnostics ?? null;
  const stats = {
    generated: diagnostics?.universeSize ?? 0,
    passed: diagnostics?.validated ?? 0,
  };
  const regimeType = response?.regime.label ?? "";
  const marketCondition = response
    ? [...response.regime.evidence.slice(0, 1), ...response.macro.evidence.slice(0, 2)].join(" ")
    : "";

  const hasActiveFilters = Boolean(budget || selectedAssetTypes.size > 0 || selectedSectors.size > 0 || selectedHorizon);
  const isHonestEmptyState = Boolean(!error && !loading && recommendations.length === 0 && (diagnostics?.universeSize ?? 0) > 0);

  const rejectSummary = useMemo(() => {
    if (!diagnostics) return [] as string[];
    return Object.entries(diagnostics.rejectionSummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([code, count]) => `${count} ${REJECTION_LABELS[code] || code.replace(/_/g, " ")}`);
  }, [diagnostics]);

  const toggleChip = <T,>(set: Set<T>, setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const toggleEvidence = (symbol: string) => {
    setExpandedEvidence((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol); else next.add(symbol);
      return next;
    });
  };

  // Quantity: engine sizing first; explicit budget applies the engine's
  // suggested weight to the user's stated capital instead.
  const qtyFor = (o: ValidatedOpportunity): number => {
    const budgetNum = budget ? parseFloat(budget.replace(/,/g, "")) : 0;
    if (budgetNum > 0 && o.price > 0) {
      return Math.max(1, Math.floor((budgetNum * o.sizing.suggestedWeightPct / 100) / o.price));
    }
    return Math.max(1, o.sizing.suggestedQty ?? 1);
  };

  const handleAdd = (o: ValidatedOpportunity) => {
    const qty = qtyFor(o);
    onAddToPortfolio(o.symbol, o.price, qty);
    setAddedTickers((prev) => new Set(prev).add(o.symbol));
    toast({ title: `Added ${o.symbol}`, description: `${qty} units at ${getCurrencySymbol(o.currency)}${o.price.toLocaleString()}` });
  };

  const showInlineLoader = loading && recommendations.length === 0;

  return (
    <div className="space-y-5">
      {/* Header (classic) */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Desirable Assets</h2>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
              QUANT VALIDATED · {REGION_LABELS[baseCurrency] || "Global"}
              {regimeType && <span className={`ml-2 uppercase ${regimeType === "risk-off" ? "text-loss" : regimeType === "risk-on" ? "text-gain" : "text-warning"}`}>{regimeType}</span>}
              {stats.generated > 0 && <span className="ml-2 text-primary">{stats.passed}/{stats.generated} passed</span>}
              {response?.executionVenue === "local_fallback" && (
                <span className="ml-2 text-warning" title="The opportunity-engine edge function isn't deployed yet, so the same pipeline ran locally on a reduced universe (coverage grid + your holdings) via the deployed data proxies.">
                  LOCAL VENUE · REDUCED UNIVERSE
                </span>
              )}
              {fetchedAt && <span className="ml-2">{Math.round((Date.now() - fetchedAt) / 1000)}s ago</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">Cached 30m</span>
          <Button size="sm" variant="ghost" onClick={() => refresh(true)} className="h-7 gap-1.5 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Needs & Constraints Bar (classic) */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <button onClick={() => setShowConstraints(!showConstraints)} className="flex items-center gap-2 w-full text-left">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Needs & Constraints</span>
          <span className="text-[10px] text-muted-foreground ml-1">
            {hasActiveFilters
              ? [budget ? `${getCurrencySymbol(baseCurrency)}${budget}` : "", selectedHorizon ? (HORIZONS.find(h => h.key === selectedHorizon)?.label || selectedHorizon) : "", selectedAssetTypes.size > 0 ? `${selectedAssetTypes.size} types` : "", selectedSectors.size > 0 ? `${selectedSectors.size} sectors` : ""].filter(Boolean).join(" · ")
              : "Set your preferences"}
          </span>
          <span className={`ml-auto text-muted-foreground text-xs transition-transform ${showConstraints ? "rotate-180" : ""}`}>▼</span>
        </button>

        {showConstraints && (
          <div className="space-y-3 pt-2 border-t border-border">
            {/* Budget */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Budget</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">{getCurrencySymbol(baseCurrency)}</span>
                <Input
                  type="text"
                  placeholder="e.g. 50000"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value.replace(/[^0-9.,]/g, ""))}
                  className="pl-8 h-8 text-sm bg-background"
                />
              </div>
            </div>

            {/* Asset Type */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Asset Type</label>
              <div className="flex flex-wrap gap-1.5">
                {ASSET_TYPES.map((type) => (
                  <button
                    key={type.key}
                    onClick={() => toggleChip(selectedAssetTypes, setSelectedAssetTypes, type.key)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      selectedAssetTypes.has(type.key)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sectors */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Sectors</label>
              <div className="flex flex-wrap gap-1.5">
                {SECTORS.map((sector) => (
                  <button
                    key={sector.label}
                    onClick={() => toggleChip(selectedSectors, setSelectedSectors, sector.label)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      selectedSectors.has(sector.label)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {sector.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time Horizon */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="h-3 w-3" /> Time Horizon
                <span className="text-[9px] font-normal normal-case text-muted-foreground/70">— sets the evaluation horizon for edge, risk and validation</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {HORIZONS.map((h) => (
                  <button
                    key={h.key}
                    onClick={() => setSelectedHorizon(selectedHorizon === h.key ? "" : h.key)}
                    title={h.hint}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                      selectedHorizon === h.key
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {h.label} <span className="opacity-60">· {h.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Apply */}
            <Button size="sm" onClick={() => refresh(true)} className="w-full h-8 text-xs gap-1.5">
              <Sparkles className="h-3 w-3" />
              Find Assets
            </Button>
          </div>
        )}
      </div>

      {/* Error banner (classic look) */}
      {error && recommendations.length === 0 && !loading && (
        <div className="rounded-xl border border-loss/20 bg-loss/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-loss/10">
              <AlertTriangle className="h-4 w-4 text-loss flex-shrink-0" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">Feed interrupted</p>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-mono bg-loss/10 text-loss">LIVE FAILURE</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                The engine did not complete cleanly, so nothing was shown as a fake fallback.
              </p>
              <p className="mt-2 text-sm text-foreground">{error}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refresh(true)}>Retry live</Button>
          </div>
        </div>
      )}

      {/* Honest empty (classic look, engine-backed accounting) */}
      {isHonestEmptyState && (
        <div className="rounded-xl border border-warning/20 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
              <Ban className="h-4 w-4 text-warning flex-shrink-0" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-foreground">No clean setups right now</p>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-mono bg-warning/10 text-warning">HONEST EMPTY</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{EMPTY_STATE_MESSAGE}</p>
              {engineSlate.length > recommendations.length ? (
                <p className="mt-2 text-sm text-foreground">
                  {engineSlate.length - recommendations.length} validated name{engineSlate.length - recommendations.length === 1 ? " is" : "s are"} hidden by your sector filters.
                </p>
              ) : rejectSummary.length > 0 ? (
                <p className="mt-2 text-sm text-foreground">{rejectSummary.join(". ")}.</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-muted-foreground font-mono">
                <span className="rounded-full bg-surface-2 px-2 py-1">Screened {stats.generated}</span>
                <span className="rounded-full bg-surface-2 px-2 py-1">Passed {stats.passed}</span>
                <span className="rounded-full bg-surface-2 px-2 py-1">Filters {hasActiveFilters ? "custom" : "default"}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Button size="sm" variant="secondary" onClick={() => refresh(true)}>Retry live</Button>
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" onClick={() => { setBudget(""); setSelectedAssetTypes(new Set()); setSelectedSectors(new Set()); setSelectedHorizon(""); }}>
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Staged loader (classic look, real stage names) */}
      {showInlineLoader && (
        <div className="flex flex-col items-center justify-center py-12 gap-4 max-w-md mx-auto">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary animate-pulse" />
          </div>
          <div className="w-full space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground font-medium">{loadingStage}</span>
              <span className="font-mono text-muted-foreground">{loadingProgress}%</span>
            </div>
            <Progress value={loadingProgress} className="h-2.5 bg-surface-2" />
            <div className="flex justify-between text-[9px] text-muted-foreground font-mono">
              <span>Universe</span>
              <span>Evidence</span>
              <span>Models</span>
              <span>Validate</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground/60 font-mono text-center mt-2">
            Shared pipeline: macro context → universe → evidence → independent models → consensus → validation
          </p>
        </div>
      )}

      {/* Market Assessment (classic card, measured content) */}
      {marketCondition && !showInlineLoader && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Market Assessment</span>
          </div>
          <p className="text-sm text-foreground">{marketCondition}</p>
        </div>
      )}

      {/* Cards (classic layout) */}
      <div className="grid gap-4 md:grid-cols-2">
        {recommendations.map((rec, i) => {
          const sym = getCurrencySymbol(rec.currency);
          const price = rec.price;
          const target = rec.tradePlan.objective;
          const stop = rec.tradePlan.invalidationLevel;
          const upside = price > 0 ? ((target - price) / price) * 100 : 0;
          const downside = price > 0 ? ((stop - price) / price) * 100 : 0;
          const inZone = price >= rec.tradePlan.entryLow && price <= rec.tradePlan.entryHigh;
          const alreadyOwned = existingTickers.has(rec.symbol.toUpperCase());
          const justAdded = addedTickers.has(rec.symbol);
          const spark = rec.sparkline;
          const change = spark.length >= 2 ? ((spark[spark.length - 1] - spark[spark.length - 2]) / spark[spark.length - 2]) * 100 : 0;
          const confidencePct = Math.round(rec.confidence * 100);
          const qty = qtyFor(rec);
          const evidenceOpen = expandedEvidence.has(rec.symbol);
          const conflicted = rec.contradictingEvidence.length > 0;

          return (
            <div key={rec.symbol} className={`glass-panel rounded-xl p-5 transition-all hover:glass-glow-primary ${i < 2 ? "glass-glow-primary" : ""}`}>
              {/* Header row */}
              <div className="flex items-center justify-between mb-3 relative z-10">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-base font-bold text-foreground">{rec.symbol}</span>
                  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono ${rec.direction === "long" ? "bg-gain/10 text-gain border-gain/20" : "bg-loss/10 text-loss border-loss/20"}`}>
                    {rec.direction.toUpperCase()}
                  </span>
                  <span className="rounded bg-gain/10 px-1.5 py-0.5 text-[8px] font-mono text-gain flex items-center gap-0.5">
                    <CheckCircle2 className="h-2.5 w-2.5" /> VALIDATED
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[8px] font-mono ${rec.consensus.bucketConsensus === "ALL_3" ? "bg-gain/15 text-gain" : "bg-primary/15 text-primary"}`}
                    title={`Independent info-buckets: price/flow ${rec.consensus.bucketDirs.A === 1 ? "↑" : rec.consensus.bucketDirs.A === -1 ? "↓" : "—"} · fundamental ${rec.consensus.bucketDirs.B === 1 ? "↑" : rec.consensus.bucketDirs.B === -1 ? "↓" : "—"} · risk/regime ${rec.consensus.bucketDirs.C === 1 ? "↑" : rec.consensus.bucketDirs.C === -1 ? "↓" : "—"} · ${rec.consensus.engineCount} models · ${Math.round(rec.consensus.calibratedProb * 100)}% calibrated`}
                  >
                    {rec.consensus.bucketConsensus === "ALL_3" ? "3/3" : rec.consensus.bucketConsensus === "TWO_OF_3" ? "2/3" : rec.consensus.bucketConsensus} · {Math.round(rec.consensus.calibratedProb * 100)}%
                  </span>
                  {conflicted && (
                    <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[8px] font-mono text-warning flex items-center gap-0.5" title={rec.contradictingEvidence[0]}>
                      <AlertTriangle className="h-2.5 w-2.5" /> MIXED EVIDENCE
                    </span>
                  )}
                  {i < 2 && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-mono text-primary">TOP PICK</span>}
                </div>
                <Sparkline data={spark} />
              </div>

              {/* Name + price row */}
              <div className="flex items-center justify-between mb-3">
                <div className="min-w-0">
                  <p className="truncate text-xs text-muted-foreground">{rec.name}</p>
                  <p className="text-[9px] font-mono text-muted-foreground/70">{rec.sector || rec.assetClass.toUpperCase()}{rec.exchange ? ` · ${rec.exchange}` : ""}</p>
                </div>
                <div className="text-right">
                  <div className="font-mono text-lg font-bold text-foreground">{sym}{price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                  <div className={`text-[10px] font-mono ${change >= 0 ? "text-gain" : "text-loss"}`}>
                    {change >= 0 ? "+" : ""}{change.toFixed(2)}% today
                  </div>
                </div>
              </div>

              {/* Entry / Target / Stop (classic rows, vol-derived levels) */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="rounded-lg bg-surface-2 px-2 py-1.5" title="±0.25× the expected horizon volatility around the last close">
                  <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Entry zone {inZone && <span className="text-gain">· IN</span>}</div>
                  <div className="font-mono text-[11px] text-foreground">{sym}{rec.tradePlan.entryLow.toFixed(2)}–{rec.tradePlan.entryHigh.toFixed(2)}</div>
                </div>
                <div className="rounded-lg bg-surface-2 px-2 py-1.5" title="1σ favorable move over the horizon — the consensus prior, not a promise">
                  <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Target className="h-2.5 w-2.5" /> Objective</div>
                  <div className="font-mono text-[11px] text-gain">{sym}{target.toFixed(2)} <span className="text-[9px]">({upside >= 0 ? "+" : ""}{upside.toFixed(1)}%)</span></div>
                </div>
                <div className="rounded-lg bg-surface-2 px-2 py-1.5" title="1.25σ adverse move — the same level quoted in the invalidation conditions">
                  <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Shield className="h-2.5 w-2.5" /> Invalidation</div>
                  <div className="font-mono text-[11px] text-loss">{sym}{stop.toFixed(2)} <span className="text-[9px]">({downside.toFixed(1)}%)</span></div>
                </div>
              </div>

              {/* Confidence bar + stats (classic) */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1">
                  <span>Confidence {confidencePct}%</span>
                  <span>
                    Edge {rec.expectedEdgePct >= 0 ? "+" : ""}{(rec.expectedEdgePct * 100).toFixed(1)}% · VaR −{(rec.downsideRiskPct * 100).toFixed(1)}% · {rec.horizonDays}d
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                  <div className={`h-full rounded-full ${confidencePct >= 72 ? "bg-gain" : confidencePct >= 62 ? "bg-primary" : "bg-warning"}`} style={{ width: `${confidencePct}%` }} />
                </div>
              </div>

              {/* Thesis + catalyst (classic slots, evidence-backed content) */}
              {rec.supportingEvidence[0] && (
                <p className="text-xs text-foreground/90 leading-snug mb-1.5">{rec.supportingEvidence.slice(0, 2).join(" ")}</p>
              )}
              <p className="text-[11px] text-muted-foreground leading-snug mb-3">
                <span className="font-semibold text-foreground/80">What changed: </span>{rec.recentChange}
              </p>

              {/* Expandable full evidence */}
              <button onClick={() => toggleEvidence(rec.symbol)} className="flex w-full items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground mb-2">
                <Activity className="h-3 w-3" />
                {rec.consensus.engineCount} models · evidence for & against · what invalidates it
                <ChevronDown className={`ml-auto h-3 w-3 transition-transform ${evidenceOpen ? "rotate-180" : ""}`} />
              </button>
              {evidenceOpen && (
                <div className="mb-3 rounded-lg border border-border/60 bg-surface-1 px-3 py-2 space-y-2">
                  {rec.supportingEvidence.length > 0 && (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-gain flex items-center gap-1"><TrendingUp className="h-2.5 w-2.5" /> For</div>
                      <ul className="mt-0.5 space-y-0.5">
                        {rec.supportingEvidence.slice(0, 4).map((e, j) => <li key={j} className="text-[10px] leading-snug text-foreground/90">• {e}</li>)}
                      </ul>
                    </div>
                  )}
                  {rec.contradictingEvidence.length > 0 && (
                    <div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-loss flex items-center gap-1"><TrendingDown className="h-2.5 w-2.5" /> Against</div>
                      <ul className="mt-0.5 space-y-0.5">
                        {rec.contradictingEvidence.slice(0, 3).map((e, j) => <li key={j} className="text-[10px] leading-snug text-muted-foreground">• {e}</li>)}
                      </ul>
                    </div>
                  )}
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Shield className="h-2.5 w-2.5" /> Invalidated by</div>
                    <ul className="mt-0.5 space-y-0.5">
                      {rec.invalidation.slice(0, 3).map((e, j) => <li key={j} className="text-[10px] leading-snug text-muted-foreground">• {e}</li>)}
                    </ul>
                  </div>
                  {rec.historicalStats && (
                    <p className="text-[9px] font-mono text-muted-foreground">
                      History: {rec.historicalStats.sampleSize} similar {rec.historicalStats.horizonDays}d windows · {rec.historicalStats.hitRatePct}% win rate
                    </p>
                  )}
                </div>
              )}

              {/* Footer: qty + add (classic) */}
              <div className="flex items-center justify-between border-t border-border/50 pt-3">
                <div className="text-[10px] font-mono text-muted-foreground" title={`Sizing: ${rec.sizing.suggestedWeightPct}% of capital, bound by ${rec.sizing.basis === "fractional_kelly" ? "¼-Kelly" : "2% vol budget"}; est. loss at VaR ${rec.sizing.estMaxLossPct}% of capital.${rec.portfolioFit ? ` ${rec.portfolioFit.note}` : ""}`}>
                  Qty {qty} · {rec.sizing.suggestedWeightPct}% alloc · cost {rec.costHaircutPct}%
                </div>
                <Button
                  size="sm"
                  variant={alreadyOwned || justAdded ? "secondary" : "default"}
                  disabled={alreadyOwned || justAdded}
                  onClick={() => handleAdd(rec)}
                  className="h-7 gap-1 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  {alreadyOwned ? "Owned" : justAdded ? "Added" : "Add to Portfolio"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DesirableAssets;
