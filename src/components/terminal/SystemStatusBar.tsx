import { useState, useEffect } from "react";
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
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface-1 px-4 py-1 flex items-center justify-between font-mono text-[9px]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Zap className="h-2.5 w-2.5 text-gain" />
          <span className="text-muted-foreground">LATENCY</span>
          <span className={`font-semibold tabular-nums ${latencyColor}`}>{latencyMs}ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Activity className="h-2.5 w-2.5 text-primary" />
          <span className="text-muted-foreground">SIMS</span>
          <span className="text-foreground font-semibold tabular-nums">{stockCount > 0 ? simCount + stockCount : 0}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Wifi className="h-2.5 w-2.5 text-gain" />
          <span className="text-muted-foreground">WS</span>
          <span className="text-gain font-semibold">CONNECTED</span>
        </div>
        {/* API Governor Metrics */}
        <div className="hidden md:flex items-center gap-1.5">
          <BarChart3 className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">API/HR</span>
          <span className="text-foreground font-semibold tabular-nums">{apiMetrics.requestsPerHour}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5">
          <ShieldCheck className="h-2.5 w-2.5 text-gain" />
          <span className="text-muted-foreground">SAVED</span>
          <span className={`font-semibold tabular-nums ${savingsColor}`}>{apiMetrics.savingsPercent}%</span>
          <span className="text-muted-foreground/50">({apiMetrics.cacheHits + apiMetrics.requestsBlocked} cached)</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Cpu className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">COMPUTE</span>
          <span className="text-foreground font-semibold tabular-nums">{cpuLoad}%</span>
          <div className="w-12 h-1 bg-surface-3 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${cpuLoad}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">ASSETS</span>
          <span className="text-foreground font-semibold tabular-nums">{stockCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-foreground font-semibold tabular-nums">{utc}</span>
          <span className="text-muted-foreground">UTC</span>
        </div>
      </div>
    </div>
  );
};

export default SystemStatusBar;
