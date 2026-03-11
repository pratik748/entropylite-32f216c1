import { useState, useMemo } from "react";
import { Satellite, RefreshCw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import GeopoliticalMap from "@/components/geopolitical/GeopoliticalMap";
import type { ConflictEvent } from "@/components/geopolitical/GeopoliticalMap";
import { RiskStrip, IntelligenceBrief, ThreatFeed, ThreatsView, ForexView } from "@/components/geopolitical/GeopoliticalPanels";
import type { GeoData, TickerThreat } from "@/hooks/useGeoIntelligence";

interface Props {
  stocks: PortfolioStock[];
  geoData: GeoData | null;
  geoLoading: boolean;
  exposedTickers: string[];
  tickerThreats: Record<string, TickerThreat>;
  onRefresh: (showLoading?: boolean) => void;
}

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
  conflicts: "Conflicts", tradeHubs: "Trade Hubs", supplyChains: "Supply Routes",
  entropy: "Entropy Zones", forex: "FX Stress", portfolio: "Portfolio",
};

const GeopoliticalGlobe = ({ stocks, geoData: data, geoLoading: loading, exposedTickers, tickerThreats, onRefresh }: Props) => {
  const [selectedConflict, setSelectedConflict] = useState<ConflictEvent | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "threats" | "forex">("map");
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    conflicts: true, tradeHubs: true, supplyChains: true, entropy: true, forex: true, portfolio: true,
  });
  const [showLayers, setShowLayers] = useState(false);

  const portfolioMarkers = useMemo(() =>
    stocks.filter(s => s.analysis).map(s => {
      const geo = getTickerGeo(s.ticker);
      return geo ? { ticker: s.ticker.replace(".NS", "").replace(".BO", ""), ...geo } : null;
    }).filter(Boolean) as { ticker: string; lat: number; lng: number }[],
    [stocks]
  );

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
        <Button variant="ghost" size="sm" onClick={() => onRefresh()} className="ml-2">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Compact Header Bar */}
      <div className="glass-panel rounded-xl px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-shrink-0">
            <Satellite className="h-4 w-4 text-loss" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-loss opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-loss" />
            </span>
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-foreground tracking-tight truncate">God's Eye — Intelligence Map</h2>
            <p className="text-[8px] text-muted-foreground font-mono tracking-widest truncate">
              LIVE 20s · {data.conflictEvents.length} CONFLICTS
              {exposedTickers.length > 0 && <span className="text-loss ml-1">⚠ {exposedTickers.length} EXPOSED</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(["map", "threats", "forex"] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`rounded-md px-2 py-1 text-[9px] font-mono font-medium transition-all ${viewMode === m ? "glass-panel glass-glow-primary text-primary" : "glass-subtle text-muted-foreground hover:text-foreground"}`}>
              {m === "map" ? "🗺 Map" : m === "threats" ? "⚠ Threats" : "💱 FX"}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => onRefresh(false)} className="h-6 w-6 p-0">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <RiskStrip data={data} />

      {/* Slim Exposure Alert */}
      {exposedTickers.length > 0 && (
        <div className="glass-panel rounded-xl px-3 py-2 border border-loss/30 flex items-center gap-2 flex-wrap">
          <span className="flex h-2 w-2 flex-shrink-0"><span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-loss opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-loss" /></span>
          <span className="text-[9px] font-bold text-loss uppercase tracking-widest flex-shrink-0">Exposed:</span>
          {exposedTickers.map(t => {
            const threat = tickerThreats[t];
            return (
              <span key={t} className="inline-flex items-center gap-1 rounded bg-loss/10 border border-loss/20 px-1.5 py-0.5">
                <span className="font-mono text-[10px] font-bold text-loss">{t}</span>
                {threat && <span className="text-[7px] font-mono text-loss/70">{threat.score}</span>}
              </span>
            );
          })}
        </div>
      )}

      <IntelligenceBrief data={data} />

      {viewMode === "map" && (
        <div className="relative" style={{ minHeight: 380 }}>
          {/* Floating Layer Toggles */}
          <div className="absolute top-2 left-2 z-[1000]">
            <button
              onClick={() => setShowLayers(!showLayers)}
              className="glass-panel rounded-md px-2 py-1 text-[8px] font-mono text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              Layers {showLayers ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
            </button>
            {showLayers && (
              <div className="glass-panel rounded-md mt-1 p-2 space-y-1.5">
                {Object.entries(LAYER_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox checked={visibleLayers[key] !== false} onCheckedChange={() => toggleLayer(key)} className="h-3 w-3" />
                    <span className="text-[8px] font-mono text-muted-foreground">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-2 grid-cols-1 lg:grid-cols-[1fr_280px]" style={{ minHeight: 380 }}>
            <div className="glass-panel rounded-xl overflow-hidden relative" style={{ minHeight: 380 }}>
              <GeopoliticalMap data={data} portfolioMarkers={portfolioMarkers} onSelectConflict={setSelectedConflict} visibleLayers={visibleLayers} />
            </div>
            <ThreatFeed data={data} selectedConflict={selectedConflict} onSelectConflict={setSelectedConflict} exposedTickers={exposedTickers} />
          </div>
        </div>
      )}

      {viewMode === "threats" && <ThreatsView data={data} exposedTickers={exposedTickers} />}
      {viewMode === "forex" && <ForexView data={data} />}
    </div>
  );
};

export default GeopoliticalGlobe;
