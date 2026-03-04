import { useState, useEffect, useCallback } from "react";
import { Sparkles, TrendingUp, TrendingDown, Shield, Clock, Target, Plus, Loader2, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getCurrencySymbol, formatCurrency } from "@/lib/currency";
import { type PortfolioStock } from "@/components/PortfolioPanel";

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
  priceChange24h: number;
  priceVerified: boolean;
}

interface Props {
  stocks: PortfolioStock[];
  onAddToPortfolio: (ticker: string, price: number, qty: number) => void;
}

const tagColors: Record<string, string> = {
  momentum: "bg-blue-500/10 text-blue-400",
  value: "bg-green-500/10 text-green-400",
  defensive: "bg-amber-500/10 text-amber-400",
  growth: "bg-purple-500/10 text-purple-400",
  contrarian: "bg-red-500/10 text-red-400",
  macro: "bg-cyan-500/10 text-cyan-400",
};

const DesirableAssets = ({ stocks, onAddToPortfolio }: Props) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [marketCondition, setMarketCondition] = useState("");
  const [loading, setLoading] = useState(true);
  const [addedTickers, setAddedTickers] = useState<Set<string>>(new Set());

  const existingTickers = stocks.map(s => s.ticker);

  const fetchRecommendations = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const totalValue = stocks.reduce((s, st) => s + (st.analysis?.currentPrice || st.buyPrice) * st.quantity, 0);
      const { data, error } = await supabase.functions.invoke("desirable-assets", {
        body: { portfolioTickers: existingTickers, portfolioValue: totalValue || 100000 },
      });
      if (error) throw error;
      setRecommendations(data.recommendations || []);
      setMarketCondition(data.marketCondition || "");
    } catch (e) {
      console.error("Desirable assets error:", e);
    } finally {
      setLoading(false);
    }
  }, [stocks.length]);

  useEffect(() => {
    fetchRecommendations();
    const interval = setInterval(() => fetchRecommendations(false), 60000);
    return () => clearInterval(interval);
  }, [fetchRecommendations]);

  const handleAdd = (rec: Recommendation) => {
    const price = rec.realPrice || rec.currentEstPrice;
    onAddToPortfolio(rec.ticker, price, rec.suggestedQty || 1);
    setAddedTickers(prev => new Set(prev).add(rec.ticker));
  };

  if (loading && recommendations.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Scanning global markets for opportunities...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Desirable Assets</h2>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
              AI + QUANT HYBRID RECOMMENDATIONS · REAL-TIME
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">60s refresh</span>
          <Button size="sm" variant="ghost" onClick={() => fetchRecommendations(false)} className="h-7 gap-1.5 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Market Condition Banner */}
      {marketCondition && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Market Assessment</span>
          </div>
          <p className="text-sm text-foreground">{marketCondition}</p>
        </div>
      )}

      {/* Recommendation Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {recommendations.map((rec, i) => {
          const price = rec.realPrice || rec.currentEstPrice;
          const sym = getCurrencySymbol(rec.realCurrency || rec.currency);
          const upside = price > 0 ? ((rec.targetPrice - price) / price * 100) : 0;
          const downside = price > 0 ? ((rec.stopLoss - price) / price * 100) : 0;
          const inZone = price >= rec.entryZone[0] && price <= rec.entryZone[1];
          const alreadyOwned = existingTickers.includes(rec.ticker);
          const justAdded = addedTickers.has(rec.ticker);

          return (
            <div key={rec.ticker} className={`rounded-xl border bg-card p-5 transition-all hover:border-primary/20 ${i < 2 ? "border-primary/30" : "border-border"}`}>
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-base font-bold text-foreground">{rec.ticker}</span>
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">{rec.assetClass}</span>
                  {i < 2 && <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-mono text-primary">TOP PICK</span>}
                  {rec.priceVerified && <span className="rounded bg-gain/10 px-1 py-0.5 text-[8px] text-gain">✓</span>}
                </div>
                <div className="flex items-center gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono font-bold ${rec.confidence >= 75 ? "bg-gain/10 text-gain" : rec.confidence >= 50 ? "bg-warning/10 text-warning" : "bg-loss/10 text-loss"}`}>
                    {rec.confidence}%
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-1">{rec.name}</p>
              <p className="text-[11px] text-secondary-foreground leading-relaxed mb-3">{rec.thesis}</p>

              {/* Price Grid */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div>
                  <p className="text-[8px] text-muted-foreground uppercase">Current</p>
                  <p className="font-mono text-sm font-bold text-foreground">{sym}{price.toLocaleString()}</p>
                  <p className={`font-mono text-[9px] ${rec.priceChange24h >= 0 ? "text-gain" : "text-loss"}`}>
                    {rec.priceChange24h >= 0 ? "+" : ""}{rec.priceChange24h.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-[8px] text-muted-foreground uppercase">Target</p>
                  <p className="font-mono text-sm font-bold text-gain">{sym}{rec.targetPrice.toLocaleString()}</p>
                  <p className="font-mono text-[9px] text-gain">+{upside.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[8px] text-muted-foreground uppercase">Stop Loss</p>
                  <p className="font-mono text-sm font-bold text-loss">{sym}{rec.stopLoss.toLocaleString()}</p>
                  <p className="font-mono text-[9px] text-loss">{downside.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[8px] text-muted-foreground uppercase">R:R</p>
                  <p className="font-mono text-sm font-bold text-foreground">{rec.riskReward}</p>
                  <p className="text-[9px] text-muted-foreground">{rec.timeHorizon}</p>
                </div>
              </div>

              {/* Entry Zone */}
              <div className={`rounded-lg px-3 py-2 mb-3 text-[10px] font-mono ${inZone ? "bg-gain/10 text-gain border border-gain/20" : "bg-surface-2 text-muted-foreground"}`}>
                <span className="font-bold">{inZone ? "✓ IN ENTRY ZONE" : "ENTRY ZONE"}</span>: {sym}{rec.entryZone[0].toLocaleString()} – {sym}{rec.entryZone[1].toLocaleString()}
                {inZone && " · BUY SIGNAL ACTIVE"}
              </div>

              {/* Catalyst & Hedge */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-[10px]">
                <div className="rounded-lg bg-surface-2 p-2">
                  <p className="text-muted-foreground mb-0.5 flex items-center gap-1"><Target className="h-2.5 w-2.5" /> Catalyst</p>
                  <p className="text-foreground">{rec.catalyst}</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-2">
                  <p className="text-muted-foreground mb-0.5 flex items-center gap-1"><Shield className="h-2.5 w-2.5" /> Hedge</p>
                  <p className="text-foreground">{rec.hedgingStrategy}</p>
                </div>
              </div>

              {/* Tags */}
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {rec.tags?.map(tag => (
                    <span key={tag} className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${tagColors[tag] || "bg-surface-3 text-muted-foreground"}`}>
                      {tag}
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
