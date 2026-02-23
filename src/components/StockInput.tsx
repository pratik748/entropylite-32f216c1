import { useState } from "react";
import { Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StockInputProps {
  onAnalyze: (ticker: string, buyPrice: number, quantity: number) => void;
  isLoading: boolean;
}

const POPULAR_TICKERS = [
  "RELIANCE.NS",
  "TCS.NS",
  "INFY.NS",
  "HDFCBANK.NS",
  "ICICIBANK.NS",
  "WIPRO.NS",
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

  const handleQuickSelect = (t: string) => {
    setTicker(t);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-5 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Analyze Stock</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ticker" className="text-sm text-muted-foreground">
            NSE/BSE Ticker
          </Label>
          <Input
            id="ticker"
            placeholder="e.g. RELIANCE.NS"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="bg-surface-2 border-border font-mono text-sm placeholder:text-muted-foreground/50"
          />
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_TICKERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleQuickSelect(t)}
                className="rounded-md bg-surface-3 px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="buyPrice" className="text-sm text-muted-foreground">
              Buy Price (₹)
            </Label>
            <Input
              id="buyPrice"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={buyPrice}
              onChange={(e) => setBuyPrice(e.target.value)}
              className="bg-surface-2 border-border font-mono text-sm placeholder:text-muted-foreground/50"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity" className="text-sm text-muted-foreground">
              Quantity
            </Label>
            <Input
              id="quantity"
              type="number"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="bg-surface-2 border-border font-mono text-sm placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={!ticker || !buyPrice || !quantity || isLoading}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
        >
          <Search className="mr-2 h-4 w-4" />
          {isLoading ? "Analyzing..." : "Run Analysis"}
        </Button>
      </form>
    </div>
  );
};

export default StockInput;
