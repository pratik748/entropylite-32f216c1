import { Target } from "lucide-react";

interface SimulationProps {
  currentPrice: number;
  bullRange: [number, number];
  neutralRange: [number, number];
  bearRange: [number, number];
}

const SimulationTable = ({ currentPrice, bullRange, neutralRange, bearRange }: SimulationProps) => {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const pct = (target: number) => (((target - currentPrice) / currentPrice) * 100).toFixed(1);

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-5 flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">3-Month Simulation</h2>
      </div>

      <div className="space-y-3">
        <ScenarioRow
          label="Bull Case"
          emoji="🟢"
          range={bullRange}
          currentPrice={currentPrice}
          colorClass="text-gain"
          bgClass="bg-gain/5 border-gain/15"
        />
        <ScenarioRow
          label="Neutral Case"
          emoji="🟡"
          range={neutralRange}
          currentPrice={currentPrice}
          colorClass="text-warning"
          bgClass="bg-warning/5 border-warning/15"
        />
        <ScenarioRow
          label="Bear Case"
          emoji="🔴"
          range={bearRange}
          currentPrice={currentPrice}
          colorClass="text-loss"
          bgClass="bg-loss/5 border-loss/15"
        />
      </div>

      <div className="mt-4 rounded-lg bg-surface-2 p-3 text-center">
        <p className="text-xs text-muted-foreground">Current Price</p>
        <p className="font-mono text-lg font-bold text-foreground">{fmt(currentPrice)}</p>
      </div>
    </div>
  );
};

const ScenarioRow = ({
  label,
  emoji,
  range,
  currentPrice,
  colorClass,
  bgClass,
}: {
  label: string;
  emoji: string;
  range: [number, number];
  currentPrice: number;
  colorClass: string;
  bgClass: string;
}) => {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const pctLow = (((range[0] - currentPrice) / currentPrice) * 100).toFixed(1);
  const pctHigh = (((range[1] - currentPrice) / currentPrice) * 100).toFixed(1);

  return (
    <div className={`rounded-lg border ${bgClass} p-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>{emoji}</span>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="text-right">
          <p className={`font-mono text-sm font-semibold ${colorClass}`}>
            {fmt(range[0])} – {fmt(range[1])}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {Number(pctLow) >= 0 ? "+" : ""}{pctLow}% to {Number(pctHigh) >= 0 ? "+" : ""}{pctHigh}%
          </p>
        </div>
      </div>
    </div>
  );
};

export default SimulationTable;
