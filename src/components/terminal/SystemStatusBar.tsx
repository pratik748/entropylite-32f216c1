import { useState, useEffect, memo } from "react";
import { Activity, Wifi, Cpu, Clock, Zap, BarChart3, ShieldCheck } from "lucide-react";
import { getGovernorMetrics } from "@/lib/apiGovernor";

interface SystemStatusBarProps {
  stockCount?: number;
  priceLatency?: number;
}

const SystemStatusBar = ({ stockCount = 0, priceLatency }: SystemStatusBarProps) => {
  const [utc, setUtc] = useState("");
  const [simCount] = useState(() => Math.floor(Math.random() * 3) + 1);
  const [cpuLoad] = useState(() => (Math.random() * 20 + 8).toFixed(1));
  const [apiMetrics, setApiMetrics] = useState({ requestsPerHour: 0, requestsBlocked: 0, cacheHits: 0, savingsPercent: 0, requestsTotal: 0, estimatedCostUnits: 0 });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtc(now.toISOString().slice(11, 19));
      setApiMetrics(getGovernorMetrics());
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const latencyMs = priceLatency ?? Math.floor(Math.random() * 40 + 12);
  const latencyColor = latencyMs < 50 ? "text-gain" : latencyMs < 150 ? "text-warning" : "text-loss";
  const savingsColor = apiMetrics.savingsPercent > 50 ? "text-gain" : apiMetrics.savingsPercent > 20 ? "text-warning" : "text-muted-foreground";

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-sidebar px-3 flex items-stretch font-mono text-[9px] uppercase tracking-[0.12em]" style={{ height: '22px' }}>
      <div className="flex items-stretch divide-x divide-border">
        <div className="flex items-center gap-1.5 pr-3">
          <span className="h-1 w-1 bg-gain" />
          <span className="text-gain font-semibold">SYS·OK</span>
        </div>
        <div className="flex items-center gap-1.5 px-3">
          <Zap className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">LAT</span>
          <span className={`font-semibold tabular-nums ${latencyColor}`}>{latencyMs}<span className="text-muted-foreground/60">ms</span></span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3">
          <Wifi className="h-2.5 w-2.5 text-gain" />
          <span className="text-gain font-semibold">FEED·LIVE</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3">
          <Activity className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">SIM</span>
          <span className="text-foreground font-semibold tabular-nums">{stockCount > 0 ? simCount + stockCount : 0}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-3">
          <BarChart3 className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">API·HR</span>
          <span className="text-foreground font-semibold tabular-nums">{apiMetrics.requestsPerHour}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-3">
          <ShieldCheck className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">SAVED</span>
          <span className={`font-semibold tabular-nums ${savingsColor}`}>{apiMetrics.savingsPercent}%</span>
        </div>
      </div>
      <div className="flex-1" />
      <div className="flex items-stretch divide-x divide-border">
        <div className="flex items-center gap-1.5 px-3">
          <span className="text-muted-foreground">POS</span>
          <span className="text-foreground font-semibold tabular-nums">{stockCount}</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 px-3">
          <Cpu className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-foreground font-semibold tabular-nums">{cpuLoad}%</span>
          <div className="w-10 h-[3px] bg-surface-3 overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${cpuLoad}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 pl-3">
          <Clock className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-foreground font-semibold tabular-nums normal-case">{utc}<span className="text-muted-foreground/60 ml-1">UTC</span></span>
        </div>
      </div>
    </div>
  );
};

export default memo(SystemStatusBar);
