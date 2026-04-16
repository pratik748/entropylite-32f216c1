import { Brain, ArrowRight, Shield, Target, Globe } from "lucide-react";
import { cleanAIText } from "@/lib/utils";

interface RecommendationProps {
  summary: string;
  suggestion: "Hold" | "Add" | "Exit";
  confidence: number;
  confidenceReasoning?: string;
  macroFactors: string[];
  verdict?: string;
  hedgeStrategy?: string;
}

const suggestionConfig = {
  Hold: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/20", label: "HOLD" },
  Add: { color: "text-gain", bg: "bg-gain/10", border: "border-gain/20", label: "ADD" },
  Exit: { color: "text-loss", bg: "bg-loss/10", border: "border-loss/20", label: "EXIT" },
};

const Recommendation = ({ summary, suggestion, confidence, confidenceReasoning, macroFactors, verdict, hedgeStrategy }: RecommendationProps) => {
  const config = suggestionConfig[suggestion];

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-5 flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">AI Recommendation</h2>
      </div>

      {/* Verdict Banner — top prominence */}
      {verdict && (
        <div className={`mb-4 rounded-lg border-2 ${config.border} ${config.bg} p-4`}>
          <div className="flex items-start gap-3">
            <Target className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Verdict</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-widest text-primary">
                  <Globe className="h-2.5 w-2.5" /> Consensus
                </span>
              </div>
              <p className={`text-sm sm:text-base font-semibold leading-snug ${config.color}`}>{cleanAIText(verdict)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`font-mono text-2xl font-bold ${config.color}`}>{config.label}</p>
              <p className="font-mono text-lg font-bold text-foreground">{confidence}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Fallback if no verdict */}
      {!verdict && (
        <div className={`mb-5 rounded-lg border ${config.border} ${config.bg} p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Suggestion</p>
              <p className={`mt-1 font-mono text-2xl font-bold ${config.color}`}>{suggestion}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className="mt-1 font-mono text-2xl font-bold text-foreground">{confidence}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Hedge Strategy */}
      {hedgeStrategy && (
        <div className="mb-5 rounded-lg border border-info/20 bg-info/5 p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 mt-0.5 shrink-0 text-info" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Hedge if Wrong</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-widest text-primary">
                  <Globe className="h-2.5 w-2.5" /> Consensus
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground">{cleanAIText(hedgeStrategy)}</p>
            </div>
          </div>
        </div>
      )}

      {confidenceReasoning && (
        <div className="mb-5">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Confidence Reasoning</p>
          <p className="text-sm leading-relaxed text-secondary-foreground italic">{cleanAIText(confidenceReasoning)}</p>
        </div>
      )}

      <div className="mb-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Analysis Summary</p>
        <p className="text-sm leading-relaxed text-secondary-foreground">{cleanAIText(summary)}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Macro Factors</p>
        <div className="flex flex-wrap gap-2">
          {macroFactors.map((f, i) => (
            <span key={i} className="rounded-md bg-surface-3 px-2.5 py-1 text-xs text-muted-foreground">
              {cleanAIText(f)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Recommendation;
