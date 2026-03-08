import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TickerData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  history: number[];
}

const GLOBAL_TICKERS = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "NASDAQ" },
  { symbol: "^DJI", name: "DOW" },
  { symbol: "^N225", name: "NIKKEI" },
  { symbol: "^STOXX50E", name: "EURO STOXX" },
  { symbol: "^HSI", name: "HANG SENG" },
  { symbol: "GC=F", name: "GOLD" },
  { symbol: "CL=F", name: "OIL" },
  { symbol: "BTC-USD", name: "BTC" },
  { symbol: "ETH-USD", name: "ETH" },
  { symbol: "^TNX", name: "US 10Y" },
  { symbol: "DX-Y.NYB", name: "DXY" },
  { symbol: "SI=F", name: "SILVER" },
  { symbol: "EURUSD=X", name: "EUR/USD" },
  { symbol: "^FTSE", name: "FTSE" },
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
  const [tickers, setTickers] = useState<TickerData[]>(() =>
    GLOBAL_TICKERS.map(t => ({ ...t, price: 0, change: 0, history: [] }))
  );
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const fetchPrices = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("market-data", {
          body: { tickers: GLOBAL_TICKERS.map(t => t.symbol) },
        });
        if (!alive || error) return;

        // Build lookup from indices array (symbol → {price, changePct})
        const lookup: Record<string, { price: number; changePct: number }> = {};
        if (data?.indices) {
          for (const idx of data.indices) {
            lookup[idx.symbol] = { price: idx.price, changePct: idx.changePct ?? 0 };
          }
        }
        // Also check macro for specific tickers
        if (data?.macro) {
          if (data.macro.goldPrice) lookup["GC=F"] = { price: data.macro.goldPrice, changePct: 0 };
          if (data.macro.crudeBrent) lookup["CL=F"] = { price: data.macro.crudeBrent, changePct: 0 };
          if (data.macro.btcUsd) lookup["BTC-USD"] = { price: data.macro.btcUsd, changePct: 0 };
          if (data.macro.ethUsd) lookup["ETH-USD"] = { price: data.macro.ethUsd, changePct: 0 };
          if (data.macro.silverPrice) lookup["SI=F"] = { price: data.macro.silverPrice, changePct: 0 };
          if (data.macro.eurUsd) lookup["EURUSD=X"] = { price: data.macro.eurUsd, changePct: 0 };
        }

        setTickers(prev =>
          prev.map(t => {
            const d = lookup[t.symbol];
            if (!d) return t;
            const newHistory = [...t.history.slice(-19), d.price];
            return { ...t, price: d.price, change: d.changePct, history: newHistory };
          })
        );
      } catch { /* silent */ }
    };
    fetchPrices();
    const iv = setInterval(fetchPrices, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  // Duplicate items for seamless scroll
  const items = [...tickers, ...tickers];

  return (
    <div
      className="border-b border-border bg-surface-1 overflow-hidden relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={scrollRef}
        className={`flex items-center gap-0 ticker-scroll ${paused ? "ticker-paused" : ""}`}
        style={{ width: "max-content" }}
      >
        {items.map((t, i) => {
          const positive = t.change >= 0;
          return (
            <div
              key={`${t.symbol}-${i}`}
              className="flex items-center gap-2 px-3 py-1 border-r border-border/50 hover:bg-surface-2 transition-colors"
            >
              <span className="font-mono text-[9px] text-muted-foreground font-semibold">{t.name}</span>
              <span className="font-mono text-[10px] text-foreground font-medium tabular-nums">
                {t.price > 0 ? t.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
              </span>
              <span className={`font-mono text-[9px] font-semibold tabular-nums ${positive ? "text-gain" : "text-loss"}`}>
                {positive ? "+" : ""}{t.change.toFixed(2)}%
              </span>
              <MiniSparkline data={t.history} positive={positive} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TickerStrip;
