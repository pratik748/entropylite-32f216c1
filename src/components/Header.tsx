import { useState, useEffect } from "react";
import { useFX, SUPPORTED_CURRENCIES, getCurrencyLabel } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Zap, Share2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface HeaderProps {
  directProfitMode?: boolean;
  onToggleDirectProfit?: () => void;
  onOpenBrief?: () => void;
}

const Header = ({ directProfitMode, onToggleDirectProfit, onOpenBrief }: HeaderProps) => {
  const [time, setTime] = useState(new Date());
  const { baseCurrency, setBaseCurrency, indiaMode, setIndiaMode } = useFX();

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
    <header className="border-b border-border bg-surface-1 relative shrink-0">
      <div className="px-3 flex h-9 items-center justify-between relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          <img alt="Entropy" className="h-5 object-contain flex-shrink-0 opacity-90" src="/lovable-uploads/9357bd58-6be2-4fd2-97f0-ac56eb56f217.jpg" />
          <span className="font-mono text-[9px] text-foreground/80 uppercase tracking-[0.22em] font-semibold border-l border-border pl-3">ENTROPY · CONTROL</span>
          <div className="hidden md:flex items-center gap-2 ml-3 border-l border-border pl-3">
            {markets.map(m => {
              const open = isMarketOpen(m.tz, m.open, m.close);
              return (
                <div key={m.name} className="flex items-center gap-1">
                  <span className={`h-1 w-1 ${open ? "bg-gain" : "bg-muted-foreground/30"}`} />
                  <span className={`font-mono text-[9px] tracking-wider ${open ? "text-foreground" : "text-muted-foreground/60"}`}>{m.name}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Entropy Brief — share button */}
          {onOpenBrief && (
            <button
              onClick={onOpenBrief}
              className="hidden sm:flex items-center gap-1 h-6 px-2 border border-border bg-transparent text-muted-foreground hover:text-primary hover:border-primary/60 transition-colors text-[10px] font-mono font-semibold uppercase tracking-wider"
              title="Generate today's shareable Entropy Brief"
            >
              <Share2 className="h-2.5 w-2.5" />
              <span>Brief</span>
            </button>
          )}
          {/* Direct Profit Mode Toggle */}
          {onToggleDirectProfit && (
            <button
              onClick={onToggleDirectProfit}
              className={`flex items-center gap-1 h-6 px-2 border transition-colors text-[10px] font-mono font-semibold uppercase tracking-wider ${
                directProfitMode
                  ? "border-primary text-primary accent-bar-l bg-primary/[0.06]"
                  : "border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              <Zap className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">Direct</span>
            </button>
          )}
          {/* India Mode Toggle */}
          <div className="hidden sm:flex items-center gap-1.5 border-l border-border pl-2">
            <span className="text-[10px]">🇮🇳</span>
            <Switch
              checked={indiaMode}
              onCheckedChange={setIndiaMode}
              className="h-4 w-8 data-[state=checked]:bg-primary"
            />
          </div>

          {/* Base Currency Selector */}
          <div className="flex items-center gap-1 border-l border-border pl-2">
            <span className="hidden sm:inline font-mono text-[8px] uppercase tracking-wider text-muted-foreground/60">BASE</span>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              className="bg-transparent border border-border px-1 py-0.5 font-mono text-[10px] text-foreground font-semibold cursor-pointer hover:border-primary/60 transition-colors appearance-none"
              style={{ minWidth: 44 }}
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>
              ))}
            </select>
          </div>

          <span className="hidden md:inline font-mono text-[10px] text-muted-foreground tabular-nums border-l border-border pl-2">
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="p-1 border border-transparent hover:border-border text-muted-foreground hover:text-loss transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3 w-3" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
