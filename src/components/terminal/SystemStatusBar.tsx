import { useState, useEffect, memo } from "react";
import { Activity, Wifi, Cpu, Clock, Zap, BarChart3, ShieldCheck } from "lucide-react";
import { getGovernorMetrics } from "@/lib/apiGovernor";

interface SystemStatusBarProps {
  stockCount?: number;
  priceLatency?: number;
}

const SystemStatusBar = ({ stockCount = 0, priceLatency }: SystemStatusBarProps) => {
  const [utc, setUtc] = useState("");
  const [apiMetrics, setApiMetrics] = useState({ requestsPerHour: 0, requestsBlocked: 0, cacheHits: 0, savingsPercent: 0, requestsTotal: 0, estimatedCostUnits: 0 });
  // Real frame-time load: measured from rAF deltas (60fps == 0% load).
  const [frameLoad, setFrameLoad] = useState<number | null>(null);

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

  // Sample real frame deltas via requestAnimationFrame; load = (delta - 16.6ms) / 16.6ms clipped 0–100.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const samples: number[] = [];
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      samples.push(dt);
      if (samples.length > 60) samples.shift();
      if (samples.length >= 30) {
        const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
        const load = Math.max(0, Math.min(100, ((avg - 16.6) / 16.6) * 100));
        setFrameLoad(load);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const hasLatency = typeof priceLatency === "number" && Number.isFinite(priceLatency);
  const latencyMs = hasLatency ? (priceLatency as number) : null;
  const latencyColor = latencyMs == null
    ? "text-muted-foreground"
    : latencyMs < 50 ? "text-gain" : latencyMs < 150 ? "text-warning" : "text-loss";
  const savingsColor = apiMetrics.savingsPercent > 50 ? "text-gain" : apiMetrics.savingsPercent > 20 ? "text-warning" : "text-muted-foreground";

  return (
    <div data-tour="status-bar" className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface-1 px-2 sm:px-4 flex items-center justify-between font-mono text-[8px]" style={{ height: '24px' }}>
      <div className="flex items-center gap-2 sm:gap-3">
        <span className="h-1.5 w-1.5 rounded-full bg-gain flex-shrink-0" />
        <div className="flex items-center gap-1">
          <Zap className="h-2 w-2 text-gain" />
          <span className={`font-semibold tabular-nums ${latencyColor}`}>
            {latencyMs == null ? "—" : `${latencyMs}ms`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Wifi className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-gain" />
          <span className="text-gain font-semibold">LIVE</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          <Activity className="h-2.5 w-2.5 text-primary" />
          <span className="text-muted-foreground">SIMS</span>
          <span className="text-foreground font-semibold tabular-nums">{stockCount}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5">
          <BarChart3 className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-muted-foreground">API/HR</span>
          <span className="text-foreground font-semibold tabular-nums">{apiMetrics.requestsPerHour}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5">
          <ShieldCheck className="h-2.5 w-2.5 text-gain" />
          <span className="text-muted-foreground">SAVED</span>
          <span className={`font-semibold tabular-nums ${savingsColor}`}>{apiMetrics.savingsPercent}%</span>
        </div>
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">ASSETS</span>
          <span className="text-foreground font-semibold tabular-nums">{stockCount}</span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5">
          <Cpu className="h-2.5 w-2.5 text-muted-foreground" />
          <span className="text-foreground font-semibold tabular-nums">
            {frameLoad == null ? "—" : `${frameLoad.toFixed(0)}%`}
          </span>
          <div className="w-12 h-1 bg-surface-3 rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${frameLoad ?? 0}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-2 w-2 sm:h-2.5 sm:w-2.5 text-muted-foreground" />
          <span className="text-foreground font-semibold tabular-nums">{utc}</span>
        </div>
      </div>
    </div>
  );
};

export default memo(SystemStatusBar);
