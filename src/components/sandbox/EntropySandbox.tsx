import { useState } from "react";
import {
  Zap, Brain, Target, Crosshair, Shield, BarChart3, Skull,
  Activity, TrendingUp, Layers, Radio, GitBranch, ScatterChart, Dna,
} from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useAIProvider } from "@/hooks/useAIProvider";
import StrategyLab from "./StrategyLab";
import MonteCarloEngine from "./MonteCarloEngine";
import AftermathMatrix from "./AftermathMatrix";
import IntelligenceLayers from "./IntelligenceLayers";
import ExecutionEngine from "./ExecutionEngine";
import PortfolioCommandCenter from "./PortfolioCommandCenter";
import ScarMemory from "./ScarMemory";
import CrownLayer from "./CrownLayer";
import CausalEffectsEngine from "./CausalEffectsEngine";
import StatArbEngine from "./StatArbEngine";
import StrategyFactory from "./StrategyFactory";

interface Props {
  stocks: PortfolioStock[];
}

const sections = [
  { id: "strategy", label: "Strategy Lab", icon: Brain, desc: "Auto-generated strategies ranked by Sharpe, drawdown, reflexivity" },
  { id: "montecarlo", label: "Scenario Engine", icon: Activity, desc: "10K-path Monte Carlo with tail risk, CVaR, ruin probability" },
  { id: "statarb", label: "Stat Arb", icon: ScatterChart, desc: "Pure math: GBM, GARCH, Cholesky, Markowitz, Kalman, VaR" },
  { id: "causal", label: "Causal Effects", icon: GitBranch, desc: "2nd & 3rd order effects engine with reflexivity feedback loops" },
  { id: "aftermath", label: "Aftermath Matrix", icon: Crosshair, desc: "Simulate your own market impact before execution" },
  { id: "intelligence", label: "Deep Intelligence", icon: Radio, desc: "Management DNA, Capital Flow, Narrative, Structural Risk" },
  { id: "crown", label: "Risk→Profit", icon: TrendingUp, desc: "Convert risk signals into actionable $$ opportunities" },
  { id: "execution", label: "Execution Engine", icon: Target, desc: "VWAP/TWAP slicing, dark pool routing, liquidity-aware sizing" },
  { id: "command", label: "Command Center", icon: Layers, desc: "Portfolio heatmap, risk constellation, liquidity radar" },
  { id: "scar", label: "Scar Memory", icon: Skull, desc: "Track past mistakes and lessons — never repeat errors" },
  { id: "factory", label: "Strategy Factory", icon: Dna, desc: "AI evolution machine — autonomous strategy discovery & ranking" },
] as const;

type SectionId = typeof sections[number]["id"];

const EntropySandbox = ({ stocks }: Props) => {
  const [activeSection, setActiveSection] = useState<SectionId>("strategy");
  const { provider, toggle, providerLabel } = useAIProvider();
  const analyzed = stocks.filter(s => s.analysis);

  const renderSection = () => {
    switch (activeSection) {
      case "strategy": return <StrategyLab stocks={stocks} />;
      case "montecarlo": return <MonteCarloEngine stocks={stocks} />;
      case "statarb": return <StatArbEngine stocks={stocks} />;
      case "causal": return <CausalEffectsEngine stocks={stocks} />;
      case "aftermath": return <AftermathMatrix stocks={stocks} />;
      case "intelligence": return <IntelligenceLayers stocks={stocks} />;
      case "crown": return <CrownLayer stocks={stocks} />;
      case "execution": return <ExecutionEngine stocks={stocks} />;
      case "command": return <PortfolioCommandCenter stocks={stocks} />;
      case "scar": return <ScarMemory />;
      case "factory": return <StrategyFactory stocks={stocks} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel rounded-xl p-5 relative">
        <div className="flex items-center gap-3 mb-1 relative z-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Entropy Simulation Sandbox</h2>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
              PREDICTION + AFTERMATH ENGINE · {analyzed.length} ASSETS LOADED
            </p>
          </div>
        </div>
      </div>

      {/* Section Selector */}
      <div className="glass-panel rounded-xl p-3 relative">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 relative z-10">
          {sections.map((s) => {
            const Icon = s.icon;
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`group flex flex-col items-start rounded-lg px-3 py-2.5 text-left transition-all ${
                  active
                    ? "glass-panel glass-glow-primary text-foreground"
                    : "glass-subtle text-muted-foreground hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">{s.label}</span>
                </div>
                <span className={`text-[9px] leading-tight ${active ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                  {s.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="animate-fade-in">
        {analyzed.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-20 text-center">
            <Zap className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Assets Loaded</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Add and analyze stocks in the Dashboard tab to power the simulation engine.
              Entropy requires real portfolio data to generate strategies, run simulations, and detect opportunities.
            </p>
          </div>
        ) : (
          renderSection()
        )}
      </div>
    </div>
  );
};

export default EntropySandbox;
