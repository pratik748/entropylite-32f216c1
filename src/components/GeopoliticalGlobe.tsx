import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AlertTriangle, Shield, Loader2, RefreshCw, Zap, MapPin, Radio, Satellite, Ship, Plane, Crosshair, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";

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

// Mercator projection helpers
const projectLat = (lat: number): number => {
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  return 50 - (mercN / Math.PI) * 50;
};
const projectLng = (lng: number): number => ((lng + 180) / 360) * 100;

// Animated overlay objects
interface MovingObject {
  id: string;
  type: "ship" | "plane" | "satellite";
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  label: string;
}

const generateOverlayObjects = (): MovingObject[] => {
  const ships: MovingObject[] = [
    { id: "s1", type: "ship", lat: 1.3, lng: 103.8, heading: 220, speed: 0.002, label: "VLCC Tanker — Malacca" },
    { id: "s2", type: "ship", lat: 30.0, lng: 32.5, heading: 180, speed: 0.001, label: "Container — Suez" },
    { id: "s3", type: "ship", lat: 9.0, lng: -79.5, heading: 90, speed: 0.0015, label: "Bulk Carrier — Panama" },
    { id: "s4", type: "ship", lat: 34.0, lng: 136.0, heading: 270, speed: 0.001, label: "LNG Carrier — Japan" },
    { id: "s5", type: "ship", lat: 51.0, lng: 2.0, heading: 180, speed: 0.001, label: "Container — English Channel" },
    { id: "s6", type: "ship", lat: -33.8, lng: 18.4, heading: 90, speed: 0.001, label: "Oil Tanker — Cape of Good Hope" },
  ];
  const planes: MovingObject[] = [
    { id: "p1", type: "plane", lat: 40.6, lng: -73.8, heading: 45, speed: 0.01, label: "Cargo — JFK" },
    { id: "p2", type: "plane", lat: 25.2, lng: 55.3, heading: 90, speed: 0.012, label: "Freight — Dubai" },
    { id: "p3", type: "plane", lat: 51.5, lng: -0.1, heading: 270, speed: 0.011, label: "Cargo — Heathrow" },
    { id: "p4", type: "plane", lat: 31.2, lng: 121.5, heading: 135, speed: 0.01, label: "Freight — Shanghai" },
  ];
  const sats: MovingObject[] = [
    { id: "sat1", type: "satellite", lat: 0, lng: -30, heading: 90, speed: 0.05, label: "ISS" },
    { id: "sat2", type: "satellite", lat: 60, lng: 80, heading: 200, speed: 0.03, label: "Sentinel-2" },
    { id: "sat3", type: "satellite", lat: -20, lng: 150, heading: 320, speed: 0.04, label: "Starlink" },
  ];
  return [...ships, ...planes, ...sats];
};

// Simplified world map path (Natural Earth inspired)
const WORLD_PATH = `M183,52l-2,1l-1,0l0,-1l1,-1l2,0zM191,53l1,1l-2,0l0,-1zM180,54l1,1l-2,0zM116,55l2,1l0,1l-2,0l-1,-1zM169,41l3,2l1,2l-1,1l-3,0l-2,-2l0,-2zM152,44l2,2l-1,2l-2,0l-1,-2zM141,45l1,1l-2,1l-1,-1zM80,34l4,1l2,2l0,3l-2,2l-4,0l-3,-2l-1,-3l1,-2zM71,37l2,1l0,2l-2,1l-2,-1l0,-2zM58,42l3,1l1,2l-1,2l-3,0l-2,-2l0,-2zM26,47l4,2l2,3l0,3l-2,2l-4,0l-3,-3l0,-4z`;

const GeopoliticalGlobe = ({ stocks }: Props) => {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConflict, setSelectedConflict] = useState<ConflictEvent | null>(null);
  const [viewMode, setViewMode] = useState<"map" | "threats" | "forex">("map");
  const [overlayObjects, setOverlayObjects] = useState<MovingObject[]>(generateOverlayObjects);
  const [hoveredObject, setHoveredObject] = useState<string | null>(null);
  const [activeLayers, setActiveLayers] = useState({ conflicts: true, ships: true, planes: true, satellites: true, supplyChains: true, forex: true });
  const animRef = useRef<number>();

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

  // Animate overlay objects
  useEffect(() => {
    const animate = () => {
      setOverlayObjects(prev => prev.map(obj => {
        const rad = (obj.heading * Math.PI) / 180;
        let newLng = obj.lng + Math.cos(rad) * obj.speed * 16;
        let newLat = obj.lat - Math.sin(rad) * obj.speed * 16;
        if (newLng > 180) newLng -= 360;
        if (newLng < -180) newLng += 360;
        newLat = Math.max(-85, Math.min(85, newLat));
        return { ...obj, lat: newLat, lng: newLng };
      }));
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, []);

  const toggleLayer = (layer: keyof typeof activeLayers) => {
    setActiveLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

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
                LIVE · {data.conflictEvents.length} CONFLICTS · {overlayObjects.filter(o => o.type === "ship").length} VESSELS · {overlayObjects.filter(o => o.type === "plane").length} AIRCRAFT
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(["map", "threats", "forex"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-mono font-medium transition-all ${viewMode === m ? "glass-panel text-primary" : "glass-subtle text-muted-foreground hover:text-foreground"}`}>
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

      {/* Map View */}
      {viewMode === "map" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Interactive World Map */}
          <div className="glass-card rounded-2xl overflow-hidden relative" style={{ minHeight: 420 }}>
            {/* Layer Controls */}
            <div className="absolute top-3 left-3 z-20 flex flex-wrap gap-1">
              {([
                { key: "conflicts" as const, icon: <Crosshair className="h-2.5 w-2.5" />, label: "Conflicts", color: "text-loss" },
                { key: "ships" as const, icon: <Ship className="h-2.5 w-2.5" />, label: "Ships", color: "text-blue-400" },
                { key: "planes" as const, icon: <Plane className="h-2.5 w-2.5" />, label: "Planes", color: "text-cyan-400" },
                { key: "satellites" as const, icon: <Satellite className="h-2.5 w-2.5" />, label: "Sats", color: "text-violet-400" },
                { key: "supplyChains" as const, icon: <Activity className="h-2.5 w-2.5" />, label: "Supply", color: "text-amber-400" },
                { key: "forex" as const, icon: <span className="text-[8px] font-bold">FX</span>, label: "Forex", color: "text-emerald-400" },
              ]).map(l => (
                <button key={l.key} onClick={() => toggleLayer(l.key)}
                  className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[8px] font-mono transition-all ${activeLayers[l.key] ? `glass-panel ${l.color}` : "glass-subtle text-muted-foreground/40 line-through"}`}>
                  {l.icon} {l.label}
                </button>
              ))}
            </div>

            {/* SVG World Map */}
            <svg viewBox="0 0 100 56" className="w-full h-full" style={{ minHeight: 420, background: "linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--muted)/0.3) 100%)" }}>
              <defs>
                <radialGradient id="conflictGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="hsl(0, 80%, 50%)" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="hsl(0, 80%, 50%)" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="entropyGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="hsl(30, 90%, 50%)" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="hsl(30, 90%, 50%)" stopOpacity="0" />
                </radialGradient>
                <filter id="mapGlow">
                  <feGaussianBlur stdDeviation="0.15" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Grid lines */}
              {[-60, -30, 0, 30, 60].map(lat => (
                <line key={`lat${lat}`} x1="0" y1={projectLat(lat)} x2="100" y2={projectLat(lat)}
                  stroke="hsl(var(--border))" strokeWidth="0.08" strokeOpacity="0.3" strokeDasharray="0.5,0.5" />
              ))}
              {[-120, -60, 0, 60, 120].map(lng => (
                <line key={`lng${lng}`} x1={projectLng(lng)} y1="0" x2={projectLng(lng)} y2="56"
                  stroke="hsl(var(--border))" strokeWidth="0.08" strokeOpacity="0.3" strokeDasharray="0.5,0.5" />
              ))}

              {/* Simplified continent outlines */}
              {/* North America */}
              <polygon points="10,14 15,10 22,10 28,13 30,18 28,22 25,25 20,28 15,28 12,30 10,28 8,22 6,18" 
                fill="hsl(var(--muted))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.12" strokeOpacity="0.5" />
              {/* South America */}
              <polygon points="22,32 26,30 30,32 32,36 30,42 28,48 24,50 20,46 18,40 20,36" 
                fill="hsl(var(--muted))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.12" strokeOpacity="0.5" />
              {/* Europe */}
              <polygon points="46,12 52,10 56,12 54,16 50,18 47,16" 
                fill="hsl(var(--muted))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.12" strokeOpacity="0.5" />
              {/* Africa */}
              <polygon points="46,22 52,20 58,22 60,28 58,36 54,42 48,42 44,38 42,30 44,24" 
                fill="hsl(var(--muted))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.12" strokeOpacity="0.5" />
              {/* Asia */}
              <polygon points="56,8 66,6 78,8 86,12 88,18 84,22 78,24 72,22 66,18 60,16 56,14" 
                fill="hsl(var(--muted))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.12" strokeOpacity="0.5" />
              {/* Middle East */}
              <polygon points="56,18 62,16 66,18 66,24 62,26 56,24" 
                fill="hsl(var(--muted))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.12" strokeOpacity="0.5" />
              {/* India */}
              <polygon points="68,20 74,18 76,24 74,30 70,30 68,26" 
                fill="hsl(var(--muted))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.12" strokeOpacity="0.5" />
              {/* Southeast Asia / Indonesia */}
              <polygon points="78,24 84,22 88,26 86,30 80,30 78,28" 
                fill="hsl(var(--muted))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.12" strokeOpacity="0.5" />
              {/* Australia */}
              <polygon points="82,34 90,32 94,36 92,42 86,44 80,40 80,36" 
                fill="hsl(var(--muted))" fillOpacity="0.15" stroke="hsl(var(--border))" strokeWidth="0.12" strokeOpacity="0.5" />

              {/* Supply Chain Arcs */}
              {activeLayers.supplyChains && data.supplyChainRisks?.map((risk, i) => {
                const x1 = projectLng(risk.startLng);
                const y1 = projectLat(risk.startLat);
                const x2 = projectLng(risk.endLng);
                const y2 = projectLat(risk.endLat);
                const midX = (x1 + x2) / 2;
                const midY = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.15;
                const isHigh = risk.riskLevel === "high";
                return (
                  <path key={`arc${i}`}
                    d={`M${x1},${y1} Q${midX},${midY} ${x2},${y2}`}
                    fill="none"
                    stroke={isHigh ? "hsl(0, 70%, 55%)" : "hsl(40, 80%, 50%)"}
                    strokeWidth="0.12"
                    strokeOpacity="0.5"
                    strokeDasharray="0.4,0.3">
                    <animate attributeName="stroke-dashoffset" from="0" to="-2" dur="3s" repeatCount="indefinite" />
                  </path>
                );
              })}

              {/* Trade Hubs */}
              {data.tradeHubs?.map((hub, i) => {
                const cx = projectLng(hub.lng);
                const cy = projectLat(hub.lat);
                return (
                  <g key={`hub${i}`}>
                    <circle cx={cx} cy={cy} r="0.5" fill="hsl(210, 70%, 50%)" fillOpacity="0.2" />
                    <circle cx={cx} cy={cy} r="0.2" fill="hsl(210, 70%, 60%)" fillOpacity="0.6" />
                  </g>
                );
              })}

              {/* High Entropy Zones — pulsing rings */}
              {activeLayers.conflicts && data.highEntropyZones.map((zone, i) => {
                const cx = projectLng(zone.lng);
                const cy = projectLat(zone.lat);
                const r = 1 + zone.entropyScore / 30;
                return (
                  <g key={`ent${i}`}>
                    <circle cx={cx} cy={cy} r={r} fill="url(#entropyGlow)" opacity="0.5">
                      <animate attributeName="r" values={`${r * 0.7};${r * 1.3};${r * 0.7}`} dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0.2;0.5" dur="2s" repeatCount="indefinite" />
                    </circle>
                  </g>
                );
              })}

              {/* Conflict Points */}
              {activeLayers.conflicts && data.conflictEvents.map((evt, i) => {
                const cx = projectLng(evt.lng);
                const cy = projectLat(evt.lat);
                const isSelected = selectedConflict?.name === evt.name;
                const r = 0.3 + evt.severity * 0.5;
                return (
                  <g key={`conf${i}`} onClick={() => setSelectedConflict(isSelected ? null : evt)} style={{ cursor: "pointer" }}>
                    <circle cx={cx} cy={cy} r={r * 2.5} fill="url(#conflictGlow)" opacity={isSelected ? 0.8 : 0.4}>
                      {evt.severity > 0.7 && <animate attributeName="opacity" values="0.4;0.8;0.4" dur="1.5s" repeatCount="indefinite" />}
                    </circle>
                    <circle cx={cx} cy={cy} r={r} fill="hsl(0, 80%, 50%)" stroke={isSelected ? "white" : "none"} strokeWidth="0.1" filter="url(#mapGlow)">
                      {evt.severity > 0.7 && <animate attributeName="r" values={`${r};${r * 1.3};${r}`} dur="1.5s" repeatCount="indefinite" />}
                    </circle>
                    {isSelected && (
                      <text x={cx} y={cy - r - 0.5} textAnchor="middle" fontSize="1" fill="hsl(var(--foreground))" fontFamily="monospace">{evt.name}</text>
                    )}
                  </g>
                );
              })}

              {/* Forex Stress Markers */}
              {activeLayers.forex && data.forexVolatility.filter(f => f.isStressed).map((fx, i) => {
                const cx = projectLng(fx.lng);
                const cy = projectLat(fx.lat);
                const isNeg = fx.change24h < 0;
                return (
                  <g key={`fx${i}`}>
                    <rect x={cx - 2} y={cy - 0.6} width="4" height="1.2" rx="0.3" fill="hsl(var(--background))" fillOpacity="0.7" stroke={isNeg ? "hsl(0,70%,50%)" : "hsl(120,50%,40%)"} strokeWidth="0.06" />
                    <text x={cx} y={cy + 0.25} textAnchor="middle" fontSize="0.7" fill={isNeg ? "hsl(0,70%,55%)" : "hsl(120,50%,45%)"} fontFamily="monospace" fontWeight="bold">
                      {fx.currency} {fx.change24h > 0 ? "+" : ""}{fx.change24h.toFixed(1)}%
                    </text>
                  </g>
                );
              })}

              {/* Ships */}
              {activeLayers.ships && overlayObjects.filter(o => o.type === "ship").map(obj => {
                const cx = projectLng(obj.lng);
                const cy = projectLat(obj.lat);
                const isHovered = hoveredObject === obj.id;
                return (
                  <g key={obj.id} onMouseEnter={() => setHoveredObject(obj.id)} onMouseLeave={() => setHoveredObject(null)}>
                    <polygon points={`${cx},${cy - 0.4} ${cx + 0.25},${cy + 0.2} ${cx - 0.25},${cy + 0.2}`}
                      fill="hsl(210, 80%, 60%)" fillOpacity="0.9" transform={`rotate(${obj.heading}, ${cx}, ${cy})`} />
                    {isHovered && (
                      <text x={cx} y={cy - 0.7} textAnchor="middle" fontSize="0.6" fill="hsl(210, 80%, 70%)" fontFamily="monospace">{obj.label}</text>
                    )}
                  </g>
                );
              })}

              {/* Planes */}
              {activeLayers.planes && overlayObjects.filter(o => o.type === "plane").map(obj => {
                const cx = projectLng(obj.lng);
                const cy = projectLat(obj.lat);
                const isHovered = hoveredObject === obj.id;
                return (
                  <g key={obj.id} onMouseEnter={() => setHoveredObject(obj.id)} onMouseLeave={() => setHoveredObject(null)}>
                    <polygon points={`${cx},${cy - 0.35} ${cx + 0.35},${cy + 0.15} ${cx},${cy} ${cx - 0.35},${cy + 0.15}`}
                      fill="hsl(190, 80%, 55%)" fillOpacity="0.9" transform={`rotate(${obj.heading}, ${cx}, ${cy})`} />
                    {isHovered && (
                      <text x={cx} y={cy - 0.6} textAnchor="middle" fontSize="0.6" fill="hsl(190, 80%, 65%)" fontFamily="monospace">{obj.label}</text>
                    )}
                  </g>
                );
              })}

              {/* Satellites */}
              {activeLayers.satellites && overlayObjects.filter(o => o.type === "satellite").map(obj => {
                const cx = projectLng(obj.lng);
                const cy = projectLat(obj.lat);
                const isHovered = hoveredObject === obj.id;
                return (
                  <g key={obj.id} onMouseEnter={() => setHoveredObject(obj.id)} onMouseLeave={() => setHoveredObject(null)}>
                    <circle cx={cx} cy={cy} r="0.2" fill="hsl(270, 70%, 65%)" fillOpacity="0.9">
                      <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={cx} cy={cy} r="0.5" fill="none" stroke="hsl(270, 70%, 65%)" strokeWidth="0.04" strokeOpacity="0.4">
                      <animate attributeName="r" values="0.3;0.8;0.3" dur="3s" repeatCount="indefinite" />
                    </circle>
                    {isHovered && (
                      <text x={cx} y={cy - 0.8} textAnchor="middle" fontSize="0.6" fill="hsl(270, 70%, 75%)" fontFamily="monospace">{obj.label}</text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2 sm:gap-3 text-[8px] sm:text-[9px] text-muted-foreground glass-subtle rounded-lg px-2 sm:px-3 py-1.5 z-20">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Conflict</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Entropy</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Vessel</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-400" /> Aircraft</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" /> Satellite</span>
              <span className="flex items-center gap-1 ml-auto font-mono text-primary">ENTROPY MAP</span>
            </div>
          </div>

          {/* Threat Feed */}
          <div className="space-y-2 max-h-[560px] overflow-y-auto scrollbar-hide">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest sticky top-0 glass-subtle py-1.5 px-2 rounded-lg flex items-center gap-2 z-10">
              <Radio className="h-3 w-3 text-loss animate-pulse" /> Active Intel Feed
            </h3>
            {data.conflictEvents.map((evt, i) => (
              <div key={i} onClick={() => setSelectedConflict(selectedConflict?.name === evt.name ? null : evt)}
                className={`glass-card rounded-lg p-2.5 sm:p-3 cursor-pointer transition-all ${selectedConflict?.name === evt.name ? "ring-1 ring-loss/30" : "hover:ring-1 hover:ring-primary/20"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full ${typeColors[evt.type] || "bg-red-500"} ${evt.severity > 0.7 ? "animate-pulse" : ""}`} />
                  <span className="text-[11px] font-bold text-foreground truncate">{evt.name}</span>
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">
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
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
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
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-mono font-bold ${zone.isHighEntropy ? "bg-loss/10 text-loss" : "bg-warning/10 text-warning"}`}>
                        {zone.entropyScore.toFixed(0)}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] text-muted-foreground">Severity</span>
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-loss" style={{ width: `${zone.severity * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[8px] text-muted-foreground">FX Stress</span>
                        <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-warning" style={{ width: `${zone.currencyStress * 100}%` }} />
                        </div>
                      </div>
                    </div>
                    {zone.affectedCurrencies?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {zone.affectedCurrencies.map(c => (
                          <span key={c} className="rounded bg-warning/10 px-1 py-0.5 text-[7px] font-mono text-warning">{c}</span>
                        ))}
                      </div>
                    )}
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
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
            💱 Live Forex Volatility
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.forexVolatility.map((fx, i) => (
              <div key={i} className={`glass-card rounded-lg p-3 ${fx.isStressed ? "ring-1 ring-loss/20" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground">{fx.currency}</span>
                  <span className={`font-mono text-xs font-bold ${fx.change24h < 0 ? "text-loss" : "text-gain"}`}>
                    {fx.change24h > 0 ? "+" : ""}{fx.change24h.toFixed(2)}%
                  </span>
                </div>
                <p className="text-[9px] text-muted-foreground mt-1">{fx.country} · {fx.symbol}</p>
                {fx.isStressed && <span className="text-[7px] text-loss font-mono uppercase">⚠ STRESSED</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Portfolio Exposure */}
      {stocks.filter(s => s.analysis).length > 0 && data.conflictEvents.length > 0 && (
        <div className="glass-card rounded-2xl p-4 sm:p-5">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-primary" /> Portfolio Geopolitical Exposure
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stocks.filter(s => s.analysis).map(stock => {
              const exposed = data.conflictEvents.filter(c =>
                c.affectedAssets?.some(a => stock.ticker.includes(a) || a.includes(stock.ticker.replace(".NS","").replace(".BO","")))
              );
              return (
                <div key={stock.id} className={`glass-card rounded-lg p-3 ${exposed.length > 0 ? "ring-1 ring-loss/20" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">{stock.ticker}</span>
                    <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded ${exposed.length > 0 ? "bg-loss/10 text-loss" : "bg-gain/10 text-gain"}`}>
                      {exposed.length > 0 ? `${exposed.length} THREAT${exposed.length > 1 ? "S" : ""}` : "CLEAR"}
                    </span>
                  </div>
                  {exposed.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {exposed.map(e => <span key={e.name} className="text-[7px] text-muted-foreground">{e.name}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default GeopoliticalGlobe;
