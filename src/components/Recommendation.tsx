import { Brain, ArrowRight } from "lucide-react";

interface RecommendationProps {
  summary: string;
  suggestion: "Hold" | "Add" | "Exit";
  confidence: number;
  confidenceReasoning?: string;
  macroFactors: string[];
}

const suggestionConfig = {
  Hold: { color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
  Add: { color: "text-gain", bg: "bg-gain/10", border: "border-gain/20" },
  Exit: { color: "text-loss", bg: "bg-loss/10", border: "border-loss/20" },
};

const Recommendation = ({ summary, suggestion, confidence, confidenceReasoning, macroFactors }: RecommendationProps) => {
  const config = suggestionConfig[suggestion];

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-5 flex items-center gap-2">
        <Brain className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">AI Recommendation</h2>
      </div>

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

      {confidenceReasoning && (
        <div className="mb-5">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Confidence Reasoning</p>
          <p className="text-sm leading-relaxed text-secondary-foreground italic">{confidenceReasoning}</p>
        </div>
      )}

      <div className="mb-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Analysis Summary</p>
        <p className="text-sm leading-relaxed text-secondary-foreground">{summary}</p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Indian Macro Factors Considered</p>
        <div className="flex flex-wrap gap-2">
          {macroFactors.map((f, i) => (
            <span key={i} className="rounded-md bg-surface-3 px-2.5 py-1 text-xs text-muted-foreground">
              {f}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Recommendation;
