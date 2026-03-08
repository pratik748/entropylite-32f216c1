import { useEffect, useRef, useState } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useFX } from "@/hooks/useFX";

interface Props {
  stocks: PortfolioStock[];
}

interface DataPoint {
  t: number;
  value: number;
}

const MAX_POINTS = 60; // ~15 min at 15s intervals

const PortfolioSparkline = ({ stocks }: Props) => {
  const { convertToBase } = useFX();
  const [history, setHistory] = useState<DataPoint[]>([]);
  const prevValueRef = useRef<number>(0);

  useEffect(() => {
    const analyzed = stocks.filter(s => s.analysis);
    if (analyzed.length === 0) return;

    const totalValue = analyzed.reduce((sum, s) => {
      const ccy = s.analysis!.currency || "USD";
      return sum + convertToBase(s.analysis!.currentPrice * s.quantity, ccy);
    }, 0);

    if (totalValue === 0) return;

    // Only add point if value changed
    if (Math.abs(totalValue - prevValueRef.current) > 0.01) {
      prevValueRef.current = totalValue;
      setHistory(prev => {
        const next = [...prev, { t: Date.now(), value: totalValue }];
        return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
      });
    }
  }, [stocks, convertToBase]);

  if (history.length < 2) return null;

  const first = history[0].value;
  const last = history[history.length - 1].value;
  const change = last - first;
  const changePct = first > 0 ? (change / first) * 100 : 0;
  const isUp = change >= 0;

  return (
    <div className="border-t border-border px-2 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-wider">Session P&L</span>
        <span className={`text-[9px] font-mono font-bold ${isUp ? "text-gain" : "text-loss"}`}>
          {isUp ? "+" : ""}{changePct.toFixed(2)}%
        </span>
      </div>
      <div className="h-10">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <YAxis domain={["dataMin", "dataMax"]} hide />
            <Line
              type="monotone"
              dataKey="value"
              stroke={isUp ? "hsl(var(--gain))" : "hsl(var(--loss))"}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PortfolioSparkline;
