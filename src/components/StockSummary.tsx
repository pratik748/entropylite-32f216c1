import { ArrowUpRight, ArrowDownRight, ChevronRight, FileSearch } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { getCurrencySymbol, formatCurrency, resolveAssetCurrency } from "@/lib/currency";
import { useFX } from "@/hooks/useFX";
import { springGentle } from "@/lib/motion";
import { workstationPath } from "@/components/workstation/registry";

interface StockSummaryProps {
  ticker: string;
  currentPrice: number;
  buyPrice: number;
  quantity: number;
  currency?: string;
}

const StockSummary = ({ ticker, currentPrice, buyPrice, quantity, currency }: StockSummaryProps) => {
  const { baseCurrency, convertToBase } = useFX();
  const assetCurrency = resolveAssetCurrency(ticker, currency);
  const invested = buyPrice * quantity;
  const currentValue = currentPrice * quantity;
  const pnl = currentValue - invested;
  const pnlPercent = ((pnl / invested) * 100);
  const isProfit = pnl >= 0;

  const showConverted = assetCurrency !== baseCurrency;
  const baseSym = getCurrencySymbol(baseCurrency);
  const convertedPrice = showConverted ? convertToBase(currentPrice, assetCurrency) : null;
  const convertedValue = showConverted ? convertToBase(currentValue, assetCurrency) : null;
  const convertedPnl = showConverted ? convertToBase(pnl, assetCurrency) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
      className="rounded-2xl border border-border/70 bg-card p-4 sm:p-6 shadow-soft"
    >
      {/* Ticker + live price, Apple Stocks hierarchy */}
      <div className="mb-4 sm:mb-5 flex items-start justify-between">
        <div className="min-w-0">
          <Link
            to={workstationPath(ticker)}
            title={`Open Equity Workstation — ${ticker}`}
            className="group inline-flex items-center gap-1 text-headline text-foreground transition-colors hover:text-muted-foreground"
          >
            {ticker}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>
          <p className="mt-1.5 text-title-1 text-foreground tabular">{formatCurrency(currentPrice, assetCurrency)}</p>
          <p className="mt-0.5 text-caption-1 text-muted-foreground">
            {assetCurrency}
            {convertedPrice !== null && (
              <span className="text-muted-foreground/70"> · ≈ {baseSym}{convertedPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-semibold tabular ${isProfit ? "bg-gain/12 text-gain" : "bg-loss/12 text-loss"}`}>
            {isProfit ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {isProfit ? "+" : ""}{pnlPercent.toFixed(2)}%
          </div>
          <Link
            to={workstationPath(ticker)}
            title={`Open the Equity Workstation for ${ticker}`}
            className="pressable flex items-center gap-1.5 rounded-full bg-foreground px-3.5 py-1.5 text-[12px] font-semibold tracking-tight text-background shadow-soft transition-opacity hover:opacity-85"
          >
            <FileSearch className="h-3.5 w-3.5" strokeWidth={2} />
            Open Workstation
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <MetricTile label="Buy price" value={formatCurrency(buyPrice, assetCurrency)} />
        <div className="rounded-xl bg-surface-2 p-2.5 sm:p-3.5">
          <p className="text-caption-1 text-muted-foreground">P&L</p>
          <p className={`mt-1 text-subheadline font-semibold tabular ${isProfit ? "text-gain" : "text-loss"}`}>
            {isProfit ? "+" : "−"}{formatCurrency(Math.abs(pnl), assetCurrency)}
          </p>
          {convertedPnl !== null && (
            <p className={`mt-0.5 text-caption-2 tabular ${isProfit ? "text-gain/60" : "text-loss/60"}`}>
              ≈ {isProfit ? "+" : "−"}{baseSym}{Math.abs(convertedPnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-surface-2 p-2.5 sm:p-3.5">
          <p className="text-caption-1 text-muted-foreground">Value</p>
          <p className="mt-1 text-subheadline font-semibold text-foreground tabular">{formatCurrency(currentValue, assetCurrency)}</p>
          {convertedValue !== null && (
            <p className="mt-0.5 text-caption-2 text-muted-foreground/70 tabular">≈ {baseSym}{convertedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const MetricTile = ({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: "gain" | "loss";
}) => (
  <div className="rounded-xl bg-surface-2 p-2.5 sm:p-3.5">
    <p className="text-caption-1 text-muted-foreground">{label}</p>
    <p
      className={`mt-1 text-subheadline font-semibold tabular ${
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
