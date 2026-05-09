import { useState, useEffect } from "react";
import { useFX, SUPPORTED_CURRENCIES, getCurrencyLabel } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Zap, Share2 } from "lucide-react";

interface HeaderProps {
  directProfitMode?: boolean;
  onToggleDirectProfit?: () => void;
  onOpenBrief?: () => void;
}

const Header = ({ directProfitMode, onToggleDirectProfit, onOpenBrief }: HeaderProps) => {
  const [time, setTime] = useState(new Date());
  const { baseCurrency, setBaseCurrency, setIndiaMode } = useFX();

  // Auto-toggle India mode based on currency selection
  useEffect(() => {
    setIndiaMode(baseCurrency === "INR");
  }, [baseCurrency, setIndiaMode]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const markets = [
    { name: "NYSE", tz: "America/New_York", open: 9.5, close: 16 },
    { name: "LSE", tz: "Europe/London", open: 8, close: 16.5 },
    { name: "NSE", tz: "Asia/Kolkata", open: 9.25, close: 15.5 },
    { name: "TSE", tz: "Asia/Tokyo", open: 9, close: 15 },
  ];

  const isMarketOpen = (tz: string, open: number, close: number) => {
    const t = new Date(time.toLocaleString("en-US", { timeZone: tz }));
    const h = t.getHours() + t.getMinutes() / 60;
    const day = t.getDay();
    return day >= 1 && day <= 5 && h >= open && h < close;
  };

  return (
    <header data-density="compact" className="border-b border-border/70 glass-panel relative shrink-0">
      <div className="px-3 sm:container flex h-16 sm:h-20 items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
          {onOpenBrief ? (
            <button
              onClick={onOpenBrief}
              data-tour="brief-btn"
              title="Open today's Entropy Brief"
              className="flex-shrink-0 rounded-md transition-all hover:opacity-90 active:scale-95 focus:outline-none focus:ring-1 focus:ring-primary/40"
              aria-label="Open Entropy Brief"
            >
              <img alt="Entropy — tap for today's Brief" className="h-14 sm:h-16 object-contain pointer-events-none" src="/brand/entropy-mark.jpg" />
            </button>
          ) : (
            <img alt="Entropy" className="h-14 sm:h-16 object-contain flex-shrink-0" src="/brand/entropy-mark.jpg" />
          )}
          <span className="hidden lg:inline font-mono text-[8px] text-muted-foreground/40 uppercase tracking-[0.2em] leading-tight max-w-[220px]">Economic Neural Trading &amp; Risk Optimisation via Predictive Yield</span>
          <div className="hidden md:flex items-center gap-3 ml-3 pl-3 border-l border-border/60">
            {markets.map(m => {
              const open = isMarketOpen(m.tz, m.open, m.close);
              return (
                <div key={m.name} className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${open ? "bg-gain animate-pulse" : "bg-muted-foreground/30"}`} />
                  <span className="font-mono text-[10px] text-muted-foreground">{m.name}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {/* Entropy Brief, share button */}
          {onOpenBrief && (
            <button
              onClick={onOpenBrief}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/70 bg-surface-2/60 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-surface-2 transition-all text-[10px] font-mono font-semibold"
              title="Generate today's shareable Entropy Brief"
            >
              <Share2 className="h-3 w-3" />
              <span>Brief</span>
            </button>
          )}
          {/* Direct Profit Mode Toggle */}
          {onToggleDirectProfit && (
            <button
              onClick={onToggleDirectProfit}
              data-tour="direct-profit-btn"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition-all text-[10px] font-mono font-semibold ${
                directProfitMode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/70 bg-surface-2/60 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-surface-2"
              }`}
            >
              <Zap className="h-3 w-3" />
              <span className="hidden sm:inline">Direct Profit</span>
            </button>
          )}
          {/* Base Currency Selector */}
          <div className="flex items-center gap-1">
            <span className="hidden sm:inline font-mono text-[9px] text-muted-foreground/60">BASE</span>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              className="bg-surface-2/70 border border-border/70 rounded-md px-1.5 sm:px-2 py-0.5 font-mono text-[9px] sm:text-[10px] text-foreground font-semibold cursor-pointer hover:border-foreground/30 hover:bg-surface-2 transition-all appearance-none"
              style={{ minWidth: 44 }}
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>
              ))}
            </select>
          </div>

          <span className="hidden md:inline font-mono text-[10px] text-muted-foreground/80 tabular-nums">
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })} UTC{time.getTimezoneOffset() > 0 ? "-" : "+"}{Math.abs(time.getTimezoneOffset() / 60)}
          </span>
          <span className="text-[9px] text-muted-foreground/45 font-mono tracking-wider hidden lg:inline">
            by <span className="text-muted-foreground/80 font-medium">Pratik Sehwag</span>
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
