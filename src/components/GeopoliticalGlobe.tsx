import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, Shield, Loader2, RefreshCw, Zap, MapPin, Navigation, Satellite, Ship, Plane, Radio, Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";
import L from "leaflet";

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
interface SupplyChainRisk {
  route: string; startLat: number; startLng: number; endLat: number; endLng: number;
  riskLevel: string; reason: string;
}
interface GeoData {
  conflictEvents: ConflictEvent[]; forexVolatility: ForexEntry[];
  highEntropyZones: HighEntropyZone[];
  tradeHubs: { name: string; lat: number; lng: number; type: string }[];
  supplyChainRisks: SupplyChainRisk[]; globalRiskScore: number;
  regimeSignal: string; keyThreats: string[]; capitalFlowDirection: string;
  safeHavenDemand?: string; intelligenceSummary?: string; timestamp: number;
}

interface Props { stocks: PortfolioStock[]; }

const typeColors: Record<string, string> = {
  war: "#ff3232", sanctions: "#ffb400", unrest: "#ff7820",
  terrorism: "#ff1e1e", trade_war: "#ffe000", cyber: "#64c8ff", energy: "#ff9900",
};
const typeBadgeColors: Record<string, string> = {
  war: "bg-red-500", sanctions: "bg-amber-500", unrest: "bg-orange-500",
  terrorism: "bg-red-600", trade_war: "bg-yellow-500", cyber: "bg-cyan-500", energy: "bg-orange-400",
};

const GeopoliticalGlobe = ({ stocks }: Props) => {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConflict, setSelectedConflict] = useState<ConflictEvent | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "threats" | "forex">("map");
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<Record<string, L.LayerGroup>>({});

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

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const map = L.map(mapContainerRef.current, {
      center: [20, 30],
      zoom: 3,
      minZoom: 2,
      maxZoom: 12,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    // Add zoom control to bottom-right
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Create layer groups
    const groups = ["conflicts", "tradeHubs", "supplyChains", "entropy", "forex", "portfolio"];
    groups.forEach(name => {
      layersRef.current[name] = L.layerGroup().addTo(map);
    });

    mapRef.current = map;

    // Force resize after mount
    setTimeout(() => map.invalidateSize(), 100);

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = {};
    };
  }, []);

  // Update map layers when data changes
  useEffect(() => {
    if (!data || !mapRef.current) return;
    const layers = layersRef.current;

    // Clear all layers
    Object.values(layers).forEach(l => l.clearLayers());

    // Trade hubs - blue markers
    data.tradeHubs.forEach(hub => {
      L.circleMarker([hub.lat, hub.lng], {
        radius: 5, color: "#3ca0ff", fillColor: "#3ca0ff",
        fillOpacity: 0.6, weight: 1, opacity: 0.8,
      }).bindTooltip(hub.name, {
        permanent: false, direction: "top", className: "entropy-tooltip",
        offset: [0, -8],
      }).addTo(layers.tradeHubs);
    });

    // Supply chain routes
    data.supplyChainRisks?.forEach(risk => {
      const color = risk.riskLevel === "high" ? "#ff3c3c" : risk.riskLevel === "medium" ? "#ffb400" : "#3ca0ff";
      L.polyline([[risk.startLat, risk.startLng], [risk.endLat, risk.endLng]], {
        color, weight: 2, opacity: 0.5, dashArray: "8 4",
      }).bindPopup(`<div class="entropy-popup"><b>${risk.route}</b><br/>${risk.reason}</div>`)
        .addTo(layers.supplyChains);
    });

    // Conflict events - red pulsing markers
    data.conflictEvents.forEach(evt => {
      const color = typeColors[evt.type] || "#ff3232";
      const radius = 5 + evt.severity * 12;

      // Outer glow ring
      const outerDiv = L.divIcon({
        className: "",
        html: `<div style="
          width: ${radius * 4}px; height: ${radius * 4}px;
          border-radius: 50%;
          background: radial-gradient(circle, ${color}33, transparent 70%);
          animation: pulse-glow 2s ease-in-out infinite;
          position: relative; left: -${radius * 2}px; top: -${radius * 2}px;
        "></div>`,
        iconSize: [0, 0],
      });
      L.marker([evt.lat, evt.lng], { icon: outerDiv, interactive: false }).addTo(layers.conflicts);

      // Core circle marker
      L.circleMarker([evt.lat, evt.lng], {
        radius, color, fillColor: color,
        fillOpacity: 0.5, weight: 2, opacity: 0.8,
      }).bindPopup(`<div class="entropy-popup">
        <b>${evt.name}</b><br/>
        <span style="color:${color}">Severity: ${(evt.severity * 100).toFixed(0)}%</span><br/>
        ${evt.summary}<br/>
        ${evt.escalationProb !== undefined ? `<br/>Escalation: ${(evt.escalationProb * 100).toFixed(0)}%` : ""}
        ${evt.actionableIntel ? `<br/><b>Intel:</b> ${evt.actionableIntel}` : ""}
      </div>`).addTo(layers.conflicts);

      // Label
      if (mapRef.current && mapRef.current.getZoom() >= 3) {
        L.marker([evt.lat, evt.lng], {
          icon: L.divIcon({
            className: "",
            html: `<div style="color:${color}; font-size:9px; font-family:monospace; font-weight:700; white-space:nowrap; text-shadow: 0 0 4px rgba(0,0,0,0.8); margin-left: ${radius + 4}px; margin-top: -6px;">${evt.name.substring(0, 20)}</div>`,
            iconSize: [0, 0],
          }),
          interactive: false,
        }).addTo(layers.conflicts);
      }
    });

    // High entropy zones - orange triple rings
    data.highEntropyZones.forEach(zone => {
      const zoneDiv = L.divIcon({
        className: "",
        html: `<div style="position:relative; left:-30px; top:-30px;">
          <div style="width:60px; height:60px; border-radius:50%; border:2px solid rgba(255,120,0,0.4); position:absolute; animation: pulse-glow 3s ease-in-out infinite;"></div>
          <div style="width:40px; height:40px; border-radius:50%; border:1px dashed rgba(255,120,0,0.25); position:absolute; left:10px; top:10px;"></div>
          <div style="color:#ffa028; font-size:10px; font-family:monospace; font-weight:900; position:absolute; left:65px; top:20px; white-space:nowrap; text-shadow: 0 0 4px rgba(0,0,0,0.9);">⚡${zone.entropyScore.toFixed(0)}</div>
        </div>`,
        iconSize: [0, 0],
      });
      L.marker([zone.lat, zone.lng], { icon: zoneDiv, interactive: false }).addTo(layers.entropy);
    });

    // Forex stress markers
    data.forexVolatility.filter(f => f.isStressed).forEach(fx => {
      const fxColor = Math.abs(fx.change24h) > 2 ? "#ff5050" : "#ffc800";
      L.marker([fx.lat, fx.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="color:${fxColor}; font-size:9px; font-family:monospace; font-weight:700; white-space:nowrap; text-shadow: 0 0 6px rgba(0,0,0,0.9); background: rgba(0,0,0,0.4); padding: 1px 4px; border-radius: 3px; border: 1px solid ${fxColor}44;">${fx.currency} ${fx.change24h > 0 ? "+" : ""}${fx.change24h.toFixed(1)}%</div>`,
          iconSize: [0, 0],
        }),
      }).addTo(layers.forex);
    });

    // Portfolio exposure markers
    stocks.filter(s => s.analysis).forEach(s => {
      const geo = getTickerGeo(s.ticker);
      if (!geo) return;
      L.circleMarker([geo.lat, geo.lng], {
        radius: 8, color: "#3c82ff", fillColor: "#3c82ff",
        fillOpacity: 0.4, weight: 2, opacity: 0.8,
      }).bindTooltip(s.ticker.replace(".NS", "").replace(".BO", ""), {
        permanent: true, direction: "right", className: "entropy-tooltip portfolio-tooltip",
        offset: [10, 0],
      }).addTo(layers.portfolio);
    });
  }, [data, stocks]);

  const exposedAssets = stocks.filter(s => {
    if (!s.analysis || !data) return false;
    return data.conflictEvents.some(c =>
      c.affectedAssets?.some(a => s.ticker.includes(a) || a.includes(s.ticker.replace(".NS", "").replace(".BO", "")))
    );
  });

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
      {/* Command Header */}
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

      {/* Risk Strip */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "Global Risk", value: data.globalRiskScore, suffix: "/100", color: data.globalRiskScore > 70 ? "text-loss" : data.globalRiskScore > 40 ? "text-warning" : "text-gain" },
          { label: "Regime", value: data.regimeSignal, color: data.regimeSignal === "crisis" ? "text-loss" : data.regimeSignal === "transition" ? "text-warning" : "text-gain" },
          { label: "Capital Flow", value: data.capitalFlowDirection, color: data.capitalFlowDirection === "risk-off" ? "text-loss" : data.capitalFlowDirection === "risk-on" ? "text-gain" : "text-warning" },
          { label: "Entropy Zones", value: data.highEntropyZones.length, suffix: " ACTIVE", color: "text-warning" },
        ].map((item, i) => (
          <div key={i} className="glass-card rounded-xl p-3 sm:p-4 relative z-10">
            <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
            <p className={`font-mono text-lg sm:text-xl font-black uppercase mt-1 ${item.color}`}>
              {item.value}{item.suffix && <span className="text-[9px] text-muted-foreground ml-1">{item.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Intelligence Summary */}
      {data.intelligenceSummary && (
        <div className="glass-panel glass-glow-primary rounded-xl p-3 sm:p-4 relative">
          <div className="flex items-center gap-2 mb-1 relative z-10">
            <Radio className="h-3 w-3 text-primary animate-pulse" />
            <span className="text-[9px] font-bold text-primary uppercase tracking-widest">Intelligence Brief</span>
            {data.safeHavenDemand && (
              <span className={`ml-auto rounded px-2 py-0.5 text-[8px] font-mono font-bold uppercase ${
                data.safeHavenDemand === "extreme" || data.safeHavenDemand === "high" ? "bg-loss/10 text-loss" : "bg-surface-3 text-muted-foreground"
              }`}>Safe Haven: {data.safeHavenDemand}</span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-foreground leading-relaxed relative z-10">{data.intelligenceSummary}</p>
        </div>
      )}

      {/* Map View */}
      {viewMode === "map" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="glass-panel rounded-xl overflow-hidden relative" style={{ minHeight: "500px" }}>
            <div ref={mapContainerRef} className="w-full h-full absolute inset-0" style={{ minHeight: "500px", zIndex: 10 }} />
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2 sm:gap-3 text-[8px] sm:text-[9px] text-muted-foreground glass-subtle rounded-lg px-2 sm:px-3 py-1.5" style={{ zIndex: 1000 }}>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Conflict</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Entropy</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Hub</span>
              <span className="flex items-center gap-1 text-primary"><Navigation className="h-2.5 w-2.5" /> Portfolio</span>
            </div>
          </div>

          {/* Threat Feed */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-hide">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest sticky top-0 glass-subtle py-1.5 px-2 rounded-lg flex items-center gap-2 z-10">
              <Radio className="h-3 w-3 text-loss animate-pulse" /> Active Intel Feed
            </h3>
            {data.conflictEvents.map((evt, i) => (
              <div key={i}
                onClick={() => {
                  setSelectedConflict(selectedConflict?.name === evt.name ? null : evt);
                  if (mapRef.current) mapRef.current.setView([evt.lat, evt.lng], 5, { animate: true });
                }}
                className={`glass-card rounded-lg p-2.5 sm:p-3 cursor-pointer transition-all ${selectedConflict?.name === evt.name ? "glass-glow-loss border-loss/30" : "hover:border-primary/20"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full ${typeBadgeColors[evt.type] || "bg-red-500"} ${evt.severity > 0.7 ? "animate-pulse" : ""}`} />
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
                        <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                          <div className="h-full rounded-full bg-loss transition-all" style={{ width: `${evt.escalationProb * 100}%` }} />
                        </div>
                        <span className="text-[8px] font-mono text-loss font-bold">{(evt.escalationProb * 100).toFixed(0)}%</span>
                      </div>
                    )}
                    {evt.actionableIntel && (
                      <div className="rounded glass-subtle px-2 py-1.5">
                        <p className="text-[8px] text-primary font-bold uppercase mb-0.5">Actionable Intel</p>
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
            <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Key Global Threats
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 relative z-10">
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
            <div className="glass-panel glass-glow-loss rounded-xl p-4 sm:p-5 relative">
              <h3 className="text-[10px] font-bold text-loss uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
                <Zap className="h-3.5 w-3.5" /> High-Entropy Zones
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 relative z-10">
                {data.highEntropyZones.map((zone, i) => (
                  <div key={i} className="glass-card rounded-lg p-3 sm:p-4 border-loss/20">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs sm:text-sm font-bold text-foreground">{zone.name}</span>
                      <span className="rounded bg-loss/20 px-2 py-0.5 text-[9px] font-mono font-bold text-loss">⚡{zone.entropyScore.toFixed(0)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><p className="text-[8px] text-muted-foreground uppercase">Severity</p><p className="font-mono font-bold text-loss">{(zone.severity * 100).toFixed(0)}%</p></div>
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
            <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
              <h3 className="text-[10px] font-bold text-warning uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
                <Shield className="h-3.5 w-3.5" /> Portfolio Exposure
              </h3>
              <div className="space-y-2 relative z-10">
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
        <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 relative z-10">Global Currency Volatility</h3>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 relative z-10">
            {data.forexVolatility.map((fx, i) => (
              <div key={i} className={`glass-card rounded-lg p-3 transition-all ${fx.isStressed ? "glass-glow-loss border-loss/20" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-foreground">{fx.currency}</span>
                  <span className="text-[8px] text-muted-foreground">{fx.country}</span>
                </div>
                <p className="font-mono text-sm font-bold text-foreground">{fx.rate > 0 ? fx.rate.toFixed(fx.rate > 100 ? 0 : 2) : "—"}</p>
                <p className={`font-mono text-xs font-semibold ${fx.change24h >= 0 ? "text-gain" : "text-loss"}`}>
                  {fx.change24h >= 0 ? "+" : ""}{fx.change24h.toFixed(2)}%
                </p>
                {fx.isStressed && <span className="text-[8px] text-loss font-mono mt-1 block">⚠ STRESSED</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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

export default GeopoliticalGlobe;
