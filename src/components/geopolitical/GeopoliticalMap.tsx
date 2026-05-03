import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet.heat";
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

export interface GeoEventMarker {
  id: string;
  title: string;
  source: string;
  ts: number;
  loc: { lat: number; lng: number; place: string };
  category: "military" | "economic" | "political" | "supply_chain" | "cyber";
  severity: number;
  market_relevance: number;
  velocity: number;
  decayedScore: number;
  // Allow additional fields from upstream (e.g. ScoredGeoEvent)
  [key: string]: unknown;
}

export interface TacticalShip { mmsi: string; lat: number; lng: number; sog?: number; cog?: number; name?: string; type?: string; }
export interface TacticalPlane { icao24: string; callsign?: string; lat: number; lng: number; heading?: number; alt?: number; vel?: number; origin?: string; }
export interface TacticalChokepoint { name: string; lat: number; lng: number; ships: number; stoppedShips: number; planes: number; stress: number; delta: number; }

interface Props {
  data: MapData;
  portfolioMarkers: PortfolioMarker[];
  onSelectConflict?: (c: ConflictEvent) => void;
  visibleLayers: Record<string, boolean>;
  geoEvents?: GeoEventMarker[];
  selectedEventId?: string | null;
  onSelectEvent?: (e: any) => void;
  ships?: TacticalShip[];
  planes?: TacticalPlane[];
  chokepoints?: TacticalChokepoint[];
}

const TYPE_COLORS: Record<string, string> = {
  war: "#ff3232", sanctions: "#ffb400", unrest: "#ff7820",
  terrorism: "#ff1e1e", trade_war: "#ffe000", cyber: "#64c8ff", energy: "#ff9900",
};

const EVENT_COLORS: Record<string, string> = {
  military: "#ef4444",
  economic: "#f59e0b",
  political: "#a855f7",
  supply_chain: "#3b82f6",
  cyber: "#22d3ee",
};

const SHIP_COLORS: Record<string, string> = {
  cargo: "#38bdf8", tanker: "#fb923c", passenger: "#a78bfa",
  fishing: "#94a3b8", military: "#ef4444", wing: "#22d3ee", other: "#cbd5e1",
};

export default function GeopoliticalMap({
  data, portfolioMarkers, onSelectConflict, visibleLayers,
  geoEvents, selectedEventId, onSelectEvent,
  ships, planes, chokepoints,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const initRef = useRef(false);
  const layersRef = useRef<Record<string, L.LayerGroup>>({});
  const heatRef = useRef<any>(null);

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

    ["conflicts", "tradeHubs", "supplyChains", "entropy", "forex", "portfolio", "events", "ships", "planes", "chokepoints"].forEach(name => {
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
      heatRef.current = null;
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

  // Live geo events layer + heat overlay (separate effect — high churn)
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const evLayer = layersRef.current.events;
    if (!evLayer) return;

    evLayer.clearLayers();
    if (heatRef.current) {
      map.removeLayer(heatRef.current);
      heatRef.current = null;
    }

    if (visibleLayers.events === false || !geoEvents || geoEvents.length === 0) return;

    // Markers
    geoEvents.slice(0, 80).forEach(e => {
      if (!e.loc || typeof e.loc.lat !== "number") return;
      // Skip the synthetic "Global" placeholder used for unlocatable wire items.
      if (e.loc.lat === 0 && e.loc.lng === 0) return;
      const color = EVENT_COLORS[e.category] || "#a855f7";
      const r = 4 + e.decayedScore * 10;
      const isSelected = selectedEventId === e.id;

      L.circleMarker([e.loc.lat, e.loc.lng], {
        radius: r + 6,
        color, fillColor: color,
        fillOpacity: 0.06, weight: isSelected ? 2 : 1, opacity: isSelected ? 0.9 : 0.35,
        className: "geo-pulse-ring",
      }).addTo(evLayer);

      L.circleMarker([e.loc.lat, e.loc.lng], {
        radius: r,
        color, fillColor: color,
        fillOpacity: 0.55, weight: isSelected ? 2.5 : 1.5, opacity: 0.95,
      })
        .bindTooltip(e.title.slice(0, 80), { direction: "top", className: "entropy-tooltip", offset: [0, -r] })
        .on("click", () => onSelectEvent?.(e))
        .addTo(evLayer);
    });

    // Heat layer (weighted by decayedScore)
    const heatPoints = geoEvents
      .filter(e => e.loc && typeof e.loc.lat === "number" && !(e.loc.lat === 0 && e.loc.lng === 0))
      .map(e => [e.loc.lat, e.loc.lng, Math.min(1, e.decayedScore * 1.4)] as [number, number, number]);
    if (heatPoints.length > 0) {
      // @ts-ignore — leaflet.heat extends L
      heatRef.current = L.heatLayer(heatPoints, {
        radius: 28,
        blur: 22,
        minOpacity: 0.25,
        maxZoom: 5,
        gradient: { 0.2: "#3b82f6", 0.45: "#a855f7", 0.65: "#f59e0b", 0.85: "#ef4444" },
      }).addTo(map);
    }
  }, [geoEvents, visibleLayers.events, selectedEventId, onSelectEvent]);

  // Tactical: ships
  useEffect(() => {
    if (!mapRef.current) return;
    const layer = layersRef.current.ships;
    if (!layer) return;
    layer.clearLayers();
    if (visibleLayers.ships === false || !ships?.length) return;
    ships.slice(0, 250).forEach(s => {
      const color = SHIP_COLORS[s.type || "other"] || SHIP_COLORS.other;
      const idle = (s.sog ?? 0) < 0.5;
      L.circleMarker([s.lat, s.lng], {
        radius: idle ? 3.2 : 2.4,
        color,
        fillColor: color,
        fillOpacity: idle ? 0.85 : 0.55,
        weight: idle ? 1.2 : 0.5,
        opacity: 0.9,
      })
        .bindTooltip(
          `<b>${s.name || s.mmsi}</b><br/>${s.type || "vessel"} · ${(s.sog ?? 0).toFixed(1)} kn${idle ? " · <span style='color:#fb923c'>idle</span>" : ""}`,
          { direction: "top", className: "entropy-tooltip", offset: [0, -4] },
        )
        .addTo(layer);
    });
  }, [ships, visibleLayers.ships]);

  // Tactical: planes
  useEffect(() => {
    if (!mapRef.current) return;
    const layer = layersRef.current.planes;
    if (!layer) return;
    layer.clearLayers();
    if (visibleLayers.planes === false || !planes?.length) return;
    planes.slice(0, 350).forEach(p => {
      const heading = p.heading ?? 0;
      const icon = L.divIcon({
        className: "geo-plane-icon",
        html: `<div style="transform:rotate(${heading}deg);font-size:11px;line-height:11px;color:#67e8f9;text-shadow:0 0 4px rgba(34,211,238,0.6);">▲</div>`,
        iconSize: [11, 11],
        iconAnchor: [5, 5],
      });
      L.marker([p.lat, p.lng], { icon })
        .bindTooltip(
          `<b>${(p.callsign || p.icao24).trim()}</b><br/>${p.origin || ""} · ${p.alt ? Math.round(p.alt) + "m" : ""} · ${p.vel ? Math.round(p.vel * 1.94384) + "kn" : ""}`,
          { direction: "top", className: "entropy-tooltip", offset: [0, -6] },
        )
        .addTo(layer);
    });
  }, [planes, visibleLayers.planes]);

  // Tactical: chokepoint stress halos
  useEffect(() => {
    if (!mapRef.current) return;
    const layer = layersRef.current.chokepoints;
    if (!layer) return;
    layer.clearLayers();
    if (visibleLayers.chokepoints === false || !chokepoints?.length) return;
    chokepoints.forEach(c => {
      const color = c.stress > 0.6 ? "#ef4444" : c.stress > 0.35 ? "#f59e0b" : "#22d3ee";
      L.circleMarker([c.lat, c.lng], {
        radius: 14 + c.stress * 18,
        color,
        fillColor: color,
        fillOpacity: 0.05 + c.stress * 0.18,
        weight: 1.5,
        opacity: 0.5 + c.stress * 0.4,
        dashArray: "3 3",
        className: "geo-pulse-ring",
      })
        .bindTooltip(
          `<b>${c.name}</b><br/>Stress ${Math.round(c.stress * 100)}<br/>${c.ships} ships (${c.stoppedShips} idle) · ${c.planes} flights<br/>Δ vs baseline ${c.delta > 0 ? "+" : ""}${Math.round(c.delta * 100)}%`,
          { direction: "top", className: "entropy-tooltip", offset: [0, -10] },
        )
        .addTo(layer);
    });
  }, [chokepoints, visibleLayers.chokepoints]);

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
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-400" /> Live event</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> Vessel</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-cyan-300" /> Aircraft</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" /> Choke stress</span>
        <span className="flex items-center gap-1 text-primary">◆ Portfolio</span>
      </div>
    </div>
  );
}

export { type ConflictEvent, type ForexEntry, type HighEntropyZone, type SupplyChainRisk, type TradeHub };
