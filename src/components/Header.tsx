import { useState, useEffect } from "react";
import { useFX, SUPPORTED_CURRENCIES, getCurrencyLabel } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Zap } from "lucide-react";

interface HeaderProps {
  directProfitMode?: boolean;
  onToggleDirectProfit?: () => void;
}

const Header = ({ directProfitMode, onToggleDirectProfit }: HeaderProps) => {
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
    <header data-density="compact" className="glass-panel border-b border-border/60 relative shrink-0">
      <div className="px-3 sm:container flex h-14 sm:h-16 items-center justify-between gap-2 relative z-10">
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0 overflow-hidden">
          <img alt="Entropy" className="h-11 sm:h-12 rounded-lg object-contain flex-shrink-0" src="/brand/entropy-mark.jpg" />
          <div className="hidden lg:flex flex-col justify-center leading-tight shrink-0">
            <span className="text-[13px] font-semibold tracking-tight text-foreground">Entropy</span>
            <span className="text-[10px] text-muted-foreground/70 tracking-tight">Predictive yield intelligence</span>
          </div>
          {/* Progressive disclosure: one market on mobile, all four from sm+ (Apple HIG density principle) */}
          <div className="hidden sm:flex items-center gap-3 ml-1.5 sm:ml-3 pl-2 sm:pl-4 border-l border-border/60 shrink-0">
            {markets.map(m => {
              const open = isMarketOpen(m.tz, m.open, m.close);
              return (
                <div key={m.name} className="flex items-center gap-1.5 whitespace-nowrap" title={`${m.name} ${open ? "open" : "closed"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${open ? "bg-gain shadow-[0_0_6px_hsl(var(--gain))] animate-breathe" : "bg-muted-foreground/25"}`} />
                  <span className="text-[11px] font-medium text-muted-foreground tracking-tight">{m.name}</span>
                </div>
              );
            })}
          </div>
          <div
            className="flex sm:hidden items-center gap-1 ml-1.5 pl-2 border-l border-border/60 shrink-0 whitespace-nowrap"
            title={`${markets.filter(m => isMarketOpen(m.tz, m.open, m.close)).length} of ${markets.length} markets open`}
          >
            {(() => {
              const openCount = markets.filter(m => isMarketOpen(m.tz, m.open, m.close)).length;
              return (
                <>
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${openCount > 0 ? "bg-gain shadow-[0_0_6px_hsl(var(--gain))] animate-breathe" : "bg-muted-foreground/25"}`} />
                  <span className="text-[10px] font-medium text-muted-foreground tracking-tight">{openCount}/{markets.length}</span>
                </>
              );
            })()}
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0">
          {/* Direct Profit Mode Toggle */}
          {onToggleDirectProfit && (
            <button
              onClick={onToggleDirectProfit}
              data-tour="direct-profit-btn"
              className={`pressable flex items-center gap-1.5 rounded-full px-3.5 sm:px-4 py-1.5 sm:py-2 text-[12px] sm:text-[13px] font-semibold tracking-tight transition-colors shadow-soft ${
                directProfitMode
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border/70 bg-surface-2/70 text-foreground hover:bg-surface-2"
              }`}
              title="Direct Profit Mode"
            >
              <Zap className={`h-3.5 w-3.5 ${directProfitMode ? "" : "text-warning"}`} />
              <span>Direct Profit</span>
            </button>
          )}
          {/* Base Currency Selector */}
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            aria-label="Base currency"
            className="rounded-full border border-border/70 bg-surface-2/70 px-2.5 py-1.5 text-[11px] sm:text-[12px] font-medium tracking-tight text-foreground cursor-pointer hover:bg-surface-2 transition-colors appearance-none"
            style={{ minWidth: 56 }}
          >
            {SUPPORTED_CURRENCIES.map(c => (
              <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>
            ))}
          </select>

          <span className="hidden md:inline text-[12px] font-medium text-muted-foreground tabular-nums tracking-tight">
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="pressable p-2 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
