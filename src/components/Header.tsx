import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

const Header = () => {
  const [time, setTime] = useState(new Date());
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return true;
  });

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // Default to dark on first load if no preference
    const stored = localStorage.getItem("entropy-theme");
    if (!stored) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("entropy-theme", next ? "dark" : "light");
  };

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
    <header className="border-b border-border/50 glass-panel relative">
      <div className="container flex h-12 items-center justify-between relative z-10">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <img alt="Entropy" className="h-7 w-7 rounded-lg object-contain" src="/lovable-uploads/9357bd58-6be2-4fd2-97f0-ac56eb56f217.jpg" />
            <span className="text-sm font-semibold tracking-tight text-foreground">Entropy</span>
          </div>
          <div className="hidden md:flex items-center gap-4 ml-2">
            {markets.map(m => {
              const open = isMarketOpen(m.tz, m.open, m.close);
              return (
                <div key={m.name} className="flex items-center gap-1.5">
                  <span className={`h-[5px] w-[5px] rounded-full transition-colors duration-700 ${open ? "bg-gain" : "bg-muted-foreground/20"}`} />
                  <span className="font-mono text-[10px] tracking-wide text-muted-foreground/70 uppercase">{m.name}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-muted-foreground/60 tabular-nums tracking-wider">
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <button
            onClick={toggleTheme}
            className="flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 hover:bg-accent active:scale-95 text-muted-foreground hover:text-foreground"
            aria-label="Toggle theme"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
          <span className="text-[9px] text-muted-foreground/30 tracking-widest uppercase hidden sm:inline">
            Entropy Lite
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
