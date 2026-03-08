import { useState, useEffect, useCallback, useMemo } from "react";
import { Satellite, RefreshCw, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import GeopoliticalMap from "@/components/geopolitical/GeopoliticalMap";
import type { ConflictEvent, MapData } from "@/components/geopolitical/GeopoliticalMap";
import { RiskStrip, IntelligenceBrief, ThreatFeed, ThreatsView, ForexView } from "@/components/geopolitical/GeopoliticalPanels";

interface GeoData extends MapData {
  globalRiskScore: number;
  regimeSignal: string;
  capitalFlowDirection: string;
  safeHavenDemand?: string;
  intelligenceSummary?: string;
  keyThreats: string[];
  timestamp: number;
}

interface Props { stocks: PortfolioStock[]; }

function getTickerGeo(ticker: string): { lat: number; lng: number } | null {
  const t = ticker.toUpperCase();
  if (t.endsWith(".NS") || t.endsWith(".BO")) return { lat: 19, lng: 73 };
  if (t.endsWith(".L")) return { lat: 51.5, lng: -0.1 };
  if (t.endsWith(".T") || t.endsWith(".TYO")) return { lat: 35.7, lng: 139.7 };
  if (t.endsWith(".HK")) return { lat: 22.3, lng: 114.2 };
  if (t.endsWith(".SS") || t.endsWith(".SZ")) return { lat: 31.2, lng: 121.5 };
  if (t.endsWith(".DE") || t.endsWith(".F")) return { lat: 50.1, lng: 8.7 };
  if (t.endsWith(".PA")) return { lat: 48.9, lng: 2.3 };
  if (t.includes("-USD") || t.includes("-EUR")) return { lat: 37, lng: -95 };
  if (t.includes("=X")) return null;
  if (t.includes("=F")) return { lat: 41.9, lng: -87.6 };
  return { lat: 40.7, lng: -74 };
}

const LAYER_LABELS: Record<string, string> = {
  conflicts: "Conflicts",
  tradeHubs: "Trade Hubs",
  supplyChains: "Supply Routes",
  entropy: "Entropy Zones",
  forex: "FX Stress",
  portfolio: "Portfolio",
};

const GeopoliticalGlobe = ({ stocks }: Props) => {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConflict, setSelectedConflict] = useState<ConflictEvent | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "threats" | "forex">("map");
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    conflicts: true, tradeHubs: true, supplyChains: true, entropy: true, forex: true, portfolio: true,
  });

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data: result, error } = await governedInvoke("geopolitical-data");
      if (error) throw error;
      setData(result);
    } catch (e) { console.error("Geo fetch error:", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const i = setInterval(() => fetchData(false), 30000); return () => clearInterval(i); }, [fetchData]);

  const portfolioMarkers = useMemo(() =>
    stocks.filter(s => s.analysis).map(s => {
      const geo = getTickerGeo(s.ticker);
      return geo ? { ticker: s.ticker.replace(".NS", "").replace(".BO", ""), ...geo } : null;
    }).filter(Boolean) as { ticker: string; lat: number; lng: number }[],
    [stocks]
  );

  const exposedTickers = useMemo(() => {
    if (!data) return [];
    return stocks.filter(s => s.analysis && data.conflictEvents.some(c =>
      c.affectedAssets?.some(a => s.ticker.includes(a) || a.includes(s.ticker.replace(".NS", "").replace(".BO", "")))
    )).map(s => s.ticker);
  }, [stocks, data]);

  const toggleLayer = (key: string) => setVisibleLayers(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-2 border-primary/20 animate-ping absolute inset-0" />
          <Loader2 className="h-16 w-16 animate-spin text-primary relative" />
        </div>
        <span className="text-sm text-muted-foreground font-mono">Initializing intelligence grid...</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        Failed to load geopolitical data.
        <Button variant="ghost" size="sm" onClick={() => fetchData()} className="ml-2">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass-panel rounded-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-loss/10 border border-loss/20">
                <Satellite className="h-5 w-5 text-loss" />
              </div>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-loss opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-loss" />
              </span>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">God's Eye — Global Intelligence Map</h2>
              <p className="text-[9px] text-muted-foreground font-mono tracking-widest">
                LIVE · {data.conflictEvents.length} CONFLICTS · {data.timestamp ? `${Math.round((Date.now() - data.timestamp) / 1000)}s ago` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap relative z-10">
            {(["map", "threats", "forex"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-mono font-medium transition-all ${viewMode === m ? "glass-panel glass-glow-primary text-primary" : "glass-subtle text-muted-foreground hover:text-foreground"}`}>
                {m === "map" ? "🗺 Map" : m === "threats" ? "⚠ Threats" : "💱 Forex"}
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => fetchData(false)} className="h-7 gap-1 text-[10px]">
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> 30s
            </Button>
          </div>
        </div>
      </div>

      <RiskStrip data={data} />
      <IntelligenceBrief data={data} />

      {viewMode === "map" && (
        <>
          {/* Layer toggles */}
          <div className="flex flex-wrap gap-3 glass-subtle rounded-lg px-3 py-2">
            {Object.entries(LAYER_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox checked={visibleLayers[key] !== false} onCheckedChange={() => toggleLayer(key)} className="h-3 w-3" />
                <span className="text-[9px] font-mono text-muted-foreground">{label}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="glass-panel rounded-xl overflow-hidden relative" style={{ minHeight: 500 }}>
              <GeopoliticalMap
                data={data}
                portfolioMarkers={portfolioMarkers}
                onSelectConflict={setSelectedConflict}
                visibleLayers={visibleLayers}
              />
            </div>
            <ThreatFeed data={data} selectedConflict={selectedConflict} onSelectConflict={setSelectedConflict} exposedTickers={exposedTickers} />
          </div>
        </>
      )}

      {viewMode === "threats" && <ThreatsView data={data} exposedTickers={exposedTickers} />}
      {viewMode === "forex" && <ForexView data={data} />}
    </div>
  );
};

export default GeopoliticalGlobe;
