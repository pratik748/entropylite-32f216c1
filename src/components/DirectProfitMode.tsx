import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Search, ArrowUp, ArrowDown, Minus, Shield, TrendingUp, Clock, Zap, Volume2, BarChart3, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { governedInvoke } from "@/lib/apiGovernor";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";

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
}

const DirectProfitMode = () => {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TradeResult | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { indiaMode } = useFX();

  const analyze = useCallback(async (inputTicker: string) => {
    const t = inputTicker.trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await governedInvoke("direct-profit", {
        body: { ticker: t, indiaMode },
      });
      if (error) throw error;
      setResult(data as TradeResult);
    } catch (err: any) {
      console.error("Direct profit error:", err);
    } finally {
      setLoading(false);
    }
  }, [indiaMode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    analyze(ticker);
  };

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript.trim();
      setTicker(transcript);
      setListening(false);
      analyze(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  const speakResult = () => {
    if (!result || speaking) return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const cs = getCurrencySymbol(indiaMode ? "INR" : "USD");
    let text = "";
    if (result.action === "BUY") {
      text = `Buy between ${cs}${result.entryLow} and ${cs}${result.entryHigh}. Target ${cs}${result.targetPrice}. Exit below ${cs}${result.stopLoss}. Timeframe: ${result.timeframe}.`;
    } else if (result.action === "SELL") {
      text = `Sell between ${cs}${result.entryLow} and ${cs}${result.entryHigh}. Target ${cs}${result.targetPrice}. Stop at ${cs}${result.stopLoss}. Timeframe: ${result.timeframe}.`;
    } else {
      text = `Wait. Confidence is low at ${result.confidence}%. ${result.directionReason}.`;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(utterance);
  };

  const cs = getCurrencySymbol(indiaMode ? "INR" : "USD");
  const actionColor = result?.action === "BUY" ? "text-gain" : result?.action === "SELL" ? "text-loss" : "text-muted-foreground";
  const actionBg = result?.action === "BUY" ? "bg-gain/10 border-gain/30" : result?.action === "SELL" ? "bg-loss/10 border-loss/30" : "bg-muted/20 border-border";
  const dirIcon = result?.direction === "UP" ? <ArrowUp className="h-5 w-5 text-gain" /> : result?.direction === "DOWN" ? <ArrowDown className="h-5 w-5 text-loss" /> : <Minus className="h-5 w-5 text-muted-foreground" />;

  return (
    <div className="h-full flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Title */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground tracking-tight">Direct Profit Mode</h1>
          </div>
          <p className="text-xs text-muted-foreground">One input. One decision. Zero confusion.</p>
        </div>

        {/* Input */}
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

        {/* Loading skeleton */}
        {loading && (
          <div className="glass-panel rounded-xl p-6 space-y-4 animate-pulse">
            <div className="h-16 bg-muted/30 rounded-lg" />
            <div className="h-24 bg-muted/30 rounded-lg" />
            <div className="h-12 bg-muted/30 rounded-lg" />
          </div>
        )}

        {/* Result Card */}
        {result && !loading && (
          <div className="glass-panel rounded-xl overflow-hidden animate-fade-in">
            {/* 1. ACTION */}
            <div className={`border-b ${actionBg} p-5 text-center`}>
              <div className={`text-4xl font-black tracking-tight ${actionColor}`}>
                {result.action}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {result.confidence >= 75 ? "High" : result.confidence >= 50 ? "Medium" : "Low"} Confidence —{" "}
                <span className="font-bold text-foreground">{result.confidence}%</span>
              </div>
            </div>

            {/* 2. TRADE PLAN */}
            <div className="border-b border-border p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                Trade Plan
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Entry Range</span>
                  <span className="text-foreground font-semibold">{cs}{result.entryLow.toLocaleString()} – {cs}{result.entryHigh.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target</span>
                  <span className="text-gain font-semibold">{cs}{result.targetPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stop Loss</span>
                  <span className="text-loss font-semibold">{cs}{result.stopLoss.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Timeframe</span>
                  <span className="text-foreground font-semibold flex items-center gap-1"><Clock className="h-3 w-3" />{result.timeframe}</span>
                </div>
              </div>
            </div>

            {/* 3. PROTECTION */}
            <div className="border-b border-border p-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Protection
              </div>
              <p className="text-sm text-muted-foreground">{result.protection}</p>
            </div>

            {/* 4. DIRECTION */}
            <div className="border-b border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {dirIcon}
                  <span className="text-lg font-bold text-foreground">{result.direction}</span>
                </div>
                <span className="text-xs text-muted-foreground italic">{result.directionReason}</span>
              </div>
            </div>

            {/* 5. QUANT METRICS */}
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

            {/* 6. NEWS SNAPSHOT */}
            <div className="p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span>🟢</span>
                <span className="text-foreground">{result.positiveNews}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span>🔴</span>
                <span className="text-foreground">{result.negativeNews}</span>
              </div>
            </div>

            {/* Voice playback */}
            <div className="border-t border-border p-3 flex justify-center">
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
      </div>
    </div>
  );
};

export default DirectProfitMode;
