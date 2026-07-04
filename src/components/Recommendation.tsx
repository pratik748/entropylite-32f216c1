import { Brain, Shield, Target, Globe, Radio } from "lucide-react";
import { cleanAIText } from "@/lib/utils";
import { getScenarioConfig, MICRO_DISCLAIMER } from "@/lib/sebiCompliance";

interface RecommendationProps {
  summary: string;
  suggestion: "Hold" | "Add" | "Exit" | "Skip";
  confidence: number;
  confidenceReasoning?: string;
  macroFactors: string[];
  verdict?: string;
  hedgeStrategy?: string;
  liveWebContext?: string;
}

const Recommendation = ({ summary, suggestion, confidence, confidenceReasoning, macroFactors, verdict, hedgeStrategy, liveWebContext }: RecommendationProps) => {
  const config = getScenarioConfig(suggestion);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-soft animate-slide-up">
      <div className="mb-5 flex items-center gap-2">
        <Brain className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-headline text-foreground">Scenario assessment</h2>
      </div>

      {/* Scenario Banner, top prominence */}
      {verdict && (
        <div className={`mb-4 rounded-xl border ${config.border} ${config.bg} p-4`}>
          <div className="flex items-start gap-3">
            <Target className={`h-5 w-5 mt-0.5 shrink-0 ${config.color}`} />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-caption-1 font-medium text-muted-foreground">Scenario outlook</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-3/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Globe className="h-2.5 w-2.5" /> Consensus
                </span>
              </div>
              <p className={`text-subheadline font-semibold leading-snug ${config.color}`}>{cleanAIText(verdict)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-title-2 tabular ${config.color}`}>{config.label}</p>
              <p className="text-headline text-foreground tabular">{confidence}%</p>
              <p className="text-caption-2 text-muted-foreground mt-0.5">confidence</p>
            </div>
          </div>
        </div>
      )}

      {/* Fallback if no verdict */}
      {!verdict && (
        <div className={`mb-5 rounded-xl border ${config.border} ${config.bg} p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-caption-1 font-medium text-muted-foreground">Scenario outlook</p>
              <p className={`mt-1 text-title-2 ${config.color}`}>{config.label}</p>
            </div>
            <div className="text-right">
              <p className="text-caption-1 font-medium text-muted-foreground">Confidence</p>
              <p className="mt-1 text-title-2 text-foreground tabular">{confidence}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Hedge Strategy */}
      {hedgeStrategy && (
        <div className="mb-5 rounded-xl border border-info/15 bg-info/5 p-4">
          <div className="flex items-start gap-3">
            <Shield className="h-4 w-4 mt-0.5 shrink-0 text-info" />
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-caption-1 font-medium text-muted-foreground">Invalidation hedge</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-3/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  <Globe className="h-2.5 w-2.5" /> Consensus
                </span>
              </div>
              <p className="text-footnote leading-relaxed text-foreground">{cleanAIText(hedgeStrategy)}</p>
            </div>
          </div>
        </div>
      )}

      {confidenceReasoning && (
        <div className="mb-5">
          <p className="mb-1 text-caption-1 font-medium text-muted-foreground">Why this confidence</p>
          <p className="text-footnote leading-relaxed text-secondary-foreground">{cleanAIText(confidenceReasoning)}</p>
        </div>
      )}

      {liveWebContext && liveWebContext.trim().length > 20 && (
        <div className="mb-5 rounded-xl border border-border/70 bg-surface-2/60 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Radio className="h-4 w-4 text-info animate-breathe" />
            <p className="text-caption-1 font-semibold text-foreground">Live web pulse</p>
            <span className="text-caption-2 text-muted-foreground">· Real-time search grounding</span>
          </div>
          <pre className="whitespace-pre-wrap text-caption-1 leading-relaxed text-secondary-foreground font-sans">{cleanAIText(liveWebContext).replace(/^## LIVE WEB CONTEXT[^\n]*\n/, "").trim()}</pre>
        </div>
      )}

      <div className="mb-5">
        <p className="mb-2 text-caption-1 font-medium text-muted-foreground">Summary</p>
        <p className="text-footnote leading-relaxed text-secondary-foreground">{cleanAIText(summary)}</p>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-caption-1 font-medium text-muted-foreground">Macro factors</p>
        <div className="flex flex-wrap gap-1.5">
          {macroFactors.map((f, i) => (
            <span key={i} className="rounded-full bg-surface-3/80 px-3 py-1 text-caption-1 text-muted-foreground">
              {cleanAIText(f)}
            </span>
          ))}
        </div>
      </div>

      {/* Micro disclaimer */}
      <p className="text-[10px] text-muted-foreground/50 mt-4 border-t border-border/40 pt-3 leading-relaxed">
        {MICRO_DISCLAIMER}
      </p>
    </div>
  );
};

export default Recommendation;
