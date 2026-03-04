import { useState, useEffect, useRef, useCallback } from "react";
import { Globe as GlobeIcon, AlertTriangle, Activity, Shield, Radio, TrendingDown, Loader2, RefreshCw, Zap, MapPin, Navigation } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";
import { getCurrencySymbol } from "@/lib/currency";

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

const riskColors: Record<string, string> = {
  high: "text-loss", medium: "text-warning", low: "text-gain",
};

const GeopoliticalGlobe = ({ stocks }: Props) => {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<HighEntropyZone | null>(null);
  const [globeRotation, setGlobeRotation] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

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

  // 3D Globe rendering with Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const R = Math.min(W, H) * 0.38;
    const cx = W / 2;
    const cy = H / 2;

    let rotation = globeRotation;

    const toScreen = (lat: number, lng: number): [number, number, boolean] | null => {
      const phi = (90 - lat) * Math.PI / 180;
      const theta = (lng + rotation) * Math.PI / 180;
      const x = R * Math.sin(phi) * Math.cos(theta);
      const y = -R * Math.cos(phi);
      const z = R * Math.sin(phi) * Math.sin(theta);
      if (z < 0) return null; // behind globe
      return [cx + x, cy + y, true];
    };

    const drawFrame = () => {
      ctx.clearRect(0, 0, W, H);

      // Atmosphere glow
      const grad = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.15);
      grad.addColorStop(0, "rgba(30, 80, 180, 0.15)");
      grad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Globe body
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      const globeGrad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R);
      globeGrad.addColorStop(0, "hsl(215, 20%, 18%)");
      globeGrad.addColorStop(1, "hsl(215, 25%, 8%)");
      ctx.fillStyle = globeGrad;
      ctx.fill();

      // Grid lines
      ctx.strokeStyle = "rgba(100, 140, 200, 0.08)";
      ctx.lineWidth = 0.5;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        for (let lng = -180; lng <= 180; lng += 3) {
          const pt = toScreen(lat, lng);
          if (pt) {
            if (lng === -180 || !toScreen(lat, lng - 3)) ctx.moveTo(pt[0], pt[1]);
            else ctx.lineTo(pt[0], pt[1]);
          }
        }
        ctx.stroke();
      }
      for (let lng = -180; lng <= 180; lng += 30) {
        ctx.beginPath();
        for (let lat = -90; lat <= 90; lat += 3) {
          const pt = toScreen(lat, lng);
          if (pt) {
            if (lat === -90 || !toScreen(lat - 3, lng)) ctx.moveTo(pt[0], pt[1]);
            else ctx.lineTo(pt[0], pt[1]);
          }
        }
        ctx.stroke();
      }

      // Trade hubs
      data.tradeHubs.forEach(hub => {
        const pt = toScreen(hub.lat, hub.lng);
        if (!pt) return;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(60, 160, 255, 0.7)";
        ctx.fill();
      });

      // Conflict events
      const t = Date.now() / 1000;
      data.conflictEvents.forEach(evt => {
        const pt = toScreen(evt.lat, evt.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 3 + evt.lat) * 0.3;
        const r = (4 + evt.severity * 8) * pulse;
        
        // Glow
        const glow = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], r * 2);
        glow.addColorStop(0, `rgba(255, 50, 50, ${0.4 * evt.severity})`);
        glow.addColorStop(1, "rgba(255, 50, 50, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(pt[0] - r * 2, pt[1] - r * 2, r * 4, r * 4);

        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 60, 60, ${0.6 + evt.severity * 0.4})`;
        ctx.fill();
      });

      // High-entropy zones
      data.highEntropyZones.forEach(zone => {
        const pt = toScreen(zone.lat, zone.lng);
        if (!pt) return;
        const pulse = 1 + Math.sin(t * 2 + zone.lng) * 0.4;
        const r = 12 * pulse;

        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 180, 0, ${0.6 + Math.sin(t * 4) * 0.3})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pt[0], pt[1], r * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 100, 0, 0.2)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Forex stress indicators
      data.forexVolatility.filter(f => f.isStressed).forEach(fx => {
        const pt = toScreen(fx.lat, fx.lng);
        if (!pt) return;
        ctx.beginPath();
        ctx.arc(pt[0], pt[1], 6, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255, 200, 0, 0.8)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = "9px monospace";
        ctx.fillStyle = "rgba(255, 200, 0, 0.9)";
        ctx.fillText(`${fx.currency} ${fx.change24h > 0 ? "+" : ""}${fx.change24h.toFixed(1)}%`, pt[0] + 8, pt[1] + 3);
      });

      // Supply chain risk arcs
      data.supplyChainRisks?.forEach(risk => {
        const start = toScreen(risk.startLat, risk.startLng);
        const end = toScreen(risk.endLat, risk.endLng);
        if (!start || !end) return;
        ctx.beginPath();
        ctx.moveTo(start[0], start[1]);
        const midX = (start[0] + end[0]) / 2;
        const midY = Math.min(start[1], end[1]) - 30;
        ctx.quadraticCurveTo(midX, midY, end[0], end[1]);
        ctx.strokeStyle = risk.riskLevel === "high" ? "rgba(255, 60, 60, 0.4)" : "rgba(255, 180, 0, 0.3)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      rotation += 0.05;
      setGlobeRotation(rotation);
      animRef.current = requestAnimationFrame(drawFrame);
    };

    animRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(animRef.current);
  }, [data]);

  // Portfolio exposure analysis
  const exposedAssets = stocks.filter(s => {
    if (!s.analysis || !data) return false;
    return data.conflictEvents.some(c =>
      c.affectedAssets?.some(a => s.ticker.includes(a) || a.includes(s.ticker.replace(".NS", "").replace(".BO", "")))
    );
  });

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Loading geopolitical intelligence...</span>
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-loss/10">
            <GlobeIcon className="h-5 w-5 text-loss" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Geopolitical Entropy Layer</h2>
            <p className="text-[10px] text-muted-foreground font-mono tracking-wider">
              REAL-TIME CONFLICT · FOREX VOLATILITY · TRADE DISRUPTION
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-loss opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-loss" />
          </span>
          <span className="text-[9px] font-mono text-muted-foreground">30s refresh</span>
          <Button size="sm" variant="ghost" onClick={() => fetchData(false)} className="h-7 gap-1.5 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Global Risk Indicators */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Global Risk Score</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${data.globalRiskScore > 70 ? "text-loss" : data.globalRiskScore > 40 ? "text-warning" : "text-gain"}`}>
            {data.globalRiskScore}
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-surface-3 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${data.globalRiskScore > 70 ? "bg-loss" : data.globalRiskScore > 40 ? "bg-warning" : "bg-gain"}`}
              style={{ width: `${data.globalRiskScore}%` }} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Regime Signal</p>
          <p className={`mt-1 font-mono text-lg font-bold uppercase ${data.regimeSignal === "crisis" ? "text-loss" : data.regimeSignal === "transition" ? "text-warning" : "text-gain"}`}>
            {data.regimeSignal}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Capital Flow</p>
          <p className={`mt-1 font-mono text-lg font-bold uppercase ${data.capitalFlowDirection === "risk-off" ? "text-loss" : data.capitalFlowDirection === "risk-on" ? "text-gain" : "text-warning"}`}>
            {data.capitalFlowDirection}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Active Conflicts</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{data.conflictEvents.length}</p>
          <p className="text-[9px] text-loss">{data.highEntropyZones.length} high-entropy</p>
        </div>
      </div>

      {/* 3D Globe + Sidebar */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="rounded-xl border border-border bg-card overflow-hidden relative">
          <canvas
            ref={canvasRef}
            width={800}
            height={500}
            className="w-full h-[500px]"
            style={{ background: "radial-gradient(ellipse at center, hsl(215, 25%, 6%) 0%, hsl(215, 30%, 3%) 100%)" }}
          />
          {/* Legend */}
          <div className="absolute bottom-3 left-3 flex items-center gap-4 text-[9px] text-muted-foreground bg-background/80 backdrop-blur-sm rounded-lg px-3 py-2">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> Conflict</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> High Entropy</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Trade Hub</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" /> FX Stress</span>
          </div>
        </div>

        {/* Conflict List */}
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider sticky top-0 bg-background py-1">Active Threats</h3>
          {data.conflictEvents.map((evt, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3 transition-all hover:border-loss/30">
              <div className="flex items-center gap-2 mb-1">
                <span className={`h-2 w-2 rounded-full ${typeColors[evt.type] || "bg-red-500"}`} />
                <span className="text-xs font-bold text-foreground">{evt.name}</span>
                <span className="ml-auto rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                  {(evt.severity * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{evt.summary}</p>
              {evt.nearTradeHub && (
                <p className="text-[9px] text-warning mt-1 flex items-center gap-1">
                  <MapPin className="h-2.5 w-2.5" />
                  Near {evt.nearTradeHub} ({evt.distanceKm}km)
                </p>
              )}
              {evt.affectedAssets?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {evt.affectedAssets.map(a => (
                    <span key={a} className="rounded bg-loss/10 px-1.5 py-0.5 text-[9px] font-mono text-loss">{a}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Key Threats */}
      {data.keyThreats.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Key Global Threats
          </h3>
          <div className="grid gap-2 md:grid-cols-3">
            {data.keyThreats.map((threat, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-secondary-foreground rounded-lg bg-surface-2 p-3">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" />
                {threat}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High-Entropy Zones Detail */}
      {data.highEntropyZones.length > 0 && (
        <div className="rounded-xl border border-loss/20 bg-card p-5">
          <h3 className="text-xs font-bold text-loss uppercase tracking-wider mb-4 flex items-center gap-2">
            <Zap className="h-3.5 w-3.5" /> High-Entropy Zones — Immediate Attention
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {data.highEntropyZones.map((zone, i) => (
              <div key={i} className="rounded-lg border border-loss/20 bg-loss/5 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-foreground">{zone.name}</span>
                  <span className="rounded bg-loss/20 px-2 py-0.5 text-[10px] font-mono font-bold text-loss">
                    ENTROPY: {zone.entropyScore.toFixed(0)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">Conflict Severity</p>
                    <p className="font-mono font-bold text-loss">{(zone.severity * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-muted-foreground uppercase">Currency Stress</p>
                    <p className="font-mono font-bold text-warning">{zone.currencyStress.toFixed(1)}%</p>
                  </div>
                </div>
                {zone.affectedCurrencies.length > 0 && (
                  <div className="flex gap-1 mt-2">
                    {zone.affectedCurrencies.map(c => (
                      <span key={c} className="rounded bg-warning/10 px-1.5 py-0.5 text-[9px] font-mono text-warning">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Forex Volatility Grid */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-4">Real-Time Forex Volatility</h3>
        <div className="grid gap-2 grid-cols-3 md:grid-cols-5 lg:grid-cols-8">
          {data.forexVolatility.map(fx => (
            <div key={fx.symbol} className={`rounded-lg border p-3 transition-all ${fx.isStressed ? "border-warning/40 bg-warning/5" : "border-border bg-surface-2"}`}>
              <p className="text-[9px] text-muted-foreground">{fx.country}</p>
              <p className="font-mono text-xs font-bold text-foreground">{fx.currency}</p>
              <p className={`font-mono text-[11px] font-semibold ${fx.change24h > 0 ? "text-loss" : fx.change24h < -0.5 ? "text-gain" : "text-foreground"}`}>
                {fx.change24h > 0 ? "+" : ""}{fx.change24h.toFixed(2)}%
              </p>
              {fx.rate > 0 && <p className="font-mono text-[9px] text-muted-foreground">{fx.rate.toFixed(2)}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Portfolio Exposure */}
      {exposedAssets.length > 0 && (
        <div className="rounded-xl border border-warning/30 bg-card p-5">
          <h3 className="text-xs font-bold text-warning uppercase tracking-wider mb-3 flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" /> Portfolio Exposure to Conflict Zones
          </h3>
          <div className="space-y-2">
            {exposedAssets.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                <span className="font-mono text-sm font-bold text-foreground">{s.ticker}</span>
                <span className="text-xs text-warning">Geopolitically exposed</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supply Chain Risk */}
      {data.supplyChainRisks?.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Navigation className="h-3.5 w-3.5 text-muted-foreground" /> Supply Chain Disruption Risk
          </h3>
          <div className="space-y-2">
            {data.supplyChainRisks.map((risk, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{risk.route}</p>
                  <p className="text-[10px] text-muted-foreground">{risk.reason}</p>
                </div>
                <span className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${riskColors[risk.riskLevel] || "text-foreground"}`}>
                  {risk.riskLevel}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GeopoliticalGlobe;
