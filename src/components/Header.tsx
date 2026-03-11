import { useState, useEffect } from "react";
import { useFX, SUPPORTED_CURRENCIES, getCurrencyLabel } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { LogOut } from "lucide-react";

const Header = () => {
  const [time, setTime] = useState(new Date());
  const { baseCurrency, setBaseCurrency } = useFX();

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
    <header className="border-b border-border glass-panel relative shrink-0">
      <div className="px-2 sm:container flex h-10 sm:h-11 items-center justify-between relative z-10">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <img alt="Entropy" className="h-7 sm:h-9 object-contain flex-shrink-0" src="/lovable-uploads/9357bd58-6be2-4fd2-97f0-ac56eb56f217.jpg" />
          <span className="hidden lg:inline font-mono text-[8px] text-muted-foreground/40 uppercase tracking-[0.2em] leading-tight max-w-[220px]">Economic Neural Trading &amp; Risk Optimisation via Predictive Yield</span>
          <div className="hidden md:flex items-center gap-3 ml-4">
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
        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {/* Base Currency Selector */}
          <div className="flex items-center gap-1">
            <span className="hidden sm:inline font-mono text-[9px] text-muted-foreground/60">BASE</span>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              className="bg-surface-2 border border-border rounded px-1 sm:px-1.5 py-0.5 font-mono text-[9px] sm:text-[10px] text-primary font-semibold cursor-pointer hover:border-primary/40 transition-colors appearance-none"
              style={{ minWidth: 44 }}
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>
              ))}
            </select>
          </div>

          <span className="hidden sm:inline font-mono text-[11px] text-muted-foreground tabular-nums">
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })} UTC{time.getTimezoneOffset() > 0 ? "-" : "+"}{Math.abs(time.getTimezoneOffset() / 60)}
          </span>
          <span className="text-[10px] text-muted-foreground/50 font-mono tracking-wider hidden sm:inline">
            by <span className="text-muted-foreground font-medium">Pratik Sehwag</span>
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-1 sm:p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
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
