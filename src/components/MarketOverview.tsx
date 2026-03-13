import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Globe, BarChart3, Fuel, DollarSign, Activity, Loader2, RefreshCw, Bitcoin, Landmark } from "lucide-react";
import { governedInvoke } from "@/lib/apiGovernor";
import { Button } from "@/components/ui/button";
import LiveNewsFeed from "@/components/LiveNewsFeed";
import VixGauge from "@/components/charts/VixGauge";
import { useMacroIntelligence } from "@/hooks/useMacroIntelligence";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface IndexData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  region?: string;
  currency?: string;
}

interface MarketData {
  indices: IndexData[];
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
    silverPrice?: number;
    eurUsd?: number;
    gbpUsd?: number;
    btcUsd?: number;
    ethUsd?: number;
    topMovers: { name: string; change: number }[];
    keyEvents: string[];
    outlook: string;
    sectorRotation?: string;
    riskAppetite?: string;
  } | null;
  timestamp?: number;
}

const REFRESH_INTERVAL = 15_000;
const regions = ["All", "US", "Europe", "Asia", "India"] as const;
type Region = typeof regions[number];

const MarketOverview = () => {
  const { data: macroIntel } = useMacroIntelligence();
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [region, setRegion] = useState<Region>("All");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMarketData = async (showLoading = true, force = false) => {
    if (showLoading) setLoading(true);
    try {
      const { data: result, error } = await governedInvoke("market-data", {
        body: { region },
        force,
      });
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Loading global market data...</span>
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

  const filteredIndices = region === "All" ? data.indices : data.indices.filter(i => i.region === region);

  const sectorChartData = data.sectors.map((s) => ({
    name: s.name,
    value: s.changePct,
    fill: s.changePct >= 0 ? "hsl(152, 82%, 42%)" : "hsl(0, 84%, 55%)",
  }));

  const getCurrencySymbol = (currency?: string) => {
    const map: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£", JPY: "¥", HKD: "HK$", CNY: "¥" };
    return map[currency || "USD"] || "";
  };

  return (
    <div className="space-y-5">
      {/* Live indicator + Region selector */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-gain" />
          </span>
          <span className="text-[10px] text-muted-foreground font-mono tracking-wider">
            LIVE · 15s refresh
            {lastUpdate && ` · ${lastUpdate.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {regions.map(r => (
            <button key={r} onClick={() => setRegion(r)}
              className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all ${region === r ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"}`}>
              {r}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => fetchMarketData(false)} className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground ml-2">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* Indices Grid */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filteredIndices.map((idx) => (
          <div key={idx.symbol} className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/20">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{idx.name}</p>
              {idx.region && <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">{idx.region}</span>}
            </div>
            <p className="font-mono text-xl font-bold text-foreground tabular-nums">
              {getCurrencySymbol(idx.currency)}{idx.price.toLocaleString("en-US", { maximumFractionDigits: idx.price > 1000 ? 0 : 2 })}
            </p>
            <div className={`mt-1 flex items-center gap-1.5 text-sm ${idx.change >= 0 ? "text-gain" : "text-loss"}`}>
              {idx.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span className="font-mono font-semibold tabular-nums text-xs">
                {idx.change >= 0 ? "+" : ""}{idx.change.toFixed(idx.price > 1000 ? 0 : 2)} ({idx.changePct >= 0 ? "+" : ""}{idx.changePct.toFixed(2)}%)
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* VIX Gauge + Key Macro Metrics */}
      {data.macro && (
        <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
          <VixGauge vix={data.macro.vix} />
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3">
            <MacroCard icon={<DollarSign className="h-4 w-4" />} label="USD/INR" value={data.macro.usdInr > 0 ? `${data.macro.usdInr.toFixed(2)}` : "—"} />
            <MacroCard icon={<DollarSign className="h-4 w-4" />} label="EUR/USD" value={data.macro.eurUsd ? `$${data.macro.eurUsd.toFixed(4)}` : "—"} />
            <MacroCard icon={<DollarSign className="h-4 w-4" />} label="GBP/USD" value={data.macro.gbpUsd ? `$${data.macro.gbpUsd.toFixed(4)}` : "—"} />
            <MacroCard icon={<Fuel className="h-4 w-4" />} label="Brent Crude" value={data.macro.crudeBrent > 0 ? `$${data.macro.crudeBrent.toFixed(2)}` : "—"} />
            <MacroCard icon={<BarChart3 className="h-4 w-4" />} label="Gold" value={data.macro.goldPrice ? `$${data.macro.goldPrice.toFixed(0)}` : "—"} />
            <MacroCard icon={<BarChart3 className="h-4 w-4" />} label="Silver" value={data.macro.silverPrice ? `$${data.macro.silverPrice.toFixed(2)}` : "—"} />
            <MacroCard icon={<Bitcoin className="h-4 w-4" />} label="Bitcoin" value={data.macro.btcUsd ? `$${data.macro.btcUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"} />
            <MacroCard icon={<Bitcoin className="h-4 w-4" />} label="Ethereum" value={data.macro.ethUsd ? `$${data.macro.ethUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"} />
            <MacroCard icon={<Globe className="h-4 w-4" />} label="FII Flow" value={data.macro.fiiFlow} />
          </div>
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
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/50" />
                  {event}
                </div>
              ))}
            </div>
            {data.macro.outlook && (
              <div className="rounded-lg bg-surface-2 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Global Outlook</p>
                <p className="text-sm leading-relaxed text-secondary-foreground">{data.macro.outlook}</p>
              </div>
            )}
            {data.macro.sectorRotation && (
              <div className="rounded-lg bg-surface-2 p-3 mt-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Sector Rotation</p>
                <p className="text-xs leading-relaxed text-secondary-foreground">{data.macro.sectorRotation}</p>
              </div>
            )}
            {data.macro.riskAppetite && (
              <div className="rounded-lg bg-primary/5 border border-primary/10 p-3 mt-2">
                <p className="text-[10px] uppercase tracking-wider text-primary/70 mb-1">Risk Appetite</p>
                <p className="text-xs leading-relaxed text-foreground">{data.macro.riskAppetite}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sector Performance */}
      {sectorChartData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Global Sector Performance (S&P 500 Sectors)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorChartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 13%)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(210, 8%, 45%)", fontSize: 11 }} axisLine={{ stroke: "hsl(220, 12%, 13%)" }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                <YAxis dataKey="name" type="category" tick={{ fill: "hsl(210, 8%, 45%)", fontSize: 11 }} axisLine={{ stroke: "hsl(220, 12%, 13%)" }} width={75} />
                <Tooltip contentStyle={{ background: "hsl(220, 14%, 7%)", border: "1px solid hsl(220, 12%, 13%)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(2)}%`, "Change"]} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {sectorChartData.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Macro Intelligence Strip */}
      {macroIntel && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Landmark className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Macro Regime Intelligence</h3>
            <span className={`ml-auto rounded-lg px-3 py-1 font-mono text-xs font-bold ${
              macroIntel.regime.regime === "expansion" ? "text-gain bg-gain/10" :
              macroIntel.regime.regime === "contraction" ? "text-loss bg-loss/10" :
              "text-warning bg-warning/10"
            }`}>
              {macroIntel.regime.regime.toUpperCase()} ({macroIntel.regime.confidence}%)
            </span>
          </div>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
            {macroIntel.indicators.filter(i => i.impact === "high").slice(0, 8).map(ind => (
              <div key={ind.id} className="rounded-lg bg-surface-2 p-2.5">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{ind.name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="font-mono text-sm font-bold text-foreground">
                    {typeof ind.value === "number" ? ind.value.toFixed(2) : ind.value}
                  </span>
                  <span className={`text-[9px] font-mono ${ind.trend === "rising" ? "text-gain" : ind.trend === "falling" ? "text-loss" : "text-muted-foreground"}`}>
                    {ind.trend === "rising" ? "▲" : ind.trend === "falling" ? "▼" : "—"}
                  </span>
                </div>
                <p className="text-[8px] text-muted-foreground mt-0.5">{ind.source} · {ind.lastUpdated}</p>
              </div>
            ))}
          </div>
          {macroIntel.regime.signals.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {macroIntel.regime.signals.map((sig, i) => (
                <span key={i} className="rounded-md bg-surface-3 px-2 py-1 text-[9px] text-muted-foreground">{sig}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live News Feed — region-aware */}
      <LiveNewsFeed region={region} />
    </div>
  );
};

const MacroCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/20">
    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
      {icon}
      <span className="text-[9px] uppercase tracking-wider">{label}</span>
    </div>
    <p className="font-mono text-sm font-bold text-foreground tabular-nums">{value}</p>
  </div>
);

export default MarketOverview;
