import { ArrowUpRight, ArrowDownRight, IndianRupee } from "lucide-react";

interface StockSummaryProps {
  ticker: string;
  currentPrice: number;
  buyPrice: number;
  quantity: number;
}

const StockSummary = ({ ticker, currentPrice, buyPrice, quantity }: StockSummaryProps) => {
  const invested = buyPrice * quantity;
  const currentValue = currentPrice * quantity;
  const pnl = currentValue - invested;
  const pnlPercent = ((pnl / invested) * 100);
  const isProfit = pnl >= 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-xl font-bold text-foreground">{ticker}</p>
          <p className="text-sm text-muted-foreground">NSE</p>
        </div>
        <div className={`flex items-center gap-1 rounded-lg px-3 py-1.5 ${isProfit ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"}`}>
          {isProfit ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
          <span className="font-mono text-sm font-semibold">
            {isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Current Price" value={`₹${currentPrice.toLocaleString("en-IN")}`} />
        <MetricCard label="Buy Price" value={`₹${buyPrice.toLocaleString("en-IN")}`} />
        <MetricCard
          label="P&L"
          value={`${isProfit ? "+" : ""}₹${pnl.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
          highlight={isProfit ? "gain" : "loss"}
        />
        <MetricCard
          label="Portfolio Value"
          value={`₹${currentValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`}
        />
      </div>
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "gain" | "loss";
}) => (
  <div className="rounded-lg bg-surface-2 p-3">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p
      className={`mt-1 font-mono text-lg font-semibold ${
        highlight === "gain"
          ? "text-gain"
          : highlight === "loss"
          ? "text-loss"
          : "text-foreground"
      }`}
    >
      {value}
    </p>
  </div>
);

export default StockSummary;
