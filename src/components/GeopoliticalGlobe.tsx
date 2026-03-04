import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { AlertTriangle, Shield, Loader2, RefreshCw, Zap, MapPin, Radio, Satellite, Ship, Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";
import Globe from "react-globe.gl";

interface ConflictEvent {
  name: string; lat: number; lng: number; severity: number; type: string;
  affectedAssets: string[]; summary: string; nearTradeHub?: string;
  distanceKm?: number; escalationProb?: number; actionableIntel?: string;
}
interface ForexEntry {
  symbol: string; country: string; lat: number; lng: number; currency: string;
  rate: number; change24h: number; isStressed: boolean;
}
interface HighEntropyZone {
  name: string; lat: number; lng: number; severity: number; entropyScore: number;
  currencyStress: number; affectedCurrencies: string[]; isHighEntropy: boolean;
}
interface GeoData {
  conflictEvents: ConflictEvent[]; forexVolatility: ForexEntry[];
  highEntropyZones: HighEntropyZone[];
  tradeHubs: { name: string; lat: number; lng: number; type: string }[];
  supplyChainRisks: any[]; globalRiskScore: number;
  regimeSignal: string; keyThreats: string[]; capitalFlowDirection: string;
  safeHavenDemand?: string; intelligenceSummary?: string; timestamp: number;
}

interface Props { stocks: PortfolioStock[]; }

const typeColors: Record<string, string> = {
  war: "bg-red-500", sanctions: "bg-amber-500", unrest: "bg-orange-500",
  terrorism: "bg-red-600", trade_war: "bg-yellow-500", cyber: "bg-cyan-500", energy: "bg-orange-400",
};

const typeHexColors: Record<string, string> = {
  war: "#ff3333", sanctions: "#ffaa00", unrest: "#ff7722",
  terrorism: "#ff2222", trade_war: "#ffdd00", cyber: "#44ccff", energy: "#ff9900",
};

const GeopoliticalGlobe = ({ stocks }: Props) => {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConflict, setSelectedConflict] = useState<ConflictEvent | null>(null);
  const [viewMode, setViewMode] = useState<"globe" | "threats" | "forex">("globe");
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 450 });

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("geopolitical-data");
      if (error) throw error;
      setData(result);
    } catch (e) { console.error("Geo data error:", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const i = setInterval(() => fetchData(false), 30000); return () => clearInterval(i); }, [fetchData]);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setDimensions({ width, height: Math.min(560, width * 0.75) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-rotate
  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.controls().autoRotate = true;
      globeRef.current.controls().autoRotateSpeed = 0.4;
      globeRef.current.pointOfView({ lat: 20, lng: 40, altitude: 2.2 });
    }
  }, [data]);

  // Conflict points data
  const pointsData = useMemo(() => {
    if (!data) return [];
    return data.conflictEvents.map(evt => ({
      lat: evt.lat,
      lng: evt.lng,
      size: 0.3 + evt.severity * 0.7,
      color: typeHexColors[evt.type] || "#ff3333",
      label: evt.name,
      evt,
    }));
  }, [data]);

  // Rings for high-entropy zones
  const ringsData = useMemo(() => {
    if (!data) return [];
    return data.highEntropyZones.map(zone => ({
      lat: zone.lat,
      lng: zone.lng,
      maxR: 3 + zone.entropyScore / 20,
      propagationSpeed: 2,
      repeatPeriod: 800,
      color: () => "rgba(255, 120, 0, 0.6)",
    }));
  }, [data]);

  // Arcs for supply chain risks
  const arcsData = useMemo(() => {
    if (!data?.supplyChainRisks) return [];
    return data.supplyChainRisks.map(risk => ({
      startLat: risk.startLat,
      startLng: risk.startLng,
      endLat: risk.endLat,
      endLng: risk.endLng,
      color: risk.riskLevel === "high" ? ["rgba(255,60,60,0.6)", "rgba(255,60,60,0.1)"] : ["rgba(255,180,0,0.4)", "rgba(255,180,0,0.1)"],
      stroke: 0.5,
      dashLength: 0.4,
      dashGap: 0.2,
      dashAnimateTime: 2000,
    }));
  }, [data]);

  // Forex stressed labels
  const labelsData = useMemo(() => {
    if (!data) return [];
    return data.forexVolatility.filter(f => f.isStressed).map(fx => ({
      lat: fx.lat,
      lng: fx.lng,
      text: `${fx.currency} ${fx.change24h > 0 ? "+" : ""}${fx.change24h.toFixed(1)}%`,
      size: 0.8,
      color: Math.abs(fx.change24h) > 3 ? "#ff5555" : "#ffcc00",
    }));
  }, [data]);

  const exposedAssets = stocks.filter(s => {
    if (!s.analysis || !data) return false;
    return data.conflictEvents.some(c =>
      c.affectedAssets?.some(a => s.ticker.includes(a) || a.includes(s.ticker.replace(".NS","").replace(".BO","")))
    );
  });

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-2 border-primary/20 animate-ping absolute inset-0" />
          <Loader2 className="h-16 w-16 animate-spin text-primary relative" />
        </div>
        <span className="text-sm text-muted-foreground font-mono">Initializing surveillance grid...</span>
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
      {/* Command Header */}
      <div className="glass-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">God's Eye — Entropy Surveillance</h2>
              <p className="text-[9px] text-muted-foreground font-mono tracking-widest">
                LIVE · {data.conflictEvents.length} CONFLICTS · REAL-TIME GLOBE
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["globe", "threats", "forex"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-mono font-medium transition-all ${viewMode === m ? "glass-panel text-primary" : "glass-subtle text-muted-foreground hover:text-foreground"}`}>
                {m === "globe" ? "🛰 Globe" : m === "threats" ? "⚠ Threats" : "💱 Forex"}
              </button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => fetchData(false)} className="h-7 gap-1 text-[10px]">
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> 30s
            </Button>
          </div>
        </div>
      </div>

      {/* Risk Strip */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "Global Risk", value: data.globalRiskScore, suffix: "/100", color: data.globalRiskScore > 70 ? "text-loss" : data.globalRiskScore > 40 ? "text-warning" : "text-gain" },
          { label: "Regime", value: data.regimeSignal, color: data.regimeSignal === "crisis" ? "text-loss" : data.regimeSignal === "transition" ? "text-warning" : "text-gain" },
          { label: "Capital Flow", value: data.capitalFlowDirection, color: data.capitalFlowDirection === "risk-off" ? "text-loss" : data.capitalFlowDirection === "risk-on" ? "text-gain" : "text-warning" },
          { label: "Entropy Zones", value: data.highEntropyZones.length, suffix: " ACTIVE", color: "text-warning" },
        ].map((item, i) => (
          <div key={i} className="glass-card rounded-xl p-3 sm:p-4">
            <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className={`font-mono text-lg sm:text-xl font-black uppercase mt-1 ${item.color}`}>
              {item.value}{item.suffix && <span className="text-[9px] text-muted-foreground ml-1">{item.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Intelligence Summary */}
      {data.intelligenceSummary && (
        <div className="glass-card rounded-2xl p-3 sm:p-4">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="h-3 w-3 text-primary animate-pulse" />
            <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Intelligence Brief</span>
            {data.safeHavenDemand && (
              <span className={`ml-auto rounded px-2 py-0.5 text-[8px] font-mono font-bold uppercase ${
                data.safeHavenDemand === "extreme" || data.safeHavenDemand === "high" ? "bg-loss/10 text-loss" : "bg-surface-3 text-muted-foreground"
              }`}>Safe Haven: {data.safeHavenDemand}</span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-foreground leading-relaxed">{data.intelligenceSummary}</p>
        </div>
      )}

      {/* Globe + Intel */}
      {viewMode === "globe" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div ref={containerRef} className="glass-card rounded-2xl overflow-hidden relative" style={{ minHeight: 400 }}>
            <Globe
              ref={globeRef}
              width={dimensions.width}
              height={dimensions.height}
              globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
              bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
              backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
              atmosphereColor="hsl(217, 80%, 60%)"
              atmosphereAltitude={0.2}
              pointsData={pointsData}
              pointLat="lat"
              pointLng="lng"
              pointAltitude="size"
              pointColor="color"
              pointRadius={0.4}
              pointsMerge={false}
              ringsData={ringsData}
              ringLat="lat"
              ringLng="lng"
              ringMaxRadius="maxR"
              ringPropagationSpeed="propagationSpeed"
              ringRepeatPeriod="repeatPeriod"
              ringColor="color"
              arcsData={arcsData}
              arcStartLat="startLat"
              arcStartLng="startLng"
              arcEndLat="endLat"
              arcEndLng="endLng"
              arcColor="color"
              arcStroke="stroke"
              arcDashLength="dashLength"
              arcDashGap="dashGap"
              arcDashAnimateTime="dashAnimateTime"
              labelsData={labelsData}
              labelLat="lat"
              labelLng="lng"
              labelText="text"
              labelSize="size"
              labelColor="color"
              labelDotRadius={0.3}
              labelAltitude={0.01}
              onPointClick={(point: any) => {
                const evt = point.evt as ConflictEvent;
                setSelectedConflict(selectedConflict?.name === evt.name ? null : evt);
              }}
            />
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2 sm:gap-3 text-[8px] sm:text-[9px] text-muted-foreground glass-subtle rounded-lg px-2 sm:px-3 py-1.5 z-20">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Conflict</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Entropy Zone</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Trade Hub</span>
              <span className="flex items-center gap-1 ml-auto font-mono text-primary">react-globe.gl</span>
            </div>
          </div>

          {/* Threat Feed */}
          <div className="space-y-2 max-h-[560px] overflow-y-auto scrollbar-hide">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest sticky top-0 glass-subtle py-1.5 px-2 rounded-lg flex items-center gap-2 z-10">
              <Radio className="h-3 w-3 text-loss animate-pulse" /> Active Intel Feed
            </h3>
            {data.conflictEvents.map((evt, i) => (
              <div key={i} onClick={() => setSelectedConflict(selectedConflict?.name === evt.name ? null : evt)}
                className={`glass-card rounded-lg p-2.5 sm:p-3 cursor-pointer transition-all ${selectedConflict?.name === evt.name ? "glass-glow-loss border-loss/30" : "hover:border-primary/20"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full ${typeColors[evt.type] || "bg-red-500"} ${evt.severity > 0.7 ? "animate-pulse" : ""}`} />
                  <span className="text-[11px] font-bold text-foreground truncate">{evt.name}</span>
                  <span className="ml-auto rounded bg-surface-3 px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">
                    {(evt.severity * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[9px] text-muted-foreground leading-relaxed line-clamp-2">{evt.summary}</p>
                {evt.nearTradeHub && (
                  <p className="text-[8px] text-warning mt-1 flex items-center gap-1">
                    <MapPin className="h-2 w-2" /> {evt.nearTradeHub} ({evt.distanceKm}km)
                  </p>
                )}
                {selectedConflict?.name === evt.name && (
                  <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5">
                    {evt.escalationProb !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] text-muted-foreground">Escalation:</span>
                        <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
                          <div className="h-full rounded-full bg-loss" style={{ width: `${evt.escalationProb * 100}%` }} />
                        </div>
                        <span className="text-[8px] font-mono text-loss">{(evt.escalationProb * 100).toFixed(0)}%</span>
                      </div>
                    )}
                    {evt.actionableIntel && (
                      <div className="rounded glass-subtle px-2 py-1.5">
                        <p className="text-[8px] text-primary font-bold uppercase mb-0.5">Action</p>
                        <p className="text-[9px] text-foreground">{evt.actionableIntel}</p>
                      </div>
                    )}
                    {evt.affectedAssets?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {evt.affectedAssets.map(a => (
                          <span key={a} className="rounded bg-loss/10 px-1.5 py-0.5 text-[8px] font-mono text-loss">{a}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Threats View */}
      {viewMode === "threats" && (
        <div className="space-y-4">
          {data.keyThreats.length > 0 && (
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Key Global Threats
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.keyThreats.map((threat, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs sm:text-sm text-secondary-foreground glass-subtle rounded-lg p-3">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" />
                    {threat}
                  </div>
                ))}
              </div>
            </div>
          )}
          {data.highEntropyZones.length > 0 && (
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <h3 className="text-[10px] font-bold text-loss uppercase tracking-widest mb-3 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" /> High-Entropy Zones
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.highEntropyZones.map((zone, i) => (
                  <div key={i} className="glass-card rounded-lg p-3 sm:p-4 border-loss/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs sm:text-sm font-bold text-foreground">{zone.name}</span>
                      <span className="rounded bg-loss/20 px-2 py-0.5 text-[9px] font-mono font-bold text-loss">⚡{zone.entropyScore.toFixed(0)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><p className="text-[8px] text-muted-foreground uppercase">Severity</p><p className="font-mono font-bold text-loss">{(zone.severity*100).toFixed(0)}%</p></div>
                      <div><p className="text-[8px] text-muted-foreground uppercase">FX Stress</p><p className="font-mono font-bold text-warning">{zone.currencyStress.toFixed(1)}%</p></div>
                    </div>
                    {zone.affectedCurrencies.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {zone.affectedCurrencies.map(c => <span key={c} className="rounded bg-warning/10 px-1.5 py-0.5 text-[8px] font-mono text-warning">{c}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {exposedAssets.length > 0 && (
            <div className="glass-card rounded-2xl p-4 sm:p-5">
              <h3 className="text-[10px] font-bold text-warning uppercase tracking-widest mb-3 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" /> Portfolio Exposure
              </h3>
              <div className="space-y-2">
                {exposedAssets.map(s => (
                  <div key={s.id} className="flex items-center justify-between glass-subtle rounded-lg p-3">
                    <span className="font-mono text-sm font-bold text-foreground">{s.ticker}</span>
                    <span className="text-[10px] text-warning font-mono">EXPOSED</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Forex View */}
      {viewMode === "forex" && (
        <div className="glass-card rounded-2xl p-4 sm:p-5">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3">Global Currency Volatility</h3>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {data.forexVolatility.map((fx, i) => (
              <div key={i} className={`glass-card rounded-lg p-3 transition-all ${fx.isStressed ? "glass-glow-loss border-loss/20" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-foreground">{fx.currency}</span>
                  <span className="text-[8px] text-muted-foreground">{fx.country}</span>
                </div>
                <p className="font-mono text-sm font-bold text-foreground">{fx.rate.toLocaleString()}</p>
                <p className={`font-mono text-[10px] font-semibold ${fx.change24h > 0 ? "text-loss" : "text-gain"}`}>
                  {fx.change24h > 0 ? "+" : ""}{fx.change24h.toFixed(2)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GeopoliticalGlobe;
