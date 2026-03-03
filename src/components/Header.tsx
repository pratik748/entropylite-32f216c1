import { useState, useEffect } from "react";

const Header = () => {
  const [time, setTime] = useState(new Date());

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
    <header className="border-b border-border bg-background">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-4">
          <img alt="Entropy" className="h-9 object-contain" src="/lovable-uploads/9357bd58-6be2-4fd2-97f0-ac56eb56f217.jpg" />
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
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })} UTC{time.getTimezoneOffset() > 0 ? "-" : "+"}{Math.abs(time.getTimezoneOffset() / 60)}
          </span>
          <span className="text-[10px] text-muted-foreground/50 font-mono tracking-wider hidden sm:inline">
            by <span className="text-muted-foreground font-medium">Pratik Sehwag</span>
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
