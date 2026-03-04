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

// Simplified continent outlines (major coastlines as polylines)
const continentOutlines: [number, number][][] = [
  // North America
  [[70,-165],[65,-168],[60,-165],[58,-152],[60,-140],[55,-130],[48,-125],[40,-124],[32,-117],[25,-110],[20,-105],[15,-92],[18,-88],[21,-87],[25,-80],[30,-81],[35,-75],[40,-74],[43,-70],[45,-67],[47,-60],[50,-55],[53,-56],[55,-60],[60,-65],[64,-75],[70,-80],[73,-85],[75,-95],[72,-130],[70,-165]],
  // South America
  [[12,-72],[10,-76],[5,-77],[0,-80],[-5,-81],[-8,-80],[-15,-75],[-23,-70],[-30,-71],[-40,-73],[-46,-75],[-53,-70],[-55,-68],[-54,-64],[-48,-65],[-42,-63],[-35,-57],[-30,-50],[-25,-47],[-20,-40],[-15,-39],[-10,-37],[-5,-35],[0,-50],[5,-60],[8,-62],[10,-67],[12,-72]],
  // Europe
  [[36,-6],[38,-9],[43,-9],[48,-5],[51,2],[53,-4],[55,-7],[58,-5],[62,5],[60,10],[57,10],[55,13],[54,10],[52,5],[50,3],[43,3],[42,10],[39,3],[36,0],[36,-6]],
  // Africa
  [[35,-6],[37,10],[33,12],[32,25],[30,33],[25,35],[15,43],[12,44],[2,42],[-5,40],[-12,42],[-15,40],[-25,35],[-30,31],[-34,26],[-34,18],[-28,16],[-17,12],[-5,12],[5,2],[5,-5],[7,-15],[15,-17],[20,-17],[25,-15],[30,-10],[35,-6]],
  // Asia (simplified)
  [[40,28],[42,30],[45,40],[40,50],[30,48],[25,56],[22,60],[25,65],[28,68],[35,70],[38,75],[42,80],[45,90],[50,87],[55,73],[60,60],[65,58],[68,70],[70,80],[72,100],[70,135],[68,140],[65,142],[58,140],[55,135],[50,132],[48,135],[45,140],[42,145],[40,142],[38,140],[35,137],[32,132],[30,122],[22,114],[20,110],[12,108],[8,100],[3,103],[1,105],[-6,106],[-8,115],[-8,120],[0,120],[5,118],[10,120],[15,121],[20,122],[22,114]],
  // Australia
  [[-12,130],[-15,129],[-20,119],[-25,114],[-30,115],[-35,117],[-37,140],[-38,145],[-38,148],[-34,151],[-27,153],[-22,150],[-18,146],[-16,145],[-14,137],[-12,130]],
];

function generateMovingObjects(): MovingObject[] {
  const objects: MovingObject[] = [];
  for (let i = 0; i < 8; i++) {
    objects.push({ id: i, type: "satellite", lat: (Math.random()-0.5)*140, lng: (Math.random()-0.5)*360, speed: 2+Math.random()*3, heading: Math.random()*360, trail: [] });
  }
  const shipRoutes = [
    {lat:1.3,lng:104},{lat:30,lng:32},{lat:9,lng:-79},{lat:35,lng:140},{lat:51,lng:3},{lat:-34,lng:18},{lat:25,lng:56},{lat:22,lng:114},{lat:33,lng:130},{lat:5,lng:73},
  ];
  shipRoutes.forEach((pos, i) => {
    objects.push({ id:100+i, type:"ship", lat:pos.lat+(Math.random()-0.5)*10, lng:pos.lng+(Math.random()-0.5)*10, speed:0.05+Math.random()*0.08, heading:Math.random()*360, trail:[] });
  });
  for (let i = 0; i < 12; i++) {
    objects.push({ id:200+i, type:"plane", lat:(Math.random()-0.5)*120, lng:(Math.random()-0.5)*360, speed:0.8+Math.random()*1.2, heading:Math.random()*360, trail:[] });
  }
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
  const tiltRef = useRef(15);

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

  // Update moving objects
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
        obj.heading += (Math.random() - 0.5) * 2;
        const trail = [...obj.trail, [obj.lat, obj.lng] as [number, number]].slice(-8);
        return { ...obj, lat: newLat, lng: newLng, trail };
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // God's Eye 3D Globe rendering with continent outlines
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const R = Math.min(W, H) * 0.40;
    const cx = W / 2;
    const cy = H / 2;

    const toScreen = (lat: number, lng: number): [number, number] | null => {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (lng + rotationRef.current) * Math.PI / 180;
      const tiltRad = tiltRef.current * Math.PI / 180;
      const x3 = R * Math.sin(phi) * Math.cos(theta);
      const y3raw = -R * Math.cos(phi);
      const z3raw = R * Math.sin(phi) * Math.sin(theta);
      const y3 = y3raw * Math.cos(tiltRad) - z3raw * Math.sin(tiltRad);
      const z3 = y3raw * Math.sin(tiltRad) + z3raw * Math.cos(tiltRad);
      if (z3 < -R * 0.1) return null;
      return [cx + x3, cy + y3];
    };

    const drawFrame = () => {
      ctx.clearRect(0, 0, W, H);
      const t = Date.now() / 1000;

      // Deep space
      const spaceBg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.8);
      spaceBg.addColorStop(0, "hsl(220, 30%, 3%)");
      spaceBg.addColorStop(1, "hsl(220, 40%, 1%)");
      ctx.fillStyle = spaceBg;
      ctx.fillRect(0, 0, W, H);

      // Stars
      for (let i = 0; i < 120; i++) {
        const sx = ((i * 7919 + 31) % W);
        const sy = ((i * 6271 + 17) % H);
        const brightness = 0.12 + Math.sin(t * 0.3 + i * 0.7) * 0.08;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.4 + (i % 3) * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 210, 255, ${brightness})`;
        ctx.fill();
      }

      // Outer atmosphere
      const atmo = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.35);
      atmo.addColorStop(0, "rgba(40, 120, 255, 0.06)");
      atmo.addColorStop(0.4, "rgba(30, 80, 200, 0.03)");
      atmo.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = atmo;
      ctx.fillRect(0, 0, W, H);

      // Globe body — ocean
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      const oceanGrad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
      oceanGrad.addColorStop(0, "hsl(215, 35%, 12%)");
      oceanGrad.addColorStop(0.6, "hsl(215, 40%, 7%)");
      oceanGrad.addColorStop(1, "hsl(215, 45%, 4%)");
      ctx.fillStyle = oceanGrad;
      ctx.fill();

      // CONTINENT OUTLINES — real geography
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.clip();

      continentOutlines.forEach(outline => {
        ctx.beginPath();
        let started = false;
        const points: [number, number][] = [];
        outline.forEach(([lat, lng]) => {
          const pt = toScreen(lat, lng);
          if (pt) {
            points.push(pt);
            if (!started) { ctx.moveTo(pt[0], pt[1]); started = true; }
            else ctx.lineTo(pt[0], pt[1]);
          } else { started = false; }
        });
        if (points.length > 2) {
          ctx.closePath();
          // Fill continents
          ctx.fillStyle = "hsl(215, 18%, 14%)";
          ctx.fill();
          // Outline
          ctx.strokeStyle = "rgba(100, 160, 220, 0.2)";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      });
      ctx.restore();

      // Subtle lat/lng grid
      ctx.strokeStyle = "rgba(60, 100, 180, 0.04)";
      ctx.lineWidth = 0.3;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let started = false;
        for (let lng = -180; lng <= 180; lng += 3) {
          const pt = toScreen(lat, lng);
          if (pt) { if (!started) { ctx.moveTo(pt[0], pt[1]); started = true; } else ctx.lineTo(pt[0], pt[1]); }
          else started = false;
        }
        ctx.stroke();
      }
      for (let lng = -180; lng < 180; lng += 30) {
        ctx.beginPath();
        let started = false;
        for (let lat = -90; lat <= 90; lat += 3) {
          const pt = toScreen(lat, lng);
          if (pt) { if (!started) { ctx.moveTo(pt[0], pt[1]); started = true; } else ctx.lineTo(pt[0], pt[1]); }
          else started = false;
        }
        ctx.stroke();
      }

      // TRADE HUBS
      data.tradeHubs.forEach(hub => {
        const pt = toScreen(hub.lat, hub.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 2 + hub.lat) * 0.3;
        const hg = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 10 * pulse);
        hg.addColorStop(0, "rgba(60, 160, 255, 0.4)");
        hg.addColorStop(1, "rgba(60, 160, 255, 0)");
        ctx.fillStyle = hg;
        ctx.fillRect(pt[0] - 14, pt[1] - 14, 28, 28);
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(100, 180, 255, 0.9)";
        ctx.fill();
        ctx.font = "7px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(100, 170, 255, 0.4)";
        ctx.fillText(hub.name, pt[0] + 6, pt[1] - 5);
      });

      // SUPPLY CHAIN ROUTES
      data.supplyChainRisks?.forEach(risk => {
        const start = toScreen(risk.startLat, risk.startLng);
        const end = toScreen(risk.endLat, risk.endLng);
        if (!start || !end) return;
        ctx.beginPath();
        ctx.moveTo(start[0], start[1]);
        const midX = (start[0] + end[0]) / 2;
        const midY = Math.min(start[1], end[1]) - 40;
        ctx.quadraticCurveTo(midX, midY, end[0], end[1]);
        const riskColor = risk.riskLevel === "high" ? "rgba(255, 60, 60, 0.3)" : risk.riskLevel === "medium" ? "rgba(255, 180, 0, 0.2)" : "rgba(60, 160, 255, 0.15)";
        ctx.strokeStyle = riskColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -(t * 20) % 20;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // CONFLICT EVENTS
      data.conflictEvents.forEach(evt => {
        const pt = toScreen(evt.lat, evt.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 3 + evt.lat * 0.1) * 0.4;
        const baseR = 5 + evt.severity * 14;
        const r = baseR * pulse;
        const clr = typeGlowColors[evt.type] || "255,50,50";

        // Outer ring
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${clr}, ${0.08 + Math.sin(t * 4) * 0.04})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();

        // Glow
        const glow = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], r * 1.8);
        glow.addColorStop(0, `rgba(${clr}, ${0.4 * evt.severity})`);
        glow.addColorStop(1, `rgba(${clr}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${clr}, 0.95)`;
        ctx.fill();

        // Severity arc
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 0.6, -Math.PI/2, -Math.PI/2 + Math.PI*2*evt.severity);
        ctx.strokeStyle = `rgba(${clr}, 0.7)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        if (W > 600) {
          ctx.font = "bold 7px 'JetBrains Mono', monospace";
          ctx.fillStyle = `rgba(${clr}, 0.8)`;
          ctx.fillText(evt.name.substring(0, 20), pt[0] + r * 0.8 + 4, pt[1] - 2);
        }
      });

      // HIGH-ENTROPY ZONES
      data.highEntropyZones.forEach(zone => {
        const pt = toScreen(zone.lat, zone.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 1.5 + zone.lng) * 0.3;
        for (let ring = 0; ring < 3; ring++) {
          const rr = (14 + ring * 8) * pulse;
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], rr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 120, 0, ${0.25 - ring * 0.06})`;
          ctx.lineWidth = ring === 0 ? 1.5 : 0.8;
          ctx.setLineDash(ring > 0 ? [3, 3] : []);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(255, 160, 40, 0.9)";
        ctx.fillText(`⚡${zone.entropyScore.toFixed(0)}`, pt[0] + 16, pt[1] - 2);
      });

      // FOREX STRESS
      data.forexVolatility.filter(f => f.isStressed).forEach(fx => {
        const pt = toScreen(fx.lat, fx.lng);
        if (!pt) return;
        ctx.save();
        ctx.translate(pt[0], pt[1]);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = "rgba(255, 200, 0, 0.6)";
        ctx.lineWidth = 1.2;
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.restore();
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.fillStyle = Math.abs(fx.change24h) > 2 ? "rgba(255, 80, 80, 0.9)" : "rgba(255, 200, 0, 0.8)";
        ctx.fillText(`${fx.currency} ${fx.change24h > 0 ? "+" : ""}${fx.change24h.toFixed(1)}%`, pt[0] + 8, pt[1] + 3);
      });

      // MOVING OBJECTS
      objectsRef.current.forEach(obj => {
        const pt = toScreen(obj.lat, obj.lng);
        if (!pt) return;
        if (obj.type === "satellite") {
          ctx.beginPath();
          let ts = false;
          obj.trail.forEach(([tLat, tLng]) => {
            const tp = toScreen(tLat, tLng);
            if (tp) { if (!ts) { ctx.moveTo(tp[0], tp[1]); ts = true; } else ctx.lineTo(tp[0], tp[1]); }
          });
          ctx.strokeStyle = "rgba(0, 200, 255, 0.12)";
          ctx.lineWidth = 0.4;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 1.5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0, 220, 255, 0.8)";
          ctx.fill();
          if (Math.sin(t * 8 + obj.id) > 0.7) {
            ctx.beginPath(); ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0, 220, 255, 0.25)"; ctx.fill();
          }
        } else if (obj.type === "ship") {
          ctx.save(); ctx.translate(pt[0], pt[1]); ctx.rotate(obj.heading * Math.PI / 180);
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(-2.5, 3); ctx.lineTo(2.5, 3); ctx.closePath();
          ctx.fillStyle = "rgba(100, 200, 150, 0.65)"; ctx.fill(); ctx.restore();
        } else {
          ctx.save(); ctx.translate(pt[0], pt[1]); ctx.rotate(obj.heading * Math.PI / 180);
          ctx.strokeStyle = "rgba(200, 180, 255, 0.5)"; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, 3); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.stroke();
          ctx.restore();
        }
      });

      // GOD'S EYE reticle
      ctx.strokeStyle = "rgba(60, 130, 255, 0.05)";
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(cx - R*1.1, cy); ctx.lineTo(cx - R*0.05, cy);
      ctx.moveTo(cx + R*0.05, cy); ctx.lineTo(cx + R*1.1, cy);
      ctx.moveTo(cx, cy - R*1.1); ctx.lineTo(cx, cy - R*0.05);
      ctx.moveTo(cx, cy + R*0.05); ctx.lineTo(cx, cy + R*1.1);
      ctx.stroke();

      // Corner brackets
      const bLen = 15, bOff = R * 1.05;
      ctx.strokeStyle = "rgba(60, 130, 255, 0.12)";
      ctx.lineWidth = 0.8;
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([dx,dy]) => {
        const bx = cx + dx*bOff, by = cy + dy*bOff;
        ctx.beginPath();
        ctx.moveTo(bx, by + dy * -bLen); ctx.lineTo(bx, by); ctx.lineTo(bx + dx * -bLen, by);
        ctx.stroke();
      });

      // HUD
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(80, 140, 255, 0.3)";
      ctx.fillText(`ENTROPY GOD'S EYE · ${new Date().toISOString().split("T")[0]}`, 10, 14);
      ctx.fillText(`CONFLICTS: ${data.conflictEvents.length} · ZONES: ${data.highEntropyZones.length} · RISK: ${data.globalRiskScore}/100`, 10, 26);
      ctx.fillText(`SAT: ${objectsRef.current.filter(o => o.type === "satellite").length} · VESSELS: ${objectsRef.current.filter(o => o.type === "ship").length} · AIR: ${objectsRef.current.filter(o => o.type === "plane").length}`, W - 240, 14);

      // Atmosphere ring
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(60, 130, 255, 0.08)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      if (!isDragging.current) rotationRef.current += 0.06;
      animRef.current = requestAnimationFrame(drawFrame);
    };

    const handleMouseDown = (e: MouseEvent) => { isDragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      rotationRef.current += (e.clientX - lastMouse.current.x) * 0.3;
      tiltRef.current = Math.max(-60, Math.min(60, tiltRef.current + (e.clientY - lastMouse.current.y) * 0.2));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => { isDragging.current = false; };
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
    canvas.addEventListener("touchstart", handleTouchStart, { passive: true });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: true });
    canvas.addEventListener("touchend", handleTouchEnd);

    animRef.current = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
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
              <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">God's Eye — Entropy Surveillance</h2>
              <p className="text-[9px] text-muted-foreground font-mono tracking-widest">
                LIVE · {data.conflictEvents.length} CONFLICTS · {objectsRef.current.filter(o => o.type === "satellite").length} SAT · {objectsRef.current.filter(o => o.type === "ship").length} VESSELS · {objectsRef.current.filter(o => o.type === "plane").length} AIR
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
              style={{ height: "min(560px, 65vw)", background: "radial-gradient(ellipse at 40% 40%, hsl(220, 30%, 5%) 0%, hsl(220, 40%, 1%) 100%)" }} />
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2 sm:gap-3 text-[8px] sm:text-[9px] text-muted-foreground glass-subtle rounded-lg px-2 sm:px-3 py-1.5 z-20">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Conflict</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Entropy</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Hub</span>
              <span className="flex items-center gap-1"><Satellite className="h-2.5 w-2.5 text-cyan-400" /> Sat</span>
              <span className="flex items-center gap-1"><Ship className="h-2.5 w-2.5 text-emerald-400" /> Ship</span>
              <span className="flex items-center gap-1"><Plane className="h-2.5 w-2.5 text-purple-300" /> Air</span>
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
                <p className="font-mono text-sm font-bold text-foreground tabular-nums">
                  {fx.rate > 0 ? fx.rate.toFixed(fx.rate > 100 ? 0 : fx.rate > 10 ? 2 : 4) : "—"}
                </p>
                <p className={`font-mono text-xs font-semibold ${fx.change24h >= 0 ? "text-gain" : "text-loss"}`}>
                  {fx.change24h >= 0 ? "+" : ""}{fx.change24h.toFixed(2)}%
                </p>
                {fx.isStressed && <span className="text-[7px] text-loss font-mono uppercase">STRESSED</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GeopoliticalGlobe;
