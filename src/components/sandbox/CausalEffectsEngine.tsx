import { useState, useCallback } from "react";
import { GitBranch, Zap, Loader2, AlertTriangle, TrendingUp, TrendingDown, Activity, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";

interface CausalNode {
  order: number;
  effect: string;
  asset_class: string;
  direction: string;
  magnitude: string;
  confidence: number;
  time_horizon: string;
}

interface ScenarioBranch {
  label: string;
  probability: number;
  capital_impact_pct: number;
  key_moves: string[];
}

interface CausalAnalysis {
  event: string;
  first_order: CausalNode[];
  second_order: CausalNode[];
  third_order: CausalNode[];
  scenario_tree: ScenarioBranch[];
  reflexivity_score: number;
  scar_tag: string;
}

interface Props {
  stocks: PortfolioStock[];
}

const PRESET_EVENTS = [
  "Iran-Israel military escalation",
  "Federal Reserve emergency rate cut",
  "China Taiwan strait blockade",
  "OPEC+ production collapse",
  "Major US bank failure",
  "Global semiconductor supply shock",
  "European energy crisis escalation",
  "India-Pakistan border tensions",
];

const CausalEffectsEngine = ({ stocks }: Props) => {
  const [event, setEvent] = useState("");
  const [analysis, setAnalysis] = useState<CausalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = useCallback(async (eventText: string) => {
    if (!eventText.trim()) return;
    setLoading(true);
    setEvent(eventText);
    try {
      const portfolio = stocks.filter(s => s.analysis).map(s => `${s.ticker} (${s.quantity} @ ${s.analysis?.currentPrice})`).join(", ");
      const { data: result, error } = await supabase.functions.invoke("causal-effects", {
        body: { event: eventText, portfolio },
      });
      if (error) throw error;
      setAnalysis(result);
    } catch (e) {
      console.error("Causal analysis error:", e);
    } finally {
      setLoading(false);
    }
  }, [stocks]);

  const orderColors = ["text-primary", "text-warning", "text-loss"];
  const orderLabels = ["1st Order · Immediate", "2nd Order · Ripple", "3rd Order · Structural"];

  return (
    <div className="space-y-4">
      {/* Event Input */}
      <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
        <div className="flex items-center gap-3 mb-3 relative z-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <GitBranch className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Causal Effects Engine</h3>
            <p className="text-[9px] text-muted-foreground font-mono tracking-wider">SECOND & THIRD ORDER SIMULATION</p>
          </div>
        </div>

        <div className="flex gap-2 mb-3 relative z-10">
          <input
            type="text"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyze(event)}
            placeholder="Enter geopolitical/economic event to simulate..."
            className="flex-1 rounded-lg glass-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/30 font-mono"
          />
          <Button onClick={() => analyze(event)} disabled={loading || !event.trim()} size="sm" className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Simulate
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 relative z-10">
          {PRESET_EVENTS.map((pe) => (
            <button key={pe} onClick={() => analyze(pe)}
              className="glass-subtle rounded-lg px-2 py-1 text-[9px] font-mono text-muted-foreground hover:text-foreground transition-all hover:border-primary/20">
              {pe}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="glass-panel rounded-xl p-12 text-center relative">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3 relative z-10" />
          <p className="text-sm text-muted-foreground font-mono relative z-10">Simulating causal chains...</p>
          <p className="text-[9px] text-muted-foreground/50 font-mono mt-1 relative z-10">Mapping 2nd & 3rd order effects across assets, regions, and time</p>
        </div>
      )}

      {analysis && !loading && (
        <>
          {/* Scenario Tree */}
          <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
              <Activity className="h-3.5 w-3.5 text-primary" /> Probabilistic Scenario Tree
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 relative z-10">
              {analysis.scenario_tree.map((branch, i) => {
                const isPositive = branch.capital_impact_pct >= 0;
                return (
                  <div key={i} className={`glass-card rounded-lg p-3 sm:p-4 ${isPositive ? "glass-glow-gain" : "glass-glow-loss"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-foreground uppercase">{branch.label}</span>
                      <span className="rounded bg-surface-3 px-2 py-0.5 text-[9px] font-mono text-muted-foreground">
                        {(branch.probability * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mb-2">
                      {isPositive ? <TrendingUp className="h-4 w-4 text-gain" /> : <TrendingDown className="h-4 w-4 text-loss" />}
                      <span className={`font-mono text-lg font-black ${isPositive ? "text-gain" : "text-loss"}`}>
                        {isPositive ? "+" : ""}{branch.capital_impact_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="space-y-1">
                      {branch.key_moves.map((m, j) => (
                        <p key={j} className="text-[9px] text-muted-foreground leading-snug">• {m}</p>
                      ))}
                    </div>
                    {/* Probability bar */}
                    <div className="mt-2 h-1 rounded-full bg-surface-3 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-1000 ${isPositive ? "bg-gain" : "bg-loss"}`}
                        style={{ width: `${branch.probability * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Causal Chain */}
          {[analysis.first_order, analysis.second_order, analysis.third_order].map((order, oi) => (
            order.length > 0 && (
              <div key={oi} className="glass-panel rounded-xl p-4 sm:p-5 relative">
                <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10 ${orderColors[oi]}`}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-[9px] font-mono">{oi + 1}</span>
                  {orderLabels[oi]}
                  <span className="ml-auto text-[8px] text-muted-foreground font-normal">{order.length} effects</span>
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 relative z-10">
                  {order.map((node, i) => (
                    <div key={i} className="glass-subtle rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase">{node.asset_class}</span>
                        <span className={`text-[9px] font-mono font-bold ${node.direction === "up" ? "text-gain" : node.direction === "down" ? "text-loss" : "text-warning"}`}>
                          {node.direction === "up" ? "▲" : node.direction === "down" ? "▼" : "◆"} {node.magnitude}
                        </span>
                      </div>
                      <p className="text-[10px] text-foreground leading-snug mb-1">{node.effect}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] text-muted-foreground font-mono">{node.time_horizon}</span>
                        <div className="flex items-center gap-1">
                          <div className="h-1 w-12 rounded-full bg-surface-3 overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${node.confidence * 100}%` }} />
                          </div>
                          <span className="text-[8px] font-mono text-muted-foreground">{(node.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}

          {/* Reflexivity & Scar */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="glass-panel rounded-xl p-4 relative">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-2 relative z-10">Reflexivity Risk</h3>
              <div className="flex items-end gap-2 relative z-10">
                <span className={`font-mono text-3xl font-black ${analysis.reflexivity_score > 70 ? "text-loss" : analysis.reflexivity_score > 40 ? "text-warning" : "text-gain"}`}>
                  {analysis.reflexivity_score}
                </span>
                <span className="text-[9px] text-muted-foreground mb-1">/100</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-surface-3 overflow-hidden relative z-10">
                <div className={`h-full rounded-full transition-all ${analysis.reflexivity_score > 70 ? "bg-loss" : analysis.reflexivity_score > 40 ? "bg-warning" : "bg-gain"}`}
                  style={{ width: `${analysis.reflexivity_score}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-2 relative z-10">Measures feedback loop amplification risk</p>
            </div>
            <div className="glass-panel rounded-xl p-4 relative">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-2 relative z-10">Scar Memory Tag</h3>
              <p className="text-sm text-foreground font-mono relative z-10">{analysis.scar_tag}</p>
              <p className="text-[9px] text-muted-foreground mt-2 relative z-10">Pattern reinforcement for future simulations</p>
            </div>
          </div>
        </>
      )}

      {!analysis && !loading && (
        <div className="glass-panel rounded-xl py-16 text-center relative">
          <GitBranch className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4 relative z-10" />
          <h3 className="text-lg font-semibold text-foreground mb-2 relative z-10">No Simulation Active</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto relative z-10">
            Select or type a geopolitical/economic event above to simulate second and third-order causal effects across all asset classes.
          </p>
        </div>
      )}
    </div>
  );
};

export default CausalEffectsEngine;
