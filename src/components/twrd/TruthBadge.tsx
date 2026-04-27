import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface TruthBadgeProps {
  T: number;                           // 0..1
  contradictionRisk?: number;          // 0..1
  falseConsensus?: boolean;
  kSources?: number;
  className?: string;
  compact?: boolean;
}

/** Compact veracity chip — surfaces TWRD truth confidence next to any signal. */
export default function TruthBadge({
  T, contradictionRisk = 0, falseConsensus = false, kSources, className, compact,
}: TruthBadgeProps) {
  const pct = Math.round(Math.max(0, Math.min(1, T)) * 100);
  const tone =
    falseConsensus ? "loss" :
    pct >= 70 ? "gain" :
    pct >= 45 ? "warning" : "loss";

  const Icon = falseConsensus ? AlertTriangle : pct >= 70 ? ShieldCheck : ShieldAlert;
  const cls =
    tone === "gain" ? "bg-gain/10 text-gain border-gain/30" :
    tone === "warning" ? "bg-warning/10 text-warning border-warning/30" :
    "bg-loss/10 text-loss border-loss/30";

  const label = falseConsensus ? "FALSE CONSENSUS" : `TRUTH ${pct}%`;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={`gap-1 font-mono text-[10px] tracking-wider border ${cls} ${className ?? ""}`}>
            <Icon className="h-3 w-3" />
            {compact ? `T ${pct}%` : label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <div className="space-y-1">
            <div><strong>Truth confidence:</strong> {pct}%</div>
            {typeof kSources === "number" && (
              <div><strong>Independent sources:</strong> {kSources}</div>
            )}
            <div><strong>Contradiction risk:</strong> {Math.round(contradictionRisk * 100)}%</div>
            {falseConsensus && (
              <div className="text-loss">High agreement with low source diversity — reduce size.</div>
            )}
            <div className="text-muted-foreground">TWRD Veracity Layer (T(x,t))</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}