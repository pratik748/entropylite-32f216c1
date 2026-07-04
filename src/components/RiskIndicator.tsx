import { Shield, AlertTriangle, XOctagon } from "lucide-react";

interface RiskIndicatorProps {
  level: "Low" | "Medium" | "High";
  keyRisks: string[];
}

const riskConfig = {
  Low: {
    icon: Shield,
    color: "text-gain",
    bg: "bg-gain/10",
    border: "border-gain/20",
    barWidth: "w-1/3",
    barColor: "bg-gain",
  },
  Medium: {
    icon: AlertTriangle,
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/20",
    barWidth: "w-2/3",
    barColor: "bg-warning",
  },
  High: {
    icon: XOctagon,
    color: "text-loss",
    bg: "bg-loss/10",
    border: "border-loss/20",
    barWidth: "w-full",
    barColor: "bg-loss",
  },
};

const RiskIndicator = ({ level, keyRisks }: RiskIndicatorProps) => {
  const config = riskConfig[level];
  const Icon = config.icon;

  return (
    <div className={`rounded-2xl border ${config.border} ${config.bg} p-5 sm:p-6 shadow-soft animate-slide-up`}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${config.color}`} />
        <h2 className="text-headline text-foreground">Risk</h2>
        <span className={`ml-auto rounded-full px-3 py-1 text-[13px] font-semibold ${config.color}`}>
          {level}
        </span>
      </div>

      <div className="mb-4 h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div className={`h-full rounded-full ${config.barColor} ${config.barWidth} transition-all duration-700 ease-out-expo`} />
      </div>

      <div className="space-y-2">
        <p className="text-caption-1 font-medium text-muted-foreground">Key risk events</p>
        {keyRisks.map((risk, i) => (
          <div key={i} className="flex items-start gap-2.5 text-footnote leading-relaxed text-secondary-foreground">
            <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${config.barColor}`} />
            {risk}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RiskIndicator;
