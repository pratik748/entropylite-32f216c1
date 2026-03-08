import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface ConflictEvent {
  name: string; lat: number; lng: number; severity: number; type: string;
  affectedAssets: string[]; summary: string; nearTradeHub?: string;
  distanceKm?: number; escalationProb?: number; actionableIntel?: string;
}
interface SupplyChainRisk {
  route: string; startLat: number; startLng: number; endLat: number; endLng: number;
  riskLevel: string; reason: string;
}
interface TradeHub { name: string; lat: number; lng: number; type: string; }
interface ForexEntry { symbol: string; country: string; lat: number; lng: number; currency: string; rate: number; change24h: number; isStressed: boolean; }
interface HighEntropyZone { name: string; lat: number; lng: number; severity: number; entropyScore: number; currencyStress: number; affectedCurrencies: string[]; }

export interface MapData {
  conflictEvents: ConflictEvent[];
  tradeHubs: TradeHub[];
  supplyChainRisks: SupplyChainRisk[];
  forexVolatility: ForexEntry[];
  highEntropyZones: HighEntropyZone[];
}

interface PortfolioMarker { ticker: string; lat: number; lng: number; }

interface Props {
  data: MapData;
  portfolioMarkers: PortfolioMarker[];
  onSelectConflict?: (c: ConflictEvent) => void;
  visibleLayers: Record<string, boolean>;
}

const TYPE_COLORS: Record<string, string> = {
  war: "#ff3232", sanctions: "#ffb400", unrest: "#ff7820",
  terrorism: "#ff1e1e", trade_war: "#ffe000", cyber: "#64c8ff", energy: "#ff9900",
};

export default function GeopoliticalMap({ data, portfolioMarkers, onSelectConflict, visibleLayers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const initRef = useRef(false);
  const layersRef = useRef<Record<string, L.LayerGroup>>({});

  // Init map once
  useEffect(() => {
    if (!containerRef.current || initRef.current) return;
    initRef.current = true;

    const map = L.map(containerRef.current, {
      center: [20, 30], zoom: 3, minZoom: 2, maxZoom: 12,
      zoomControl: false, attributionControl: false, worldCopyJump: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd", maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);

    ["conflicts", "tradeHubs", "supplyChains", "entropy", "forex", "portfolio"].forEach(name => {
      layersRef.current[name] = L.layerGroup().addTo(map);
    });

    mapRef.current = map;

    // Resize handling
    const timers = [100, 400, 1200].map(ms => setTimeout(() => map.invalidateSize(), ms));
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    return () => {
      timers.forEach(clearTimeout);
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = {};
      initRef.current = false;
    };
  }, []);

  // Update layers
  useEffect(() => {
    if (!mapRef.current || !data) return;
    const layers = layersRef.current;

    // Clear all
    Object.values(layers).forEach(l => l.clearLayers());

    // Conflicts
    if (visibleLayers.conflicts !== false) {
      data.conflictEvents.forEach(evt => {
        const color = TYPE_COLORS[evt.type] || "#ff3232";
        const r = 5 + evt.severity * 10;

        // Outer pulse ring (simple circleMarker, no divIcon)
        L.circleMarker([evt.lat, evt.lng], {
          radius: r + 8, color, fillColor: color,
          fillOpacity: 0.08, weight: 1, opacity: 0.3,
          className: "geo-pulse-ring",
        }).addTo(layers.conflicts);

        // Core marker
        L.circleMarker([evt.lat, evt.lng], {
          radius: r, color, fillColor: color,
          fillOpacity: 0.45, weight: 2, opacity: 0.8,
        })
          .bindTooltip(evt.name, { direction: "top", className: "entropy-tooltip", offset: [0, -r] })
          .bindPopup(
            `<b>${evt.name}</b><br/><span style="color:${color}">Severity: ${(evt.severity * 100).toFixed(0)}%</span><br/>${evt.summary}${evt.escalationProb != null ? `<br/>Escalation: ${(evt.escalationProb * 100).toFixed(0)}%` : ""}${evt.actionableIntel ? `<br/><b>Intel:</b> ${evt.actionableIntel}` : ""}`,
            { className: "entropy-popup" }
          )
          .on("click", () => onSelectConflict?.(evt))
          .addTo(layers.conflicts);
      });
    }

    // Trade hubs
    if (visibleLayers.tradeHubs !== false) {
      data.tradeHubs.forEach(hub => {
        L.circleMarker([hub.lat, hub.lng], {
          radius: 5, color: "hsl(210,100%,60%)", fillColor: "hsl(210,100%,60%)",
          fillOpacity: 0.6, weight: 1, opacity: 0.8,
        }).bindTooltip(hub.name, { direction: "top", className: "entropy-tooltip", offset: [0, -8] })
          .addTo(layers.tradeHubs);
      });
    }

    // Supply chains
    if (visibleLayers.supplyChains !== false) {
      data.supplyChainRisks?.forEach(risk => {
        const c = risk.riskLevel === "high" ? "#ff3c3c" : risk.riskLevel === "medium" ? "#ffb400" : "#3ca0ff";
        L.polyline([[risk.startLat, risk.startLng], [risk.endLat, risk.endLng]], {
          color: c, weight: 2, opacity: 0.5, dashArray: "8 4",
        }).bindPopup(`<b>${risk.route}</b><br/>${risk.reason}`)
          .addTo(layers.supplyChains);
      });
    }

    // Entropy zones
    if (visibleLayers.entropy !== false) {
      data.highEntropyZones.forEach(zone => {
        L.circleMarker([zone.lat, zone.lng], {
          radius: 22, color: "#ff7820", fillColor: "#ff7820",
          fillOpacity: 0.06, weight: 2, opacity: 0.4,
          dashArray: "4 4", className: "geo-pulse-ring",
        }).bindTooltip(`⚡${zone.entropyScore.toFixed(0)}`, {
          permanent: true, direction: "right", className: "entropy-tooltip",
          offset: [24, 0],
        }).addTo(layers.entropy);
      });
    }

    // Forex stress
    if (visibleLayers.forex !== false) {
      data.forexVolatility.filter(f => f.isStressed).forEach(fx => {
        L.circleMarker([fx.lat, fx.lng], {
          radius: 6,
          color: Math.abs(fx.change24h) > 2 ? "#ff5050" : "#ffc800",
          fillColor: Math.abs(fx.change24h) > 2 ? "#ff5050" : "#ffc800",
          fillOpacity: 0.5, weight: 1, opacity: 0.7,
        }).bindTooltip(`${fx.currency} ${fx.change24h > 0 ? "+" : ""}${fx.change24h.toFixed(1)}%`, {
          permanent: true, direction: "right", className: "entropy-tooltip",
          offset: [8, 0],
        }).addTo(layers.forex);
      });
    }

    // Portfolio markers
    if (visibleLayers.portfolio !== false) {
      portfolioMarkers.forEach(pm => {
        L.circleMarker([pm.lat, pm.lng], {
          radius: 8, color: "hsl(210,100%,60%)", fillColor: "hsl(210,100%,60%)",
          fillOpacity: 0.4, weight: 2, opacity: 0.8,
        }).bindTooltip(pm.ticker, {
          permanent: true, direction: "right", className: "entropy-tooltip portfolio-tooltip",
          offset: [10, 0],
        }).addTo(layers.portfolio);
      });
    }
  }, [data, portfolioMarkers, visibleLayers, onSelectConflict]);

  // Fly-to on conflict select
  const flyTo = useCallback((lat: number, lng: number) => {
    mapRef.current?.flyTo([lat, lng], 5, { duration: 1 });
  }, []);

  return (
    <div className="relative w-full h-full" style={{ minHeight: 500 }}>
      <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 10 }} />
      {/* Legend */}
      <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-3 text-[9px] text-muted-foreground glass-subtle rounded-lg px-3 py-1.5" style={{ zIndex: 1000 }}>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Conflict</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Entropy</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Hub</span>
        <span className="flex items-center gap-1 text-primary">◆ Portfolio</span>
      </div>
    </div>
  );
}

export { type ConflictEvent, type ForexEntry, type HighEntropyZone, type SupplyChainRisk, type TradeHub };
