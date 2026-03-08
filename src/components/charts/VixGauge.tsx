interface Props {
  vix: number;
}

const VixGauge = ({ vix }: Props) => {
  if (vix <= 0) return null;

  const clampedVix = Math.min(vix, 80);
  const pct = (clampedVix / 80) * 100;
  const zone = vix < 15 ? "Low" : vix < 20 ? "Normal" : vix < 30 ? "Elevated" : vix < 40 ? "High" : "Extreme";
  const color = vix < 15 ? "bg-gain" : vix < 20 ? "bg-primary" : vix < 30 ? "bg-warning" : "bg-loss";
  const textColor = vix < 15 ? "text-gain" : vix < 20 ? "text-primary" : vix < 30 ? "text-warning" : "text-loss";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-mono">VIX Fear Index</span>
        <span className={`text-xs font-mono font-bold ${textColor}`}>{zone}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`font-mono text-2xl font-black ${textColor}`}>{vix.toFixed(1)}</span>
        <div className="flex-1">
          <div className="h-3 rounded-full bg-surface-3 overflow-hidden relative">
            {/* Gradient background showing zones */}
            <div className="absolute inset-0 rounded-full" style={{
              background: "linear-gradient(to right, hsl(var(--gain)), hsl(var(--primary)) 25%, hsl(var(--warning)) 50%, hsl(var(--loss)) 75%)"
            }} />
            {/* Indicator */}
            <div
              className="absolute top-0 h-full w-1 bg-foreground rounded-full transition-all duration-500 shadow-lg"
              style={{ left: `${Math.min(pct, 98)}%` }}
            />
          </div>
          <div className="flex justify-between text-[7px] font-mono text-muted-foreground mt-0.5">
            <span>0</span>
            <span>20</span>
            <span>40</span>
            <span>60</span>
            <span>80</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VixGauge;
