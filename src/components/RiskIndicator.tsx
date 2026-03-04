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
    <div className={`glass-card rounded-2xl border ${config.border} p-6 animate-slide-up`}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${config.color}`} />
        <h2 className="text-base font-semibold text-foreground">Risk Level</h2>
        <span className={`ml-auto rounded-md px-2.5 py-1 font-mono text-sm font-bold ${config.color}`}>
          {level}
        </span>
      </div>

      <div className="mb-4 h-2 rounded-full bg-surface-3">
        <div className={`h-2 rounded-full ${config.barColor} ${config.barWidth} transition-all duration-700`} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Key Risk Events</p>
        {keyRisks.map((risk, i) => (
          <div key={i} className="flex items-start gap-2 text-sm text-secondary-foreground">
            <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${config.barColor}`} />
            {risk}
          </div>
        ))}
      </div>
    </div>
  );
};

export default RiskIndicator;
