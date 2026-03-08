interface Props {
  score: number;
  label?: string;
  size?: number;
}

const RiskGauge = ({ score, label = "Global Risk", size = 140 }: Props) => {
  const clampedScore = Math.max(0, Math.min(100, score));
  const radius = (size - 20) / 2;
  const cx = size / 2;
  const cy = size / 2 + 8;
  const strokeWidth = 10;

  // Arc geometry (half-circle from left to right)
  const startAngle = Math.PI;
  const sweepAngle = startAngle - (clampedScore / 100) * Math.PI;

  const arcPoint = (angle: number) => ({
    x: cx + radius * Math.cos(angle),
    y: cy - radius * Math.sin(angle),
  });

  const bgStart = arcPoint(Math.PI);
  const bgEnd = arcPoint(0);
  const valEnd = arcPoint(sweepAngle);

  // Tick marks at 0, 25, 50, 75, 100
  const ticks = [0, 25, 50, 75, 100].map((v) => {
    const angle = Math.PI - (v / 100) * Math.PI;
    const inner = radius - strokeWidth / 2 - 3;
    const outer = radius + strokeWidth / 2 + 3;
    return {
      x1: cx + inner * Math.cos(angle),
      y1: cy - inner * Math.sin(angle),
      x2: cx + outer * Math.cos(angle),
      y2: cy - outer * Math.sin(angle),
    };
  });

  // Needle
  const needleAngle = Math.PI - (clampedScore / 100) * Math.PI;
  const needleLen = radius - strokeWidth - 6;
  const needleX = cx + needleLen * Math.cos(needleAngle);
  const needleY = cy - needleLen * Math.sin(needleAngle);

  const isHigh = clampedScore >= 55;
  const isMid = clampedScore >= 30;
  const gradId = `riskGrad-${size}`;
  const glowId = `riskGlow-${size}`;
  const needleColor = isHigh ? "hsl(var(--loss))" : isMid ? "hsl(var(--warning))" : "hsl(var(--gain))";

  const riskLabel = clampedScore >= 75 ? "CRITICAL" : clampedScore >= 55 ? "ELEVATED" : clampedScore >= 30 ? "MODERATE" : "LOW";

  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="hsl(var(--gain))" />
            <stop offset="40%" stopColor="hsl(var(--warning))" />
            <stop offset="100%" stopColor="hsl(var(--loss))" />
          </linearGradient>
          <filter id={glowId}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path
          d={`M ${bgStart.x} ${bgStart.y} A ${radius} ${radius} 0 0 1 ${bgEnd.x} ${bgEnd.y}`}
          fill="none"
          stroke="hsl(var(--surface-3))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Gradient value arc */}
        {clampedScore > 0 && (
          <path
            d={`M ${bgStart.x} ${bgStart.y} A ${radius} ${radius} 0 ${clampedScore > 50 ? 1 : 0} 1 ${valEnd.x} ${valEnd.y}`}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            filter={isHigh ? `url(#${glowId})` : undefined}
            className="transition-all duration-700"
          />
        )}

        {/* Tick marks */}
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={1}
            opacity={0.4}
          />
        ))}

        {/* Needle */}
        <line
          x1={cx} y1={cy} x2={needleX} y2={needleY}
          stroke={needleColor}
          strokeWidth={2}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
        <circle cx={cx} cy={cy} r={3} fill={needleColor} className="transition-all duration-700" />

        {/* Score text */}
        <text x={cx} y={cy - 16} textAnchor="middle" className="fill-foreground font-mono font-black" style={{ fontSize: 22 }}>
          {clampedScore}
        </text>
        <text x={cx} y={cy - 3} textAnchor="middle" className="fill-muted-foreground uppercase tracking-wider" style={{ fontSize: 7 }}>
          {label}
        </text>
      </svg>
      <span
        className={`text-[9px] font-mono font-bold uppercase tracking-widest ${
          isHigh ? "text-loss" : isMid ? "text-warning" : "text-gain"
        } ${isHigh ? "animate-pulse" : ""}`}
      >
        {riskLabel}
      </span>
    </div>
  );
};

export default RiskGauge;
