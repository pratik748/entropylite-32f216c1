import { Brain, CheckCircle, AlertTriangle, XCircle, Activity, Shield, BarChart3, TrendingUp } from "lucide-react";
import type { ParallelIntelligence } from "@/hooks/useParallelIntelligence";

interface Props {
  data: ParallelIntelligence;
  loading: boolean;
}

const IntelligenceConsensus = ({ data, loading }: Props) => {
  if (loading) {
    return (
      <div className="rounded-xl border border-primary/20 bg-card p-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-xs text-primary font-mono">Running 4 parallel AI models...</span>
        </div>
      </div>
    );
  }

  if (!data || data.models_active === 0) return null;

  const severityIcon = (type: string) => {
    if (type === "agreement") return <CheckCircle className="h-3 w-3 text-gain" />;
    return <AlertTriangle className="h-3 w-3 text-warning" />;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-3.5 w-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-foreground tracking-wide">AI CONSENSUS</h3>
            <p className="text-[9px] text-muted-foreground font-mono">{data.models_active} MODELS · CLOUDFLARE</p>
          </div>
        </div>
      </div>

      {/* Cross-validation signals */}
      {data.cross_validation.length > 0 && (
        <div className="space-y-1.5">
          {data.cross_validation.map((sig, i) => (
            <div key={i} className={`flex items-start gap-2 rounded-lg border p-2.5 ${
              sig.type === "agreement" ? "border-gain/20 bg-gain/5" : "border-warning/20 bg-warning/5"
            }`}>
              {severityIcon(sig.type)}
              <div>
                <p className="text-[10px] font-medium text-foreground">{sig.message}</p>
                <p className="text-[9px] text-muted-foreground">Confidence: {sig.confidence}%</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Model summaries grid */}
      <div className="grid grid-cols-2 gap-2">
        {data.market && (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] font-semibold text-foreground uppercase">Market</span>
            </div>
            <p className={`text-[10px] font-mono font-bold ${
              data.market.regime_assessment === "bull" ? "text-gain" : data.market.regime_assessment === "bear" ? "text-loss" : "text-warning"
            }`}>
              {data.market.regime_assessment?.toUpperCase()}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">{data.market.narrative}</p>
          </div>
        )}

        {data.anomaly && (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <Activity className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] font-semibold text-foreground uppercase">Anomaly</span>
            </div>
            <p className={`text-[10px] font-mono font-bold ${
              data.anomaly.portfolio_health > 70 ? "text-gain" : data.anomaly.portfolio_health > 40 ? "text-warning" : "text-loss"
            }`}>
              Health: {data.anomaly.portfolio_health}/100
            </p>
            <p className="text-[9px] text-muted-foreground">{data.anomaly.anomalies?.length || 0} anomalies detected</p>
          </div>
        )}

        {data.optimization && (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <BarChart3 className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] font-semibold text-foreground uppercase">Optimizer</span>
            </div>
            <p className={`text-[10px] font-mono font-bold ${
              data.optimization.rebalance_urgency === "high" ? "text-loss" : data.optimization.rebalance_urgency === "medium" ? "text-warning" : "text-gain"
            }`}>
              {data.optimization.rebalance_urgency?.toUpperCase() || "—"}
            </p>
            <p className="text-[9px] text-muted-foreground">Sharpe +{data.optimization.expected_sharpe_improvement?.toFixed(2)}</p>
          </div>
        )}

        {data.risk && (
          <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1 mb-1">
              <Shield className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] font-semibold text-foreground uppercase">Tail Risk</span>
            </div>
            <p className={`text-[10px] font-mono font-bold ${
              data.risk.overall_tail_risk_score > 70 ? "text-loss" : data.risk.overall_tail_risk_score > 40 ? "text-warning" : "text-gain"
            }`}>
              Score: {data.risk.overall_tail_risk_score}/100
            </p>
            <p className="text-[9px] text-muted-foreground">{data.risk.tail_risks?.length || 0} tail scenarios</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntelligenceConsensus;
