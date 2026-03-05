import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, Shield, Loader2, RefreshCw, Zap, MapPin, Navigation, Satellite, Ship, Plane, Radio, Newspaper } from "lucide-react";
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

const typeGlowColors: Record<string, string> = {
  war: "255,50,50", sanctions: "255,180,0", unrest: "255,120,30",
  terrorism: "255,30,30", trade_war: "255,220,0", cyber: "100,200,255",
  energy: "255,160,0",
};
const typeColors: Record<string, string> = {
  war: "bg-red-500", sanctions: "bg-amber-500", unrest: "bg-orange-500",
  terrorism: "bg-red-600", trade_war: "bg-yellow-500", cyber: "bg-cyan-500", energy: "bg-orange-400",
};

interface MovingObject {
  id: number; type: "satellite" | "ship" | "plane";
  lat: number; lng: number; speed: number; heading: number; trail: [number, number][];
}

// High-fidelity continent outlines with many more points for realistic rendering
const continentOutlines: [number, number][][] = [
  // North America (detailed)
  [[72,-168],[70,-162],[68,-165],[66,-168],[64,-166],[62,-164],[60,-162],[60,-155],[58,-152],[59,-150],[60,-147],[60,-142],[59,-139],[57,-136],[55,-133],[54,-131],[52,-128],[50,-127],[48,-125],[46,-124],[43,-124],[40,-124],[37,-122],[35,-120],[33,-118],[32,-117],[30,-114],[28,-111],[26,-109],[24,-108],[22,-105],[20,-105],[18,-101],[16,-95],[17,-92],[18,-89],[19,-88],[20,-87],[21,-87],[21,-86],[22,-84],[24,-82],[25,-81],[26,-80],[27,-80],[28,-80],[29,-81],[30,-81],[31,-81],[33,-79],[34,-78],[35,-76],[36,-76],[37,-76],[39,-74],[40,-74],[41,-72],[42,-70],[43,-70],[44,-68],[45,-67],[46,-64],[47,-63],[48,-60],[50,-57],[52,-56],[53,-56],[55,-59],[56,-61],[58,-63],[59,-64],[60,-65],[62,-67],[64,-72],[65,-75],[68,-78],[70,-80],[72,-84],[73,-90],[74,-95],[73,-100],[72,-110],[72,-120],[72,-130],[72,-140],[72,-150],[72,-160],[72,-168]],
  // South America (detailed)
  [[12,-72],[11,-74],[10,-76],[8,-77],[6,-77],[4,-78],[2,-79],[0,-80],[-2,-80],[-4,-81],[-6,-81],[-8,-80],[-10,-78],[-12,-77],[-14,-76],[-16,-75],[-18,-72],[-20,-70],[-22,-70],[-24,-70],[-26,-70],[-28,-71],[-30,-71],[-33,-72],[-36,-73],[-40,-73],[-43,-73],[-45,-74],[-48,-75],[-50,-74],[-52,-71],[-54,-70],[-55,-68],[-55,-66],[-54,-64],[-52,-64],[-50,-66],[-48,-66],[-46,-65],[-44,-64],[-42,-63],[-40,-62],[-38,-58],[-36,-56],[-34,-54],[-32,-52],[-30,-50],[-28,-49],[-26,-48],[-24,-46],[-22,-44],[-20,-42],[-18,-40],[-16,-39],[-14,-39],[-12,-38],[-10,-37],[-8,-35],[-6,-35],[-4,-34],[-2,-42],[0,-48],[2,-52],[4,-56],[6,-58],[8,-62],[10,-66],[11,-70],[12,-72]],
  // Europe (detailed)
  [[35,-10],[36,-8],[37,-9],[38,-9],[39,-9],[42,-9],[43,-9],[44,-8],[46,-5],[47,-4],[48,-5],[49,-2],[50,2],[51,2],[52,1],[53,0],[54,-2],[55,-3],[56,-5],[57,-6],[58,-5],[58,-3],[59,0],[60,3],[61,5],[62,5],[63,7],[64,10],[65,12],[66,14],[68,15],[70,19],[71,26],[70,28],[68,28],[67,25],[66,22],[65,18],[64,14],[62,12],[60,10],[58,10],[57,12],[56,13],[55,14],[54,14],[54,12],[53,10],[52,6],[51,4],[50,4],[49,6],[48,7],[47,8],[46,9],[44,12],[43,14],[42,15],[41,17],[40,20],[40,24],[41,27],[42,28],[41,30],[40,28],[39,27],[38,24],[37,22],[36,15],[36,12],[36,6],[36,2],[36,-2],[36,-6],[35,-8],[35,-10]],
  // Africa (detailed)
  [[37,10],[36,8],[35,2],[35,-2],[35,-5],[35,-8],[33,-8],[31,-10],[29,-13],[27,-14],[25,-16],[22,-17],[20,-17],[18,-16],[16,-17],[14,-17],[12,-16],[10,-14],[8,-13],[6,-10],[5,-8],[5,-5],[5,-2],[5,0],[4,1],[3,5],[2,8],[1,10],[0,10],[-1,12],[-2,14],[-3,18],[-5,28],[-6,32],[-8,35],[-10,38],[-12,40],[-14,41],[-16,40],[-18,38],[-20,36],[-22,35],[-24,35],[-26,33],[-28,32],[-30,31],[-32,29],[-33,28],[-34,26],[-34,22],[-34,18],[-32,16],[-30,15],[-28,15],[-25,14],[-22,14],[-18,12],[-14,12],[-10,12],[-6,10],[-4,10],[-2,10],[0,10],[1,10],[2,8],[3,5],[5,2],[6,0],[8,0],[10,0],[12,0],[13,-2],[14,-5],[16,-10],[20,-14],[25,-15],[28,-13],[30,-10],[32,-8],[33,2],[35,5],[37,10]],
  // Asia (simplified but accurate)
  [[42,28],[43,30],[44,35],[44,40],[42,45],[40,48],[38,48],[35,48],[32,48],[30,48],[28,52],[26,56],[24,58],[22,60],[24,64],[26,66],[28,68],[30,70],[32,72],[34,74],[36,76],[38,78],[40,80],[42,82],[44,85],[46,88],[48,90],[50,88],[52,86],[54,82],[56,78],[58,74],[60,68],[62,62],[64,58],[66,56],[68,60],[70,64],[72,70],[73,80],[72,90],[72,100],[72,110],[72,120],[72,130],[70,135],[68,140],[66,142],[64,140],[62,138],[60,140],[58,142],[55,138],[52,135],[50,132],[48,134],[46,136],[44,140],[42,142],[40,140],[38,138],[36,136],[35,134],[33,132],[31,130],[28,122],[26,118],[24,116],[22,114],[20,112],[18,110],[16,108],[14,106],[12,104],[10,102],[8,100],[6,100],[4,102],[2,104],[1,105],[0,106],[-2,106],[-4,106],[-6,106],[-7,108],[-8,112],[-8,116],[-7,118],[-5,120],[-2,120],[0,118],[2,118],[5,120],[8,120],[10,120],[12,121],[14,121],[16,120],[18,118],[20,116],[22,114]],
  // Australia (detailed)
  [[-12,132],[-14,130],[-16,128],[-18,124],[-20,119],[-22,116],[-24,114],[-26,113],[-28,114],[-30,115],[-32,116],[-34,118],[-35,122],[-36,128],[-37,132],[-37,137],[-38,142],[-38,145],[-38,148],[-37,150],[-35,151],[-33,152],[-30,153],[-28,153],[-26,152],[-24,151],[-22,150],[-20,148],[-18,146],[-16,146],[-14,142],[-13,138],[-12,136],[-12,132]],
];

function generateMovingObjects(): MovingObject[] {
  const objects: MovingObject[] = [];
  // Satellites in polar and equatorial orbits
  for (let i = 0; i < 12; i++) {
    const isPolar = i < 4;
    objects.push({
      id: i, type: "satellite",
      lat: isPolar ? (Math.random() - 0.5) * 160 : (Math.random() - 0.5) * 60,
      lng: (Math.random() - 0.5) * 360,
      speed: 2 + Math.random() * 4,
      heading: isPolar ? (i % 2 === 0 ? 5 : 175) : 90 + Math.random() * 10,
      trail: [],
    });
  }
  // Ships on major shipping lanes
  const shipRoutes = [
    { lat: 1.3, lng: 104 }, { lat: 30, lng: 32 }, { lat: 9, lng: -79 },
    { lat: 35, lng: 140 }, { lat: 51, lng: 3 }, { lat: -34, lng: 18 },
    { lat: 25, lng: 56 }, { lat: 22, lng: 114 }, { lat: 33, lng: 130 },
    { lat: 5, lng: 73 }, { lat: 14, lng: 42 }, { lat: -6, lng: 106 },
    { lat: 48, lng: -125 }, { lat: 32, lng: -64 },
  ];
  shipRoutes.forEach((pos, i) => {
    objects.push({
      id: 100 + i, type: "ship",
      lat: pos.lat + (Math.random() - 0.5) * 8,
      lng: pos.lng + (Math.random() - 0.5) * 8,
      speed: 0.04 + Math.random() * 0.06,
      heading: Math.random() * 360,
      trail: [],
    });
  });
  // Aircraft on major corridors
  const airCorridors = [
    { lat: 50, lng: -30, heading: 90 }, { lat: 30, lng: 60, heading: 45 },
    { lat: 10, lng: 80, heading: 270 }, { lat: 35, lng: -100, heading: 180 },
    { lat: -5, lng: 120, heading: 315 }, { lat: 45, lng: 10, heading: 90 },
    { lat: 20, lng: -80, heading: 180 }, { lat: 55, lng: 40, heading: 90 },
    { lat: 0, lng: 30, heading: 45 }, { lat: -30, lng: 25, heading: 0 },
    { lat: 40, lng: 120, heading: 60 }, { lat: 25, lng: -10, heading: 180 },
    { lat: 15, lng: 100, heading: 270 }, { lat: -20, lng: 140, heading: 315 },
    { lat: 60, lng: -50, heading: 120 }, { lat: 35, lng: 70, heading: 90 },
  ];
  airCorridors.forEach((ac, i) => {
    objects.push({
      id: 200 + i, type: "plane",
      lat: ac.lat + (Math.random() - 0.5) * 10,
      lng: ac.lng + (Math.random() - 0.5) * 20,
      speed: 0.6 + Math.random() * 1.0,
      heading: ac.heading + (Math.random() - 0.5) * 30,
      trail: [],
    });
  });
  return objects;
}

const GeopoliticalGlobe = ({ stocks }: Props) => {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedConflict, setSelectedConflict] = useState<ConflictEvent | null>(null);
  const [viewMode, setViewMode] = useState<"globe" | "threats" | "forex">("globe");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const rotationRef = useRef(0);
  const objectsRef = useRef<MovingObject[]>(generateMovingObjects());
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const tiltRef = useRef(18);
  const zoomRef = useRef(1);

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

  // Update moving objects with requestAnimationFrame-driven smooth movement
  useEffect(() => {
    const interval = setInterval(() => {
      objectsRef.current = objectsRef.current.map(obj => {
        const rad = obj.heading * Math.PI / 180;
        let newLat = obj.lat + Math.cos(rad) * obj.speed * 0.1;
        let newLng = obj.lng + Math.sin(rad) * obj.speed * 0.1;
        if (newLat > 85) { newLat = 85; obj.heading = (obj.heading + 180) % 360; }
        if (newLat < -85) { newLat = -85; obj.heading = (obj.heading + 180) % 360; }
        if (newLng > 180) newLng -= 360;
        if (newLng < -180) newLng += 360;
        // Smooth heading drift
        obj.heading += (Math.random() - 0.5) * (obj.type === "satellite" ? 0.5 : obj.type === "plane" ? 1.5 : 2);
        const trail = [...obj.trail, [obj.lat, obj.lng] as [number, number]].slice(-(obj.type === "satellite" ? 20 : 10));
        return { ...obj, lat: newLat, lng: newLng, trail };
      });
    }, 150);
    return () => clearInterval(interval);
  }, []);

  // High-performance globe rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();

    const W = canvas.getBoundingClientRect().width;
    const H = canvas.getBoundingClientRect().height;
    const R = Math.min(W, H) * 0.38 * zoomRef.current;
    const cx = W / 2;
    const cy = H / 2;

    const toScreen = (lat: number, lng: number): [number, number, number] | null => {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (lng + rotationRef.current) * Math.PI / 180;
      const tiltRad = tiltRef.current * Math.PI / 180;
      const x3 = R * Math.sin(phi) * Math.cos(theta);
      const y3raw = -R * Math.cos(phi);
      const z3raw = R * Math.sin(phi) * Math.sin(theta);
      const y3 = y3raw * Math.cos(tiltRad) - z3raw * Math.sin(tiltRad);
      const z3 = y3raw * Math.sin(tiltRad) + z3raw * Math.cos(tiltRad);
      if (z3 < -R * 0.05) return null;
      const depth = (z3 + R) / (2 * R); // 0=back, 1=front
      return [cx + x3, cy + y3, depth];
    };

    let frameCount = 0;
    const drawFrame = () => {
      const t = Date.now() / 1000;
      frameCount++;
      ctx.clearRect(0, 0, W, H);

      // Deep space background with nebula effect
      const spaceBg = ctx.createRadialGradient(cx * 0.7, cy * 0.4, 0, cx, cy, Math.max(W, H) * 0.9);
      spaceBg.addColorStop(0, "hsl(225, 40%, 4%)");
      spaceBg.addColorStop(0.3, "hsl(220, 35%, 3%)");
      spaceBg.addColorStop(0.7, "hsl(230, 45%, 2%)");
      spaceBg.addColorStop(1, "hsl(220, 50%, 1%)");
      ctx.fillStyle = spaceBg;
      ctx.fillRect(0, 0, W, H);

      // Stars with parallax-style twinkling
      for (let i = 0; i < 200; i++) {
        const sx = ((i * 7919 + 31) % W);
        const sy = ((i * 6271 + 17) % H);
        const brightness = 0.08 + Math.sin(t * 0.2 + i * 1.3) * 0.06;
        const size = 0.3 + (i % 4) * 0.25;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${180 + (i % 40)}, ${200 + (i % 30)}, 255, ${brightness})`;
        ctx.fill();
      }

      // Outer atmosphere glow — multi-layer
      for (let layer = 0; layer < 3; layer++) {
        const atmo = ctx.createRadialGradient(cx, cy, R * (0.98 - layer * 0.02), cx, cy, R * (1.2 + layer * 0.1));
        atmo.addColorStop(0, `rgba(40, 120, 255, ${0.06 - layer * 0.015})`);
        atmo.addColorStop(0.5, `rgba(30, 80, 200, ${0.025 - layer * 0.006})`);
        atmo.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = atmo;
        ctx.fillRect(0, 0, W, H);
      }

      // Globe body — deep ocean with specular highlight
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      const oceanGrad = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.25, R * 0.1, cx, cy, R);
      oceanGrad.addColorStop(0, "hsl(215, 40%, 14%)");
      oceanGrad.addColorStop(0.3, "hsl(215, 38%, 10%)");
      oceanGrad.addColorStop(0.7, "hsl(215, 42%, 7%)");
      oceanGrad.addColorStop(1, "hsl(220, 50%, 3%)");
      ctx.fillStyle = oceanGrad;
      ctx.fill();

      // Clip to globe for continent rendering
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      // CONTINENTS — filled with altitude-based shading
      continentOutlines.forEach((outline, ci) => {
        const points: [number, number][] = [];
        outline.forEach(([lat, lng]) => {
          const pt = toScreen(lat, lng);
          if (pt) points.push([pt[0], pt[1]]);
        });

        if (points.length > 3) {
          ctx.beginPath();
          ctx.moveTo(points[0][0], points[0][1]);
          for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i][0], points[i][1]);
          }
          ctx.closePath();

          // Continent fill with subtle gradient
          const continentHues = [160, 145, 175, 140, 155, 130];
          const hue = continentHues[ci % continentHues.length];
          ctx.fillStyle = `hsla(${hue}, 12%, 16%, 0.85)`;
          ctx.fill();

          // Coastline glow
          ctx.strokeStyle = "rgba(80, 160, 220, 0.25)";
          ctx.lineWidth = 1;
          ctx.stroke();

          // Inner border for depth
          ctx.strokeStyle = "rgba(60, 130, 200, 0.08)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });

      // Latitude/Longitude grid — subtle
      ctx.globalAlpha = 0.03;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let started = false;
        for (let lng = -180; lng <= 180; lng += 2) {
          const pt = toScreen(lat, lng);
          if (pt) { if (!started) { ctx.moveTo(pt[0], pt[1]); started = true; } else ctx.lineTo(pt[0], pt[1]); }
          else started = false;
        }
        ctx.strokeStyle = "rgba(60, 120, 200, 1)";
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
      for (let lng = -180; lng < 180; lng += 30) {
        ctx.beginPath();
        let started = false;
        for (let lat = -90; lat <= 90; lat += 2) {
          const pt = toScreen(lat, lng);
          if (pt) { if (!started) { ctx.moveTo(pt[0], pt[1]); started = true; } else ctx.lineTo(pt[0], pt[1]); }
          else started = false;
        }
        ctx.strokeStyle = "rgba(60, 120, 200, 1)";
        ctx.lineWidth = 0.3;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      // TRADE HUBS with pulsing rings
      data.tradeHubs.forEach(hub => {
        const pt = toScreen(hub.lat, hub.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 2 + hub.lat * 0.1) * 0.3;
        const alpha = 0.3 + pt[2] * 0.5;

        // Pulse ring
        const pr = 12 * pulse;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], pr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(60, 160, 255, ${0.15 * alpha})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();

        // Glow
        const hg = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 8);
        hg.addColorStop(0, `rgba(60, 160, 255, ${0.5 * alpha})`);
        hg.addColorStop(1, "rgba(60, 160, 255, 0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 8, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(100, 180, 255, ${0.9 * alpha})`;
        ctx.fill();

        if (W > 500) {
          ctx.font = "600 7px 'JetBrains Mono', monospace";
          ctx.fillStyle = `rgba(100, 170, 255, ${0.5 * alpha})`;
          ctx.fillText(hub.name, pt[0] + 8, pt[1] - 4);
        }
      });

      // SUPPLY CHAIN arcs with animated flow
      data.supplyChainRisks?.forEach(risk => {
        const start = toScreen(risk.startLat, risk.startLng);
        const end = toScreen(risk.endLat, risk.endLng);
        if (!start || !end) return;

        ctx.beginPath();
        ctx.moveTo(start[0], start[1]);
        const midX = (start[0] + end[0]) / 2;
        const midY = Math.min(start[1], end[1]) - 30 - Math.random() * 15;
        ctx.quadraticCurveTo(midX, midY, end[0], end[1]);

        const riskColor = risk.riskLevel === "high" ? "rgba(255, 60, 60, 0.35)" : risk.riskLevel === "medium" ? "rgba(255, 180, 0, 0.25)" : "rgba(60, 160, 255, 0.15)";
        ctx.strokeStyle = riskColor;
        ctx.lineWidth = risk.riskLevel === "high" ? 2 : 1.5;
        ctx.setLineDash([6, 4]);
        ctx.lineDashOffset = -(t * 25) % 10;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // CONFLICT EVENTS — multi-ring pulsing nodes
      data.conflictEvents.forEach(evt => {
        const pt = toScreen(evt.lat, evt.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 3 + evt.lat * 0.1) * 0.4;
        const baseR = 5 + evt.severity * 16;
        const r = baseR * pulse;
        const clr = typeGlowColors[evt.type] || "255,50,50";
        const alpha = 0.3 + pt[2] * 0.7;

        // Outer shockwave ring
        const shockR = r * 2.5 * (1 + Math.sin(t * 2 + evt.lng * 0.05) * 0.2);
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], shockR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${clr}, ${0.04 * alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Middle ring
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${clr}, ${0.1 * alpha})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();

        // Glow field
        const glow = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], r * 2);
        glow.addColorStop(0, `rgba(${clr}, ${0.5 * evt.severity * alpha})`);
        glow.addColorStop(0.5, `rgba(${clr}, ${0.15 * evt.severity * alpha})`);
        glow.addColorStop(1, `rgba(${clr}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 2, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 3.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${clr}, ${0.95 * alpha})`;
        ctx.fill();

        // Severity arc
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 0.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * evt.severity);
        ctx.strokeStyle = `rgba(${clr}, ${0.8 * alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label with background
        if (W > 500) {
          const label = evt.name.substring(0, 22);
          ctx.font = "bold 7px 'JetBrains Mono', monospace";
          const tw = ctx.measureText(label).width;
          ctx.fillStyle = `rgba(0, 0, 0, ${0.5 * alpha})`;
          ctx.fillRect(pt[0] + r * 0.8 + 2, pt[1] - 9, tw + 6, 12);
          ctx.fillStyle = `rgba(${clr}, ${0.9 * alpha})`;
          ctx.fillText(label, pt[0] + r * 0.8 + 5, pt[1] - 1);
        }
      });

      // HIGH-ENTROPY ZONES — triple ring with lightning icon
      data.highEntropyZones.forEach(zone => {
        const pt = toScreen(zone.lat, zone.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 1.5 + zone.lng * 0.05) * 0.3;
        const alpha = 0.3 + pt[2] * 0.7;
        for (let ring = 0; ring < 3; ring++) {
          const rr = (16 + ring * 10) * pulse;
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], rr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 120, 0, ${(0.3 - ring * 0.08) * alpha})`;
          ctx.lineWidth = ring === 0 ? 1.8 : 0.8;
          ctx.setLineDash(ring > 0 ? [3, 3] : []);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.font = "bold 9px 'JetBrains Mono', monospace";
        ctx.fillStyle = `rgba(255, 160, 40, ${0.9 * alpha})`;
        ctx.fillText(`⚡${zone.entropyScore.toFixed(0)}`, pt[0] + 20, pt[1] - 2);
      });

      // FOREX STRESS markers
      data.forexVolatility.filter(f => f.isStressed).forEach(fx => {
        const pt = toScreen(fx.lat, fx.lng);
        if (!pt) return;
        const alpha = 0.3 + pt[2] * 0.7;
        ctx.save();
        ctx.translate(pt[0], pt[1]);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = `rgba(255, 200, 0, ${0.6 * alpha})`;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-5, -5, 10, 10);
        ctx.restore();
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.fillStyle = Math.abs(fx.change24h) > 2 ? `rgba(255, 80, 80, ${0.9 * alpha})` : `rgba(255, 200, 0, ${0.8 * alpha})`;
        ctx.fillText(`${fx.currency} ${fx.change24h > 0 ? "+" : ""}${fx.change24h.toFixed(1)}%`, pt[0] + 10, pt[1] + 3);
      });

      // MOVING OBJECTS with depth-aware rendering
      objectsRef.current.forEach(obj => {
        const pt = toScreen(obj.lat, obj.lng);
        if (!pt) return;
        const depth = pt[2];
        const alpha = 0.2 + depth * 0.8;

        if (obj.type === "satellite") {
          // Trail
          ctx.beginPath();
          let ts = false;
          obj.trail.forEach(([tLat, tLng], ti) => {
            const tp = toScreen(tLat, tLng);
            if (tp) {
              if (!ts) { ctx.moveTo(tp[0], tp[1]); ts = true; }
              else ctx.lineTo(tp[0], tp[1]);
            }
          });
          ctx.strokeStyle = `rgba(0, 200, 255, ${0.08 * alpha})`;
          ctx.lineWidth = 0.4;
          ctx.stroke();

          // Satellite body
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 1.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 220, 255, ${0.9 * alpha})`;
          ctx.fill();

          // Blink
          if (Math.sin(t * 8 + obj.id) > 0.6) {
            ctx.beginPath();
            ctx.arc(pt[0], pt[1], 4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 220, 255, ${0.2 * alpha})`;
            ctx.fill();
          }
        } else if (obj.type === "ship") {
          ctx.save();
          ctx.translate(pt[0], pt[1]);
          ctx.rotate(obj.heading * Math.PI / 180);
          ctx.beginPath();
          ctx.moveTo(0, -5);
          ctx.lineTo(-3, 4);
          ctx.lineTo(3, 4);
          ctx.closePath();
          ctx.fillStyle = `rgba(80, 200, 140, ${0.7 * alpha})`;
          ctx.fill();
          ctx.restore();
          // Wake
          ctx.beginPath();
          let ws = false;
          obj.trail.slice(-5).forEach(([tLat, tLng]) => {
            const tp = toScreen(tLat, tLng);
            if (tp) { if (!ws) { ctx.moveTo(tp[0], tp[1]); ws = true; } else ctx.lineTo(tp[0], tp[1]); }
          });
          ctx.strokeStyle = `rgba(80, 200, 140, ${0.12 * alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else {
          // Plane
          ctx.save();
          ctx.translate(pt[0], pt[1]);
          ctx.rotate(obj.heading * Math.PI / 180);
          ctx.fillStyle = `rgba(200, 180, 255, ${0.6 * alpha})`;
          ctx.beginPath();
          ctx.moveTo(0, -4);
          ctx.lineTo(-3, 2);
          ctx.lineTo(0, 1);
          ctx.lineTo(3, 2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          // Contrail
          ctx.beginPath();
          let cs = false;
          obj.trail.slice(-6).forEach(([tLat, tLng]) => {
            const tp = toScreen(tLat, tLng);
            if (tp) { if (!cs) { ctx.moveTo(tp[0], tp[1]); cs = true; } else ctx.lineTo(tp[0], tp[1]); }
          });
          ctx.strokeStyle = `rgba(200, 180, 255, ${0.06 * alpha})`;
          ctx.lineWidth = 0.4;
          ctx.stroke();
        }
      });

      // Portfolio territory overlay
      stocks.filter(s => s.analysis).forEach(s => {
        // Map tickers to approximate geographic locations
        const tickerGeo = getTickerGeo(s.ticker);
        if (!tickerGeo) return;
        const pt = toScreen(tickerGeo.lat, tickerGeo.lng);
        if (!pt) return;
        const alpha = 0.3 + pt[2] * 0.7;

        // Portfolio marker
        const pg = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 12);
        pg.addColorStop(0, `rgba(60, 130, 255, ${0.4 * alpha})`);
        pg.addColorStop(1, "rgba(60, 130, 255, 0)");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(60, 180, 255, ${0.9 * alpha})`;
        ctx.fill();

        ctx.font = "bold 7px 'JetBrains Mono', monospace";
        ctx.fillStyle = `rgba(60, 180, 255, ${0.7 * alpha})`;
        ctx.fillText(s.ticker.replace(".NS", "").replace(".BO", ""), pt[0] + 8, pt[1] + 3);
      });

      // GOD'S EYE reticle overlay
      ctx.strokeStyle = "rgba(60, 130, 255, 0.04)";
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(cx - R * 1.15, cy);
      ctx.lineTo(cx - R * 0.05, cy);
      ctx.moveTo(cx + R * 0.05, cy);
      ctx.lineTo(cx + R * 1.15, cy);
      ctx.moveTo(cx, cy - R * 1.15);
      ctx.lineTo(cx, cy - R * 0.05);
      ctx.moveTo(cx, cy + R * 0.05);
      ctx.lineTo(cx, cy + R * 1.15);
      ctx.stroke();

      // Corner brackets
      const bLen = 18, bOff = R * 1.08;
      ctx.strokeStyle = "rgba(60, 130, 255, 0.1)";
      ctx.lineWidth = 0.8;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
        const bx = cx + dx * bOff, by = cy + dy * bOff;
        ctx.beginPath();
        ctx.moveTo(bx, by + dy * -bLen);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + dx * -bLen, by);
        ctx.stroke();
      });

      // HUD overlay text
      ctx.font = "600 8px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(70, 140, 255, 0.35)";
      ctx.fillText(`ENTROPY GOD'S EYE · ${new Date().toISOString().split("T")[0]}`, 10, 16);
      ctx.fillText(`CONFLICTS: ${data.conflictEvents.length} · ZONES: ${data.highEntropyZones.length} · RISK: ${data.globalRiskScore}/100`, 10, 30);
      ctx.fillText(`SAT: ${objectsRef.current.filter(o => o.type === "satellite").length} · VES: ${objectsRef.current.filter(o => o.type === "ship").length} · AIR: ${objectsRef.current.filter(o => o.type === "plane").length}`, W - 200, 16);
      ctx.fillText(`REGIME: ${data.regimeSignal?.toUpperCase()} · FLOW: ${data.capitalFlowDirection?.toUpperCase()}`, W - 200, 30);

      // Globe atmosphere edge
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(60, 130, 255, 0.06)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Specular highlight on globe
      const spec = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, 0, cx - R * 0.3, cy - R * 0.35, R * 0.6);
      spec.addColorStop(0, "rgba(180, 220, 255, 0.04)");
      spec.addColorStop(1, "rgba(180, 220, 255, 0)");
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // Auto-rotate when not dragging
      if (!isDragging.current) rotationRef.current += 0.04;
      animRef.current = requestAnimationFrame(drawFrame);
    };

    // Mouse/touch interaction
    const handleMouseDown = (e: MouseEvent) => { isDragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      rotationRef.current += (e.clientX - lastMouse.current.x) * 0.3;
      tiltRef.current = Math.max(-60, Math.min(60, tiltRef.current + (e.clientY - lastMouse.current.y) * 0.2));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => { isDragging.current = false; };
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomRef.current = Math.max(0.6, Math.min(2, zoomRef.current - e.deltaY * 0.001));
    };
    const handleTouchStart = (e: TouchEvent) => { isDragging.current = true; lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      rotationRef.current += (e.touches[0].clientX - lastMouse.current.x) * 0.3;
      tiltRef.current = Math.max(-60, Math.min(60, tiltRef.current + (e.touches[0].clientY - lastMouse.current.y) * 0.2));
      lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const handleTouchEnd = () => { isDragging.current = false; };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd);

    animRef.current = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
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
              <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">God's Eye — Global Intelligence</h2>
              <p className="text-[9px] text-muted-foreground font-mono tracking-widest">
                LIVE · {data.conflictEvents.length} CONFLICTS · {objectsRef.current.filter(o => o.type === "satellite").length} SAT · {objectsRef.current.filter(o => o.type === "ship").length} VESSELS · {objectsRef.current.filter(o => o.type === "plane").length} AIR · {data.timestamp ? `${Math.round((Date.now() - data.timestamp) / 1000)}s ago` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap relative z-10">
            {(["globe", "threats", "forex"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-mono font-medium transition-all ${viewMode === m ? "glass-panel glass-glow-primary text-primary" : "glass-subtle text-muted-foreground hover:text-foreground"}`}>
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

      {/* Globe + Intel */}
      {viewMode === "globe" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="glass-panel rounded-xl overflow-hidden relative">
            <canvas ref={canvasRef} className="w-full cursor-grab active:cursor-grabbing relative z-10"
              style={{ height: "min(600px, 70vw)" }} />
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2 sm:gap-3 text-[8px] sm:text-[9px] text-muted-foreground glass-subtle rounded-lg px-2 sm:px-3 py-1.5 z-20">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Conflict</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Entropy</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Hub</span>
              <span className="flex items-center gap-1"><Satellite className="h-2.5 w-2.5 text-cyan-400" /> Sat</span>
              <span className="flex items-center gap-1"><Ship className="h-2.5 w-2.5 text-emerald-400" /> Ship</span>
              <span className="flex items-center gap-1"><Plane className="h-2.5 w-2.5 text-purple-300" /> Air</span>
              <span className="flex items-center gap-1 text-primary"><Navigation className="h-2.5 w-2.5" /> Portfolio</span>
            </div>
          </div>

          {/* Threat Feed */}
          <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-hide">
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

// Map ticker symbols to approximate geographic coordinates for portfolio overlay
function getTickerGeo(ticker: string): { lat: number; lng: number } | null {
  const t = ticker.toUpperCase();
  if (t.endsWith(".NS") || t.endsWith(".BO")) return { lat: 19, lng: 73 }; // Mumbai
  if (t.endsWith(".L")) return { lat: 51.5, lng: -0.1 }; // London
  if (t.endsWith(".T") || t.endsWith(".TYO")) return { lat: 35.7, lng: 139.7 }; // Tokyo
  if (t.endsWith(".HK")) return { lat: 22.3, lng: 114.2 }; // Hong Kong
  if (t.endsWith(".SS") || t.endsWith(".SZ")) return { lat: 31.2, lng: 121.5 }; // Shanghai
  if (t.endsWith(".DE") || t.endsWith(".F")) return { lat: 50.1, lng: 8.7 }; // Frankfurt
  if (t.endsWith(".PA")) return { lat: 48.9, lng: 2.3 }; // Paris
  if (t.includes("-USD") || t.includes("-EUR")) return { lat: 37, lng: -95 }; // US crypto exchanges
  if (t.includes("=X")) return null; // Forex - no geo
  if (t.includes("=F")) return { lat: 41.9, lng: -87.6 }; // Chicago (CME)
  // Default to US (NYSE/NASDAQ)
  return { lat: 40.7, lng: -74 };
}

export default GeopoliticalGlobe;
