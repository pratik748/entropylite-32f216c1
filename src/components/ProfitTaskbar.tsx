import { Target, ArrowRight, CheckCircle2, Circle, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";

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

  // Calculate targets
  const target10 = buyPrice * 1.10;
  const target20 = buyPrice * 1.20;
  const stopLoss = buyPrice * 0.92;

  const tasks: Task[] = [];

  // Task 1: Entry analysis done
  tasks.push({
    label: "Entry Analysis Complete",
    detail: `Analyzed ${ticker} at ₹${buyPrice.toLocaleString("en-IN")}`,
    status: "done",
    icon: <CheckCircle2 className="h-4 w-4" />,
  });

  // Task 2: Risk assessment
  tasks.push({
    label: `Risk Level: ${riskLevel}`,
    detail: riskLevel === "High" ? "Consider reducing position size" : riskLevel === "Medium" ? "Monitor closely for changes" : "Favorable risk profile",
    status: "done",
    icon: <AlertTriangle className="h-4 w-4" />,
  });

  // Task 3: Current P&L status
  if (isProfit) {
    tasks.push({
      label: `Unrealized Gain: ${pnlPct.toFixed(1)}%`,
      detail: `+₹${pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })} on ${quantity} shares`,
      status: pnlPct >= 10 ? "done" : "active",
      icon: <TrendingUp className="h-4 w-4" />,
    });
  } else {
    tasks.push({
      label: `Unrealized Loss: ${pnlPct.toFixed(1)}%`,
      detail: `₹${pnl.toLocaleString("en-IN", { maximumFractionDigits: 0 })} — hold if fundamentals intact`,
      status: "active",
      icon: <TrendingDown className="h-4 w-4" />,
    });
  }

  // Task 4: Next action
  if (suggestion === "Add" && confidence >= 60) {
    tasks.push({
      label: "Consider Adding Position",
      detail: `AI suggests adding with ${confidence}% confidence. Bull target: ₹${bullRange[1].toLocaleString("en-IN")}`,
      status: "active",
      icon: <Target className="h-4 w-4" />,
    });
  } else if (suggestion === "Exit") {
    tasks.push({
      label: "Consider Exiting Position",
      detail: `AI suggests exit. Set stop-loss at ₹${stopLoss.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
      status: "active",
      icon: <Target className="h-4 w-4" />,
    });
  } else {
    tasks.push({
      label: "Hold & Monitor",
      detail: `Watch for breakout above ₹${target10.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (+10%)`,
      status: "active",
      icon: <Target className="h-4 w-4" />,
    });
  }

  // Task 5: Profit target
  const hitTarget10 = currentPrice >= target10;
  const hitTarget20 = currentPrice >= target20;
  tasks.push({
    label: hitTarget20 ? "20% Target Reached" : hitTarget10 ? "10% Target Reached — Trail Stop" : `Target: ₹${target10.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (+10%)`,
    detail: hitTarget20
      ? "Consider booking partial profits"
      : hitTarget10
      ? `Next target: ₹${target20.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (+20%)`
      : `Stop-loss: ₹${stopLoss.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (-8%)`,
    status: hitTarget20 ? "done" : hitTarget10 ? "active" : "pending",
    icon: <Target className="h-4 w-4" />,
  });

  // Task 6: Bear protection
  if (currentPrice <= bearRange[0]) {
    tasks.push({
      label: "Price in Bear Zone",
      detail: `Below ₹${bearRange[0].toLocaleString("en-IN")} — reassess thesis or exit`,
      status: "active",
      icon: <AlertTriangle className="h-4 w-4" />,
    });
  }

  return (
    <div className="glass-card rounded-2xl p-6 animate-slide-up">
      <div className="mb-4 flex items-center gap-2">
        <Target className="h-5 w-5 text-foreground" />
        <h2 className="text-base font-semibold text-foreground">Action Plan</h2>
        <span className="ml-auto rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {ticker}
        </span>
      </div>

      <div className="space-y-1">
        {tasks.map((task, i) => (
          <div key={i} className="flex items-start gap-3 group">
            {/* Timeline connector */}
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
    </div>
  );
};

export default ProfitTaskbar;
