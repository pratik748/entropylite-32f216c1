import { useState, useRef, useCallback, useEffect } from "react";
import {
  Mic,
  MicOff,
  Search,
  ArrowUp,
  ArrowDown,
  Minus,
  Shield,
  TrendingUp,
  Clock,
  Zap,
  Volume2,
  BarChart3,
  Activity,
  Plus,
  Trash2,
  Briefcase,
  AlertTriangle,
  RefreshCw,
  Gauge,
  Newspaper,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { governedInvoke } from "@/lib/apiGovernor";
import { useFX } from "@/hooks/useFX";
import { formatCurrency, getCurrencySymbol, resolveAssetCurrency } from "@/lib/currency";
import { cleanAIText } from "@/lib/utils";
import { useHistoricalPrices } from "@/hooks/useHistoricalPrices";
import { useTradeLogger } from "@/hooks/useTradeLogger";
import { useSymbolSuggest } from "@/components/SymbolSuggest";
import { useOpportunities } from "@/hooks/useOpportunities";
import { EMPTY_STATE_MESSAGE } from "@/lib/opportunities/types";
import { useWorkstationData } from "@/hooks/useWorkstationData";
import { useOutcomeGradient } from "@/hooks/useOutcomeGradient";
import { buildEvidenceGraph } from "@/lib/evidence/build";
import { synthesize, logNormalHorizon } from "@/lib/evidence/synthesis";
import { lognormalEs } from "@/lib/evidence/compute";
import type { Synthesis } from "@/lib/evidence/types";

interface RiskMetrics {
  var95: number;
  cvar95: number;
  var99: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  betaEstimate: number;
  kellyFraction: number;
}

interface ClankSignal {
  id: string;
  label: string;
  active: boolean;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
}

interface TradeResult {
  action: "BUY" | "SELL" | "HOLD" | "REDUCE" | "EXIT";
  confidence: number;
  entryLow: number;
  entryHigh: number;
  targetPrice: number;
  stopLoss: number;
  timeframe: string;
  direction: "UP" | "DOWN" | "SIDEWAYS";
  directionReason: string;
  positiveNews: string;
  negativeNews: string;
  protection: string;
  currentPrice: number;
  currency?: string;
  quantScore?: number;
  volatilityRegime?: "LOW" | "NORMAL" | "HIGH";
  riskRewardRatio?: number;
  providersUsed?: number;
  consensus?: "UNANIMOUS" | "MAJORITY" | "SPLIT";
  fallback?: boolean;
  riskMetrics?: RiskMetrics;
  clankSignals?: ClankSignal[];
  newsHeadlines?: string[];
  waitReasons?: string[];
  evidenceCount?: number;
  expectedReturnPct?: number | null;
  expectedDownsidePct?: number | null;
  primaryDrivers?: { id: string; label: string; reason: string; weight: number }[];
  primaryRisks?: { id: string; label: string; reason: string; weight: number }[];
  probabilityDistribution?: Synthesis["cases"];
  thesisBreakers?: Synthesis["breakers"];
  engineSources?: string[];
  bullSignals?: string[];
  bearSignals?: string[];
  intelligence?: {
    suggestion?: "Add" | "Hold" | "Exit" | "Skip";
    confidence?: number;
    verdict?: string;
    trend?: string;
    regime?: string;
    riskScore?: number;
    riskLevel?: string;
    bullRange?: [number, number];
    bearRange?: [number, number];
    sentiment?: number;
  };
  ensemble?: {
    decision: "BUY" | "SELL" | "STAND_ASIDE";
    calibratedProb: number;
    agreement: number;
    engineCount: number;
    expectedR: number;
    consensusLabel: "UNANIMOUS" | "MAJORITY" | "SPLIT";
    standAsideReason?: string;
    agreeingEngines: { id: string; label: string; confidence: number }[];
    disagreeingEngines: { id: string; label: string; confidence: number }[];
    abstainingEngines: { id: string; label: string }[];
    bucketDirs?: { A: -1 | 0 | 1; B: -1 | 0 | 1; C: -1 | 0 | 1 };
    bucketDecision?: {
      buckets: { bucket: "A" | "B" | "C"; direction: -1 | 0 | 1; agreement: number; engines: number }[];
      votingBuckets: number;
      agreeingBuckets: number;
      consensus: "ALL_3" | "TWO_OF_3" | "SPLIT" | "INSUFFICIENT";
    };
    costHaircut?: number;
    tailMultiplier?: number;
  };
  quantEdge?: QuantEdge;
}

interface QuantEdge {
  expectedProfit: {
    perShare: number;
    pct: number;
    currency: string;
    winProb: number;
    expectedR: number;
    upsidePerShare: number;
    downsidePerShare: number;
    costPerShare: number;
  };
  meanReversion?: {
    benchmark: string;
    cointegrated: boolean;
    residZ: number;
    halfLifeDays: number | null;
    beta: number;
    signal: "BUY" | "SELL" | "NEUTRAL";
    note: string;
  } | null;
  walkForward?: {
    hitRate: number;
    meanFwdPct: number;
    fwdSharpe: number;
    sample: number;
    horizonDays: number;
    signal: "BUY" | "SELL" | "NEUTRAL";
  } | null;
  structuralCredit?: {
    distanceToDefault: number;
    impliedPD: number;
    severity: "OK" | "STRESS" | "DISTRESS";
    signal: "BUY" | "SELL" | "NEUTRAL";
  } | null;
  fatTails?: {
    skew: number;
    excessKurtosis: number;
    tailMultiplier: number;
    note: string;
  };
  hedge?: {
    needed: boolean;
    instruction: string;
    riskPerShare?: number;
    var95PerShare?: number;
    cvar95PerShare?: number;
    suggestedStopLoss?: number;
    kellyFraction?: number;
  };
}

interface PortfolioItem {
  ticker: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  currentPrice: number;
  currency: string;
  addedAt: number;
  source?: string;
  catalyst?: string;
  lesson?: string;
}

const STORAGE_KEY = "dp-portfolio";
/** Ceiling for the quant edge engine; the evidence synthesis renders meanwhile. */
const ANALYSIS_TIMEOUT_MS = 45000;

function loadPortfolio(): PortfolioItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePortfolio(items: PortfolioItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/**
 * Auto-optimize position size using fixed-fractional risk + Kelly + confidence.
 *
 *   risk_budget_base  = 1% of portfolio value (fallback: $10k notional / ₹500k for INR)
 *   kelly_scale       = clamp(kelly, 0.10, 1.0)   — half-Kelly–style cap
 *   confidence_scale  = max(0.5, confidence/100)  — never under 50% of base sizing
 *   per_share_risk    = |entry − stop|
 *   qty               = floor(risk_budget_native × kelly × conf / per_share_risk)
 *
 * Falls back to a sane notional if any input is missing (e.g. no live stop).
 */
function computeOptimalQuantity(opts: {
  entryPrice: number;
  stopLoss: number;
  confidence: number;
  kellyFraction?: number;
  currency: string;
  portfolioValueBase?: number;
  convertToBase: (v: number, ccy: string) => number;
  baseCurrency: string;
}): number {
  const { entryPrice, stopLoss, confidence, kellyFraction, currency, portfolioValueBase, convertToBase, baseCurrency } = opts;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return 0;

  // Notional risk budget in *base* currency
  const fallbackNotionalBase = baseCurrency === "INR" ? 500_000 : 10_000;
  const portfolioBase = portfolioValueBase && portfolioValueBase > 0 ? portfolioValueBase : fallbackNotionalBase;
  const riskPctOfPortfolio = 0.01; // 1% per trade — institutional default
  const riskBudgetBase = portfolioBase * riskPctOfPortfolio;

  // Convert risk budget to the asset's native currency (1 unit base → x native)
  // We do this by inverting convertToBase: native = base / convertToBase(1, native)
  const oneNativeInBase = convertToBase(1, currency) || 1;
  const riskBudgetNative = riskBudgetBase / oneNativeInBase;

  // Per-share risk
  const perShareRisk = Math.abs(entryPrice - (Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : entryPrice * 0.95));
  if (perShareRisk <= 0) {
    // No usable stop — size by 5% notional / entry
    return Math.max(1, Math.floor((portfolioBase * 0.05) / oneNativeInBase / entryPrice));
  }

  // Scale by Kelly + confidence
  const kelly = kellyFraction !== undefined && Number.isFinite(kellyFraction)
    ? Math.max(0.1, Math.min(1, kellyFraction))
    : 0.5;
  const confScale = Math.max(0.5, Math.min(1, confidence / 100));

  const rawQty = (riskBudgetNative * kelly * confScale) / perShareRisk;

  // Cap at 20% of portfolio value in the position to avoid over-allocation
  const maxNotionalNative = (portfolioBase * 0.2) / oneNativeInBase;
  const maxQtyByNotional = Math.floor(maxNotionalNative / entryPrice);

  const qty = Math.min(rawQty, maxQtyByNotional);
  return Math.max(1, Math.floor(qty));
}

function isTradeResult(value: any): value is TradeResult {
  return Boolean(
    value &&
      ["BUY", "SELL", "HOLD", "REDUCE", "EXIT"].includes(value.action) &&
      ["UP", "DOWN", "SIDEWAYS"].includes(value.direction) &&
      typeof value.confidence === "number" &&
      typeof value.currentPrice === "number"
  );
}

function normalizeTradeResult(value: any): TradeResult | null {
  // The quant engine's no-trade verdict is WAIT; the client vocabulary calls
  // it HOLD. Rejecting WAIT here silently discarded every stand-aside ticket
  // from the engine and let the local synthesis own the result.
  if (value && value.action === "WAIT") value = { ...value, action: "HOLD" };
  if (!isTradeResult(value)) return null;

  const normalizeNumber = (num: unknown, fallback = 0) => {
    const parsed = Number(num);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    action: value.action,
    confidence: Math.max(0, Math.min(100, Math.round(normalizeNumber(value.confidence, 0)))),
    entryLow: normalizeNumber(value.entryLow),
    entryHigh: normalizeNumber(value.entryHigh),
    targetPrice: normalizeNumber(value.targetPrice),
    stopLoss: normalizeNumber(value.stopLoss),
    timeframe: cleanAIText(value.timeframe || "1-3 weeks"),
    direction: value.direction,
    directionReason: cleanAIText(value.directionReason || "Signal alignment is mixed").slice(0, 60),
    positiveNews: cleanAIText(value.positiveNews || "No significant positive catalyst").slice(0, 120),
    negativeNews: cleanAIText(value.negativeNews || "No significant downside catalyst").slice(0, 120),
    protection: cleanAIText(value.protection || "Exit if price breaks the stop level.").slice(0, 120),
    currentPrice: normalizeNumber(value.currentPrice),
    currency: typeof value.currency === "string" && value.currency.trim() ? value.currency.trim().toUpperCase() : undefined,
    quantScore: value.quantScore !== undefined ? Math.max(0, Math.min(100, Math.round(normalizeNumber(value.quantScore)))) : undefined,
    volatilityRegime: ["LOW", "NORMAL", "HIGH"].includes(value.volatilityRegime) ? value.volatilityRegime : undefined,
    riskRewardRatio: value.riskRewardRatio !== undefined ? Math.abs(normalizeNumber(value.riskRewardRatio)) : undefined,
    providersUsed: value.providersUsed !== undefined ? Math.max(0, Math.round(normalizeNumber(value.providersUsed))) : undefined,
    consensus: ["UNANIMOUS", "MAJORITY", "SPLIT"].includes(value.consensus) ? value.consensus : undefined,
    fallback: Boolean(value.fallback),
    riskMetrics: value.riskMetrics || undefined,
    clankSignals: Array.isArray(value.clankSignals) ? value.clankSignals : undefined,
    newsHeadlines: Array.isArray(value.newsHeadlines) ? value.newsHeadlines : undefined,
    waitReasons: Array.isArray(value.waitReasons) ? value.waitReasons.map((s: any) => String(s)) : undefined,
    evidenceCount: typeof value.evidenceCount === "number" ? value.evidenceCount : undefined,
    expectedReturnPct: value.expectedReturnPct ?? undefined,
    expectedDownsidePct: value.expectedDownsidePct ?? undefined,
    primaryDrivers: Array.isArray(value.primaryDrivers) ? value.primaryDrivers : undefined,
    primaryRisks: Array.isArray(value.primaryRisks) ? value.primaryRisks : undefined,
    probabilityDistribution: Array.isArray(value.probabilityDistribution) ? value.probabilityDistribution : undefined,
    thesisBreakers: Array.isArray(value.thesisBreakers) ? value.thesisBreakers : undefined,
    engineSources: Array.isArray(value.engineSources) ? value.engineSources.map((s: any) => String(s)) : undefined,
    bullSignals: Array.isArray(value.bullSignals) ? value.bullSignals.map((s: any) => String(s)) : undefined,
    bearSignals: Array.isArray(value.bearSignals) ? value.bearSignals.map((s: any) => String(s)) : undefined,
    intelligence: value.intelligence && typeof value.intelligence === "object" ? value.intelligence : undefined,
    ensemble: value.ensemble && typeof value.ensemble === "object" ? value.ensemble : undefined,
    quantEdge: value.quantEdge && typeof value.quantEdge === "object" && value.quantEdge.expectedProfit ? value.quantEdge : undefined,
  };
}

interface DirectProfitModeProps {
  /**
   * Called when a trade is added so the host (dashboard) can mirror the position
   * into the main cloud portfolio with an auto-optimized quantity.
   */
  onAddToMainPortfolio?: (
    ticker: string,
    buyPrice: number,
    quantity: number,
    /**
     * Direct Profit trade plan — passed through to the dashboard so deeper
     * analysis (analyze-stock) can stay consistent with the entry decision
     * instead of contradicting it.
     */
    directProfitContext: {
      action: "BUY" | "SELL" | "HOLD" | "REDUCE" | "EXIT";
      confidence: number;
      entryLow: number;
      entryHigh: number;
      targetPrice: number;
      stopLoss: number;
      currency?: string;
      currentPrice: number;
    },
  ) => void;
  /** Total portfolio value in base currency, used to size the position via fixed-fractional risk. */
  portfolioValueBase?: number;
}

const DirectProfitMode = ({ onAddToMainPortfolio, portfolioValueBase }: DirectProfitModeProps = {}) => {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTicker, setActiveTicker] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(loadPortfolio);
  const [added, setAdded] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveCurrency, setLiveCurrency] = useState<string | null>(null);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<number>(0);
  const recognitionRef = useRef<any>(null);
  const portfolioTickersRef = useRef<string[]>([]);
  const { indiaMode, baseCurrency, convertToBase } = useFX();
  const { prices: historicalPrices, fetchHistorical } = useHistoricalPrices();
  const { logTrade } = useTradeLogger();
  const { refresh: refreshWorkstation, ...workstationData } = useWorkstationData(activeTicker);
  const { desirableZones } = useOutcomeGradient();
  /** Quant-engine ticket from the direct-profit edge function; null when it failed and the evidence fallback owns the result. */
  const [edgeResult, setEdgeResult] = useState<TradeResult | null>(null);
  /** Why the quant engine did not land — shown on the fallback surface so the swap is never silent. */
  const [edgeError, setEdgeError] = useState<string | null>(null);
  const edgePendingRef = useRef(false);

  useEffect(() => {
    if (activeTicker && !loading) {
      fetchHistorical([activeTicker], "3mo");
    }
  }, [activeTicker, loading, fetchHistorical]);

  useEffect(() => { savePortfolio(portfolio); }, [portfolio]);

  useEffect(() => {
    portfolioTickersRef.current = portfolio.map((p) => p.ticker);
  }, [portfolio]);

  // Live price refresh for the currently-analyzed stock
  useEffect(() => {
    if (!activeTicker || loading) return;
    const refreshActivePrice = async () => {
      try {
        const { data } = await governedInvoke<{ prices: Record<string, { price: number; currency: string }> }>(
          "price-feed",
          { body: { tickers: [activeTicker] }, tier: "realtime", force: false }
        );
        const p = data?.prices?.[activeTicker] || data?.prices?.[activeTicker.toUpperCase()];
        if (p && p.price > 0) {
          setLivePrice(p.price);
          setLiveCurrency(p.currency || null);
          setLastPriceUpdate(Date.now());
        }
      } catch {}
    };
    refreshActivePrice();
    const interval = setInterval(refreshActivePrice, 10_000);
    return () => clearInterval(interval);
  }, [activeTicker, loading]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  // Live price refresh for portfolio items every 15 seconds
  useEffect(() => {
    if (portfolio.length === 0) return;
    const refreshPrices = async () => {
      const tickers = portfolio.map((p) => p.ticker);
      try {
        const { data } = await governedInvoke<{ prices: Record<string, { price: number; currency: string }> }>(
          "price-feed",
          { body: { tickers }, tier: "realtime", force: true }
        );
        if (data?.prices) {
          setPortfolio((prev) => {
            let changed = false;
            const updated = prev.map((item) => {
              const priceData = data.prices[item.ticker] || data.prices[item.ticker.toUpperCase()];
              if (priceData && priceData.price > 0 && (priceData.price !== item.currentPrice || (priceData.currency && priceData.currency !== item.currency))) {
                changed = true;
                return { ...item, currentPrice: priceData.price, currency: priceData.currency || item.currency };
              }
              return item;
            });
            return changed ? updated : prev;
          });
        }
      } catch (err) { console.warn("Portfolio price refresh failed:", err); }
    };
    refreshPrices();
    const interval = setInterval(refreshPrices, 15_000);
    return () => clearInterval(interval);
  }, [portfolio.length]);

  const analyze = useCallback(async (inputTicker: string) => {
    const trimmed = inputTicker.trim();
    const normalizedTicker = trimmed.toUpperCase();
    if (!normalizedTicker) return;

    setLoading(true);
    setErrorMessage(null);
    setResult(null);
    setEdgeResult(null);
    setEdgeError(null);
    setAdded(false);
    setActiveTicker(normalizedTicker);
    setLivePrice(null);
    setLiveCurrency(null);
    setLastPriceUpdate(0);

    // Two engines race for the same ticket. The quant edge function is the
    // primary — it runs the full ensemble (cointegration, Merton proxy,
    // walk-forward evidence, calibrated consensus, cost-adjusted expected
    // value). The local evidence synthesis hydrates in parallel and owns
    // the result if the function is unreachable, so the surface can never
    // show a transport error.
    refreshWorkstation();
    edgePendingRef.current = true;

    const attemptEngine = async (): Promise<TradeResult> => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`timeout after ${ANALYSIS_TIMEOUT_MS / 1000}s`)), ANALYSIS_TIMEOUT_MS);
      });
      const response = await Promise.race([
        governedInvoke<TradeResult>("direct-profit", {
          body: {
            ticker: normalizedTicker,
            indiaMode,
            desirableHint: (() => {
              const norm = normalizedTicker.replace(/\.(NS|BO)$/i, "").toUpperCase();
              const matches = desirableZones.filter(z =>
                z.assets.some(a => a.replace(/\.(NS|BO)$/i, "").toUpperCase() === norm)
              );
              if (matches.length === 0) return null;
              const avgPnl = matches.reduce((s, z) => s + z.avgPnlPct, 0) / matches.length;
              return {
                listed: true,
                avgPnlPct: Number(avgPnl.toFixed(2)),
                zoneCount: matches.length,
                regimes: matches.map(z => z.regime).slice(0, 3),
              };
            })(),
          },
          tier: "ai",
          force: true,
        }),
        timeoutPromise,
      ]);
      const { data, error } = response as Awaited<ReturnType<typeof governedInvoke<TradeResult>>>;
      if (error) throw error;
      const normalized = normalizeTradeResult(data);
      if (!normalized) throw new Error("engine returned an incomplete trade plan");
      return normalized;
    };

    try {
      setEdgeResult(await attemptEngine());
    } catch (firstErr) {
      // One retry — cold starts and transient 5xx are the common failure
      // mode, and the evidence view renders in the meantime so a late
      // quant ticket simply upgrades the surface in place.
      try {
        setEdgeResult(await attemptEngine());
      } catch (err: any) {
        console.warn("direct-profit edge engine unavailable, using evidence synthesis:", firstErr, err);
        const reason = err?.message || err?.error?.message || String(err);
        setEdgeError(String(reason).slice(0, 140));
      }
    } finally {
      edgePendingRef.current = false;
    }
  }, [refreshWorkstation, indiaMode, desirableZones]);


  useEffect(() => {
    if (!activeTicker || workstationData.bootstrapping) return;
    // Build (or rebuild) the evidence view whenever we're waiting for a
    // result or the quant edge ticket has arrived and needs its evidence
    // panels merged in.
    if (!loading && !edgeResult) return;
    try {
      const graph = buildEvidenceGraph({
        ticker: activeTicker,
        analysis: workstationData.analysis,
        bars: workstationData.bars,
        dossier: workstationData.dossier,
        quote: workstationData.quote,
        financials: workstationData.financials,
        fetchedAt: {
          analysis: workstationData.status.analysis.fetchedAt,
          bars: workstationData.status.bars.fetchedAt,
          dossier: workstationData.status.dossier.fetchedAt,
          quote: workstationData.status.quote.fetchedAt,
          financials: workstationData.status.financials.fetchedAt,
        },
      });
      // Empty graph: the evidence sources are still hydrating or settled
      // unavailable. The edge ticket stands alone if it landed; otherwise
      // report only once everything has actually settled.
      if (graph.order.length === 0) {
        const settled = Object.values(workstationData.status).every((s) => s.state !== "loading");
        if (edgeResult) {
          setResult(edgeResult);
          setLivePrice(edgeResult.currentPrice > 0 ? edgeResult.currentPrice : null);
          setLiveCurrency(edgeResult.currency || null);
          setLastPriceUpdate(Date.now());
          setLoading(false);
        } else if (settled && !edgePendingRef.current) {
          setErrorMessage("Could not assemble evidence for this asset right now. Retry in a moment.");
          setLoading(false);
        }
        return;
      }

      const price = workstationData.quote?.price ?? workstationData.analysis?.currentPrice ?? graph.metrics.support?.value ?? 0;
      const synthesis = synthesize(graph, workstationData.analysis, price || null);
      const action = synthesis.action === "ACCUMULATE" ? "BUY" : synthesis.action === "AVOID" ? "EXIT" : synthesis.action;
      const bull = synthesis.cases.find((c) => c.id === "bull");
      const bear = synthesis.cases.find((c) => c.id === "bear");
      const support = graph.metrics.support?.value ?? (price ? price * 0.97 : 0);
      const resistance = graph.metrics.resistance?.value ?? bull?.target ?? (price ? price * 1.08 : 0);
      const entryLow = graph.metrics.support?.value ?? (price ? price * 0.99 : 0);
      const entryHigh = price || entryLow;
      const drivers = synthesis.contributions
        .filter((c) => c.scored > 0)
        .sort((a, b) => b.scored - a.scored)
        .slice(0, 5)
        .map((c) => ({ id: c.id, label: graph.metrics[c.id].label, reason: graph.metrics[c.id].assessment.reason, weight: c.scored }));
      const risks = synthesis.contributions
        .filter((c) => c.scored < 0)
        .sort((a, b) => a.scored - b.scored)
        .slice(0, 5)
        .map((c) => ({ id: c.id, label: graph.metrics[c.id].label, reason: graph.metrics[c.id].assessment.reason, weight: c.scored }));
      // Expected return / downside are properties of the terminal
      // distribution, not band edges: probability-weighted return across
      // the log-normal cases, and closed-form expected shortfall (CVaR 95)
      // from the same model. Band edges made the two numbers mirror each
      // other, which read as invented data.
      const model = logNormalHorizon(graph, synthesis.pillars, price || null);
      const probWeightedReturn = synthesis.cases.some((c) => c.returnPct != null)
        ? synthesis.cases.reduce((s, c) => s + (c.probability / 100) * (c.returnPct ?? 0), 0)
        : null;
      const expectedShortfall = model ? lognormalEs(model.m, model.sigma, 0.05) * 100 : null;

      const evidenceView: TradeResult = {
        action,
        confidence: synthesis.confidence,
        entryLow: Number(entryLow.toFixed(2)),
        entryHigh: Number(entryHigh.toFixed(2)),
        targetPrice: Number((bull?.target ?? resistance).toFixed(2)),
        stopLoss: Number((support * 0.98).toFixed(2)),
        timeframe: "1-3 months",
        direction: action === "BUY" ? "UP" : action === "EXIT" || action === "REDUCE" ? "DOWN" : "SIDEWAYS",
        directionReason: synthesis.headline,
        positiveNews: drivers[0]?.reason || "No positive evidence node dominates.",
        negativeNews: risks[0]?.reason || "No primary risk node dominates.",
        protection: synthesis.breakers.find((b) => b.state !== "intact")?.detail || `Invalidate below ${Number((support * 0.98).toFixed(2))}.`,
        currentPrice: price || 0,
        currency: workstationData.quote?.currency ?? workstationData.analysis?.currency,
        quantScore: Math.round((synthesis.confidence + Math.max(0, synthesis.ledger.supporting - synthesis.ledger.opposing)) / 2),
        riskRewardRatio: price && support ? Math.abs(((bull?.target ?? resistance) - price) / Math.max(0.01, price - support)) : undefined,
        providersUsed: graph.coverage.sources.length,
        consensus: synthesis.ledger.opposing === 0 ? "UNANIMOUS" : synthesis.ledger.supporting > synthesis.ledger.opposing ? "MAJORITY" : "SPLIT",
        evidenceCount: graph.order.length,
        expectedReturnPct: probWeightedReturn != null ? Number(probWeightedReturn.toFixed(1)) : null,
        expectedDownsidePct: expectedShortfall != null ? Number(expectedShortfall.toFixed(1)) : (bear?.returnPct ?? null),
        primaryDrivers: drivers,
        primaryRisks: risks,
        probabilityDistribution: synthesis.cases,
        thesisBreakers: synthesis.breakers,
        engineSources: graph.coverage.sources,
      };

      // The quant edge ticket owns the trade plan AND the headline
      // distribution numbers when it landed: its expected value is cost-
      // and fat-tail-adjusted against the calibrated win probability, and
      // its CVaR comes from realised returns. The synthesis figures fill
      // in only when the engine did not produce the number. The evidence
      // view supplies the panels the function does not compute (drivers,
      // risks, cases, breakers).
      const engineEV = edgeResult?.quantEdge?.expectedProfit;
      const engineEntryMid = edgeResult ? (edgeResult.entryLow + edgeResult.entryHigh) / 2 || edgeResult.currentPrice : 0;
      const engineCvarPerShare = edgeResult?.quantEdge?.hedge?.cvar95PerShare;
      const engineCvarPct = engineCvarPerShare != null && engineEntryMid > 0
        ? Number((-Math.abs(engineCvarPerShare / engineEntryMid) * 100).toFixed(1))
        : null;
      const merged: TradeResult = edgeResult
        ? {
            ...evidenceView,
            ...edgeResult,
            expectedReturnPct: engineEV ? engineEV.pct : evidenceView.expectedReturnPct,
            expectedDownsidePct: engineCvarPct ?? evidenceView.expectedDownsidePct,
            primaryDrivers: evidenceView.primaryDrivers,
            primaryRisks: evidenceView.primaryRisks,
            probabilityDistribution: evidenceView.probabilityDistribution,
            thesisBreakers: evidenceView.thesisBreakers,
            evidenceCount: evidenceView.evidenceCount,
            engineSources: evidenceView.engineSources,
          }
        : evidenceView;

      setResult(merged);
      setLivePrice(merged.currentPrice > 0 ? merged.currentPrice : null);
      setLiveCurrency(merged.currency || null);
      setLastPriceUpdate(Date.now());
      setErrorMessage(null);
      setLoading(false);
    } catch (err: any) {
      console.error("Direct profit evidence synthesis error:", err);
      if (!edgeResult) setErrorMessage("Could not synthesize the evidence graph for this asset.");
      setLoading(false);
    }
    // NOTE: no `finally` — the empty-graph early return must keep `loading`
    // true so this effect re-fires as the workstation sources hydrate.
  }, [activeTicker, loading, workstationData, edgeResult]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); analyze(ticker); };

  const retryAnalysis = () => {
    const retryTicker = ticker.trim() || activeTicker;
    if (retryTicker) analyze(retryTicker);
  };

  const addToPortfolio = () => {
    if (!result || !activeTicker || result.action !== "BUY") return;
    const exists = portfolio.some((p) => p.ticker === activeTicker);
    const entryPrice = (result.entryLow + result.entryHigh) / 2;
    const itemCurrency = resolveAssetCurrency(activeTicker, liveCurrency || result.currency, indiaMode ? "INR" : "USD");

    if (!exists) {
      const item: PortfolioItem = {
        ticker: activeTicker,
        action: "BUY",
        entryPrice,
        targetPrice: result.targetPrice,
        stopLoss: result.stopLoss,
        currentPrice: livePrice ?? result.currentPrice,
        currency: itemCurrency,
        addedAt: Date.now(),
        source: result.consensus
          ? `${result.consensus} · ${result.providersUsed ?? "?"} engines · ${result.confidence}%`
          : `AI · ${result.confidence}%`,
        catalyst: (result.action === "BUY" ? result.positiveNews : result.negativeNews)?.slice(0, 140) || result.directionReason,
        lesson: "",
      };
      setPortfolio((prev) => [item, ...prev]);
      logTrade({
        ticker: activeTicker,
        action: "BUY",
        price: entryPrice,
        qty: 0,
        pnl: 0,
        source: item.source || "",
        catalyst: item.catalyst || "",
      });
    }
    setAdded(true);

    // ── Auto-optimized mirror into main dashboard portfolio ──
    if (onAddToMainPortfolio) {
      const optimizedQty = computeOptimalQuantity({
        entryPrice,
        stopLoss: result.stopLoss,
        confidence: result.confidence,
        kellyFraction: result.riskMetrics?.kellyFraction,
        currency: itemCurrency,
        portfolioValueBase,
        convertToBase,
        baseCurrency,
      });
      if (optimizedQty >= 1) {
        onAddToMainPortfolio(activeTicker, entryPrice, optimizedQty, {
          action: "BUY",
          confidence: result.confidence,
          entryLow: result.entryLow,
          entryHigh: result.entryHigh,
          targetPrice: result.targetPrice,
          stopLoss: result.stopLoss,
          currency: itemCurrency,
          currentPrice: livePrice ?? result.currentPrice,
        });
      }
    }
  };

  const removeFromPortfolio = (symbol: string) => {
    setPortfolio((prev) => prev.filter((p) => p.ticker !== symbol));
  };

  const updateLog = (symbol: string, patch: Partial<PortfolioItem>) => {
    setPortfolio((prev) => prev.map((p) => (p.ticker === symbol ? { ...p, ...patch } : p)));
  };

  const exportLog = () => {
    if (portfolio.length === 0) return;
    const rows = [
      ["time_iso", "ticker", "action", "entry", "current", "pnl_pct", "currency", "source", "catalyst", "lesson"].join(","),
      ...portfolio.map((p) => {
        const pnl = p.action === "BUY" ? p.currentPrice - p.entryPrice : p.entryPrice - p.currentPrice;
        const pct = p.entryPrice > 0 ? (pnl / p.entryPrice) * 100 : 0;
        const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        return [
          new Date(p.addedAt).toISOString(),
          p.ticker,
          p.action,
          p.entryPrice,
          p.currentPrice,
          pct.toFixed(2),
          p.currency,
          esc(p.source || ""),
          esc(p.catalyst || ""),
          esc(p.lesson || ""),
        ].join(",");
      }),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trade-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setErrorMessage("Voice input is not supported in this browser."); return; }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = indiaMode ? "hi-IN" : "en-US";
    recognition.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) { setErrorMessage("Could not hear the symbol clearly. Please try again."); setListening(false); return; }
      setTicker(transcript);
      setListening(false);
      analyze(transcript);
    };
    recognition.onerror = () => { setListening(false); setErrorMessage("Voice input failed. Please type the asset instead."); };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const speakResult = () => {
    if (!result || speaking) return;
    const synth = window.speechSynthesis;
    if (!synth) { setErrorMessage("Read aloud is not supported in this browser."); return; }
    synth.cancel();
    const speechCurrency = resolveAssetCurrency(activeTicker, liveCurrency || result.currency, indiaMode ? "INR" : "USD");
    const cSym = getCurrencySymbol(speechCurrency);
    let text = "";
    if (indiaMode) {
      if (result.action === "BUY") text = `खरीदें, ${cSym}${result.entryLow} से ${cSym}${result.entryHigh} के बीच। लक्ष्य ${cSym}${result.targetPrice}। ${cSym}${result.stopLoss} से नीचे जाएं तो बाहर निकलें। समय सीमा: ${result.timeframe}।`;
      else if (result.action === "REDUCE" || result.action === "EXIT") text = `बेचें, ${cSym}${result.entryLow} से ${cSym}${result.entryHigh} के बीच। लक्ष्य ${cSym}${result.targetPrice}। स्टॉप लॉस ${cSym}${result.stopLoss}। समय सीमा: ${result.timeframe}।`;
      else text = `${result.action}. विश्वास स्तर ${result.confidence} प्रतिशत है। ${result.directionReason}।`;
    } else {
      if (result.action === "BUY") text = `Buy between ${cSym}${result.entryLow} and ${cSym}${result.entryHigh}. Target ${cSym}${result.targetPrice}. Exit below ${cSym}${result.stopLoss}. Timeframe: ${result.timeframe}.`;
      else if (result.action === "REDUCE" || result.action === "EXIT") text = `Sell between ${cSym}${result.entryLow} and ${cSym}${result.entryHigh}. Target ${cSym}${result.targetPrice}. Stop at ${cSym}${result.stopLoss}. Timeframe: ${result.timeframe}.`;
      else text = `${result.action}. Confidence is ${result.confidence} percent. ${result.directionReason}.`;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = indiaMode ? "hi-IN" : "en-US";
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => { setSpeaking(false); setErrorMessage("Read aloud failed. Please try again."); };
    setSpeaking(true);
    synth.speak(utterance);
  };

  const activeCurrency = resolveAssetCurrency(activeTicker, liveCurrency || result?.currency, indiaMode ? "INR" : "USD");
  const cs = getCurrencySymbol(activeCurrency);
  const baseSym = getCurrencySymbol(baseCurrency);
  const actionColor = result?.action === "BUY" ? "text-gain" : result?.action === "REDUCE" || result?.action === "EXIT" ? "text-loss" : "text-muted-foreground";
  const actionBg = result?.action === "BUY" ? "bg-gain/10 border-gain/30" : result?.action === "REDUCE" || result?.action === "EXIT" ? "bg-loss/10 border-loss/30" : "bg-muted/20 border-border";
  const dirIcon = result?.direction === "UP"
    ? <ArrowUp className="h-5 w-5 text-gain" />
    : result?.direction === "DOWN"
      ? <ArrowDown className="h-5 w-5 text-loss" />
      : <Minus className="h-5 w-5 text-muted-foreground" />;

  const alreadyInPortfolio = result ? portfolio.some((p) => p.ticker === activeTicker) : false;
  const displayedActivePrice = livePrice ?? result?.currentPrice ?? 0;
  const convertedActivePrice = result && activeCurrency !== baseCurrency
    ? convertToBase(displayedActivePrice, activeCurrency) : null;

  const totalInvestedBase = portfolio.reduce((sum, p) => sum + convertToBase(p.entryPrice, p.currency), 0);
  const totalPnl = portfolio.reduce((sum, p) => {
    const diff = p.action === "BUY" ? p.currentPrice - p.entryPrice : p.entryPrice - p.currentPrice;
    return sum + convertToBase(diff, p.currency);
  }, 0);
  const totalPnlPct = totalInvestedBase > 0 ? (totalPnl / totalInvestedBase) * 100 : 0;

  const rm = result?.riskMetrics;
  const clank = result?.clankSignals?.filter(s => s.active) || [];
  const news = result?.newsHeadlines || [];
  const qe = result?.quantEdge;
  // Provenance flags — the ensemble/quantEdge blocks only ever come from the
  // direct-profit edge function, so their presence means the quant engine
  // owns the verdict; otherwise the local evidence synthesis is standing in.
  const quantOwned = Boolean(result?.ensemble || result?.quantEdge);
  const resultEntryMid = result ? (result.entryLow + result.entryHigh) / 2 || result.currentPrice : 0;
  const returnFromEngine = Boolean(qe?.expectedProfit);
  const downsideFromEngine = qe?.hedge?.cvar95PerShare != null && resultEntryMid > 0;

  return (
    <div className="h-full overflow-auto p-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground tracking-tight">Direct Profit Mode</h1>
          </div>
          <p className="text-xs text-muted-foreground">One input. One decision. Zero confusion.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <SuggestWrapper ticker={ticker} setTicker={setTicker} loading={loading} listening={listening} toggleVoice={toggleVoice} />
          <Button type="submit" disabled={!ticker.trim() || loading} className="h-12 px-6 font-semibold">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Analyzing
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Analyze
              </span>
            )}
          </Button>
        </form>

        {/* Validated opportunity queue — sourced from the shared Opportunity
            Engine, so the #1 name here is the #1 name on Discover. */}
        {!result && !loading && (
          <OpportunityQueue onSelect={(symbol) => { setTicker(symbol); analyze(symbol); }} />
        )}

        {errorMessage && !loading && (
          <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Analysis failed</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{errorMessage}</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={retryAnalysis} disabled={!ticker.trim() && !activeTicker}>
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {loading && (
          <div className="glass-panel rounded-xl p-6 space-y-4 animate-pulse">
            <div className="h-16 bg-muted/30 rounded-lg" />
            <div className="h-24 bg-muted/30 rounded-lg" />
            <div className="h-12 bg-muted/30 rounded-lg" />
            <div className="h-20 bg-muted/30 rounded-lg" />
          </div>
        )}

        {result && !loading && (
          <div className="glass-panel rounded-xl overflow-hidden animate-fade-in">
            {/* ── BIG ACTION HEADER ── */}
            <div className={`border-b ${actionBg} p-6 text-center`}>
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{activeTicker}</div>
              <div className={`text-6xl font-black tracking-tight leading-none ${actionColor}`}>{result.action}</div>
              <div className="mt-3 text-base text-muted-foreground">
                {result.confidence >= 75 ? "High" : result.confidence >= 50 ? "Medium" : "Low"} Confidence{" "}
                <span className="font-bold text-foreground text-lg">{result.confidence}%</span>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-gain animate-pulse" />
                <span className="font-mono font-bold text-foreground text-lg">
                  {cs}{displayedActivePrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                {convertedActivePrice !== null && (
                  <span className="text-[11px] text-muted-foreground">≈ {formatCurrency(convertedActivePrice, baseCurrency)}</span>
                )}
              </div>
              {lastPriceUpdate > 0 && (
                <div className="mt-1 text-[10px] text-muted-foreground/60">updated {Math.round((Date.now() - lastPriceUpdate) / 1000)}s ago</div>
              )}
              {result.fallback && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Running on resilient rules fallback while live AI consensus is unavailable.
                </div>
              )}
              {result.ensemble && (
                <div className="mt-3 mx-auto max-w-xs">
                  <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                    <span>Calibrated win-prob</span>
                    <span className="text-foreground font-semibold">{Math.round(result.ensemble.calibratedProb * 100)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted/30 rounded overflow-hidden">
                    <div
                      className={`h-full transition-all ${result.action === "BUY" ? "bg-gain" : result.action === "REDUCE" || result.action === "EXIT" ? "bg-loss" : "bg-muted-foreground/60"}`}
                      style={{ width: `${Math.round(result.ensemble.calibratedProb * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/80">
                    <span>{result.ensemble.engineCount} engines · {result.ensemble.consensusLabel.toLowerCase()}</span>
                    <span>R≈{result.ensemble.expectedR.toFixed(2)}</span>
                  </div>
                  {result.ensemble.bucketDirs && (
                    <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] font-mono">
                      {(["A","B","C"] as const).map((b) => {
                        const d = result.ensemble!.bucketDirs![b];
                        const label = b === "A" ? "PRICE" : b === "B" ? "INTEL" : "REGIME";
                        const cls = d === 1 ? "bg-gain/15 text-gain border-gain/30"
                          : d === -1 ? "bg-loss/15 text-loss border-loss/30"
                          : "bg-muted/20 text-muted-foreground/70 border-border";
                        const sym = d === 1 ? "↑" : d === -1 ? "↓" : "—";
                        return (
                          <div key={b} className={`border rounded px-1.5 py-1 flex items-center justify-between ${cls}`}>
                            <span className="opacity-80">{label}</span>
                            <span className="font-bold">{sym}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {typeof result.ensemble.costHaircut === "number" && result.ensemble.costHaircut > 0.005 && (
                    <div className="mt-1.5 text-[10px] text-warning/90 font-mono">
                      ⚠ Round-trip cost ≈ {(result.ensemble.costHaircut * 100).toFixed(2)}% — eats into edge
                    </div>
                  )}
                  {typeof result.ensemble.tailMultiplier === "number" && result.ensemble.tailMultiplier > 1.2 && (
                    <div className="mt-1 text-[10px] text-warning/90 font-mono">
                      ⚠ Left tail {result.ensemble.tailMultiplier.toFixed(2)}× normal — Cornish-Fisher adjusted downside
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── WAIT EXPLANATION ── */}
            {result.action === "HOLD" && (result.waitReasons?.length || 0) > 0 && (
              <div className="border-b border-border bg-surface-2/30 p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Why HOLD — evidence thresholds not met
                </div>
                <ul className="space-y-1.5">
                  {result.waitReasons!.map((r, i) => (
                    <li key={i} className="text-xs text-foreground flex gap-2">
                      <span className="text-muted-foreground font-mono shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
                {result.ensemble && (
                  <div className="mt-4 pt-3 border-t border-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        Engine consensus
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground">
                        {(result.ensemble.calibratedProb * 100).toFixed(0)}% calibrated · {(result.ensemble.agreement * 100).toFixed(0)}% agree
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-muted/30 rounded overflow-hidden mb-3">
                      <div
                        className="h-full bg-primary/70 transition-all"
                        style={{ width: `${Math.round(result.ensemble.calibratedProb * 100)}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <div className="text-gain font-mono uppercase tracking-wider mb-1">
                          ✓ Agreeing ({result.ensemble.agreeingEngines.length})
                        </div>
                        <ul className="space-y-0.5 text-muted-foreground">
                          {result.ensemble.agreeingEngines.slice(0, 6).map((e) => (
                            <li key={e.id} className="truncate">• {e.label}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-loss font-mono uppercase tracking-wider mb-1">
                          ✗ Disagreeing ({result.ensemble.disagreeingEngines.length})
                        </div>
                        <ul className="space-y-0.5 text-muted-foreground">
                          {result.ensemble.disagreeingEngines.slice(0, 6).map((e) => (
                            <li key={e.id} className="truncate">• {e.label}</li>
                          ))}
                          {result.ensemble.disagreeingEngines.length === 0 && (
                            <li className="italic opacity-60">none — but threshold not met</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                {(result.bullSignals?.length || result.bearSignals?.length) ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <div className="text-gain font-mono uppercase tracking-wider mb-1">Bull ({result.bullSignals?.length || 0})</div>
                      <div className="text-muted-foreground">{result.bullSignals?.join(", ") || "none"}</div>
                    </div>
                    <div>
                      <div className="text-loss font-mono uppercase tracking-wider mb-1">Bear ({result.bearSignals?.length || 0})</div>
                      <div className="text-muted-foreground">{result.bearSignals?.join(", ") || "none"}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}


            {/* ── DECISION SURFACE ── */}
            <div className="border-b border-border p-4 space-y-4 bg-surface-2/20">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Decision surface</div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                      quantOwned ? "text-gain border-gain/30 bg-gain/10" : "text-warning border-warning/40 bg-warning/10"
                    }`}
                    title={
                      quantOwned
                        ? "Verdict computed by the direct-profit quant ensemble (cost-adjusted EV, cointegration, walk-forward, structural credit)."
                        : `Quant engine unreachable${edgeError ? ` — ${edgeError}` : ""}. Verdict synthesized locally from the workstation evidence graph.`
                    }
                  >
                    {quantOwned ? "Quant engine" : "Fallback · evidence synthesis"}
                  </span>
                  {!quantOwned && (
                    <button
                      type="button"
                      onClick={retryAnalysis}
                      className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2/60 transition-colors"
                      title="Re-run the analysis and retry the quant engine"
                    >
                      Retry engine
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-surface-2/40 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Expected Return · prob-weighted</div>
                  <div className={`text-xl font-black font-mono ${(result.expectedReturnPct ?? 0) >= 0 ? "text-gain" : "text-loss"}`}>{result.expectedReturnPct != null ? `${result.expectedReturnPct > 0 ? "+" : ""}${result.expectedReturnPct}%` : "—"}</div>
                  <div className="text-[8.5px] text-muted-foreground/70">
                    {returnFromEngine ? "p·upside − (1−p)·downside·tail − costs · quant engine" : "Σ p·r across bull/base/bear · 21 sessions · local synthesis"}
                  </div>
                </div>
                <div className="rounded-lg bg-surface-2/40 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Expected Shortfall · CVaR 95</div>
                  <div className="text-xl font-black font-mono text-loss">{result.expectedDownsidePct != null ? `${result.expectedDownsidePct}%` : "—"}</div>
                  <div className="text-[8.5px] text-muted-foreground/70">
                    {downsideFromEngine ? "1-day CVaR from realised returns · quant engine" : "mean of the worst 5% of outcomes · 21 sessions · local synthesis"}
                  </div>
                </div>
                <div className="rounded-lg bg-surface-2/40 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Risk</div>
                  <div className="text-base font-bold text-foreground">{rm?.cvar95 ? "High" : result.thesisBreakers?.some((b) => b.state === "tripped") ? "High" : result.thesisBreakers?.some((b) => b.state === "watch") ? "Moderate" : "Controlled"}</div>
                </div>
                <div className="rounded-lg bg-surface-2/40 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Evidence</div>
                  <div className="text-base font-bold text-foreground">{result.evidenceCount ?? 0} nodes</div>
                </div>
              </div>

              {result.probabilityDistribution && (
                <div className="space-y-2">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Probability distribution</div>
                  <div className="grid grid-cols-3 gap-2">
                    {result.probabilityDistribution.map((c) => (
                      <div key={c.id} className="rounded-lg border border-border bg-background/40 p-2 text-center">
                        <div className="text-[10px] uppercase text-muted-foreground">{c.label}</div>
                        <div className="text-lg font-black font-mono text-foreground">{c.probability}%</div>
                        <div className={`text-[10px] font-mono ${(c.returnPct ?? 0) >= 0 ? "text-gain" : "text-loss"}`}>{c.returnPct != null ? `${c.returnPct > 0 ? "+" : ""}${c.returnPct}%` : "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-3">
                <EvidenceList title="Primary Drivers" tone="gain" items={result.primaryDrivers || []} ticker={activeTicker} />
                <EvidenceList title="Primary Risks" tone="loss" items={result.primaryRisks || []} ticker={activeTicker} />
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {quantOwned
                  ? `Verdict from the quant ensemble — ${result.providersUsed ?? 0} engines (${(result.consensus || "consensus").toLowerCase()}): cost-adjusted expected value, cointegration, walk-forward, structural credit. Evidence panels from ${result.evidenceCount ?? 0} nodes across ${result.engineSources?.join(", ") || "the shared evidence graph"}.`
                  : `Quant engine unreachable${edgeError ? ` (${edgeError})` : ""} — verdict synthesized locally from ${result.evidenceCount ?? 0} evidence nodes across ${result.engineSources?.join(", ") || "the shared evidence graph"}. LLM explanation is disabled for verdict generation.`}
              </div>
            </div>

            {/* ── PRICE CHART ── */}
            {historicalPrices[activeTicker]?.closes?.length > 0 && (
              <div className="border-b border-border p-3 bg-surface-2/30">
                <div className="flex items-center justify-between px-1 mb-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">3M Price</span>
                  <span className="text-[10px] font-mono text-muted-foreground">{historicalPrices[activeTicker].closes.length} pts</span>
                </div>
                <div className="h-32 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historicalPrices[activeTicker].closes.map((c, i) => ({ i, price: c }))}>
                      <defs>
                        <linearGradient id="dpChartFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <YAxis hide domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                        labelFormatter={() => ""}
                        formatter={(v: any) => [`${cs}${Number(v).toFixed(2)}`, "Price"]}
                      />
                      <Area type="monotone" dataKey="price" stroke="hsl(var(--primary))" strokeWidth={1.5} fill="url(#dpChartFill)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* ── TRADE PLAN (always visible) ── */}
            <div className="border-b border-border p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground uppercase tracking-wider">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                Trade Plan
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-surface-2/40 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Entry</div>
                  <div className="text-base font-bold font-mono text-foreground mt-0.5">{cs}{result.entryLow.toLocaleString()}–{cs}{result.entryHigh.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-surface-2/40 p-3">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Timeframe</div>
                  <div className="text-base font-bold font-mono text-foreground mt-0.5 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{result.timeframe}</div>
                </div>
                <div className="rounded-lg bg-gain/5 border border-gain/20 p-3">
                  <div className="text-[10px] uppercase text-gain/80 tracking-wider">Target</div>
                  <div className="text-base font-bold font-mono text-gain mt-0.5">{cs}{result.targetPrice.toLocaleString()}</div>
                </div>
                <div className="rounded-lg bg-loss/5 border border-loss/20 p-3">
                  <div className="text-[10px] uppercase text-loss/80 tracking-wider">Stop Loss</div>
                  <div className="text-base font-bold font-mono text-loss mt-0.5">{cs}{result.stopLoss.toLocaleString()}</div>
                </div>
              </div>

              {/* ── EXPECTED PROFIT (probability-weighted, fat-tail adjusted) ── */}
              {qe && result.action === "BUY" && (
                <div className={`rounded-lg p-3 border ${qe.expectedProfit.perShare >= 0 ? "bg-gain/5 border-gain/25" : "bg-loss/5 border-loss/25"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Expected Profit / share</span>
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground">{qe.expectedProfit.winProb}% win-prob · R≈{qe.expectedProfit.expectedR.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className={`text-2xl font-black font-mono ${qe.expectedProfit.perShare >= 0 ? "text-gain" : "text-loss"}`}>
                      {qe.expectedProfit.perShare >= 0 ? "+" : "−"}{cs}{Math.abs(qe.expectedProfit.perShare).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                    <span className={`text-xs font-mono ${qe.expectedProfit.pct >= 0 ? "text-gain" : "text-loss"}`}>
                      ({qe.expectedProfit.pct >= 0 ? "+" : ""}{qe.expectedProfit.pct}%)
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
                    <span className="text-gain/80">▲ {cs}{qe.expectedProfit.upsidePerShare.toLocaleString()}</span>
                    <span className="text-loss/80">▼ {cs}{qe.expectedProfit.downsidePerShare.toLocaleString()}</span>
                    {qe.expectedProfit.costPerShare > 0 && <span>cost {cs}{qe.expectedProfit.costPerShare.toLocaleString()}</span>}
                  </div>
                </div>
              )}
            </div>

            {/* ── COLLAPSIBLE: more details ── */}
            <Collapsible>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-4 text-sm font-semibold text-foreground hover:bg-surface-2/40 transition-colors group border-b border-border">
                <span className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  More details
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                {/* Direction */}
                <div className="border-b border-border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {dirIcon}
                      <span className="text-base font-bold text-foreground">{result.direction}</span>
                    </div>
                    <span className="text-xs text-muted-foreground italic text-right">{result.directionReason}</span>
                  </div>
                </div>

                {/* Protection */}
                <div className="border-b border-border p-4">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    <Shield className="h-3.5 w-3.5 text-primary" />
                    Protection
                  </div>
                  <p className="text-sm text-muted-foreground">{result.protection}</p>
                </div>

                {/* News Sentiment */}
                <div className="border-b border-border p-4 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-gain font-mono text-[10px]">+</span><span className="text-foreground">{result.positiveNews}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-loss font-mono text-[10px]">−</span><span className="text-foreground">{result.negativeNews}</span>
                  </div>
                </div>

                {/* Quant Signals */}
                {(result.quantScore !== undefined || result.riskRewardRatio !== undefined) && (
                  <div className="border-b border-border p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground uppercase tracking-wider">
                      <BarChart3 className="h-3.5 w-3.5 text-primary" /> Quant Signals
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      {result.quantScore !== undefined && (
                        <div className="text-center">
                          <div className={`text-lg font-bold ${result.quantScore >= 70 ? "text-gain" : result.quantScore >= 40 ? "text-foreground" : "text-loss"}`}>{result.quantScore}</div>
                          <div className="text-[10px] text-muted-foreground">Quant Score</div>
                        </div>
                      )}
                      {result.riskRewardRatio !== undefined && result.riskRewardRatio > 0 && (
                        <div className="text-center">
                          <div className={`text-lg font-bold ${result.riskRewardRatio >= 2 ? "text-gain" : "text-loss"}`}>{result.riskRewardRatio.toFixed(1)}:1</div>
                          <div className="text-[10px] text-muted-foreground">Risk/Reward</div>
                        </div>
                      )}
                      {result.volatilityRegime && (
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Activity className={`h-3.5 w-3.5 ${result.volatilityRegime === "HIGH" ? "text-loss" : result.volatilityRegime === "LOW" ? "text-gain" : "text-muted-foreground"}`} />
                            <span className="text-sm font-bold text-foreground">{result.volatilityRegime}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground">Volatility</div>
                        </div>
                      )}
                    </div>
                    {result.consensus && result.providersUsed && result.providersUsed > 1 && (
                      <div className="text-center text-[10px] text-muted-foreground mt-1">
                        {result.consensus === "UNANIMOUS" ? "All engines agree" : result.consensus === "MAJORITY" ? "Majority consensus" : "Split signal"} ({result.providersUsed} engines)
                      </div>
                    )}
                  </div>
                )}

                {/* Risk Metrics */}
                {rm && (
                  <div className="border-b border-border p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground uppercase tracking-wider">
                      <Gauge className="h-3.5 w-3.5 text-primary" /> Risk Intelligence
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center"><div className="text-sm font-bold font-mono text-loss">{cs}{rm.var95}</div><div className="text-[9px] text-muted-foreground">VaR 95%</div></div>
                      <div className="text-center"><div className="text-sm font-bold font-mono text-loss">{cs}{rm.cvar95}</div><div className="text-[9px] text-muted-foreground">CVaR 95%</div></div>
                      <div className="text-center"><div className={`text-sm font-bold font-mono ${rm.sharpeRatio >= 0 ? "text-gain" : "text-loss"}`}>{rm.sharpeRatio}</div><div className="text-[9px] text-muted-foreground">Sharpe</div></div>
                      <div className="text-center"><div className={`text-sm font-bold font-mono ${rm.sortinoRatio >= 0 ? "text-gain" : "text-loss"}`}>{rm.sortinoRatio}</div><div className="text-[9px] text-muted-foreground">Sortino</div></div>
                      <div className="text-center"><div className="text-sm font-bold font-mono text-loss">{rm.maxDrawdown}%</div><div className="text-[9px] text-muted-foreground">Max DD</div></div>
                      <div className="text-center"><div className="text-sm font-bold font-mono text-foreground">{rm.betaEstimate}</div><div className="text-[9px] text-muted-foreground">Beta</div></div>
                      <div className="text-center"><div className="text-sm font-bold font-mono text-loss">{cs}{rm.var99}</div><div className="text-[9px] text-muted-foreground">VaR 99%</div></div>
                      <div className="text-center"><div className={`text-sm font-bold font-mono ${rm.kellyFraction > 0 ? "text-gain" : "text-muted-foreground"}`}>{(rm.kellyFraction * 100).toFixed(0)}%</div><div className="text-[9px] text-muted-foreground">Kelly</div></div>
                    </div>
                  </div>
                )}

                {/* Renaissance Quant Edge — mean reversion, walk-forward, structural credit, fat tails */}
                {qe && (
                  <div className="border-b border-border p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground uppercase tracking-wider">
                      <Activity className="h-3.5 w-3.5 text-primary" /> Quant Edge — Renaissance Techniques
                    </div>

                    {/* Mean reversion (statistical arbitrage / cointegration) */}
                    {qe.meanReversion && (
                      <div className="rounded-lg bg-surface-2/40 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-foreground">Mean Reversion · Cointegration vs {qe.meanReversion.benchmark}</span>
                          <SignalBadge signal={qe.meanReversion.signal} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                          <div><div className={`text-sm font-bold font-mono ${Math.abs(qe.meanReversion.residZ) >= 1.5 ? "text-primary" : "text-foreground"}`}>{qe.meanReversion.residZ}</div><div className="text-muted-foreground">Spread Z</div></div>
                          <div><div className="text-sm font-bold font-mono text-foreground">{qe.meanReversion.halfLifeDays ?? "—"}{qe.meanReversion.halfLifeDays ? "d" : ""}</div><div className="text-muted-foreground">Half-life</div></div>
                          <div><div className={`text-sm font-bold font-mono ${qe.meanReversion.cointegrated ? "text-gain" : "text-muted-foreground"}`}>{qe.meanReversion.cointegrated ? "YES" : "NO"}</div><div className="text-muted-foreground">Cointegr.</div></div>
                        </div>
                        <p className="text-[10px] text-muted-foreground italic">{qe.meanReversion.note}</p>
                      </div>
                    )}

                    {/* Walk-forward forward-return edge */}
                    {qe.walkForward && (
                      <div className="rounded-lg bg-surface-2/40 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-foreground">Walk-Forward Edge · T+{qe.walkForward.horizonDays}d ({qe.walkForward.sample} samples)</span>
                          <SignalBadge signal={qe.walkForward.signal} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                          <div><div className={`text-sm font-bold font-mono ${qe.walkForward.hitRate >= 52 ? "text-gain" : qe.walkForward.hitRate <= 48 ? "text-loss" : "text-foreground"}`}>{qe.walkForward.hitRate}%</div><div className="text-muted-foreground">Hit rate</div></div>
                          <div><div className={`text-sm font-bold font-mono ${qe.walkForward.meanFwdPct >= 0 ? "text-gain" : "text-loss"}`}>{qe.walkForward.meanFwdPct}%</div><div className="text-muted-foreground">Mean fwd</div></div>
                          <div><div className={`text-sm font-bold font-mono ${qe.walkForward.fwdSharpe >= 0 ? "text-gain" : "text-loss"}`}>{qe.walkForward.fwdSharpe}</div><div className="text-muted-foreground">Fwd Sharpe</div></div>
                        </div>
                      </div>
                    )}

                    {/* Structural credit (Merton-proxy distance-to-default) */}
                    {qe.structuralCredit && (
                      <div className="rounded-lg bg-surface-2/40 p-3 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-foreground">Structural Credit · Distance-to-Default</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            qe.structuralCredit.severity === "DISTRESS" ? "bg-loss/20 text-loss" :
                            qe.structuralCredit.severity === "STRESS" ? "bg-warning/20 text-warning" : "bg-gain/15 text-gain"
                          }`}>{qe.structuralCredit.severity}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center text-[10px]">
                          <div><div className="text-sm font-bold font-mono text-foreground">{qe.structuralCredit.distanceToDefault}σ</div><div className="text-muted-foreground">Distance</div></div>
                          <div><div className="text-sm font-bold font-mono text-foreground">{qe.structuralCredit.impliedPD}%</div><div className="text-muted-foreground">Implied PD</div></div>
                        </div>
                      </div>
                    )}

                    {/* Fat tails (Cornish-Fisher) */}
                    {qe.fatTails && (
                      <div className="rounded-lg bg-surface-2/40 p-3 space-y-1">
                        <div className="text-[11px] font-semibold text-foreground">Fat-Tail Geometry · Cornish-Fisher</div>
                        <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                          <div><div className={`text-sm font-bold font-mono ${qe.fatTails.skew < 0 ? "text-loss" : "text-foreground"}`}>{qe.fatTails.skew}</div><div className="text-muted-foreground">Skew</div></div>
                          <div><div className={`text-sm font-bold font-mono ${qe.fatTails.excessKurtosis > 1 ? "text-loss" : "text-foreground"}`}>{qe.fatTails.excessKurtosis}</div><div className="text-muted-foreground">Ex. Kurt</div></div>
                          <div><div className={`text-sm font-bold font-mono ${qe.fatTails.tailMultiplier > 1.2 ? "text-loss" : "text-foreground"}`}>{qe.fatTails.tailMultiplier}×</div><div className="text-muted-foreground">Tail mult</div></div>
                        </div>
                        <p className="text-[10px] text-muted-foreground italic">{qe.fatTails.note}</p>
                      </div>
                    )}

                    {/* Risk hedge */}
                    {qe.hedge?.needed && (
                      <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
                          <Shield className="h-3.5 w-3.5 text-primary" /> Risk Hedge
                        </div>
                        <p className="text-[11px] text-foreground">{qe.hedge.instruction}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-muted-foreground pt-0.5">
                          {qe.hedge.riskPerShare !== undefined && <span>Risk/sh {cs}{qe.hedge.riskPerShare.toLocaleString()}</span>}
                          {qe.hedge.var95PerShare !== undefined && <span>VaR95 {cs}{qe.hedge.var95PerShare.toLocaleString()}</span>}
                          {qe.hedge.cvar95PerShare !== undefined && <span>CVaR95 {cs}{qe.hedge.cvar95PerShare.toLocaleString()}</span>}
                          {qe.hedge.kellyFraction !== undefined && <span>Kelly {(qe.hedge.kellyFraction * 100).toFixed(0)}%</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* CLANK */}
                {clank.length > 0 && (
                  <div className="border-b border-border p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground uppercase tracking-wider">
                      <AlertTriangle className="h-3.5 w-3.5 text-loss" /> Structural Constraints
                    </div>
                    <div className="space-y-1.5">
                      {clank.map((s) => (
                        <div key={s.id} className={`rounded-lg px-3 py-2 text-xs border ${
                          s.severity === "CRITICAL" ? "border-loss/40 bg-loss/5" :
                          s.severity === "HIGH" ? "border-loss/25 bg-loss/5" : "border-border bg-muted/10"
                        }`}>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              s.severity === "CRITICAL" ? "bg-loss/20 text-loss" :
                              s.severity === "HIGH" ? "bg-loss/15 text-loss" : "bg-muted/30 text-muted-foreground"
                            }`}>{s.severity}</span>
                            <span className="font-semibold text-foreground">{s.label}</span>
                          </div>
                          <p className="mt-1 text-muted-foreground">{s.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Intelligence Consensus */}
                {result.intelligence?.suggestion && (
                  <div className="border-b border-border p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground uppercase tracking-wider">
                        <Gauge className="h-3.5 w-3.5 text-primary" /> Intelligence Consensus
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        result.intelligence.suggestion === "Add" ? "border-gain text-gain" :
                        result.intelligence.suggestion === "Exit" ? "border-loss text-loss" :
                        "border-border text-muted-foreground"
                      }`}>
                        {result.intelligence.suggestion.toUpperCase()} · {result.intelligence.confidence ?? "—"}%
                      </span>
                    </div>
                    {result.intelligence.verdict && <p className="text-xs text-muted-foreground leading-relaxed">{result.intelligence.verdict}</p>}
                    <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                      <div>Trend: <span className="text-foreground font-mono">{result.intelligence.trend || "—"}</span></div>
                      <div>Regime: <span className="text-foreground font-mono">{result.intelligence.regime || "—"}</span></div>
                      <div>Risk: <span className="text-foreground font-mono">{result.intelligence.riskScore ?? "—"}/100</span></div>
                    </div>
                  </div>
                )}

                {/* News */}
                {news.length > 0 && (
                  <div className="border-b border-border p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground uppercase tracking-wider">
                      <Newspaper className="h-3.5 w-3.5 text-primary" /> Live News
                    </div>
                    <div className="space-y-1">
                      {news.map((headline, i) => (
                        <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                          <span className="text-primary font-mono shrink-0">{i + 1}.</span>
                          <span>{headline}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* Actions */}
            <div className="border-t border-border p-3 flex items-center justify-between">
              {result.action === "BUY" ? (
                <Button
                  size="sm"
                  variant={added || alreadyInPortfolio ? "outline" : "default"}
                  disabled={added || alreadyInPortfolio}
                  onClick={addToPortfolio}
                  className="text-xs h-8 gap-1.5"
                >
                  {added || alreadyInPortfolio ? <>Added</> : <><Plus className="h-3.5 w-3.5" /> Add to Portfolio</>}
                </Button>
              ) : <div />}
              <button
                onClick={speakResult}
                disabled={speaking}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Volume2 className={`h-3.5 w-3.5 ${speaking ? "animate-pulse text-primary" : ""}`} />
                {speaking ? "Speaking..." : "Read aloud"}
              </button>
            </div>
          </div>
        )}

        {/* Advanced Trade Logger */}
        {portfolio.length > 0 && (
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="p-3 border-b border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Briefcase className="h-4 w-4 text-primary shrink-0" />
                <span className="text-sm font-semibold text-foreground">Trade Log</span>
                <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{portfolio.length}</span>
              </div>
              <button
                onClick={exportLog}
                className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border"
                title="Export CSV"
              >
                Export CSV
              </button>
            </div>
            <div className="divide-y divide-border">
              {portfolio.map((item) => {
                const itemCurrency = resolveAssetCurrency(item.ticker, item.currency, indiaMode ? "INR" : "USD");
                const itemSym = getCurrencySymbol(itemCurrency);
                const pnl = item.action === "BUY" ? item.currentPrice - item.entryPrice : item.entryPrice - item.currentPrice;
                const pnlPct = item.entryPrice > 0 ? (pnl / item.entryPrice) * 100 : 0;
                const ts = new Date(item.addedAt);
                const tStr = ts.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

                return (
                  <div key={item.ticker} className="p-3 space-y-2">
                    {/* Row 1: time · ticker · action · pnl */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">{tStr}</span>
                        <span className="text-sm font-bold font-mono text-foreground truncate">{item.ticker}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${item.action === "BUY" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"}`}>
                          {item.action}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <div className={`text-sm font-bold font-mono ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                            {pnl >= 0 ? "+" : ""}{itemSym}{Math.abs(pnl).toFixed(2)}
                          </div>
                          <div className={`text-[10px] font-mono ${pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                            {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                          </div>
                        </div>
                        <button onClick={() => removeFromPortfolio(item.ticker)} className="text-muted-foreground hover:text-loss transition-colors p-1">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: entry → current */}
                    <div className="text-[10px] font-mono text-muted-foreground">
                      Entry {itemSym}{item.entryPrice.toLocaleString()} → Now {itemSym}{item.currentPrice.toLocaleString()}
                      {" · "}Target {itemSym}{item.targetPrice.toLocaleString()}
                      {" · "}Stop {itemSym}{item.stopLoss.toLocaleString()}
                    </div>

                    {/* Source */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Source</label>
                      <input
                        value={item.source || ""}
                        onChange={(e) => updateLog(item.ticker, { source: e.target.value })}
                        placeholder="e.g. AI consensus · 4 engines"
                        className="w-full bg-surface-2/40 border border-border rounded px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
                      />
                    </div>

                    {/* Catalyst */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Catalyst</label>
                      <input
                        value={item.catalyst || ""}
                        onChange={(e) => updateLog(item.ticker, { catalyst: e.target.value })}
                        placeholder="What triggered this trade?"
                        className="w-full bg-surface-2/40 border border-border rounded px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
                      />
                    </div>

                    {/* Lesson */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">Lesson (one-liner)</label>
                      <input
                        value={item.lesson || ""}
                        onChange={(e) => updateLog(item.ticker, { lesson: e.target.value })}
                        placeholder="What did this trade teach you?"
                        maxLength={140}
                        className="w-full bg-surface-2/40 border border-border rounded px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-3 py-2 border-t border-border flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground uppercase tracking-wider">Total</span>
              <div className="flex items-center gap-2">
                <span className={`font-bold ${totalPnl >= 0 ? "text-gain" : "text-loss"}`}>
                  {totalPnl >= 0 ? "+" : ""}{baseSym}{Math.abs(totalPnl).toFixed(2)}
                </span>
                <span className={`${totalPnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                  ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectProfitMode;

// Small directional badge for quant-edge engine signals.
const EvidenceList = ({ title, tone, items, ticker }: { title: string; tone: "gain" | "loss"; items: { id: string; label: string; reason: string; weight: number }[]; ticker: string }) => {
  const color = tone === "gain" ? "text-gain" : "text-loss";
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className={`text-[10px] font-mono uppercase tracking-widest mb-2 ${color}`}>{title}</div>
      <div className="space-y-1.5">
        {items.length === 0 ? <div className="text-xs text-muted-foreground">No dominant node.</div> : items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => window.open(`/company/${encodeURIComponent(ticker)}?evidence=${encodeURIComponent(item.id)}`, "_blank")}
            className="w-full text-left rounded-md px-2 py-1.5 hover:bg-surface-2/60 transition-colors"
            title="Open this evidence in the Workstation Inspector"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">{item.label}</span>
              <span className={`text-[10px] font-mono ${color}`}>{item.weight > 0 ? "+" : ""}{item.weight.toFixed(2)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground line-clamp-2">{item.reason}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

const SignalBadge = ({ signal }: { signal: "BUY" | "SELL" | "NEUTRAL" }) => (
  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded font-mono ${
    signal === "BUY" ? "bg-gain/15 text-gain" :
    signal === "SELL" ? "bg-loss/15 text-loss" : "bg-muted/30 text-muted-foreground"
  }`}>
    {signal === "BUY" ? "↑ BULL" : signal === "SELL" ? "↓ BEAR" : "— FLAT"}
  </span>
);

// Ticker input with auto-suggest + voice mic button.
interface SuggestWrapperProps {
  ticker: string;
  setTicker: (v: string) => void;
  loading: boolean;
  listening: boolean;
  toggleVoice: () => void;
}

const SuggestWrapper = ({ ticker, setTicker, loading, listening, toggleVoice }: SuggestWrapperProps) => {
  const { inputProps, dropdown, wrapRef } = useSymbolSuggest(ticker, setTicker, { limit: 6 });
  return (
    <div ref={wrapRef} className="relative flex-1">
      <Input
        {...inputProps}
        placeholder="Enter stock name or speak"
        className="bg-surface-2 border-border h-12 text-base font-mono pr-10 placeholder:text-muted-foreground/40"
        disabled={loading}
      />
      <button
        type="button"
        onClick={toggleVoice}
        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-sm transition-colors ${
          listening ? "text-loss animate-pulse" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
      {dropdown}
    </div>
  );
};

// Validated Opportunity Queue — a thin view over the shared Opportunity
// Engine repository. No scoring or ranking happens here; the order shown
// is the engine's canonical expected-risk-adjusted-edge ranking, identical
// to Discover. Tapping a row runs the deep per-ticker analysis on it.
const OpportunityQueue = ({ onSelect }: { onSelect: (symbol: string) => void }) => {
  const { opportunities, loading, error, response } = useOpportunities({ maxResults: 6 });

  if (error) return null; // the analyzer input above remains fully usable

  return (
    <div className="glass-panel rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Validated opportunities</span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">
          Shared engine · same ranking as Discover
        </span>
      </div>

      {loading && opportunities.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground animate-pulse">Running validation pipeline…</p>
      )}

      {!loading && opportunities.length === 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{EMPTY_STATE_MESSAGE}</p>
      )}

      {opportunities.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {opportunities.map((o, i) => (
            <button
              key={o.symbol}
              onClick={() => onSelect(o.symbol)}
              className="flex w-full items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-left transition-colors hover:bg-surface-3"
              title={`Confidence ${(o.confidence * 100).toFixed(0)}% · expected edge ${(o.expectedEdgePct * 100).toFixed(1)}% over ${o.horizonDays}d · 95% VaR −${(o.downsideRiskPct * 100).toFixed(1)}%`}
            >
              <span className="w-5 shrink-0 text-[10px] font-mono text-muted-foreground">#{i + 1}</span>
              <span className="font-mono text-sm font-bold text-foreground">{o.symbol}</span>
              <span className={`text-[9px] font-mono ${o.direction === "long" ? "text-gain" : "text-loss"}`}>
                {o.direction.toUpperCase()}
              </span>
              <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                {(o.confidence * 100).toFixed(0)}% conf
              </span>
              <span className="text-[10px] font-mono text-primary">
                E/R {(o.portfolioAdjustedScore ?? o.riskAdjustedScore).toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      )}

      {response && (
        <p className="mt-2 text-[9px] font-mono text-muted-foreground/70">
          {response.diagnostics.universeSize} screened → {response.diagnostics.validated} validated · regime {response.regime.label}
        </p>
      )}
    </div>
  );
};
