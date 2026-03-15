import { useEffect, useRef, useState } from "react";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";

interface Props {
  stocks: PortfolioStock[];
}

interface DataPoint {
  t: number;
  value: number;
  pnl: number;
}

/** Detect currency for a stock: use analysis currency, or infer from ticker suffix */
function detectCurrency(s: PortfolioStock): string {
  if (s.analysis?.currency) return s.analysis.currency;
  const t = s.ticker.toUpperCase();
  if (t.endsWith(".NS") || t.endsWith(".BO")) return "INR";
  if (t.endsWith(".L")) return "GBP";
  if (t.endsWith(".T")) return "JPY";
  if (t.endsWith(".HK")) return "HKD";
  if (t.endsWith(".DE") || t.endsWith(".PA")) return "EUR";
  if (t.endsWith(".TO")) return "CAD";
  if (t.endsWith(".AX")) return "AUD";
  return "USD";
}

const MAX_POINTS = 60; // ~15 min at 15s intervals

const PortfolioSparkline = ({ stocks }: Props) => {
  const { baseCurrency, convertToBase } = useFX();
  const baseSym = getCurrencySymbol(baseCurrency);
  const [history, setHistory] = useState<DataPoint[]>([]);
  const prevValueRef = useRef<number>(0);

  useEffect(() => {
    const analyzed = stocks.filter(s => s.analysis);
    if (analyzed.length === 0) return;

    let totalValue = 0;
    let totalInvested = 0;

    analyzed.forEach(s => {
      const ccy = detectCurrency(s);
      const curPrice = s.analysis!.currentPrice ?? 0;
      totalValue += convertToBase(curPrice * s.quantity, ccy);
      totalInvested += convertToBase(s.buyPrice * s.quantity, ccy);
    });

    if (totalValue === 0) return;

    const pnl = totalValue - totalInvested;

    // Only add point if value changed
    if (Math.abs(totalValue - prevValueRef.current) > 0.01) {
      prevValueRef.current = totalValue;
      setHistory(prev => {
        const next = [...prev, { t: Date.now(), value: totalValue, pnl }];
        return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
      });
    }
  }, [stocks, convertToBase]);

  if (history.length < 2) return null;

  const first = history[0];
  const last = history[history.length - 1];

  // Show actual portfolio P&L (value vs invested), not just session delta
  const totalPnl = last.pnl;
  const totalPnlPct = (last.value - first.value) !== 0
    ? ((last.value - first.value) / first.value) * 100
    : 0;
  const isUp = totalPnl >= 0;
  const sessionChange = last.value - first.value;
  const sessionPct = first.value > 0 ? (sessionChange / first.value) * 100 : 0;
  const sessionUp = sessionChange >= 0;

  return (
    <div className="border-t border-border px-2 py-2">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[8px] font-mono text-muted-foreground uppercase tracking-wider">Portfolio P&L</span>
        <span className={`text-[9px] font-mono font-bold ${isUp ? "text-gain" : "text-loss"}`}>
          {isUp ? "+" : ""}{baseSym}{Math.abs(totalPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
        </span>
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[7px] font-mono text-muted-foreground">SESSION</span>
        <span className={`text-[8px] font-mono ${sessionUp ? "text-gain/70" : "text-loss/70"}`}>
          {sessionUp ? "+" : ""}{sessionPct.toFixed(3)}%
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
