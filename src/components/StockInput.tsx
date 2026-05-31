import { useEffect, useMemo, useRef, useState } from "react";
import { Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchSymbols, type SymbolEntry } from "@/lib/symbolDirectory";

interface StockInputProps {
  onAnalyze: (ticker: string, buyPrice: number, quantity: number) => void;
  isLoading: boolean;
  compact?: boolean;
}

const QUICK_TICKERS = [
  { label: "RELIANCE", ticker: "RELIANCE.NS" },
  { label: "TCS", ticker: "TCS.NS" },
  { label: "ZOMATO", ticker: "ZOMATO.NS" },
  { label: "AAPL", ticker: "AAPL" },
  { label: "TSLA", ticker: "TSLA" },
  { label: "MSFT", ticker: "MSFT" },
  { label: "BTC-USD", ticker: "BTC-USD" },
  { label: "ETH-USD", ticker: "ETH-USD" },
  { label: "EURUSD=X", ticker: "EURUSD=X" },
  { label: "GC=F", ticker: "GC=F" },
  { label: "HDFCBANK", ticker: "HDFCBANK.NS" },
];

const StockInput = ({ onAnalyze, isLoading, compact }: StockInputProps) => {
  const [ticker, setTicker] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const suggestions = useMemo<SymbolEntry[]>(
    () => (ticker.trim().length >= 1 ? searchSymbols(ticker, compact ? 6 : 8) : []),
    [ticker, compact],
  );

  useEffect(() => {
    setActiveIdx(0);
  }, [ticker]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowSuggest(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const pickSuggestion = (entry: SymbolEntry) => {
    setTicker(entry.ticker);
    setShowSuggest(false);
  };

  const onTickerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggest || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      // If the user is actively navigating suggestions, accept the highlighted one
      // instead of submitting an incomplete form.
      if (suggestions[activeIdx]) {
        e.preventDefault();
        pickSuggestion(suggestions[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setShowSuggest(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticker && buyPrice && quantity) {
      onAnalyze(ticker.toUpperCase(), parseFloat(buyPrice), parseInt(quantity));
      setShowSuggest(false);
    }
  };

  if (compact) {
    return (
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
        <div ref={wrapRef} className="relative">
          <Input
            placeholder="TICKER"
            value={ticker}
            onChange={(e) => { setTicker(e.target.value); setShowSuggest(true); }}
            onFocus={() => setShowSuggest(true)}
            onKeyDown={onTickerKeyDown}
            className="bg-surface-2 border-border font-mono text-[10px] h-6 px-1.5 w-20 placeholder:text-muted-foreground/30"
          />
          {showSuggest && suggestions.length > 0 && (
            <SuggestList
              suggestions={suggestions}
              activeIdx={activeIdx}
              onPick={pickSuggestion}
              compact
            />
          )}
        </div>
        <Input
          type="number"
          step="0.01"
          placeholder="Price"
          value={buyPrice}
          onChange={(e) => setBuyPrice(e.target.value)}
          className="bg-surface-2 border-border font-mono text-[10px] h-6 px-1.5 w-16 placeholder:text-muted-foreground/30"
        />
        <Input
          type="number"
          placeholder="Qty"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="bg-surface-2 border-border font-mono text-[10px] h-6 px-1.5 w-12 placeholder:text-muted-foreground/30"
        />
        <Button
          type="submit"
          disabled={!ticker || !buyPrice || !quantity || isLoading}
          size="sm"
          className="h-6 px-2 text-[10px] font-mono"
        >
          <Search className="h-2.5 w-2.5" />
        </Button>
      </form>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 sm:p-5 animate-slide-up">
      <div className="mb-3 sm:mb-4 flex items-center gap-2">
        <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg bg-primary/10">
          <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary" />
        </div>
        <h2 className="text-xs sm:text-sm font-semibold text-foreground">Analyze Asset</h2>
        <span className="ml-auto text-[8px] sm:text-[9px] text-muted-foreground/60 font-mono">GLOBAL · ALL MARKETS</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div ref={wrapRef} className="space-y-1.5 relative">
          <Label htmlFor="ticker" className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ticker / Symbol
          </Label>
          <Input
            id="ticker"
            placeholder="AAPL, BTC-USD, RELIANCE.NS, GC=F..."
            value={ticker}
            onChange={(e) => { setTicker(e.target.value); setShowSuggest(true); }}
            onFocus={() => setShowSuggest(true)}
            onKeyDown={onTickerKeyDown}
            autoComplete="off"
            className="bg-surface-2 border-border font-mono text-sm placeholder:text-muted-foreground/30 h-9"
          />
          {showSuggest && suggestions.length > 0 && (
            <SuggestList
              suggestions={suggestions}
              activeIdx={activeIdx}
              onPick={pickSuggestion}
            />
          )}
          <div className="flex flex-wrap gap-1">
            {QUICK_TICKERS.map((t) => (
              <button
                key={t.ticker}
                type="button"
                onClick={() => setTicker(t.ticker)}
                className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="buyPrice" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Buy Price
            </Label>
            <Input
              id="buyPrice"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              className="bg-surface-2 border-border font-mono text-sm placeholder:text-muted-foreground/30 h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quantity" className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Quantity
            </Label>
            <Input
              id="quantity"
              type="number"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="bg-surface-2 border-border font-mono text-sm placeholder:text-muted-foreground/30 h-9"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={!ticker || !buyPrice || !quantity || isLoading}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium h-9 text-sm"
        >
          <Search className="mr-2 h-3.5 w-3.5" />
          {isLoading ? "Processing..." : "Run Intelligence Analysis"}
        </Button>
      </form>
    </div>
  );
};

export default StockInput;

// ---- Suggestion dropdown ----

const KIND_LABELS: Record<SymbolEntry["kind"], string> = {
  equity: "EQ",
  crypto: "CRY",
  fx: "FX",
  commodity: "CMD",
  etf: "ETF",
  index: "IDX",
};

interface SuggestListProps {
  suggestions: SymbolEntry[];
  activeIdx: number;
  onPick: (entry: SymbolEntry) => void;
  compact?: boolean;
}

const SuggestList = ({ suggestions, activeIdx, onPick, compact }: SuggestListProps) => {
  return (
    <div
      className={`absolute z-50 mt-1 ${compact ? "left-0 w-64" : "left-0 right-0"} rounded-md border border-border bg-popover shadow-lg overflow-hidden animate-fade-in`}
    >
      <ul className="max-h-72 overflow-auto py-1">
        {suggestions.map((s, i) => {
          const active = i === activeIdx;
          return (
            <li key={s.ticker}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(s); }}
                className={`w-full text-left px-2 py-1.5 flex items-center gap-2 transition-colors ${
                  active ? "bg-primary/10" : "hover:bg-surface-2"
                }`}
              >
                <span className="font-mono text-[11px] font-semibold text-foreground min-w-[80px]">
                  {s.ticker}
                </span>
                <span className="text-[10px] text-muted-foreground truncate flex-1">
                  {s.name}
                </span>
                <span className="font-mono text-[8px] text-muted-foreground/60 px-1 py-0.5 rounded bg-surface-2 border border-border/50">
                  {KIND_LABELS[s.kind]} · {s.exchange}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
