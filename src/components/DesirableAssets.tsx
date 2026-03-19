import { useState, useEffect, useCallback, useRef } from "react";
import { Sparkles, TrendingUp, TrendingDown, Shield, Clock, Target, Plus, Loader2, RefreshCw, Zap, AlertTriangle, CheckCircle2, BarChart3, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { governedInvoke } from "@/lib/apiGovernor";
import { Button } from "@/components/ui/button";
import { getCurrencySymbol } from "@/lib/currency";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { toast } from "@/hooks/use-toast";
import { useFX } from "@/hooks/useFX";

interface Recommendation {
  ticker: string;
  name: string;
  assetClass: string;
  exchange: string;
  currency: string;
  realPrice: number;
  realCurrency: string;
  currentEstPrice: number;
  entryZone: [number, number];
  targetPrice: number;
  stopLoss: number;
  timeHorizon: string;
  suggestedQty: number;
  confidence: number;
  thesis: string;
  catalyst: string;
  hedgingStrategy: string;
  riskReward: string;
  sector: string;
  tags: string[];
  riskProfile?: string[];
  strategy?: string;
  pairedInstrument?: string;
  pairedStructure?: string;
  capitalEfficiency?: number;
  priceChange24h: number;
  priceVerified: boolean;
  sharpeRatio?: number;
  maxDrawdown?: number;
  portfolioCorrelation?: number;
  volatility?: number;
  zScore?: number;
  quantScore?: number;
  closes?: number[];
  simulationTested?: boolean;
}

interface Props {
  stocks: PortfolioStock[];
  onAddToPortfolio: (ticker: string, price: number, qty: number) => void;
}

const strategyColors: Record<string, string> = {
  equity: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  pair_trade: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  futures_leverage: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  vol_arb: "bg-red-500/10 text-red-400 border-red-500/20",
  sector_hedge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  correlation_hedge: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  mean_reversion: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  momentum: "bg-pink-500/10 text-pink-400 border-pink-500/20",
};

const riskProfileColors: Record<string, string> = {
  aggressive: "bg-loss/10 text-loss",
  conservative: "bg-gain/10 text-gain",
  short_term: "bg-amber-500/10 text-amber-400",
  medium_term: "bg-blue-500/10 text-blue-400",
  long_term: "bg-purple-500/10 text-purple-400",
  income: "bg-emerald-500/10 text-emerald-400",
  safe_haven: "bg-cyan-500/10 text-cyan-400",
  high_conviction: "bg-primary/10 text-primary",
};

const MAX_RETRIES = 2;
const DA_CACHE_KEY = "da_recommendations_v3";
const DA_PREV_TICKERS_KEY = "da_previous_tickers";
const DA_CACHE_TTL = 2 * 60 * 60 * 1000;

function getPreviousTickers(): string[] {
  try {
    const raw = localStorage.getItem(DA_PREV_TICKERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePreviousTickers(tickers: string[]) {
  try {
    // Keep last 30 tickers to prevent repeats across refreshes
    localStorage.setItem(DA_PREV_TICKERS_KEY, JSON.stringify(tickers.slice(-30)));
  } catch { /* ignore */ }
}

function getCachedDA() {
  try {
    const raw = localStorage.getItem(DA_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - cached.timestamp > DA_CACHE_TTL) {
      localStorage.removeItem(DA_CACHE_KEY);
      return null;
    }
    return cached;
  } catch { return null; }
}

function setCachedDA(data: any) {
  try {
    localStorage.setItem(DA_CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch { /* ignore */ }
}

const REGION_LABELS: Record<string, string> = {
  INR: "India + Global", EUR: "Europe + Global", GBP: "UK + Global", JPY: "Japan + Global",
  CNY: "China + Global", KRW: "Korea + Global", AUD: "Australia + Global", CAD: "Canada + Global",
  BRL: "Brazil + Global", HKD: "Hong Kong + Global", SGD: "Singapore + Global",
};

// Mini sparkline component
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

// Correlation color
function corrColor(corr: number): string {
  if (corr < -0.2) return "text-gain";
  if (corr < 0.3) return "text-emerald-400";
  if (corr < 0.5) return "text-warning";
  return "text-loss";
}

function corrLabel(corr: number): string {
  if (corr < -0.2) return "Inverse";
  if (corr < 0.1) return "Uncorrelated";
  if (corr < 0.3) return "Low";
  if (corr < 0.5) return "Medium";
  return "High";
}

const DesirableAssets = ({ stocks, onAddToPortfolio }: Props) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [marketCondition, setMarketCondition] = useState("");
  const [regimeType, setRegimeType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addedTickers, setAddedTickers] = useState<Set<string>>(new Set());
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [stats, setStats] = useState({ generated: 0, passed: 0 });
  const retryCount = useRef(0);
  const { baseCurrency } = useFX();

  const existingTickers = stocks.map(s => s.ticker);

  const fetchRecommendations = useCallback(async (showLoading = true, forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getCachedDA();
      if (cached) {
        setRecommendations(cached.recommendations || []);
        setMarketCondition(cached.marketCondition || "");
        setRegimeType(cached.regimeType || "");
        setStats({ generated: cached.candidatesGenerated || 0, passed: cached.candidatesPassed || 0 });
        setLastFetch(cached.timestamp);
        setLoading(false);
        setError(null);
        return;
      }
    }

    if (showLoading) { setLoading(true); setError(null); }
    try {
      const totalValue = stocks.reduce((s, st) => s + (st.analysis?.currentPrice || st.buyPrice) * st.quantity, 0);

      // Build weights and sectors maps
      const portfolioWeights: Record<string, number> = {};
      const portfolioSectors: Record<string, string> = {};
      for (const st of stocks) {
        const val = (st.analysis?.currentPrice || st.buyPrice) * st.quantity;
        portfolioWeights[st.ticker] = totalValue > 0 ? val / totalValue : 0;
        portfolioSectors[st.ticker] = (st.analysis as any)?.sector || "";
      }

      const { data, error: fnError } = await governedInvoke("desirable-assets", {
        body: {
          portfolioTickers: existingTickers,
          portfolioWeights,
          portfolioSectors,
          portfolioValue: totalValue || 100000,
          baseCurrency,
          previousTickers: getPreviousTickers(),
        },
      });

      if (fnError) {
        const errMsg = fnError.message || "";
        if (errMsg.includes("429") || errMsg.includes("rate limit")) throw new Error("Rate limited. Retrying in 15s...");
        if (errMsg.includes("402") || errMsg.includes("credits")) throw new Error("AI credits exhausted. Please try again later.");
        throw fnError;
      }

      if (!data?.recommendations || data.recommendations.length === 0) {
        if (retryCount.current < MAX_RETRIES) {
          retryCount.current++;
          setTimeout(() => fetchRecommendations(false), 5000);
          return;
        }
        throw new Error("No recommendations survived quant filters. Try refreshing.");
      }

      const payload = {
        recommendations: data.recommendations,
        marketCondition: data.marketCondition || "",
        regimeType: data.regimeType || "",
        candidatesGenerated: data.candidatesGenerated || 0,
        candidatesPassed: data.candidatesPassed || 0,
      };
      setCachedDA(payload);
      // Save tickers for anti-repeat on next refresh
      const newTickers = data.recommendations.map((r: any) => r.ticker);
      savePreviousTickers([...getPreviousTickers(), ...newTickers]);
      setRecommendations(data.recommendations);
      setMarketCondition(data.marketCondition || "");
      setRegimeType(data.regimeType || "");
      setStats({ generated: data.candidatesGenerated || 0, passed: data.candidatesPassed || 0 });
      setLastFetch(Date.now());
      setError(null);
      retryCount.current = 0;
    } catch (e: any) {
      console.error("Desirable assets error:", e);
      setError(e.message || "Failed to load recommendations");
      if (retryCount.current < MAX_RETRIES && !e.message?.includes("credits")) {
        retryCount.current++;
        setTimeout(() => fetchRecommendations(false), retryCount.current * 5000);
      }
    } finally {
      setLoading(false);
    }
  }, [stocks.length, baseCurrency]);

  useEffect(() => {
    fetchRecommendations();
    const interval = setInterval(() => fetchRecommendations(false), 600_000);
    return () => clearInterval(interval);
  }, [fetchRecommendations]);

  const handleAdd = (rec: Recommendation) => {
    const price = rec.realPrice || rec.currentEstPrice;
    onAddToPortfolio(rec.ticker, price, rec.suggestedQty || 1);
    setAddedTickers(prev => new Set(prev).add(rec.ticker));
    toast({ title: `Added ${rec.ticker}`, description: `${rec.suggestedQty} units at ${getCurrencySymbol(rec.realCurrency || rec.currency)}${price.toLocaleString()}` });
  };

  if (loading && recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground font-mono">Running 3-stage quant funnel...</span>
        <span className="text-[9px] text-muted-foreground/50 font-mono">AI candidates → Historical validation → Portfolio correlation filter</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Desirable Assets</h2>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
              QUANT VALIDATED · {REGION_LABELS[baseCurrency] || "Global"} · {regimeType && <span className={`uppercase ${regimeType === "crisis" ? "text-loss" : regimeType === "risk-off" ? "text-warning" : "text-gain"}`}>{regimeType}</span>}
              {stats.generated > 0 && <span className="ml-2 text-primary">{stats.passed}/{stats.generated} passed</span>}
              {lastFetch && <span className="ml-2">{Math.round((Date.now() - lastFetch) / 1000)}s ago</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">Cached 2h</span>
          <Button size="sm" variant="ghost" onClick={() => { retryCount.current = 0; fetchRecommendations(true, true); }} className="h-7 gap-1.5 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && recommendations.length === 0 && (
        <div className="rounded-xl border border-loss/20 bg-loss/5 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-loss flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">{error}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Click refresh to try again</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { retryCount.current = 0; fetchRecommendations(true, true); }} className="ml-auto">Retry</Button>
        </div>
      )}

      {/* Market Condition */}
      {marketCondition && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Market Assessment</span>
          </div>
          <p className="text-sm text-foreground">{marketCondition}</p>
        </div>
      )}

      {/* Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {recommendations.map((rec, i) => {
          const price = rec.realPrice || rec.currentEstPrice || 0;
          const sym = getCurrencySymbol(rec.realCurrency || rec.currency);
          const targetPrice = rec.targetPrice || 0;
          const stopLoss = rec.stopLoss || 0;
          const entryZone: [number, number] = [rec.entryZone?.[0] || 0, rec.entryZone?.[1] || 0];
          const upside = price > 0 ? ((targetPrice - price) / price * 100) : 0;
          const downside = price > 0 ? ((stopLoss - price) / price * 100) : 0;
          const inZone = price >= entryZone[0] && price <= entryZone[1];
          const priceChange24h = rec.priceChange24h || 0;
          const alreadyOwned = existingTickers.includes(rec.ticker);
          const justAdded = addedTickers.has(rec.ticker);
          const qs = rec.quantScore || 0;

          return (
            <div key={rec.ticker} className={`glass-panel rounded-xl p-5 transition-all hover:glass-glow-primary ${i < 2 ? "glass-glow-primary" : ""}`}>
              {/* Header row */}
              <div className="flex items-center justify-between mb-3 relative z-10">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-base font-bold text-foreground">{rec.ticker}</span>
                  {rec.strategy && (
                    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-mono ${strategyColors[rec.strategy] || "bg-surface-3 text-muted-foreground border-border"}`}>
                      {rec.strategy.replace(/_/g, " ").toUpperCase()}
                    </span>
                  )}
                  {rec.simulationTested && (
                    <span className="rounded bg-gain/10 px-1.5 py-0.5 text-[8px] font-mono text-gain flex items-center gap-0.5">
                      <CheckCircle2 className="h-2.5 w-2.5" /> TESTED
                    </span>
                  )}
                  {i < 2 && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-mono text-primary">TOP PICK</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Quant Score badge */}
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-mono font-bold ${qs >= 70 ? "bg-gain/10 text-gain" : qs >= 45 ? "bg-warning/10 text-warning" : "bg-loss/10 text-loss"}`}>
                    Q{qs}
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-1 relative z-10">{rec.name}</p>

              {/* Paired instrument */}
              {rec.pairedStructure && (
                <div className="rounded-lg bg-purple-500/5 border border-purple-500/20 px-3 py-1.5 mb-2 text-[10px] font-mono text-purple-400 relative z-10">
                  <span className="font-bold">STRUCTURE:</span> {rec.pairedStructure}
                  {rec.capitalEfficiency && rec.capitalEfficiency > 1 && (
                    <span className="ml-2 text-amber-400">{rec.capitalEfficiency}x capital efficiency</span>
                  )}
                </div>
              )}

              <p className="text-[11px] text-secondary-foreground leading-relaxed mb-3 relative z-10">{rec.thesis}</p>

              {/* Quant Proof Section */}
              {rec.sharpeRatio !== undefined && (
                <div className="grid grid-cols-5 gap-1.5 mb-3 rounded-lg bg-surface-2 p-2.5 relative z-10">
                  <div className="text-center">
                    <p className="text-[7px] text-muted-foreground uppercase">Sharpe</p>
                    <p className={`font-mono text-xs font-bold ${(rec.sharpeRatio || 0) >= 0.5 ? "text-gain" : (rec.sharpeRatio || 0) >= 0 ? "text-warning" : "text-loss"}`}>
                      {rec.sharpeRatio?.toFixed(2)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[7px] text-muted-foreground uppercase">Port Corr</p>
                    <p className={`font-mono text-xs font-bold ${corrColor(rec.portfolioCorrelation || 0)}`}>
                      {rec.portfolioCorrelation?.toFixed(2)}
                    </p>
                    <p className={`text-[7px] ${corrColor(rec.portfolioCorrelation || 0)}`}>
                      {corrLabel(rec.portfolioCorrelation || 0)}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[7px] text-muted-foreground uppercase">MaxDD</p>
                    <p className={`font-mono text-xs font-bold ${(rec.maxDrawdown || 0) < 15 ? "text-gain" : (rec.maxDrawdown || 0) < 25 ? "text-warning" : "text-loss"}`}>
                      {rec.maxDrawdown?.toFixed(1)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[7px] text-muted-foreground uppercase">Vol</p>
                    <p className="font-mono text-xs font-bold text-foreground">{rec.volatility?.toFixed(1)}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[7px] text-muted-foreground uppercase">Z-Score</p>
                    <p className={`font-mono text-xs font-bold ${(rec.zScore || 0) < -1.5 ? "text-gain" : (rec.zScore || 0) > 1.5 ? "text-loss" : "text-foreground"}`}>
                      {rec.zScore?.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              {/* Max Profit Target */}
              {(rec as any).maxProfitTarget && (rec as any).maxProfitTarget > price && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 mb-3 relative z-10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3 w-3 text-primary" />
                      <span className="text-[9px] font-bold text-primary uppercase tracking-wider">Quant Max Profit</span>
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {(rec as any).maxProfitConfidence}% confidence · {(rec as any).maxProfitMethod}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="font-mono text-sm font-bold text-primary">
                      {sym}{(rec as any).maxProfitTarget.toLocaleString()}
                    </span>
                    <span className="font-mono text-[10px] text-gain">
                      +{(((rec as any).maxProfitTarget - price) / price * 100).toFixed(1)}% from current
                    </span>
                  </div>
                </div>
              )}

              {/* Price + Sparkline */}
              <div className="flex items-center gap-3 mb-3 relative z-10">
                <div className="flex-1 grid grid-cols-4 gap-2">
                  <div>
                    <p className="text-[8px] text-muted-foreground uppercase">Current</p>
                    <p className="font-mono text-sm font-bold text-foreground">{sym}{price.toLocaleString()}</p>
                    <p className={`font-mono text-[9px] ${priceChange24h >= 0 ? "text-gain" : "text-loss"}`}>
                      {priceChange24h >= 0 ? "+" : ""}{priceChange24h.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[8px] text-muted-foreground uppercase">Target</p>
                    <p className="font-mono text-sm font-bold text-gain">{sym}{targetPrice.toLocaleString()}</p>
                    <p className="font-mono text-[9px] text-gain">+{upside.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-muted-foreground uppercase">Stop Loss</p>
                    <p className="font-mono text-sm font-bold text-loss">{sym}{stopLoss.toLocaleString()}</p>
                    <p className="font-mono text-[9px] text-loss">{downside.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-[8px] text-muted-foreground uppercase">R:R</p>
                    <p className="font-mono text-sm font-bold text-foreground">{rec.riskReward || "—"}</p>
                    <p className="text-[9px] text-muted-foreground">{rec.timeHorizon || "—"}</p>
                  </div>
                </div>
                <Sparkline data={rec.closes || []} />
              </div>

              {/* Entry Zone */}
              <div className={`rounded-lg px-3 py-2 mb-3 text-[10px] font-mono relative z-10 ${inZone ? "bg-gain/10 text-gain border border-gain/20" : "bg-surface-2 text-muted-foreground"}`}>
                <span className="font-bold">{inZone ? "✓ IN ENTRY ZONE" : "ENTRY ZONE"}</span>: {sym}{entryZone[0].toLocaleString()} – {sym}{entryZone[1].toLocaleString()}
                {inZone && " · BUY SIGNAL ACTIVE"}
              </div>

              {/* Catalyst & Hedge */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-[10px] relative z-10">
                <div className="rounded-lg bg-surface-2 p-2">
                  <p className="text-muted-foreground mb-0.5 flex items-center gap-1"><Target className="h-2.5 w-2.5" /> Catalyst</p>
                  <p className="text-foreground">{rec.catalyst}</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-2">
                  <p className="text-muted-foreground mb-0.5 flex items-center gap-1"><Shield className="h-2.5 w-2.5" /> Hedge</p>
                  <p className="text-foreground">{rec.hedgingStrategy}</p>
                </div>
              </div>

              {/* Tags: strategy + risk profile */}
              <div className="flex items-center justify-between relative z-10">
                <div className="flex flex-wrap gap-1">
                  {rec.riskProfile?.map(tag => (
                    <span key={tag} className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${riskProfileColors[tag] || "bg-surface-3 text-muted-foreground"}`}>
                      {tag.replace(/_/g, " ")}
                    </span>
                  ))}
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[9px] text-muted-foreground">{rec.sector}</span>
                </div>
                <Button
                  size="sm"
                  variant={justAdded ? "secondary" : "default"}
                  disabled={alreadyOwned || justAdded}
                  onClick={() => handleAdd(rec)}
                  className="h-7 gap-1 text-[10px]"
                >
                  {justAdded ? "Added ✓" : alreadyOwned ? "Owned" : <><Plus className="h-3 w-3" /> Add</>}
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
