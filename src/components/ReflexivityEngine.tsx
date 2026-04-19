import { useMemo } from "react";
import { Eye, AlertTriangle, Zap, Brain, Activity, Target, ArrowRight, RefreshCw, GitMerge } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useReflexivity } from "@/hooks/useReflexivity";
import { useInstitutionalFlows } from "@/hooks/useInstitutionalFlows";
import { useMarketRegime } from "@/hooks/useMarketRegime";
import { governedInvoke } from "@/lib/apiGovernor";
import { useEffect, useState } from "react";
import type { PortfolioStock } from "@/components/PortfolioPanel";

interface Props {
  stocks: PortfolioStock[];
  refreshKey?: number;
}

export default function ReflexivityEngine({ stocks, refreshKey }: Props) {
  const tickers = useMemo(() => stocks.filter((s) => s.analysis).map((s) => s.ticker), [stocks]);
  const { data: flowsData } = useInstitutionalFlows(tickers);
  const marketRegime = useMarketRegime();
  const regime = marketRegime?.regime;
  const vix = marketRegime?.vix;

  const [sentiment, setSentiment] = useState<any>(null);
  const [causal, setCausal] = useState<any>(null);

  // Pull sentiment intel (composite belief proxy)
  useEffect(() => {
    let alive = true;
    governedInvoke("sentiment-intel", { body: {} }).then(({ data }) => {
      if (alive && data) setSentiment(data);
    });
    return () => { alive = false; };
  }, [refreshKey]);

  // Pull a portfolio-wide causal cascade for reflexivity context
  useEffect(() => {
    let alive = true;
    if (tickers.length === 0) return;
    governedInvoke("causal-effects", {
      body: {
        event: `Reflexivity scan: institutional consensus on ${tickers.slice(0, 5).join(", ")} under ${regime || "current"} regime`,
        portfolio: tickers.join(", "),
      },
    }).then(({ data }) => { if (alive && data) setCausal(data); });
    return () => { alive = false; };
  }, [tickers.join(","), regime, refreshKey]);

  const reflexInput = useMemo(() => ({
    flows: flowsData ? [
      // Translate institutional flow aggregates into the engine's signal shape
      ...(flowsData.optionsFlow || []).map((o: any) => ({
        direction: o.signal === "bullish" ? "BUY" : o.signal === "bearish" ? "SELL" : "NEUTRAL",
        intensity: Math.min(100, (o.totalCallVolume + o.totalPutVolume) / 1000),
        impact: o.unusualActivity ? 80 : 50,
        category: "OPTIONS",
        name: `${o.ticker} options flow`,
      })),
      ...(flowsData.etfFlows || []).map((e: any) => ({
        direction: e.flowSignal === "inflow" ? "BUY" : e.flowSignal === "outflow" ? "SELL" : "NEUTRAL",
        intensity: Math.min(100, Math.abs(e.change) * 10),
        impact: 60,
        category: "FLOW",
        name: `${e.symbol} ETF flow`,
      })),
    ] : [],
    sentiment,
    causal,
    vix,
    regime,
    portfolio: stocks.map((s) => ({ ticker: s.ticker })),
  }), [flowsData, sentiment, causal, vix, regime, stocks]);

  const { data, loading, error, refresh } = useReflexivity(reflexInput, refreshKey);

  if (tickers.length === 0) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Brain className="h-10 w-10 text-muted-foreground mb-3" />
          <h3 className="font-mono text-sm uppercase tracking-wider text-foreground mb-1">Reflexivity Engine</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Add positions to map belief about belief. The engine fuses institutional flows, narrative sentiment, and causal cascades into a real-time contradiction map.
          </p>
        </div>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
          <div className="flex-1">
            <h3 className="font-mono text-xs uppercase tracking-wider text-foreground mb-1">Reflexivity Engine — Unavailable</h3>
            <p className="text-[11px] text-muted-foreground mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={refresh} className="h-7 text-[10px] font-mono uppercase tracking-wider">
              <RefreshCw className="h-3 w-3 mr-1.5" /> Retry
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <Card className="p-6 bg-card border-border">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-4 w-4 text-primary animate-spin" />
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Computing belief map — fusing flows, sentiment, causal cascades…
          </span>
        </div>
      </Card>
    );
  }

  const { consensus, conviction, contradictions, shiftETA, thesis, actionable, signalCount } = data;

  const directionColor =
    consensus.direction > 10 ? "text-gain" :
    consensus.direction < -10 ? "text-loss" : "text-warning";
  const shiftColor =
    shiftETA.probability > 50 ? "text-loss" :
    shiftETA.probability > 25 ? "text-warning" : "text-muted-foreground";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-sm bg-primary/10">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="font-mono text-sm uppercase tracking-widest text-foreground">Reflexivity Engine</h2>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              What the market believes the market believes — and where it's wrong
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} className="h-7 text-[10px] font-mono uppercase tracking-wider">
          <RefreshCw className="h-3 w-3 mr-1.5" /> Recompute
        </Button>
      </div>

      {/* Top row: Consensus / Conviction / Shift ETA */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Consensus</span>
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className={`text-2xl font-mono font-bold ${directionColor}`}>
            {consensus.direction > 0 ? "+" : ""}{consensus.direction}
          </div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-foreground mt-1">{consensus.label}</div>
          <div className="mt-3 space-y-1">
            <ComponentBar label="Flow" value={consensus.components.flow} />
            <ComponentBar label="Sentiment" value={consensus.components.sentiment} />
            <ComponentBar label="Causal" value={consensus.components.causal} />
          </div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Conviction</span>
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="text-2xl font-mono font-bold text-foreground">{conviction.score}</div>
          <div className="text-[11px] font-mono uppercase tracking-wider text-foreground mt-1">{conviction.label}</div>
          <div className="mt-3">
            <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Signal spread</div>
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className={`h-full ${conviction.spread > 50 ? "bg-loss" : conviction.spread > 25 ? "bg-warning" : "bg-gain"}`}
                style={{ width: `${Math.min(100, conviction.spread)}%` }}
              />
            </div>
            <div className="text-[10px] font-mono text-muted-foreground mt-1">σ = {conviction.spread}</div>
          </div>
        </Card>

        <Card className="p-4 bg-card border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Shift ETA</span>
            <Zap className={`h-3.5 w-3.5 ${shiftColor}`} />
          </div>
          <div className={`text-2xl font-mono font-bold ${shiftColor}`}>{shiftETA.probability}%</div>
          <div className={`text-[11px] font-mono uppercase tracking-wider mt-1 ${shiftColor}`}>{shiftETA.label}</div>
          <div className="mt-3 flex items-center gap-2">
            <Badge variant="outline" className="text-[9px] font-mono uppercase">
              Window: {shiftETA.window}
            </Badge>
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-2">
            Pressure: {shiftETA.pressure} · {signalCount}/3 signals
          </div>
        </Card>
      </div>

      {/* Reflexivity Thesis */}
      <Card className="p-4 bg-surface-1 border-primary/30">
        <div className="flex items-start gap-3">
          <div className="p-1.5 rounded-sm bg-primary/10 mt-0.5">
            <GitMerge className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-mono uppercase tracking-widest text-primary mb-1.5">Reflexivity Thesis</div>
            {thesis ? (
              <p className="text-sm text-foreground leading-relaxed font-light italic">"{thesis}"</p>
            ) : (
              <p className="text-xs text-muted-foreground font-mono">
                Narrative layer temporarily unavailable. Math signals above are live and unaffected.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Contradictions */}
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            <h3 className="font-mono text-xs uppercase tracking-widest text-foreground">Internal Contradictions</h3>
          </div>
          <Badge variant="outline" className="text-[9px] font-mono uppercase">
            {contradictions.length} detected
          </Badge>
        </div>
        {contradictions.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center font-mono">
            All signals aligned. No belief breakage detected.
          </div>
        ) : (
          <div className="space-y-2">
            {contradictions.map((c, i) => (
              <div key={i} className="border-l-2 border-warning/60 pl-3 py-1.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-foreground">{c.pair}</span>
                  <Badge variant="outline" className="text-[9px] font-mono">
                    Gap {c.gap}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{c.description}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Actionable */}
      {actionable && (
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-3.5 w-3.5 text-gain" />
            <h3 className="font-mono text-xs uppercase tracking-widest text-foreground">Asymmetric Expression</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ActionCell label="Confirmation Trigger" value={actionable.trigger} icon={<ArrowRight className="h-3 w-3 text-primary" />} />
            <ActionCell label="Trade Expression" value={actionable.trade} icon={<Target className="h-3 w-3 text-gain" />} />
            <ActionCell label="Invalidation Risk" value={actionable.risk} icon={<AlertTriangle className="h-3 w-3 text-loss" />} />
          </div>
        </Card>
      )}
    </div>
  );
}

function ComponentBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.abs(value));
  const color = value > 0 ? "bg-gain" : value < 0 ? "bg-loss" : "bg-muted-foreground";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-mono uppercase text-muted-foreground w-16">{label}</span>
      <div className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden relative">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <div
          className={`absolute top-0 bottom-0 ${color}`}
          style={{
            width: `${pct / 2}%`,
            left: value >= 0 ? "50%" : `${50 - pct / 2}%`,
          }}
        />
      </div>
      <span className={`text-[10px] font-mono w-8 text-right ${value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-muted-foreground"}`}>
        {value > 0 ? "+" : ""}{value}
      </span>
    </div>
  );
}

function ActionCell({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="border border-border rounded-sm p-3 bg-surface-1">
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon}
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      </div>
      <p className="text-[11px] text-foreground leading-relaxed">{value}</p>
    </div>
  );
}
