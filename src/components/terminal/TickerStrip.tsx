import { useState, useEffect, useRef, memo } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";

interface TickerData {
  symbol: string;
  name: string;
  price: number;
  nativeCurrency: string;
  change: number;
  history: number[];
}

const GLOBAL_TICKERS = [
  { symbol: "^GSPC", name: "S&P 500", currency: "USD" },
  { symbol: "^IXIC", name: "NASDAQ", currency: "USD" },
  { symbol: "^DJI", name: "DOW", currency: "USD" },
  { symbol: "^N225", name: "NIKKEI", currency: "JPY" },
  { symbol: "^STOXX50E", name: "EURO STOXX", currency: "EUR" },
  { symbol: "^HSI", name: "HANG SENG", currency: "HKD" },
  { symbol: "GC=F", name: "GOLD", currency: "USD" },
  { symbol: "CL=F", name: "OIL", currency: "USD" },
  { symbol: "BTC-USD", name: "BTC", currency: "USD" },
  { symbol: "ETH-USD", name: "ETH", currency: "USD" },
  { symbol: "^TNX", name: "US 10Y", currency: "USD" },
  { symbol: "DX-Y.NYB", name: "DXY", currency: "USD" },
  { symbol: "SI=F", name: "SILVER", currency: "USD" },
  { symbol: "EURUSD=X", name: "EUR/USD", currency: "USD" },
  { symbol: "^FTSE", name: "FTSE", currency: "GBP" },
];

const INDIA_TICKERS = [
  { symbol: "^NSEI", name: "NIFTY 50", currency: "INR" },
  { symbol: "^BSESN", name: "SENSEX", currency: "INR" },
  { symbol: "^NSEBANK", name: "BANK NIFTY", currency: "INR" },
  { symbol: "RELIANCE.NS", name: "RELIANCE", currency: "INR" },
  { symbol: "TCS.NS", name: "TCS", currency: "INR" },
  { symbol: "HDFCBANK.NS", name: "HDFC BANK", currency: "INR" },
  { symbol: "INFY.NS", name: "INFOSYS", currency: "INR" },
  { symbol: "ICICIBANK.NS", name: "ICICI BANK", currency: "INR" },
  { symbol: "GC=F", name: "GOLD", currency: "USD" },
  { symbol: "CL=F", name: "OIL", currency: "USD" },
  { symbol: "BTC-USD", name: "BTC", currency: "USD" },
  { symbol: "USDINR=X", name: "USD/INR", currency: "INR" },
  { symbol: "BHARTIARTL.NS", name: "AIRTEL", currency: "INR" },
  { symbol: "ITC.NS", name: "ITC", currency: "INR" },
  { symbol: "SBIN.NS", name: "SBI", currency: "INR" },
];

const MiniSparkline = ({ data, positive }: { data: number[]; positive: boolean }) => {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 40;
  const h = 14;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "hsl(var(--gain))" : "hsl(var(--loss))"}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const TickerStrip = () => {
  const { baseCurrency, convertToBase, indiaMode } = useFX();
  const activeTickers = indiaMode ? INDIA_TICKERS : GLOBAL_TICKERS;
  const [tickers, setTickers] = useState<TickerData[]>(() =>
    activeTickers.map(t => ({ ...t, price: 0, nativeCurrency: t.currency, change: 0, history: [] }))
  );
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset tickers when mode changes
  useEffect(() => {
    setTickers(activeTickers.map(t => ({ ...t, price: 0, nativeCurrency: t.currency, change: 0, history: [] })));
  }, [indiaMode]);

  useEffect(() => {
    let alive = true;
    const fetchPrices = async () => {
      try {
        const { data, error } = await governedInvoke("market-data", {
          body: { tickers: activeTickers.map(t => t.symbol) },
        });
        if (!alive || error) return;

        const lookup: Record<string, { price: number; changePct: number; currency: string }> = {};
        if (data?.indices) {
          for (const idx of data.indices) {
            lookup[idx.symbol] = { price: idx.price, changePct: idx.changePct ?? 0, currency: idx.currency || "USD" };
          }
        }
        if (data?.macro) {
          // Macro is only a fallback when indices lookup didn't already provide the symbol
          const fb = (sym: string, price: number) => {
            if (price && !lookup[sym]) lookup[sym] = { price, changePct: 0, currency: "USD" };
          };
          fb("GC=F", data.macro.goldPrice);
          fb("CL=F", data.macro.crudeBrent);
          fb("BTC-USD", data.macro.btcUsd);
          fb("ETH-USD", data.macro.ethUsd);
          fb("SI=F", data.macro.silverPrice);
          fb("EURUSD=X", data.macro.eurUsd);
        }

        setTickers(prev =>
          prev.map(t => {
            const d = lookup[t.symbol];
            if (!d) return t;
            const newHistory = [...t.history.slice(-19), d.price];
            return { ...t, price: d.price, nativeCurrency: d.currency, change: d.changePct, history: newHistory };
          })
        );
      } catch { /* silent */ }
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, [indiaMode]);

  const items = [...tickers, ...tickers];
  const baseSym = getCurrencySymbol(baseCurrency);

  // Some tickers are ratios/indices, don't convert those
  const isRatio = (sym: string) => ["EURUSD=X", "DX-Y.NYB", "^TNX", "USDINR=X"].includes(sym);

  return (
    <div
      className="border-b border-border/50 bg-surface-1/60 overflow-hidden relative shrink-0 mask-fade-x"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={scrollRef}
        className={`flex items-center gap-1 px-2 py-1 ticker-scroll ${paused ? "ticker-paused" : ""}`}
        style={{ width: "max-content" }}
      >
        {items.map((t, i) => {
          const positive = t.change >= 0;
          const displayPrice = t.price > 0
            ? isRatio(t.symbol)
              ? t.price
              : convertToBase(t.price, t.nativeCurrency)
            : 0;
          const priceSymbol = isRatio(t.symbol) ? "" : baseSym;

          return (
            <div
              key={`${t.symbol}-${i}`}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 hover:bg-surface-2/80 transition-colors duration-200"
            >
              <span className="text-[10px] font-medium tracking-tight text-muted-foreground">{t.name}</span>
              <span className="text-[11px] font-semibold tracking-tight text-foreground tabular-nums">
                {displayPrice > 0 ? `${priceSymbol}${displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
              </span>
              <span className={`text-[10px] font-semibold tabular-nums ${positive ? "text-gain" : "text-loss"}`}>
                {positive ? "▲" : "▼"} {Math.abs(t.change).toFixed(2)}%
              </span>
              <MiniSparkline data={t.history} positive={positive} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default memo(TickerStrip);
