import { Target, CheckCircle2, Circle, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { getScenarioConfig, MICRO_DISCLAIMER } from "@/lib/sebiCompliance";

interface ProfitTaskbarProps {
  ticker: string;
  currentPrice: number;
  buyPrice: number;
  quantity: number;
  suggestion: "Hold" | "Add" | "Exit";
  confidence: number;
  bullRange: [number, number];
  bearRange: [number, number];
  riskLevel: "Low" | "Medium" | "High";
}

interface Task {
  label: string;
  detail: string;
  status: "done" | "active" | "pending";
  icon: React.ReactNode;
}

const ProfitTaskbar = ({
  ticker,
  currentPrice,
  buyPrice,
  quantity,
  suggestion,
  confidence,
  bullRange,
  bearRange,
  riskLevel,
}: ProfitTaskbarProps) => {
  const invested = buyPrice * quantity;
  const currentValue = currentPrice * quantity;
  const pnl = currentValue - invested;
  const pnlPct = (pnl / invested) * 100;
  const isProfit = pnl >= 0;

  // Key levels
  const projectedUpside = buyPrice * 1.10;
  const projectedUpside20 = buyPrice * 1.20;
  const invalidationZone = buyPrice * 0.92;

  const sc = getScenarioConfig(suggestion);
  const tasks: Task[] = [];

  // Task 1: Analysis complete
  tasks.push({
    label: "Intelligence Analysis Complete",
    detail: `Analyzed ${ticker} at ₹${buyPrice.toLocaleString("en-IN")}`,
    status: "done",
    icon: <CheckCircle2 className="h-4 w-4" />,
  });

  // Task 2: Risk assessment
  tasks.push({
    label: `Risk Level: ${riskLevel}`,
    detail: riskLevel === "High" ? "Elevated volatility, monitor positioning" : riskLevel === "Medium" ? "Moderate risk, standard monitoring" : "Favorable risk profile observed",
    status: "done",
    icon: <AlertTriangle className="h-4 w-4" />,
  });

  // Task 3: Current P&L status
  if (isProfit) {
    tasks.push({
      label: `Unrealized Gain: ${pnlPct.toFixed(1)}%`,
      detail: `+₹${pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })} on ${quantity} units`,
      status: pnlPct >= 10 ? "done" : "active",
      icon: <TrendingUp className="h-4 w-4" />,
    });
  } else {
    tasks.push({
      label: `Unrealized Loss: ${pnlPct.toFixed(1)}%`,
      detail: `₹${pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })}, reassess thesis if fundamentals shift`,
      status: "active",
      icon: <TrendingDown className="h-4 w-4" />,
    });
  }

  // Task 4: Scenario outlook
  if (suggestion === "Add" && confidence >= 60) {
    tasks.push({
      label: "Upside Scenario Detected",
      detail: `${confidence}% confidence. Projected upper range: ₹${bullRange[1].toLocaleString("en-IN")}`,
      status: "active",
      icon: <Target className="h-4 w-4" />,
    });
  } else if (suggestion === "Exit") {
    tasks.push({
      label: "Downside Scenario Detected",
      detail: `Invalidation zone near ₹${invalidationZone.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      status: "active",
      icon: <Target className="h-4 w-4" />,
    });
  } else {
    tasks.push({
      label: "Observe & Monitor",
      detail: `Reaction zone above ₹${projectedUpside.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (+10%)`,
      status: "active",
      icon: <Target className="h-4 w-4" />,
    });
  }

  // Task 5: Projected range
  const hitUpside10 = currentPrice >= projectedUpside;
  const hitUpside20 = currentPrice >= projectedUpside20;
  tasks.push({
    label: hitUpside20 ? "20% Projected Range Reached" : hitUpside10 ? "10% Projected Range Reached" : `Projected Range: ₹${projectedUpside.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (+10%)`,
    detail: hitUpside20
      ? "Upper projected range achieved, reassess positioning"
      : hitUpside10
      ? `Next level: ₹${projectedUpside20.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (+20%)`
      : `Invalidation zone: ₹${invalidationZone.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (-8%)`,
    status: hitUpside20 ? "done" : hitUpside10 ? "active" : "pending",
    icon: <Target className="h-4 w-4" />,
  });

  // Task 6: Bear zone
  if (currentPrice <= bearRange[0]) {
    tasks.push({
      label: "Price in Downside Zone",
      detail: `Below ₹${bearRange[0].toLocaleString("en-IN")}, reassess thesis`,
      status: "active",
      icon: <AlertTriangle className="h-4 w-4" />,
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-foreground" />
        <h2 className="text-base font-semibold text-foreground">Scenario Roadmap</h2>
        <span className="ml-auto rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {ticker}
        </span>
      </div>

      <div className="space-y-1">
        {tasks.map((task, i) => (
          <div key={i} className="flex items-start gap-3 group">
            <div className="flex flex-col items-center">
              <div className={`rounded-full p-0.5 ${
                task.status === "done" ? "text-gain" : task.status === "active" ? "text-foreground" : "text-muted-foreground/40"
              }`}>
                {task.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
              </div>
              {i < tasks.length - 1 && (
                <div className={`w-px h-8 ${task.status === "done" ? "bg-gain/30" : "bg-border"}`} />
              )}
            </div>

            <div className="flex-1 pb-3">
              <p className={`text-sm font-medium ${
                task.status === "done" ? "text-gain" : task.status === "active" ? "text-foreground" : "text-muted-foreground"
              }`}>
                {task.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{task.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-[8px] text-muted-foreground/40 mt-3 border-t border-border/20 pt-2">
        {MICRO_DISCLAIMER}
      </p>
    </div>
  );
};

export default ProfitTaskbar;
