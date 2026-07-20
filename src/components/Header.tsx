import { useState, useEffect } from "react";
import { useFX, SUPPORTED_CURRENCIES } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { Command, LogOut, Search, Zap } from "lucide-react";
import { emitUIEvent } from "@/foresight/uiBus";
import wordmarkBlack from "@/assets/entropy-wordmark-black.png";

interface HeaderProps {
  directProfitMode?: boolean;
  onToggleDirectProfit?: () => void;
}

// Foresight's top launcher is hidden for now. Flip to `true` to restore the
// header button (⌘J and the command palette continue to open it regardless).
const FORESIGHT_LAUNCHER_ENABLED = false;

/** The brand wordmark, inverting with the terminal theme via .logo-adaptive. */
const TerminalMark = () => (
  <img
    src={wordmarkBlack}
    alt="Entropy"
    draggable={false}
    className="h-7 w-auto logo-adaptive select-none shrink-0"
  />
);

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

  const openPalette = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  };

  const openCount = markets.filter((m) => isMarketOpen(m.tz, m.open, m.close)).length;

  return (
    <header data-density="compact" className="border-b border-border bg-surface-1 relative shrink-0 z-40">
      <div className="px-3 sm:px-4 flex h-12 items-center gap-3 relative z-10">
        {/* Identity */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <TerminalMark />
          <span className="hidden lg:inline text-[8px] font-semibold uppercase tracking-[0.26em] text-muted-foreground/70 border-l border-border/60 pl-2.5">
            Terminal
          </span>
        </div>

        {/* Market session cluster */}
        <div className="hidden sm:flex items-center gap-3.5 pl-3.5 border-l border-border/60 shrink-0">
          {markets.map((m) => {
            const open = isMarketOpen(m.tz, m.open, m.close);
            return (
              <div key={m.name} className="flex items-center gap-1.5 whitespace-nowrap" title={`${m.name} ${open ? "open" : "closed"}`}>
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${open ? "bg-gain shadow-[0_0_6px_hsl(var(--gain))] animate-breathe" : "bg-muted-foreground/25"}`} />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{m.name}</span>
              </div>
            );
          })}
        </div>
        <div
          className="flex sm:hidden items-center gap-1.5 pl-2.5 border-l border-border/60 shrink-0 whitespace-nowrap"
          title={`${openCount} of ${markets.length} markets open`}
        >
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${openCount > 0 ? "bg-gain shadow-[0_0_6px_hsl(var(--gain))] animate-breathe" : "bg-muted-foreground/25"}`} />
          <span className="text-[10px] font-semibold text-muted-foreground tabular-nums">{openCount}/{markets.length}</span>
        </div>

        {/* Global search — opens the command palette */}
        <button
          onClick={openPalette}
          className="hidden md:flex flex-1 max-w-md items-center gap-2 border border-border bg-surface-2/60 px-3 h-8 text-left hover:bg-surface-2 hover:border-border transition-colors mx-2"
          aria-label="Open command palette"
        >
          <Search className="h-3 w-3 text-muted-foreground/70 shrink-0" />
          <span className="flex-1 text-[11.5px] font-medium tracking-tight text-muted-foreground/70 truncate">
            Search modules, actions…
          </span>
          <kbd className="rounded-md border border-border/80 bg-surface-3/70 px-1.5 py-0.5 text-[9.5px] font-semibold text-muted-foreground/80">
            ⌘K
          </kbd>
        </button>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
          {/* Foresight operating surface — top launcher hidden for now.
              Foresight itself is still reachable via ⌘J and the command
              palette ("Ask Foresight"); restore this button to bring it back. */}
          {FORESIGHT_LAUNCHER_ENABLED && (
            <button
              onClick={() => emitUIEvent("open_surface", {})}
              className="pressable hidden md:flex items-center gap-1.5 border border-border bg-surface-2/60 px-3 h-8 text-[11.5px] font-semibold tracking-tight text-foreground hover:bg-surface-2 transition-colors"
              title="Foresight (⌘J)"
            >
              <Command className="h-3 w-3 text-muted-foreground" />
              <span className="hidden lg:inline">Foresight</span>
              <kbd className="hidden lg:inline text-[8.5px] font-mono text-muted-foreground/60 border border-border/50 rounded px-1 py-px">⌘J</kbd>
            </button>
          )}

          {/* Direct Profit Mode Toggle */}
          {onToggleDirectProfit && (
            <button
              onClick={onToggleDirectProfit}
              data-tour="direct-profit-btn"
              className={`pressable flex items-center gap-1.5 px-3 h-8 text-[11.5px] font-semibold tracking-tight transition-colors ${
                directProfitMode
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border/70 bg-surface-2/60 text-foreground hover:bg-surface-2"
              }`}
              title="Direct Profit Mode"
            >
              <Zap className={`h-3 w-3 ${directProfitMode ? "" : "text-warning"}`} />
              <span className="hidden sm:inline">Direct Profit</span>
            </button>
          )}

          {/* Base Currency Selector */}
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            aria-label="Base currency"
            className="border border-border bg-surface-2/60 px-2 h-8 text-[11px] font-semibold tracking-tight text-foreground cursor-pointer hover:bg-surface-2 transition-colors appearance-none"
            style={{ minWidth: 56 }}
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>{getCurrencySymbol(c)} {c}</option>
            ))}
          </select>

          <span className="hidden md:inline text-[11px] font-semibold text-muted-foreground tabular-nums tracking-tight border-l border-border/60 pl-3">
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>

          <button
            onClick={() => supabase.auth.signOut()}
            className="pressable flex h-8 w-8 items-center justify-center hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
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
