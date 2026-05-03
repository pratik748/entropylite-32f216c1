import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface DemoResult {
  ticker: string;
  currency: string;
  currentPrice: number;
  changePct: number;
  posIn52w: number;
  technicals: {
    sma20: number; sma50: number; sma200: number;
    zScore: number; trend: string; support: number; resistance: number; annualVol: number;
  };
  risk: {
    var95: number; var99: number; cvar95: number;
    sharpe: number; sortino: number; maxDrawdown: number;
  };
  monteCarlo: {
    paths: number; horizonDays: number;
    median: number; p5: number; p95: number;
    expected: number; profitProbability: number;
  };
  verdict: "BUY" | "SELL" | "HOLD";
  signalScore: number;
  headlines: string[];
}

const SYM: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£", JPY: "¥" };

export default function InteractiveDemo() {
  const navigate = useNavigate();
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DemoResult | null>(null);

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) { setError("Enter a ticker"); return; }
    if (t.length > 20) { setError("Ticker too long"); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const { data, error: err } = await supabase.functions.invoke("demo-analyze", { body: { ticker: t } });
      if (err) throw new Error(err.message || "Analysis failed");
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as DemoResult);
    } catch (e: any) {
      setError(e?.message || "Could not run analysis");
    } finally {
      setLoading(false);
    }
  }

  const sym = result ? (SYM[result.currency] || result.currency + " ") : "$";

  return (
    <section className="border-t border-black/5 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-8 sm:mb-10">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Try it now</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            Type a ticker. See the terminal think.
          </h2>
          <p className="text-sm sm:text-base text-black/55 max-w-xl mx-auto">
            No price. No quantity. No login. Just a symbol — and one full institutional read.
          </p>
        </div>

        <form onSubmit={run} className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto mb-3">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="AAPL · RELIANCE.NS · BTC-USD · TSLA"
            maxLength={20}
            className="flex-1 h-12 px-4 rounded-full border border-black/15 bg-white font-mono text-sm tracking-wide placeholder:text-black/30 focus:outline-none focus:border-black/45 transition"
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={loading}
            className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-6 h-12 rounded-full"
          >
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analyzing</> : <>Run analysis <ArrowRight className="h-4 w-4 ml-1" /></>}
          </Button>
        </form>

        <div className="text-center font-mono text-[10px] text-black/35 tracking-wide mb-6">
          Try: AAPL · TSLA · RELIANCE.NS · INFY.NS · BTC-USD · NVDA
        </div>

        {error && (
          <div className="max-w-xl mx-auto p-4 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>
        )}

        {result && (
          <div className="mt-8 rounded-2xl border border-black/10 bg-white shadow-xl shadow-black/5 overflow-hidden">
            {/* Header */}
            <div className={`p-5 sm:p-6 border-b border-black/5 ${
              result.verdict === "BUY" ? "bg-emerald-50" : result.verdict === "SELL" ? "bg-red-50" : "bg-black/[0.02]"
            }`}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-black/40 mb-1">Live snapshot</div>
                  <div className="text-2xl sm:text-3xl font-bold tracking-tight">{result.ticker}</div>
                  <div className="text-sm text-black/60 mt-0.5">
                    {sym}{result.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className={`ml-2 font-mono text-xs ${result.changePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {result.changePct >= 0 ? "+" : ""}{result.changePct}%
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-black/40 mb-1">Verdict</div>
                  <div className={`text-3xl sm:text-4xl font-black tracking-tight flex items-center gap-2 ${
                    result.verdict === "BUY" ? "text-emerald-600" : result.verdict === "SELL" ? "text-red-600" : "text-black/60"
                  }`}>
                    {result.verdict === "BUY" ? <TrendingUp className="h-7 w-7" /> : result.verdict === "SELL" ? <TrendingDown className="h-7 w-7" /> : <Minus className="h-7 w-7" />}
                    {result.verdict}
                  </div>
                  <div className="font-mono text-[10px] text-black/40 mt-0.5">Signal score {result.signalScore >= 0 ? "+" : ""}{result.signalScore}</div>
                </div>
              </div>
            </div>

            {/* Monte Carlo */}
            <div className="p-5 sm:p-6 border-b border-black/5">
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-black/40">Monte Carlo · {result.monteCarlo.paths.toLocaleString()} paths · {result.monteCarlo.horizonDays}d horizon</div>
                <div className="font-mono text-xs font-bold text-black">{result.monteCarlo.profitProbability}% profit prob.</div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-black/40">5th pctile</div>
                  <div className="text-lg font-semibold text-red-600 mt-0.5">{sym}{result.monteCarlo.p5}</div>
                </div>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-black/40">Median</div>
                  <div className="text-lg font-semibold text-black mt-0.5">{sym}{result.monteCarlo.median}</div>
                </div>
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-wider text-black/40">95th pctile</div>
                  <div className="text-lg font-semibold text-emerald-600 mt-0.5">{sym}{result.monteCarlo.p95}</div>
                </div>
              </div>
              {/* simple range bar */}
              <div className="mt-4 h-2 rounded-full bg-gradient-to-r from-red-400 via-amber-300 to-emerald-400 relative">
                {(() => {
                  const lo = result.monteCarlo.p5, hi = result.monteCarlo.p95;
                  const pos = clamp(((result.currentPrice - lo) / Math.max(hi - lo, 0.01)) * 100, 0, 100);
                  return <div className="absolute -top-1 h-4 w-1 bg-black rounded" style={{ left: `${pos}%` }} title="Current price" />;
                })()}
              </div>
            </div>

            {/* Risk + Technicals grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black/5">
              <Stat label="VaR 95%" value={`-${result.risk.var95}%`} tone="loss" />
              <Stat label="CVaR 95%" value={`-${result.risk.cvar95}%`} tone="loss" />
              <Stat label="Sharpe" value={result.risk.sharpe.toFixed(2)} tone={result.risk.sharpe > 0 ? "gain" : "loss"} />
              <Stat label="Max DD" value={`-${result.risk.maxDrawdown}%`} tone="loss" />
              <Stat label="Trend" value={result.technicals.trend} tone={result.technicals.trend === "bullish" ? "gain" : result.technicals.trend === "bearish" ? "loss" : "muted"} />
              <Stat label="Z-score" value={result.technicals.zScore.toFixed(2)} tone="muted" />
              <Stat label="Ann. Vol" value={`${result.technicals.annualVol}%`} tone="muted" />
              <Stat label="52w pos" value={`${result.posIn52w}%`} tone="muted" />
            </div>

            {/* Dossier */}
            <div className="p-5 sm:p-6 border-t border-black/5">
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-black/40 mb-3">Dossier · structure</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <DossierLine label="Support" v={`${sym}${result.technicals.support}`} />
                <DossierLine label="Resistance" v={`${sym}${result.technicals.resistance}`} />
                <DossierLine label="SMA 50" v={`${sym}${result.technicals.sma50}`} />
                <DossierLine label="SMA 200" v={`${sym}${result.technicals.sma200}`} />
              </div>
            </div>

            {result.headlines.length > 0 && (
              <div className="p-5 sm:p-6 border-t border-black/5">
                <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-black/40 mb-3">Recent headlines</div>
                <ul className="space-y-2">
                  {result.headlines.slice(0, 4).map((h, i) => (
                    <li key={i} className="text-sm text-black/75 leading-snug flex gap-2">
                      <span className="font-mono text-[10px] text-black/30 mt-1">{String(i + 1).padStart(2, "0")}</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA */}
            <div className="p-5 sm:p-6 border-t border-black/5 bg-black/[0.02] text-center">
              <p className="text-sm text-black/60 mb-3">
                This is one ticker. The terminal runs this across your entire book — with CLANK, geopolitics and learning loops layered on top.
              </p>
              <Button
                onClick={() => navigate("/dashboard")}
                className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-11 rounded-full"
              >
                Open the full terminal <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }

function Stat({ label, value, tone }: { label: string; value: string; tone: "gain" | "loss" | "muted" }) {
  const color = tone === "gain" ? "text-emerald-600" : tone === "loss" ? "text-red-600" : "text-black";
  return (
    <div className="bg-white p-4 text-center">
      <div className="font-mono text-[9px] uppercase tracking-wider text-black/40">{label}</div>
      <div className={`text-base font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function DossierLine({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-wider text-black/40">{label}</div>
      <div className="text-sm font-medium text-black mt-0.5">{v}</div>
    </div>
  );
}