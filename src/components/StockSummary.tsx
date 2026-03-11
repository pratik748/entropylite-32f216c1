import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { getCurrencySymbol, formatCurrency } from "@/lib/currency";
import { useFX } from "@/hooks/useFX";

interface StockSummaryProps {
  ticker: string;
  currentPrice: number;
  buyPrice: number;
  quantity: number;
  currency?: string;
}

const StockSummary = ({ ticker, currentPrice, buyPrice, quantity, currency }: StockSummaryProps) => {
  const { baseCurrency, convertToBase } = useFX();
  const invested = buyPrice * quantity;
  const currentValue = currentPrice * quantity;
  const pnl = currentValue - invested;
  const pnlPercent = ((pnl / invested) * 100);
  const isProfit = pnl >= 0;
  const sym = getCurrencySymbol(currency);

  const showConverted = currency && currency !== baseCurrency;
  const baseSym = getCurrencySymbol(baseCurrency);
  const convertedPrice = showConverted ? convertToBase(currentPrice, currency) : null;
  const convertedValue = showConverted ? convertToBase(currentValue, currency) : null;
  const convertedPnl = showConverted ? convertToBase(pnl, currency) : null;

  return (
    <div className="rounded-sm border border-border bg-card p-3 sm:p-5 animate-slide-up">
      <div className="mb-3 sm:mb-4 flex items-center justify-between">
        <div>
          <p className="font-mono text-base sm:text-xl font-bold text-foreground">{ticker}</p>
          <p className="text-xs sm:text-sm text-muted-foreground">{currency || "USD"}</p>
        </div>
        <div className={`flex items-center gap-1 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 ${isProfit ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"}`}>
          {isProfit ? <ArrowUpRight className="h-3 w-3 sm:h-4 sm:w-4" /> : <ArrowDownRight className="h-3 w-3 sm:h-4 sm:w-4" />}
          <span className="font-mono text-xs sm:text-sm font-semibold">
            {isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <div className="rounded-lg bg-surface-2 p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Current Price</p>
          <p className="mt-0.5 sm:mt-1 font-mono text-sm sm:text-lg font-semibold text-foreground">{formatCurrency(currentPrice, currency)}</p>
          {convertedPrice !== null && (
            <p className="font-mono text-[9px] sm:text-[10px] text-muted-foreground/70 mt-0.5">≈ {baseSym}{convertedPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
          )}
        </div>
        <MetricCard label="Buy Price" value={formatCurrency(buyPrice, currency)} />
        <div className="rounded-lg bg-surface-2 p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-muted-foreground">P&L</p>
          <p className={`mt-0.5 sm:mt-1 font-mono text-sm sm:text-lg font-semibold ${isProfit ? "text-gain" : "text-loss"}`}>
            {isProfit ? "+" : ""}{formatCurrency(Math.abs(pnl), currency)}
          </p>
          {convertedPnl !== null && (
            <p className={`font-mono text-[9px] sm:text-[10px] mt-0.5 ${isProfit ? "text-gain/60" : "text-loss/60"}`}>
              ≈ {isProfit ? "+" : "-"}{baseSym}{Math.abs(convertedPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
        <div className="rounded-lg bg-surface-2 p-2 sm:p-3">
          <p className="text-[10px] sm:text-xs text-muted-foreground">Portfolio Value</p>
          <p className="mt-0.5 sm:mt-1 font-mono text-sm sm:text-lg font-semibold text-foreground">{formatCurrency(currentValue, currency)}</p>
          {convertedValue !== null && (
            <p className="font-mono text-[9px] sm:text-[10px] text-muted-foreground/70 mt-0.5">≈ {baseSym}{convertedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          )}
        </div>
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
  <div className="rounded-lg bg-surface-2 p-2 sm:p-3">
    <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
    <p
      className={`mt-0.5 sm:mt-1 font-mono text-sm sm:text-lg font-semibold ${
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
