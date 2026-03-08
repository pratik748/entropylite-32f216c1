interface Props {
  score: number;
  label?: string;
  size?: number;
}

const RiskGauge = ({ score, label = "Global Risk", size = 120 }: Props) => {
  const clampedScore = Math.max(0, Math.min(100, score));
  const radius = (size - 16) / 2;
  const cx = size / 2;
  const cy = size / 2 + 10;
  
  // Arc from -180° to 0° (half circle)
  const startAngle = Math.PI;
  const endAngle = 0;
  const sweepAngle = startAngle - (clampedScore / 100) * Math.PI;

  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy - radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(sweepAngle);
  const endY = cy - radius * Math.sin(sweepAngle);

  const bgStartX = cx + radius * Math.cos(startAngle);
  const bgStartY = cy - radius * Math.sin(startAngle);
  const bgEndX = cx + radius * Math.cos(endAngle);
  const bgEndY = cy - radius * Math.sin(endAngle);

  const color = clampedScore >= 55 ? "hsl(var(--loss))" : clampedScore >= 30 ? "hsl(var(--warning))" : "hsl(var(--gain))";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
        {/* Background arc */}
        <path
          d={`M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 0 1 ${bgEndX} ${bgEndY}`}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {/* Value arc */}
        {clampedScore > 0 && (
          <path
            d={`M ${startX} ${startY} A ${radius} ${radius} 0 ${clampedScore > 50 ? 1 : 0} 1 ${endX} ${endY}`}
            fill="none"
            stroke={color}
            strokeWidth={8}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        )}
        {/* Score text */}
        <text x={cx} y={cy - 5} textAnchor="middle" className="fill-foreground font-mono text-lg font-black">
          {clampedScore}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" className="fill-muted-foreground text-[8px] uppercase tracking-wider">
          {label}
        </text>
      </svg>
    </div>
  );
};

export default RiskGauge;
