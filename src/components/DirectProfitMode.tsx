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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { governedInvoke } from "@/lib/apiGovernor";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import { cleanAIText } from "@/lib/utils";

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
  quantScore?: number;
  volatilityRegime?: "LOW" | "NORMAL" | "HIGH";
  riskRewardRatio?: number;
  providersUsed?: number;
  consensus?: "UNANIMOUS" | "MAJORITY" | "SPLIT";
  fallback?: boolean;
}

interface PortfolioItem {
  ticker: string;
  action: "BUY" | "SELL";
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  currentPrice: number;
  addedAt: number;
}

const STORAGE_KEY = "dp-portfolio";
const ANALYSIS_TIMEOUT_MS = 20000;

function loadPortfolio(): PortfolioItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePortfolio(items: PortfolioItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
    quantScore: value.quantScore !== undefined ? Math.max(0, Math.min(100, Math.round(normalizeNumber(value.quantScore)))) : undefined,
    volatilityRegime: ["LOW", "NORMAL", "HIGH"].includes(value.volatilityRegime) ? value.volatilityRegime : undefined,
    riskRewardRatio: value.riskRewardRatio !== undefined ? Math.abs(normalizeNumber(value.riskRewardRatio)) : undefined,
    providersUsed: value.providersUsed !== undefined ? Math.max(0, Math.round(normalizeNumber(value.providersUsed))) : undefined,
    consensus: ["UNANIMOUS", "MAJORITY", "SPLIT"].includes(value.consensus) ? value.consensus : undefined,
    fallback: Boolean(value.fallback),
  };
}

const DirectProfitMode = () => {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTicker, setActiveTicker] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>(loadPortfolio);
  const [added, setAdded] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { indiaMode } = useFX();

  useEffect(() => {
    savePortfolio(portfolio);
  }, [portfolio]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop?.();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, []);

  const analyze = useCallback(async (inputTicker: string) => {
    const trimmed = inputTicker.trim();
    const normalizedTicker = trimmed.toUpperCase();
    if (!normalizedTicker) return;

    setLoading(true);
    setErrorMessage(null);
    setResult(null);
    setAdded(false);
    setActiveTicker(normalizedTicker);

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
      if (!normalized) {
        throw new Error("Direct Profit returned an incomplete trade plan. Please retry.");
      }

      setResult(normalized);
    } catch (err: any) {
      const message = typeof err?.message === "string" && err.message.trim()
        ? err.message
        : "Could not analyze this asset right now. Please try again.";
      console.error("Direct profit error:", err);
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [indiaMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyze(ticker);
  };

  const retryAnalysis = () => {
    const retryTicker = ticker.trim() || activeTicker;
    if (retryTicker) analyze(retryTicker);
  };

  const addToPortfolio = () => {
    if (!result || !activeTicker || result.action === "WAIT") return;
    const exists = portfolio.some((p) => p.ticker === activeTicker);
    if (exists) return;

    const item: PortfolioItem = {
      ticker: activeTicker,
      action: result.action,
      entryPrice: (result.entryLow + result.entryHigh) / 2,
      targetPrice: result.targetPrice,
      stopLoss: result.stopLoss,
      currentPrice: result.currentPrice,
      addedAt: Date.now(),
    };

    setPortfolio((prev) => [item, ...prev]);
    setAdded(true);
  };

  const removeFromPortfolio = (symbol: string) => {
    setPortfolio((prev) => prev.filter((p) => p.ticker !== symbol));
  };

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setErrorMessage("Voice input is not supported in this browser.");
      return;
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = indiaMode ? "hi-IN" : "en-US";

    recognition.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) {
        setErrorMessage("Could not hear the symbol clearly. Please try again.");
        setListening(false);
        return;
      }
      setTicker(transcript);
      setListening(false);
      analyze(transcript);
    };
    recognition.onerror = () => {
      setListening(false);
      setErrorMessage("Voice input failed. Please type the asset instead.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const speakResult = () => {
    if (!result || speaking) return;
    const synth = window.speechSynthesis;
    if (!synth) {
      setErrorMessage("Read aloud is not supported in this browser.");
      return;
    }

    synth.cancel();
    const cs = getCurrencySymbol(indiaMode ? "INR" : "USD");
    let text = "";

    if (indiaMode) {
      if (result.action === "BUY") {
        text = `खरीदें, ${cs}${result.entryLow} से ${cs}${result.entryHigh} के बीच। लक्ष्य ${cs}${result.targetPrice}। ${cs}${result.stopLoss} से नीचे जाएं तो बाहर निकलें। समय सीमा: ${result.timeframe}।`;
      } else if (result.action === "SELL") {
        text = `बेचें, ${cs}${result.entryLow} से ${cs}${result.entryHigh} के बीच। लक्ष्य ${cs}${result.targetPrice}। स्टॉप लॉस ${cs}${result.stopLoss}। समय सीमा: ${result.timeframe}।`;
      } else {
        text = `रुकें। संकेत मिश्रित हैं। विश्वास स्तर ${result.confidence} प्रतिशत है। ${result.directionReason}।`;
      }
    } else {
      if (result.action === "BUY") {
        text = `Buy between ${cs}${result.entryLow} and ${cs}${result.entryHigh}. Target ${cs}${result.targetPrice}. Exit below ${cs}${result.stopLoss}. Timeframe: ${result.timeframe}.`;
      } else if (result.action === "SELL") {
        text = `Sell between ${cs}${result.entryLow} and ${cs}${result.entryHigh}. Target ${cs}${result.targetPrice}. Stop at ${cs}${result.stopLoss}. Timeframe: ${result.timeframe}.`;
      } else {
        text = `Wait. Signals are mixed. Confidence is ${result.confidence} percent. ${result.directionReason}.`;
      }
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = indiaMode ? "hi-IN" : "en-US";
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      setErrorMessage("Read aloud failed. Please try again.");
    };

    setSpeaking(true);
    synth.speak(utterance);
  };

  const cs = getCurrencySymbol(indiaMode ? "INR" : "USD");
  const actionColor = result?.action === "BUY" ? "text-gain" : result?.action === "SELL" ? "text-loss" : "text-muted-foreground";
  const actionBg = result?.action === "BUY" ? "bg-gain/10 border-gain/30" : result?.action === "SELL" ? "bg-loss/10 border-loss/30" : "bg-muted/20 border-border";
  const dirIcon = result?.direction === "UP"
    ? <ArrowUp className="h-5 w-5 text-gain" />
    : result?.direction === "DOWN"
      ? <ArrowDown className="h-5 w-5 text-loss" />
      : <Minus className="h-5 w-5 text-muted-foreground" />;

  const alreadyInPortfolio = result ? portfolio.some((p) => p.ticker === activeTicker) : false;

  const totalPnl = portfolio.reduce((sum, p) => {
    const diff = p.action === "BUY" ? p.currentPrice - p.entryPrice : p.entryPrice - p.currentPrice;
    return sum + diff;
  }, 0);

  const totalPnlPct = portfolio.length > 0
    ? portfolio.reduce((sum, p) => {
        const diff = p.action === "BUY"
          ? ((p.currentPrice - p.entryPrice) / p.entryPrice) * 100
          : ((p.entryPrice - p.currentPrice) / p.entryPrice) * 100;
        return sum + diff;
      }, 0) / portfolio.length
    : 0;

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
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
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
          </div>
        )}

        {result && !loading && (
          <div className="glass-panel rounded-xl overflow-hidden animate-fade-in">
            <div className={`border-b ${actionBg} p-5 text-center`}>
              <div className={`text-4xl font-black tracking-tight ${actionColor}`}>
                {result.action}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {result.confidence >= 75 ? "High" : result.confidence >= 50 ? "Medium" : "Low"} Confidence — {" "}
                <span className="font-bold text-foreground">{result.confidence}%</span>
              </div>
              {result.fallback && (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Running on resilient rules fallback while live AI consensus is unavailable.
                </div>
              )}
            </div>

            <div className="border-b border-border p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                Trade Plan
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm font-mono">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Entry Range</span>
                  <span className="text-foreground font-semibold text-right">{cs}{result.entryLow.toLocaleString()} – {cs}{result.entryHigh.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Target</span>
                  <span className="text-gain font-semibold text-right">{cs}{result.targetPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Stop Loss</span>
                  <span className="text-loss font-semibold text-right">{cs}{result.stopLoss.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Timeframe</span>
                  <span className="text-foreground font-semibold flex items-center gap-1 text-right"><Clock className="h-3 w-3" />{result.timeframe}</span>
                </div>
              </div>
            </div>

            <div className="border-b border-border p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Protection
              </div>
              <p className="text-sm text-muted-foreground">{result.protection}</p>
            </div>

            <div className="border-b border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  {dirIcon}
                  <span className="text-lg font-bold text-foreground">{result.direction}</span>
                </div>
                <span className="text-xs text-muted-foreground italic text-right">{result.directionReason}</span>
              </div>
            </div>

            {(result.quantScore !== undefined || result.riskRewardRatio !== undefined) && (
              <div className="border-b border-border p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
                  <BarChart3 className="h-3.5 w-3.5 text-primary" />
                  Quant Signals
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  {result.quantScore !== undefined && (
                    <div className="text-center">
                      <div className={`text-lg font-bold ${result.quantScore >= 70 ? "text-gain" : result.quantScore >= 40 ? "text-foreground" : "text-loss"}`}>
                        {result.quantScore}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Quant Score</div>
                    </div>
                  )}
                  {result.riskRewardRatio !== undefined && result.riskRewardRatio > 0 && (
                    <div className="text-center">
                      <div className={`text-lg font-bold ${result.riskRewardRatio >= 2 ? "text-gain" : "text-loss"}`}>
                        {result.riskRewardRatio.toFixed(1)}:1
                      </div>
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
                    {result.consensus === "UNANIMOUS" ? "✓ All engines agree" : result.consensus === "MAJORITY" ? "⚡ Majority consensus" : "⚠ Split signal"} ({result.providersUsed} engines)
                  </div>
                )}
              </div>
            )}

            <div className="border-b border-border p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span>🟢</span>
                <span className="text-foreground">{result.positiveNews}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>🔴</span>
                <span className="text-foreground">{result.negativeNews}</span>
              </div>
            </div>

            <div className="border-t border-border p-3 flex items-center justify-between">
              {result.action !== "WAIT" ? (
                <Button
                  size="sm"
                  variant={added || alreadyInPortfolio ? "outline" : "default"}
                  disabled={added || alreadyInPortfolio}
                  onClick={addToPortfolio}
                  className="text-xs h-8 gap-1.5"
                >
                  {added || alreadyInPortfolio ? (
                    <>✓ Added</>
                  ) : (
                    <><Plus className="h-3.5 w-3.5" /> Add to Portfolio</>
                  )}
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
                    {totalPnl >= 0 ? "+" : ""}{cs}{Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className={`text-[10px] ${totalPnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                    {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}% avg
                  </div>
                </div>
              </div>
            </div>
            <div className="divide-y divide-border">
              {portfolio.map((item) => {
                const pnl = item.action === "BUY" ? item.currentPrice - item.entryPrice : item.entryPrice - item.currentPrice;
                const pnlPct = (pnl / item.entryPrice) * 100;
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
                          {hitTarget && <span className="text-[10px] text-gain">🎯 Target Hit</span>}
                          {hitStop && <span className="text-[10px] text-loss">⛔ Stop Hit</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          Entry {cs}{item.entryPrice.toLocaleString()} → Target {cs}{item.targetPrice.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className={`text-sm font-bold font-mono ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                          {pnl >= 0 ? "+" : ""}{cs}{Math.abs(pnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className={`text-[10px] ${pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromPortfolio(item.ticker)}
                        className="text-muted-foreground hover:text-loss transition-colors p-1"
                      >
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
