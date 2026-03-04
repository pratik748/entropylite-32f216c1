import { useState, useEffect, useRef, useCallback } from "react";
import { AlertTriangle, Shield, Loader2, RefreshCw, Zap, MapPin, Navigation, Satellite, Ship, Plane, Radio, Newspaper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";

interface ConflictEvent {
  name: string;
  lat: number;
  lng: number;
  severity: number;
  type: string;
  affectedAssets: string[];
  summary: string;
  nearTradeHub?: string;
  distanceKm?: number;
  escalationProb?: number;
  actionableIntel?: string;
}

interface ForexEntry {
  symbol: string;
  country: string;
  lat: number;
  lng: number;
  currency: string;
  rate: number;
  change24h: number;
  isStressed: boolean;
}

interface HighEntropyZone {
  name: string;
  lat: number;
  lng: number;
  severity: number;
  entropyScore: number;
  currencyStress: number;
  affectedCurrencies: string[];
  isHighEntropy: boolean;
}

interface SupplyChainRisk {
  route: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  riskLevel: string;
  reason: string;
}

interface GeoData {
  conflictEvents: ConflictEvent[];
  forexVolatility: ForexEntry[];
  highEntropyZones: HighEntropyZone[];
  tradeHubs: { name: string; lat: number; lng: number; type: string }[];
  supplyChainRisks: SupplyChainRisk[];
  globalRiskScore: number;
  regimeSignal: string;
  keyThreats: string[];
  capitalFlowDirection: string;
  timestamp: number;
}

interface Props {
  stocks: PortfolioStock[];
}

const typeColors: Record<string, string> = {
  war: "bg-red-500", sanctions: "bg-amber-500", unrest: "bg-orange-500",
  terrorism: "bg-red-600", trade_war: "bg-yellow-500",
};
const typeGlowColors: Record<string, string> = {
  war: "255,50,50", sanctions: "255,180,0", unrest: "255,120,30",
  terrorism: "255,30,30", trade_war: "255,220,0",
};

// Simulated moving objects for God's Eye view
interface MovingObject {
  id: number;
  type: "satellite" | "ship" | "plane";
  lat: number;
  lng: number;
  speed: number;
  heading: number;
  trail: [number, number][];
}

function generateMovingObjects(): MovingObject[] {
  const objects: MovingObject[] = [];
  // Satellites (polar orbits)
  for (let i = 0; i < 8; i++) {
    objects.push({
      id: i, type: "satellite",
      lat: (Math.random() - 0.5) * 140,
      lng: (Math.random() - 0.5) * 360,
      speed: 2 + Math.random() * 3,
      heading: Math.random() * 360,
      trail: [],
    });
  }
  // Ships (major shipping lanes)
  const shipRoutes = [
    { lat: 1.3, lng: 104 }, { lat: 30, lng: 32 }, { lat: 9, lng: -79 },
    { lat: 35, lng: 140 }, { lat: 51, lng: 3 }, { lat: -34, lng: 18 },
    { lat: 25, lng: 56 }, { lat: 22, lng: 114 },
  ];
  shipRoutes.forEach((pos, i) => {
    objects.push({
      id: 100 + i, type: "ship",
      lat: pos.lat + (Math.random() - 0.5) * 10,
      lng: pos.lng + (Math.random() - 0.5) * 10,
      speed: 0.05 + Math.random() * 0.08,
      heading: Math.random() * 360,
      trail: [],
    });
  });
  // Planes (major air corridors)
  for (let i = 0; i < 12; i++) {
    objects.push({
      id: 200 + i, type: "plane",
      lat: (Math.random() - 0.5) * 120,
      lng: (Math.random() - 0.5) * 360,
      speed: 0.8 + Math.random() * 1.2,
      heading: Math.random() * 360,
      trail: [],
    });
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
    } catch (e) {
      console.error("Geo data error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(false), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
        // Slight heading drift
        obj.heading += (Math.random() - 0.5) * 2;
        const trail = [...obj.trail, [obj.lat, obj.lng] as [number, number]].slice(-8);
        return { ...obj, lat: newLat, lng: newLng, trail };
      });
    }, 200);
    return () => clearInterval(interval);
  }, []);

  // God's Eye 3D Globe rendering
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

      // Deep space background
      ctx.fillStyle = "hsl(220, 25%, 2%)";
      ctx.fillRect(0, 0, W, H);

      // Stars
      for (let i = 0; i < 80; i++) {
        const sx = ((i * 7919 + 31) % W);
        const sy = ((i * 6271 + 17) % H);
        const brightness = 0.15 + Math.sin(t * 0.5 + i) * 0.1;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.5 + Math.random() * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 200, 255, ${brightness})`;
        ctx.fill();
      }

      // Outer atmosphere glow
      const atmo1 = ctx.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.25);
      atmo1.addColorStop(0, "rgba(40, 100, 255, 0.08)");
      atmo1.addColorStop(0.5, "rgba(30, 70, 200, 0.04)");
      atmo1.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = atmo1;
      ctx.fillRect(0, 0, W, H);

      // Globe body — dark with continental hints
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      const globeGrad = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.3, 0, cx, cy, R);
      globeGrad.addColorStop(0, "hsl(215, 22%, 14%)");
      globeGrad.addColorStop(0.7, "hsl(215, 28%, 8%)");
      globeGrad.addColorStop(1, "hsl(215, 30%, 4%)");
      ctx.fillStyle = globeGrad;
      ctx.fill();

      // Inner atmosphere ring
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(60, 130, 255, 0.12)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Grid lines (lat/lng)
      ctx.strokeStyle = "rgba(80, 120, 200, 0.06)";
      ctx.lineWidth = 0.5;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let started = false;
        for (let lng = -180; lng <= 180; lng += 2) {
          const pt = toScreen(lat, lng);
          if (pt) { if (!started) { ctx.moveTo(pt[0], pt[1]); started = true; } else ctx.lineTo(pt[0], pt[1]); }
          else started = false;
        }
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
        ctx.stroke();
      }

      // TRADE HUBS — pulsing blue nodes
      data.tradeHubs.forEach(hub => {
        const pt = toScreen(hub.lat, hub.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 2 + hub.lat) * 0.3;
        // Hub glow
        const hg = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], 8 * pulse);
        hg.addColorStop(0, "rgba(60, 160, 255, 0.5)");
        hg.addColorStop(1, "rgba(60, 160, 255, 0)");
        ctx.fillStyle = hg;
        ctx.fillRect(pt[0] - 12, pt[1] - 12, 24, 24);
        // Hub dot
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 2.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(100, 180, 255, 0.9)";
        ctx.fill();
        // Label
        ctx.font = "7px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(100, 170, 255, 0.5)";
        ctx.fillText(hub.name, pt[0] + 5, pt[1] - 4);
      });

      // SUPPLY CHAIN ROUTES — animated dashed arcs
      data.supplyChainRisks?.forEach(risk => {
        const start = toScreen(risk.startLat, risk.startLng);
        const end = toScreen(risk.endLat, risk.endLng);
        if (!start || !end) return;
        ctx.beginPath();
        ctx.moveTo(start[0], start[1]);
        const midX = (start[0] + end[0]) / 2;
        const midY = Math.min(start[1], end[1]) - 40;
        ctx.quadraticCurveTo(midX, midY, end[0], end[1]);
        const riskColor = risk.riskLevel === "high" ? "rgba(255, 60, 60, 0.35)" : risk.riskLevel === "medium" ? "rgba(255, 180, 0, 0.25)" : "rgba(60, 160, 255, 0.2)";
        ctx.strokeStyle = riskColor;
        ctx.lineWidth = 1.5;
        const dashOffset = (t * 20) % 20;
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -dashOffset;
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // CONFLICT EVENTS — threat pulses
      data.conflictEvents.forEach(evt => {
        const pt = toScreen(evt.lat, evt.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 3 + evt.lat * 0.1) * 0.4;
        const baseR = 5 + evt.severity * 12;
        const r = baseR * pulse;
        const clr = typeGlowColors[evt.type] || "255,50,50";

        // Outer ring pulse
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 1.8, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${clr}, ${0.1 + Math.sin(t * 4) * 0.05})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Glow
        const glow = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], r * 1.5);
        glow.addColorStop(0, `rgba(${clr}, ${0.35 * evt.severity})`);
        glow.addColorStop(1, `rgba(${clr}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${clr}, 0.9)`;
        ctx.fill();

        // Severity ring
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 0.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * evt.severity);
        ctx.strokeStyle = `rgba(${clr}, 0.7)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // HIGH-ENTROPY ZONES — concentric warning rings
      data.highEntropyZones.forEach(zone => {
        const pt = toScreen(zone.lat, zone.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 1.5 + zone.lng) * 0.3;

        // Triple ring
        for (let ring = 0; ring < 3; ring++) {
          const rr = (14 + ring * 8) * pulse;
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], rr, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 120, 0, ${0.3 - ring * 0.08})`;
          ctx.lineWidth = ring === 0 ? 2 : 1;
          ctx.setLineDash(ring > 0 ? [4, 4] : []);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Label
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.fillStyle = "rgba(255, 160, 40, 0.9)";
        ctx.fillText(`⚡${zone.entropyScore.toFixed(0)}`, pt[0] + 16, pt[1] - 2);
      });

      // FOREX STRESS — currency stress markers
      data.forexVolatility.filter(f => f.isStressed).forEach(fx => {
        const pt = toScreen(fx.lat, fx.lng);
        if (!pt) return;
        // Warning diamond
        ctx.save();
        ctx.translate(pt[0], pt[1]);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = "rgba(255, 200, 0, 0.7)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-4, -4, 8, 8);
        ctx.restore();
        // Label
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.fillStyle = Math.abs(fx.change24h) > 2 ? "rgba(255, 80, 80, 0.9)" : "rgba(255, 200, 0, 0.8)";
        ctx.fillText(`${fx.currency} ${fx.change24h > 0 ? "+" : ""}${fx.change24h.toFixed(1)}%`, pt[0] + 8, pt[1] + 3);
      });

      // MOVING OBJECTS — satellites, ships, planes
      objectsRef.current.forEach(obj => {
        const pt = toScreen(obj.lat, obj.lng);
        if (!pt) return;

        if (obj.type === "satellite") {
          // Satellite orbit trail
          ctx.beginPath();
          let trailStarted = false;
          obj.trail.forEach(([tLat, tLng]) => {
            const tp = toScreen(tLat, tLng);
            if (tp) { if (!trailStarted) { ctx.moveTo(tp[0], tp[1]); trailStarted = true; } else ctx.lineTo(tp[0], tp[1]); }
          });
          ctx.strokeStyle = "rgba(0, 200, 255, 0.15)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
          // Satellite dot
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 1.5, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0, 220, 255, 0.8)";
          ctx.fill();
          // Blink
          if (Math.sin(t * 8 + obj.id) > 0.7) {
            ctx.beginPath();
            ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0, 220, 255, 0.3)";
            ctx.fill();
          }
        } else if (obj.type === "ship") {
          // Ship triangle
          ctx.save();
          ctx.translate(pt[0], pt[1]);
          ctx.rotate(obj.heading * Math.PI / 180);
          ctx.beginPath();
          ctx.moveTo(0, -4);
          ctx.lineTo(-2.5, 3);
          ctx.lineTo(2.5, 3);
          ctx.closePath();
          ctx.fillStyle = "rgba(100, 200, 150, 0.7)";
          ctx.fill();
          ctx.restore();
          // Wake
          obj.trail.slice(-3).forEach(([tLat, tLng], idx) => {
            const tp = toScreen(tLat, tLng);
            if (tp) {
              ctx.beginPath();
              ctx.arc(tp[0], tp[1], 1, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(100, 200, 150, ${0.1 + idx * 0.03})`;
              ctx.fill();
            }
          });
        } else {
          // Plane — small cross
          ctx.save();
          ctx.translate(pt[0], pt[1]);
          ctx.rotate(obj.heading * Math.PI / 180);
          ctx.strokeStyle = "rgba(200, 180, 255, 0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 0); ctx.stroke();
          ctx.restore();
        }
      });

      // GOD'S EYE reticle overlay
      ctx.strokeStyle = "rgba(60, 130, 255, 0.06)";
      ctx.lineWidth = 0.5;
      // Crosshair
      ctx.beginPath();
      ctx.moveTo(cx - R * 1.1, cy); ctx.lineTo(cx - R * 0.05, cy);
      ctx.moveTo(cx + R * 0.05, cy); ctx.lineTo(cx + R * 1.1, cy);
      ctx.moveTo(cx, cy - R * 1.1); ctx.lineTo(cx, cy - R * 0.05);
      ctx.moveTo(cx, cy + R * 0.05); ctx.lineTo(cx, cy + R * 1.1);
      ctx.stroke();
      // Corner brackets
      const bLen = 15;
      const bOff = R * 1.05;
      ctx.strokeStyle = "rgba(60, 130, 255, 0.15)";
      ctx.lineWidth = 1;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dy]) => {
        const bx = cx + dx * bOff;
        const by = cy + dy * bOff;
        ctx.beginPath();
        ctx.moveTo(bx, by + dy * -bLen);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + dx * -bLen, by);
        ctx.stroke();
      });

      // HUD text overlay
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(80, 140, 255, 0.35)";
      ctx.fillText(`ENTROPY SURVEILLANCE · ${new Date().toISOString().split("T")[0]}`, 12, 16);
      ctx.fillText(`CONFLICTS: ${data.conflictEvents.length} · ENTROPY ZONES: ${data.highEntropyZones.length}`, 12, 28);
      ctx.fillText(`ROT: ${rotationRef.current.toFixed(1)}° · RISK: ${data.globalRiskScore}/100`, W - 200, 16);
      ctx.fillText(`SAT: ${objectsRef.current.filter(o => o.type === "satellite").length} · VESSELS: ${objectsRef.current.filter(o => o.type === "ship").length}`, W - 200, 28);

      // Auto-rotate
      if (!isDragging.current) {
        rotationRef.current += 0.08;
      }

      animRef.current = requestAnimationFrame(drawFrame);
    };

    // Mouse interaction
    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      rotationRef.current += dx * 0.3;
      tiltRef.current = Math.max(-60, Math.min(60, tiltRef.current + dy * 0.2));
      lastMouse.current = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => { isDragging.current = false; };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    // Touch support
    const handleTouchStart = (e: TouchEvent) => {
      isDragging.current = true;
      lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      const dx = e.touches[0].clientX - lastMouse.current.x;
      const dy = e.touches[0].clientY - lastMouse.current.y;
      rotationRef.current += dx * 0.3;
      tiltRef.current = Math.max(-60, Math.min(60, tiltRef.current + dy * 0.2));
      lastMouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const handleTouchEnd = () => { isDragging.current = false; };

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
              REAL-TIME · {data.conflictEvents.length} CONFLICTS · {objectsRef.current.filter(o => o.type === "satellite").length} SAT · {objectsRef.current.filter(o => o.type === "ship").length} VESSELS
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(["globe", "threats", "forex"] as const).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-mono font-medium transition-all ${viewMode === m ? "bg-primary/15 text-primary border border-primary/30" : "bg-surface-2 text-muted-foreground hover:text-foreground border border-transparent"}`}>
              {m === "globe" ? "🛰 Globe" : m === "threats" ? "⚠ Threats" : "💱 Forex"}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => fetchData(false)} className="h-7 gap-1 text-[10px]">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> 30s
          </Button>
        </div>
      </div>

      {/* Risk Indicator Strip */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-muted-foreground">Global Risk</p>
          <div className="flex items-end gap-2">
            <p className={`font-mono text-xl sm:text-2xl font-black ${data.globalRiskScore > 70 ? "text-loss" : data.globalRiskScore > 40 ? "text-warning" : "text-gain"}`}>
              {data.globalRiskScore}
            </p>
            <span className="text-[9px] text-muted-foreground mb-1">/100</span>
          </div>
          <div className="mt-1 h-1 rounded-full bg-surface-3 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${data.globalRiskScore > 70 ? "bg-loss" : data.globalRiskScore > 40 ? "bg-warning" : "bg-gain"}`}
              style={{ width: `${data.globalRiskScore}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-muted-foreground">Regime</p>
          <p className={`font-mono text-base sm:text-lg font-black uppercase mt-1 ${data.regimeSignal === "crisis" ? "text-loss" : data.regimeSignal === "transition" ? "text-warning" : "text-gain"}`}>
            {data.regimeSignal}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-muted-foreground">Capital Flow</p>
          <p className={`font-mono text-base sm:text-lg font-black uppercase mt-1 ${data.capitalFlowDirection === "risk-off" ? "text-loss" : data.capitalFlowDirection === "risk-on" ? "text-gain" : "text-warning"}`}>
            {data.capitalFlowDirection}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-wider text-muted-foreground">Entropy Zones</p>
          <div className="flex items-end gap-2">
            <p className="font-mono text-xl sm:text-2xl font-black text-warning">{data.highEntropyZones.length}</p>
            <span className="text-[9px] text-loss mb-1">ACTIVE</span>
          </div>
        </div>
      </div>

      {/* Globe + Intel Sidebar */}
      {viewMode === "globe" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="rounded-xl border border-border bg-card overflow-hidden relative">
            <canvas
              ref={canvasRef}
              className="w-full cursor-grab active:cursor-grabbing"
              style={{
                height: "min(520px, 60vw)",
                background: "radial-gradient(ellipse at 40% 40%, hsl(220, 30%, 6%) 0%, hsl(220, 35%, 2%) 100%)"
              }}
            />
            {/* Legend */}
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-center gap-2 sm:gap-3 text-[8px] sm:text-[9px] text-muted-foreground bg-background/70 backdrop-blur-md rounded-lg px-2 sm:px-3 py-1.5 border border-border/30">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Conflict</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Entropy</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Hub</span>
              <span className="flex items-center gap-1"><Satellite className="h-2.5 w-2.5 text-cyan-400" /> Sat</span>
              <span className="flex items-center gap-1"><Ship className="h-2.5 w-2.5 text-emerald-400" /> Ship</span>
              <span className="flex items-center gap-1"><Plane className="h-2.5 w-2.5 text-purple-300" /> Air</span>
            </div>
          </div>

          {/* Live Threat Intel */}
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest sticky top-0 bg-background py-1.5 flex items-center gap-2">
              <Radio className="h-3 w-3 text-loss animate-pulse" /> Active Intel Feed
            </h3>
            {data.conflictEvents.map((evt, i) => (
              <div key={i}
                onClick={() => setSelectedConflict(selectedConflict?.name === evt.name ? null : evt)}
                className={`rounded-lg border p-2.5 sm:p-3 cursor-pointer transition-all ${selectedConflict?.name === evt.name ? "border-loss/40 bg-loss/5" : "border-border/50 bg-surface-2 hover:border-border"}`}>
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
                {selectedConflict?.name === evt.name && evt.affectedAssets?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-border/30">
                    {evt.affectedAssets.map(a => (
                      <span key={a} className="rounded bg-loss/10 px-1.5 py-0.5 text-[8px] font-mono text-loss">{a}</span>
                    ))}
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
          {/* Key Threats */}
          {data.keyThreats.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Key Global Threats
              </h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.keyThreats.map((threat, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs sm:text-sm text-secondary-foreground rounded-lg bg-surface-2 p-3 border border-border/30">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" />
                    {threat}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* High-Entropy Zones */}
          {data.highEntropyZones.length > 0 && (
            <div className="rounded-xl border border-loss/20 bg-card p-4 sm:p-5">
              <h3 className="text-[10px] font-bold text-loss uppercase tracking-widest mb-3 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" /> High-Entropy Zones
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.highEntropyZones.map((zone, i) => (
                  <div key={i} className="rounded-lg border border-loss/20 bg-loss/5 p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs sm:text-sm font-bold text-foreground">{zone.name}</span>
                      <span className="rounded bg-loss/20 px-2 py-0.5 text-[9px] font-mono font-bold text-loss">
                        ⚡{zone.entropyScore.toFixed(0)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[8px] text-muted-foreground uppercase">Severity</p>
                        <p className="font-mono font-bold text-loss">{(zone.severity * 100).toFixed(0)}%</p>
                      </div>
                      <div>
                        <p className="text-[8px] text-muted-foreground uppercase">FX Stress</p>
                        <p className="font-mono font-bold text-warning">{zone.currencyStress.toFixed(1)}%</p>
                      </div>
                    </div>
                    {zone.affectedCurrencies.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {zone.affectedCurrencies.map(c => (
                          <span key={c} className="rounded bg-warning/10 px-1.5 py-0.5 text-[8px] font-mono text-warning">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Portfolio Exposure */}
          {exposedAssets.length > 0 && (
            <div className="rounded-xl border border-warning/30 bg-card p-4 sm:p-5">
              <h3 className="text-[10px] font-bold text-warning uppercase tracking-widest mb-3 flex items-center gap-2">
                <Shield className="h-3.5 w-3.5" /> Portfolio Exposure to Conflict Zones
              </h3>
              <div className="space-y-2">
                {exposedAssets.map(s => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                    <span className="font-mono text-sm font-bold text-foreground">{s.ticker}</span>
                    <span className="text-[10px] text-warning font-mono">EXPOSED</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supply Chain Risk */}
          {data.supplyChainRisks?.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                <Navigation className="h-3.5 w-3.5 text-muted-foreground" /> Supply Chain Disruption
              </h3>
              <div className="space-y-2">
                {data.supplyChainRisks.map((risk, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-surface-2 p-3 border border-border/30">
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-semibold text-foreground truncate">{risk.route}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{risk.reason}</p>
                    </div>
                    <span className={`rounded px-2 py-0.5 text-[9px] font-mono font-bold uppercase flex-shrink-0 ${
                      risk.riskLevel === "high" ? "bg-loss/10 text-loss" : risk.riskLevel === "medium" ? "bg-warning/10 text-warning" : "bg-gain/10 text-gain"
                    }`}>{risk.riskLevel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Forex View */}
      {viewMode === "forex" && (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-4">Real-Time Forex Volatility</h3>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-8">
            {data.forexVolatility.map(fx => (
              <div key={fx.symbol} className={`rounded-lg border p-2.5 sm:p-3 transition-all ${fx.isStressed ? "border-warning/40 bg-warning/5" : "border-border/30 bg-surface-2"}`}>
                <p className="text-[8px] text-muted-foreground truncate">{fx.country}</p>
                <p className="font-mono text-xs font-bold text-foreground">{fx.currency}</p>
                <p className={`font-mono text-[10px] font-semibold ${fx.change24h > 0 ? "text-loss" : fx.change24h < -0.5 ? "text-gain" : "text-foreground"}`}>
                  {fx.change24h > 0 ? "+" : ""}{fx.change24h.toFixed(2)}%
                </p>
                {fx.rate > 0 && <p className="font-mono text-[8px] text-muted-foreground">{fx.rate.toFixed(2)}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GeopoliticalGlobe;
