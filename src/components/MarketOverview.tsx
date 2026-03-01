import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Globe, BarChart3, Fuel, DollarSign, Activity, Loader2, RefreshCw, Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import LiveNewsFeed from "@/components/LiveNewsFeed";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface MarketData {
  indices: { symbol: string; name: string; price: number; change: number; changePct: number }[];
  sectors: { name: string; price: number; change: number; changePct: number }[];
  macro: {
    marketMood: string;
    moodScore: number;
    fiiFlow: string;
    diiFlow: string;
    vix: number;
    usdInr: number;
    crudeBrent: number;
    goldPrice?: number;
    topMovers: { name: string; change: number }[];
    keyEvents: string[];
    outlook: string;
  } | null;
  timestamp?: number;
}

const REFRESH_INTERVAL = 15_000; // 15 seconds

const MarketOverview = () => {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMarketData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("market-data");
      if (error) throw error;
      setData(result);
      setLastUpdate(new Date());
    } catch (e) {
      console.error("Market data error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketData();
    intervalRef.current = setInterval(() => fetchMarketData(false), REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Loading live market data...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Failed to load market data.
        <Button variant="ghost" size="sm" onClick={() => fetchMarketData()} className="ml-2">Retry</Button>
      </div>
    );
  }

  const moodConfig: Record<string, { color: string; bg: string }> = {
    Bullish: { color: "text-gain", bg: "bg-gain/10" },
    Bearish: { color: "text-loss", bg: "bg-loss/10" },
    Neutral: { color: "text-warning", bg: "bg-warning/10" },
    Cautious: { color: "text-warning", bg: "bg-warning/10" },
  };

  const mood = data.macro?.marketMood || "Neutral";
  const moodStyle = moodConfig[mood] || moodConfig.Neutral;

  const sectorChartData = data.sectors.map((s) => ({
    name: s.name.replace("NIFTY ", ""),
    value: s.changePct,
    fill: s.changePct >= 0 ? "hsl(145, 70%, 50%)" : "hsl(0, 72%, 55%)",
  }));

  return (
    <div className="space-y-6">
      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-gain" />
          </span>
          <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
            LIVE · Auto-refresh 15s
            {lastUpdate && ` · ${lastUpdate.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
          </span>
        </div>
        <Button size="sm" variant="ghost" onClick={() => fetchMarketData(false)} className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Indices */}
      <div className="grid gap-3 md:grid-cols-3">
        {data.indices.map((idx) => (
          <div key={idx.symbol} className="rounded-xl border border-border bg-card p-5 transition-all hover:border-foreground/20">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{idx.name}</p>
            <p className="mt-1.5 font-mono text-2xl font-bold text-foreground tabular-nums">
              {idx.price.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
            <div className={`mt-1.5 flex items-center gap-1.5 text-sm ${idx.change >= 0 ? "text-gain" : "text-loss"}`}>
              {idx.change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              <span className="font-mono font-semibold tabular-nums">
                {idx.change >= 0 ? "+" : ""}{idx.change.toFixed(0)} ({idx.changePct >= 0 ? "+" : ""}{idx.changePct.toFixed(2)}%)
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Key Macro Metrics Bar */}
      {data.macro && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
          <MacroCard icon={<DollarSign className="h-4 w-4" />} label="USD/INR" value={data.macro.usdInr > 0 ? `₹${data.macro.usdInr.toFixed(2)}` : "—"} />
          <MacroCard icon={<Fuel className="h-4 w-4" />} label="Brent Crude" value={data.macro.crudeBrent > 0 ? `$${data.macro.crudeBrent.toFixed(2)}` : "—"} />
          <MacroCard icon={<Activity className="h-4 w-4" />} label="India VIX" value={data.macro.vix > 0 ? data.macro.vix.toFixed(2) : "—"} />
          <MacroCard icon={<Globe className="h-4 w-4" />} label="FII Flow" value={data.macro.fiiFlow} />
          <MacroCard icon={<BarChart3 className="h-4 w-4" />} label="DII Flow" value={data.macro.diiFlow} />
        </div>
      )}

      {/* Macro Summary */}
      {data.macro && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Market Mood</h3>
              <span className={`rounded-lg px-3 py-1 font-mono text-sm font-bold ${moodStyle.color} ${moodStyle.bg}`}>
                {mood}
                {data.macro.moodScore !== 0 && (
                  <span className="ml-1.5 text-xs opacity-70">{data.macro.moodScore > 0 ? "+" : ""}{data.macro.moodScore}</span>
                )}
              </span>
            </div>

            {data.macro.topMovers?.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Top Movers</p>
                {data.macro.topMovers.slice(0, 5).map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{m.name}</span>
                    <span className={`font-mono font-semibold ${m.change >= 0 ? "text-gain" : "text-loss"}`}>
                      {m.change >= 0 ? "+" : ""}{m.change}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Key Events & Outlook</h3>
            <div className="space-y-2 mb-4">
              {data.macro.keyEvents?.map((event, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-secondary-foreground">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground/50" />
                  {event}
                </div>
              ))}
            </div>
            {data.macro.outlook && (
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Outlook</p>
                <p className="text-sm leading-relaxed text-secondary-foreground">{data.macro.outlook}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sector Performance */}
      {sectorChartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Sector Performance</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorChartData} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 14%)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 11 }}
                  axisLine={{ stroke: "hsl(0, 0%, 14%)" }}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 11 }}
                  axisLine={{ stroke: "hsl(0, 0%, 14%)" }}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(0, 0%, 6%)",
                    border: "1px solid hsl(0, 0%, 14%)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v.toFixed(2)}%`, "Change"]}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {sectorChartData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Live News Feed for entire market */}
      <LiveNewsFeed />
    </div>
  );
};

const MacroCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-xl border border-border bg-card p-4 transition-all hover:border-foreground/20">
    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
      {icon}
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </div>
    <p className="font-mono text-base font-bold text-foreground tabular-nums">{value}</p>
  </div>
);

export default MarketOverview;
