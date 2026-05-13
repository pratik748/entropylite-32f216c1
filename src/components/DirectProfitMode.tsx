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
  action: "BUY" | "SELL" | "WAIT";
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
const ANALYSIS_TIMEOUT_MS = 25000;

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
      ["BUY", "SELL", "WAIT"].includes(value.action) &&
      ["UP", "DOWN", "SIDEWAYS"].includes(value.direction) &&
      typeof value.confidence === "number" &&
      typeof value.currentPrice === "number"
  );
}

function normalizeTradeResult(value: any): TradeResult | null {
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
    bullSignals: Array.isArray(value.bullSignals) ? value.bullSignals.map((s: any) => String(s)) : undefined,
    bearSignals: Array.isArray(value.bearSignals) ? value.bearSignals.map((s: any) => String(s)) : undefined,
    intelligence: value.intelligence && typeof value.intelligence === "object" ? value.intelligence : undefined,
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
      action: "BUY" | "SELL" | "WAIT";
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
    setAdded(false);
    setActiveTicker(normalizedTicker);
    setLivePrice(null);
    setLiveCurrency(null);
    setLastPriceUpdate(0);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Analysis is taking too long. Please try again.")), ANALYSIS_TIMEOUT_MS);
    });

    try {
      const response = await Promise.race([
        governedInvoke<TradeResult>("direct-profit", {
          body: { ticker: normalizedTicker, indiaMode },
          tier: "ai",
          force: true,
        }),
        timeoutPromise,
      ]);

      const { data, error } = response as Awaited<ReturnType<typeof governedInvoke<TradeResult>>>;
      if (error) throw error;

      const normalized = normalizeTradeResult(data);
      if (!normalized) throw new Error("Direct Profit returned an incomplete trade plan. Please retry.");

      setResult(normalized);
      setLivePrice(normalized.currentPrice > 0 ? normalized.currentPrice : null);
      setLiveCurrency(normalized.currency || null);
      setLastPriceUpdate(Date.now());
    } catch (err: any) {
      const message = typeof err?.message === "string" && err.message.trim()
        ? err.message
        : "Could not analyze this asset right now. Please try again.";
      console.error("Direct profit error:", err);
      setErrorMessage(message);
    } finally { setLoading(false); }
  }, [indiaMode]);

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); analyze(ticker); };

  const retryAnalysis = () => {
    const retryTicker = ticker.trim() || activeTicker;
    if (retryTicker) analyze(retryTicker);
  };

  const addToPortfolio = () => {
    if (!result || !activeTicker || result.action === "WAIT") return;
    const exists = portfolio.some((p) => p.ticker === activeTicker);
    const entryPrice = (result.entryLow + result.entryHigh) / 2;
    const itemCurrency = resolveAssetCurrency(activeTicker, liveCurrency || result.currency, indiaMode ? "INR" : "USD");

    if (!exists) {
      const item: PortfolioItem = {
        ticker: activeTicker,
        action: result.action,
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
          action: result.action,
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
      else if (result.action === "SELL") text = `बेचें, ${cSym}${result.entryLow} से ${cSym}${result.entryHigh} के बीच। लक्ष्य ${cSym}${result.targetPrice}। स्टॉप लॉस ${cSym}${result.stopLoss}। समय सीमा: ${result.timeframe}।`;
      else text = `रुकें। संकेत मिश्रित हैं। विश्वास स्तर ${result.confidence} प्रतिशत है। ${result.directionReason}।`;
    } else {
      if (result.action === "BUY") text = `Buy between ${cSym}${result.entryLow} and ${cSym}${result.entryHigh}. Target ${cSym}${result.targetPrice}. Exit below ${cSym}${result.stopLoss}. Timeframe: ${result.timeframe}.`;
      else if (result.action === "SELL") text = `Sell between ${cSym}${result.entryLow} and ${cSym}${result.entryHigh}. Target ${cSym}${result.targetPrice}. Stop at ${cSym}${result.stopLoss}. Timeframe: ${result.timeframe}.`;
      else text = `Wait. Signals are mixed. Confidence is ${result.confidence} percent. ${result.directionReason}.`;
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
  const actionColor = result?.action === "BUY" ? "text-gain" : result?.action === "SELL" ? "text-loss" : "text-muted-foreground";
  const actionBg = result?.action === "BUY" ? "bg-gain/10 border-gain/30" : result?.action === "SELL" ? "bg-loss/10 border-loss/30" : "bg-muted/20 border-border";
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
          <div className="relative flex-1">
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
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
          </div>
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
            </div>

            {/* ── WAIT EXPLANATION ── */}
            {result.action === "WAIT" && (result.waitReasons?.length || 0) > 0 && (
              <div className="border-b border-border bg-surface-2/30 p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                  Why WAIT — thresholds not met
                </div>
                <ul className="space-y-1.5">
                  {result.waitReasons!.map((r, i) => (
                    <li key={i} className="text-xs text-foreground flex gap-2">
                      <span className="text-muted-foreground font-mono shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
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
              {result.action !== "WAIT" ? (
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

        {/* Portfolio */}
        {portfolio.length > 0 && (
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">My Trades</span>
                  <span className="text-[10px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">{portfolio.length}</span>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-bold font-mono ${totalPnl >= 0 ? "text-gain" : "text-loss"}`}>
                    {totalPnl >= 0 ? "+" : ""}{baseSym}{Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={`text-[10px] ${totalPnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                    {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}% avg
                  </div>
                </div>
              </div>
            </div>
            <div className="divide-y divide-border">
              {portfolio.map((item) => {
                const itemCurrency = resolveAssetCurrency(item.ticker, item.currency, indiaMode ? "INR" : "USD");
                const itemSym = getCurrencySymbol(itemCurrency);
                const pnl = item.action === "BUY" ? item.currentPrice - item.entryPrice : item.entryPrice - item.currentPrice;
                const pnlPct = (pnl / item.entryPrice) * 100;
                const pnlBase = itemCurrency !== baseCurrency ? convertToBase(pnl, itemCurrency) : null;
                const hitTarget = item.action === "BUY" ? item.currentPrice >= item.targetPrice : item.currentPrice <= item.targetPrice;
                const hitStop = item.action === "BUY" ? item.currentPrice <= item.stopLoss : item.currentPrice >= item.stopLoss;

                return (
                  <div key={item.ticker} className="p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold font-mono text-foreground">{item.ticker}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${item.action === "BUY" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"}`}>
                            {item.action}
                          </span>
                          {hitTarget && <span className="text-[10px] text-gain font-mono">TARGET HIT</span>}
                          {hitStop && <span className="text-[10px] text-loss">Stop Hit</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          Entry {itemSym}{item.entryPrice.toLocaleString()} → Target {itemSym}{item.targetPrice.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className={`text-sm font-bold font-mono ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                          {pnl >= 0 ? "+" : ""}{itemSym}{Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={`text-[10px] ${pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </div>
                        {pnlBase !== null && (
                          <div className={`text-[10px] font-mono ${pnlBase >= 0 ? "text-gain/70" : "text-loss/70"}`}>
                            ≈ {pnlBase >= 0 ? "+" : "-"}{formatCurrency(Math.abs(pnlBase), baseCurrency)}
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeFromPortfolio(item.ticker)} className="text-muted-foreground hover:text-loss transition-colors p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DirectProfitMode;
