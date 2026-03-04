import { useState } from "react";
import { Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StockInputProps {
  onAnalyze: (ticker: string, buyPrice: number, quantity: number) => void;
  isLoading: boolean;
}

const QUICK_TICKERS = [
  { label: "RELIANCE", ticker: "RELIANCE.NS" },
  { label: "TCS", ticker: "TCS.NS" },
  { label: "AAPL", ticker: "AAPL" },
  { label: "TSLA", ticker: "TSLA" },
  { label: "MSFT", ticker: "MSFT" },
  { label: "BTC-USD", ticker: "BTC-USD" },
  { label: "ETH-USD", ticker: "ETH-USD" },
  { label: "EURUSD=X", ticker: "EURUSD=X" },
  { label: "GC=F", ticker: "GC=F" },
  { label: "HDFCBANK", ticker: "HDFCBANK.NS" },
];

const StockInput = ({ onAnalyze, isLoading }: StockInputProps) => {
  const [ticker, setTicker] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ticker && buyPrice && quantity) {
      onAnalyze(ticker.toUpperCase(), parseFloat(buyPrice), parseInt(quantity));
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-slide-up">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Analyze Asset</h2>
        <span className="ml-auto text-[9px] text-muted-foreground/60 font-mono">GLOBAL · ALL MARKETS</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ticker" className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Ticker / Symbol
          </Label>
          <Input
            id="ticker"
            placeholder="AAPL, BTC-USD, RELIANCE.NS, GC=F..."
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="bg-surface-2 border-border font-mono text-sm placeholder:text-muted-foreground/30 h-9"
          />
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
          {isLoading ? "Analyzing..." : "Run Deep Analysis"}
        </Button>
      </form>
    </div>
  );
};

export default StockInput;
