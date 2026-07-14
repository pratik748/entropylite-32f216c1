import { useState, useMemo } from "react";
import { Satellite, RefreshCw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import GeopoliticalMap from "@/components/geopolitical/GeopoliticalMap";
import type { ConflictEvent } from "@/components/geopolitical/GeopoliticalMap";
import { RiskStrip, IntelligenceBrief, ThreatFeed, ThreatsView, ForexView } from "@/components/geopolitical/GeopoliticalPanels";
import type { GeoData, TickerThreat } from "@/hooks/useGeoIntelligence";
import EventFeed from "@/components/geopolitical/EventFeed";
import { useGeoEvents, type ScoredGeoEvent } from "@/hooks/useGeoEvents";
import IntelStack from "@/components/geopolitical/IntelStack";
import { useTacticalMovement } from "@/hooks/useTacticalMovement";
import { Dialog, DialogContent } from "@/components/ui/dialog";

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
  conflicts: "Conflicts", events: "Live Events", tradeHubs: "Trade Hubs", supplyChains: "Supply Routes",
  entropy: "Entropy Zones", forex: "FX Stress", portfolio: "Portfolio",
  ships: "Vessels (AIS)", planes: "Flights (ADS-B)", chokepoints: "Chokepoints",
};

const GeopoliticalGlobe = ({ stocks, geoData: data, geoLoading: loading, exposedTickers, tickerThreats, onRefresh }: Props) => {
  const [selectedConflict, setSelectedConflict] = useState<ConflictEvent | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "threats" | "forex">("map");
  const [visibleLayers, setVisibleLayers] = useState<Record<string, boolean>>({
    conflicts: true, events: true, tradeHubs: true, supplyChains: true, entropy: true, forex: true, portfolio: true,
    ships: true, planes: true, chokepoints: true,
  });
  const [showLayers, setShowLayers] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScoredGeoEvent | null>(null);
  const { events: geoEvents, loading: eventsLoading, lastTick: eventsLastTick, error: eventsError } = useGeoEvents();
  const { data: tactical } = useTacticalMovement(true);
  const aisLive = tactical?.sources?.ais === "live";
  const adsbLive = tactical?.sources?.opensky === "live";
  const hasMovementTelemetry = aisLive || adsbLive;

  const portfolioMarkers = useMemo(() =>
    stocks.filter(s => s.analysis).map(s => {
      const geo = getTickerGeo(s.ticker);
      return geo ? { ticker: s.ticker.replace(".NS", "").replace(".BO", ""), ...geo } : null;
    }).filter(Boolean) as { ticker: string; lat: number; lng: number }[],
    [stocks]
  );

  const toggleLayer = (key: string) => setVisibleLayers(prev => ({ ...prev, [key]: !prev[key] }));

  // Soft-fail: if legacy geo summary is unavailable, still render the live map + feed.
  const safeData: GeoData = data ?? {
    conflictEvents: [],
    forexVolatility: [],
    highEntropyZones: [],
    tradeHubs: [],
    supplyChainRisks: [],
    globalRiskScore: 0,
    regimeSignal: "stable",
    capitalFlowDirection: "neutral",
    safeHavenDemand: "normal",
    intelligenceSummary: "",
    keyThreats: [],
    timestamp: Date.now(),
  };

  if (loading && !data && geoEvents.length === 0) {
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
            <h2 className="text-xs font-bold text-foreground tracking-tight truncate">Geopolitical Risk Monitor</h2>
            <p className="text-[8px] text-muted-foreground font-mono tracking-widest truncate">
              LIVE 20s · {safeData.conflictEvents.length} CONFLICTS · {geoEvents.length} WIRE EVENTS
              {exposedTickers.length > 0 && <span className="text-loss ml-1">{exposedTickers.length} EXPOSED</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(["map", "threats", "forex"] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`rounded-md px-2 py-1 text-[9px] font-mono font-medium transition-all ${viewMode === m ? "glass-panel glass-glow-primary text-primary" : "glass-subtle text-muted-foreground hover:text-foreground"}`}>
              {m === "map" ? "Map" : m === "threats" ? "Threats" : "FX"}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => onRefresh(false)} className="h-6 w-6 p-0">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {data && <RiskStrip data={data} />}

      {/* Chokepoint Stress Strip */}
      {hasMovementTelemetry && tactical?.chokepoints && tactical.chokepoints.length > 0 && (
        <div className="glass-panel rounded-xl px-2.5 py-1.5 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground flex-shrink-0">
              Trade-route telemetry
            </span>
            {tactical.chokepoints.map(c => {
              const tone = c.stress > 0.6 ? "text-loss border-loss/30 bg-loss/5"
                : c.stress > 0.35 ? "text-warning border-warning/30 bg-warning/5"
                : "text-muted-foreground border-border/40 bg-muted/20";
              return (
                <div key={c.name} className={`flex items-center gap-1.5 px-1.5 py-0.5 rounded border ${tone}`}>
                  <span className="font-mono text-[9px] font-semibold whitespace-nowrap">{c.name}</span>
                  <span className="font-mono text-[9px] tabular-nums opacity-80">
                    {aisLive ? `${c.ships} AIS` : "AIS n/a"} · {adsbLive ? `${c.planes} ADS-B` : "ADS-B n/a"}
                  </span>
                  <span className="font-mono text-[9px] tabular-nums font-bold">
                    {Math.round(c.stress * 100)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

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

      {data && <IntelligenceBrief data={data} />}

      {viewMode === "map" && (
        <div className="relative space-y-2">
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

          {/* Map: full-width, plotted with live news markers */}
          <div
            className="glass-panel rounded-xl overflow-hidden relative w-full"
            style={{ height: "min(62vh, 560px)", minHeight: 360 }}
          >
            <GeopoliticalMap
              data={safeData}
              portfolioMarkers={portfolioMarkers}
              onSelectConflict={setSelectedConflict}
              visibleLayers={visibleLayers}
              geoEvents={geoEvents as any}
              selectedEventId={selectedEvent?.id || null}
              onSelectEvent={(e) => setSelectedEvent(e as ScoredGeoEvent)}
              ships={aisLive ? tactical?.ships : undefined}
              planes={adsbLive ? tactical?.planes : undefined}
              chokepoints={hasMovementTelemetry ? tactical?.chokepoints : undefined}
              aisLive={aisLive}
              adsbLive={adsbLive}
            />
          </div>

          {/* Live news under the map — tap any item to open causal cascade */}
          <div className="grid gap-2 grid-cols-1 lg:grid-cols-[1fr_320px]">
            <div style={{ height: 420 }}>
              <EventFeed
                events={geoEvents}
                loading={eventsLoading}
                lastTick={eventsLastTick}
                error={eventsError}
                selectedId={selectedEvent?.id}
                onSelect={(e) => setSelectedEvent(e)}
              />
            </div>
            <div className="hidden lg:block" style={{ height: 420 }}>
              <ThreatFeed
                data={safeData}
                selectedConflict={selectedConflict}
                onSelectConflict={setSelectedConflict}
                exposedTickers={exposedTickers}
              />
            </div>
          </div>

          {/* Causal cascade dialog */}
          <Dialog open={!!selectedEvent} onOpenChange={(o) => !o && setSelectedEvent(null)}>
            <DialogContent className="max-w-5xl w-[96vw] h-[88vh] p-0 overflow-hidden border-border bg-background">
              {selectedEvent && (
                <IntelStack
                  event={selectedEvent}
                  onClear={() => setSelectedEvent(null)}
                  portfolioTickers={stocks.map((s) => s.ticker)}
                  tickerThreats={tickerThreats}
                />
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}

      {viewMode === "threats" && (
        <ThreatsView
          data={safeData}
          exposedTickers={exposedTickers}
          loading={loading && !data}
          onRefresh={() => onRefresh()}
        />
      )}
      {viewMode === "forex" && (
        <ForexView data={safeData} loading={loading && !data} onRefresh={() => onRefresh()} />
      )}
    </div>
  );
};

export default GeopoliticalGlobe;
