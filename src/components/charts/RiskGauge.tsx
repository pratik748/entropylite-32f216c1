interface Props {
  score: number;
  label?: string;
  size?: number;
}

const RiskGauge = ({ score, label = "GLOBAL RISK INDEX", size = 140 }: Props) => {
  const clampedScore = Math.max(0, Math.min(100, score));
  const isHigh = clampedScore >= 55;
  const isMid = clampedScore >= 30;
  const riskLabel = clampedScore >= 75 ? "CRITICAL" : clampedScore >= 55 ? "ELEVATED" : clampedScore >= 30 ? "MODERATE" : "LOW";
  const needleColor = isHigh ? "hsl(var(--loss))" : isMid ? "hsl(var(--warning))" : "hsl(var(--gain))";

  // Dimensions
  const w = size;
  const h = size * 0.65;
  const cx = w / 2;
  const cy = h - 12;
  const outerR = w / 2 - 8;
  const innerR = outerR - 14;
  const trackWidth = 6;

  // Arc helpers
  const polarToCart = (angle: number, r: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  });

  const arcPath = (r: number, startDeg: number, endDeg: number) => {
    const s = polarToCart(startDeg, r);
    const e = polarToCart(endDeg, r);
    const large = Math.abs(startDeg - endDeg) > Math.PI ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  // Build segmented arc (institutional look: 40 segments)
  const totalSegments = 40;
  const gapAngle = 0.02; // radians gap between segments
  const totalArc = Math.PI; // 180 degrees
  const segArc = (totalArc - gapAngle * totalSegments) / totalSegments;
  const midR = (outerR + innerR) / 2;

  const segments = Array.from({ length: totalSegments }, (_, i) => {
    const startAngle = Math.PI - i * (segArc + gapAngle);
    const endAngle = startAngle - segArc;
    const segValue = ((i + 1) / totalSegments) * 100;
    const filled = segValue <= clampedScore;

    let color: string;
    if (segValue <= 30) color = "hsl(var(--gain))";
    else if (segValue <= 55) color = "hsl(var(--warning))";
    else color = "hsl(var(--loss))";

    return { startAngle, endAngle, filled, color };
  });

  // Needle
  const needleAngle = Math.PI - (clampedScore / 100) * Math.PI;
  const needleLen = innerR - 8;
  const needleTip = polarToCart(needleAngle, needleLen);
  const needleBase1 = polarToCart(needleAngle + Math.PI / 2, 2.5);
  const needleBase2 = polarToCart(needleAngle - Math.PI / 2, 2.5);

  // Scale labels
  const scaleLabels = [0, 25, 50, 75, 100].map(v => {
    const angle = Math.PI - (v / 100) * Math.PI;
    const pos = polarToCart(angle, outerR + 9);
    return { v, ...pos };
  });

  const gradId = `riskSegGlow-${size}`;

  return (
    <div className="flex flex-col items-center">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <defs>
          <filter id={gradId}>
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Scale labels */}
        {scaleLabels.map(({ v, x, y }) => (
          <text key={v} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            className="fill-muted-foreground font-mono" style={{ fontSize: 7 }}>
            {v}
          </text>
        ))}

        {/* Segmented arc */}
        {segments.map((seg, i) => (
          <path
            key={i}
            d={arcPath(midR, seg.startAngle, seg.endAngle)}
            fill="none"
            stroke={seg.filled ? seg.color : "hsl(var(--muted) / 0.15)"}
            strokeWidth={trackWidth}
            strokeLinecap="butt"
            opacity={seg.filled ? (isHigh && seg.color === "hsl(var(--loss))" ? 1 : 0.85) : 0.3}
            filter={seg.filled && isHigh && seg.color === "hsl(var(--loss))" ? `url(#${gradId})` : undefined}
            className="transition-all duration-500"
          />
        ))}

        {/* Inner arc track (thin reference line) */}
        <path
          d={arcPath(innerR - 4, Math.PI, 0)}
          fill="none"
          stroke="hsl(var(--muted) / 0.08)"
          strokeWidth={1}
        />

        {/* Needle triangle */}
        <polygon
          points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
          fill={needleColor}
          className="transition-all duration-700"
          filter={isHigh ? `url(#${gradId})` : undefined}
        />
        <circle cx={cx} cy={cy} r={4} fill="hsl(var(--foreground))" />
        <circle cx={cx} cy={cy} r={2} fill={needleColor} className="transition-all duration-700" />

        {/* Score */}
        <text x={cx} y={cy - 22} textAnchor="middle" className="fill-foreground font-mono font-black" style={{ fontSize: 20 }}>
          {clampedScore}
        </text>
        <text x={cx} y={cy - 11} textAnchor="middle" className="fill-muted-foreground font-mono uppercase" style={{ fontSize: 5.5, letterSpacing: '0.12em' }}>
          {label}
        </text>
      </svg>
      <span
        className={`-mt-1 text-[8px] font-mono font-bold uppercase tracking-[0.2em] ${
          isHigh ? "text-loss" : isMid ? "text-warning" : "text-gain"
        }`}
      >
        ■ {riskLabel}
      </span>
    </div>
  );
};

export default RiskGauge;
