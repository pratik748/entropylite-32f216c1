import { useState, useCallback, useRef, useEffect } from "react";
import { GitBranch, Zap, Loader2, AlertTriangle, TrendingUp, TrendingDown, Activity, RefreshCw, Maximize2, Volume2, VolumeX } from "lucide-react";
import { governedInvoke } from "@/lib/apiGovernor";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { Button } from "@/components/ui/button";

interface CausalNode {
  order: number;
  effect: string;
  asset_class: string;
  direction: string;
  magnitude: string;
  confidence: number;
  time_horizon: string;
}

interface ScenarioBranch {
  label: string;
  probability: number;
  capital_impact_pct: number;
  key_moves: string[];
}

interface CausalAnalysis {
  event: string;
  first_order: CausalNode[];
  second_order: CausalNode[];
  third_order: CausalNode[];
  scenario_tree: ScenarioBranch[];
  reflexivity_score: number;
  scar_tag: string;
}

interface Props {
  stocks: PortfolioStock[];
}

const PRESET_EVENTS = [
  "Iran-Israel military escalation",
  "Federal Reserve emergency rate cut",
  "China Taiwan strait blockade",
  "OPEC+ production collapse",
  "Major US bank failure",
  "Global semiconductor supply shock",
  "European energy crisis escalation",
  "India-Pakistan border tensions",
];

// Causal graph node positions
interface GraphNode {
  id: string;
  x: number;
  y: number;
  order: number;
  effect: string;
  asset_class: string;
  direction: string;
  confidence: number;
  magnitude: string;
  time_horizon: string;
  targetX: number;
  targetY: number;
}

interface GraphEdge {
  from: string;
  to: string;
  weight: number;
}

const CausalEffectsEngine = ({ stocks }: Props) => {
  const [event, setEvent] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggleChaos = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio("/audio/chaos-currency.mp3");
      audioRef.current.loop = true;
      audioRef.current.addEventListener("ended", () => setIsPlaying(false));
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);
  const [analysis, setAnalysis] = useState<CausalAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [density, setDensity] = useState(1); // 0.5 to 2
  const graphCanvasRef = useRef<HTMLCanvasElement>(null);
  const graphAnimRef = useRef<number>(0);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const waveProgressRef = useRef(0);

  const analyze = useCallback(async (eventText: string) => {
    if (!eventText.trim()) return;
    setLoading(true);
    setEvent(eventText);
    waveProgressRef.current = 0;
    try {
      const portfolio = stocks.filter(s => s.analysis).map(s => `${s.ticker} (${s.quantity} @ ${s.analysis?.currentPrice})`).join(", ");
      const { data: result, error } = await governedInvoke("causal-effects", {
        body: { event: eventText, portfolio },
      });
      if (error) throw error;
      setAnalysis(result);
      buildGraph(result);
    } catch (e) {
      console.error("Causal analysis error:", e);
    } finally {
      setLoading(false);
    }
  }, [stocks]);

  const buildGraph = (data: CausalAnalysis) => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    // Center node = event
    nodes.push({
      id: "event",
      x: 0, y: 0, targetX: 0, targetY: 0,
      order: 0, effect: data.event, asset_class: "event",
      direction: "volatile", confidence: 1, magnitude: "PRIMARY", time_horizon: "immediate",
    });

    const allOrders = [
      { items: data.first_order || [], order: 1 },
      { items: data.second_order || [], order: 2 },
      { items: data.third_order || [], order: 3 },
    ];

    allOrders.forEach(({ items, order }) => {
      const radius = order * 140;
      items.forEach((item, i) => {
        const angle = (i / Math.max(items.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const jitter = (Math.random() - 0.5) * 30;
        const id = `${order}-${i}`;
        const tx = Math.cos(angle) * (radius + jitter);
        const ty = Math.sin(angle) * (radius + jitter);
        nodes.push({
          id, x: 0, y: 0, targetX: tx, targetY: ty,
          order, effect: item.effect, asset_class: item.asset_class,
          direction: item.direction, confidence: item.confidence,
          magnitude: item.magnitude, time_horizon: item.time_horizon,
        });

        // Connect to parent nodes
        if (order === 1) {
          edges.push({ from: "event", to: id, weight: item.confidence });
        } else {
          // Connect to random node in previous order
          const prevNodes = nodes.filter(n => n.order === order - 1);
          if (prevNodes.length > 0) {
            const parent = prevNodes[Math.floor(Math.random() * prevNodes.length)];
            edges.push({ from: parent.id, to: id, weight: item.confidence });
          }
        }
      });
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
  };

  // Animate causal graph
  useEffect(() => {
    const canvas = graphCanvasRef.current;
    if (!canvas || !analysis) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width;
    const H = rect.height;
    const cxo = W / 2;
    const cyo = H / 2;

    const drawFrame = () => {
      const t = Date.now() / 1000;
      ctx.clearRect(0, 0, W, H);

      // Background
      ctx.fillStyle = "hsl(220, 20%, 4%)";
      ctx.fillRect(0, 0, W, H);

      // Animate wave progress
      if (waveProgressRef.current < 1) {
        waveProgressRef.current = Math.min(1, waveProgressRef.current + 0.008);
      }

      // Animate nodes towards target positions
      nodesRef.current.forEach(node => {
        const speed = 0.05;
        node.x += (node.targetX - node.x) * speed;
        node.y += (node.targetY - node.y) * speed;
      });

      const getNodePos = (id: string) => {
        const n = nodesRef.current.find(n => n.id === id);
        if (!n) return { x: 0, y: 0 };
        return { x: cxo + n.x, y: cyo + n.y };
      };

      // Draw propagation wave rings
      for (let ring = 1; ring <= 3; ring++) {
        const ringProgress = Math.max(0, waveProgressRef.current * 3 - (ring - 1));
        if (ringProgress <= 0) continue;
        const radius = ring * 140 * Math.min(ringProgress, 1);
        const alpha = Math.max(0, 0.06 - ringProgress * 0.02);
        ctx.beginPath();
        ctx.arc(cxo, cyo, radius, 0, Math.PI * 2);
        const ringColors = ["rgba(60, 130, 255, ", "rgba(255, 180, 0, ", "rgba(255, 60, 60, "];
        ctx.strokeStyle = `${ringColors[ring - 1]}${alpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -(t * 20) % 8;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw edges with animated flow
      edgesRef.current.forEach(edge => {
        const from = getNodePos(edge.from);
        const to = getNodePos(edge.to);
        const toNode = nodesRef.current.find(n => n.id === edge.to);
        if (!toNode) return;

        const orderProgress = Math.max(0, waveProgressRef.current * 3 - (toNode.order - 1));
        if (orderProgress <= 0) return;
        const edgeAlpha = Math.min(orderProgress, 1);

        // Edge line
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        // Curved edge
        const mx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 0.1;
        const my = (from.y + to.y) / 2 + (Math.random() - 0.5) * 0.1;
        ctx.lineTo(to.x, to.y);

        const edgeColor = toNode.direction === "up" ? "80, 200, 120" :
                          toNode.direction === "down" ? "255, 80, 80" : "255, 180, 60";
        const thickness = 0.5 + edge.weight * 2.5;
        ctx.strokeStyle = `rgba(${edgeColor}, ${0.25 * edgeAlpha})`;
        ctx.lineWidth = thickness;
        ctx.stroke();

        // Animated particle along edge
        const particleT = (t * 0.5 + parseFloat(edge.to)) % 1;
        const px = from.x + (to.x - from.x) * particleT;
        const py = from.y + (to.y - from.y) * particleT;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${edgeColor}, ${0.6 * edgeAlpha})`;
        ctx.fill();
      });

      // Draw nodes
      nodesRef.current.forEach(node => {
        const orderProgress = Math.max(0, waveProgressRef.current * 3 - (node.order));
        if (orderProgress <= 0 && node.order > 0) return;
        const nodeAlpha = node.order === 0 ? 1 : Math.min(orderProgress, 1);

        const nx = cxo + node.x;
        const ny = cyo + node.y;

        // Node glow
        const intensity = node.confidence * (node.order === 0 ? 1 : 0.7);
        const glowR = node.order === 0 ? 30 : 8 + intensity * 20;
        const orderColors = [
          [60, 130, 255],   // Event - blue
          [60, 180, 255],   // 1st order - light blue
          [255, 180, 60],   // 2nd order - amber
          [255, 80, 80],    // 3rd order - red
        ];
        const [cr, cg, cb] = orderColors[node.order] || [255, 255, 255];

        const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, glowR);
        glow.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.4 * intensity * nodeAlpha})`);
        glow.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(nx, ny, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Node core
        const coreR = node.order === 0 ? 10 : 4 + node.confidence * 6;
        ctx.beginPath();
        ctx.arc(nx, ny, coreR, 0, Math.PI * 2);

        // Direction-based fill
        if (node.direction === "up") {
          ctx.fillStyle = `rgba(80, 200, 120, ${0.8 * nodeAlpha})`;
        } else if (node.direction === "down") {
          ctx.fillStyle = `rgba(255, 80, 80, ${0.8 * nodeAlpha})`;
        } else {
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.8 * nodeAlpha})`;
        }
        ctx.fill();

        // Confidence ring
        ctx.beginPath();
        ctx.arc(nx, ny, coreR + 2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * node.confidence);
        ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.5 * nodeAlpha})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        if (node.order === 0 || W > 600) {
          ctx.font = node.order === 0 ? "bold 9px 'JetBrains Mono', monospace" : "600 7px 'JetBrains Mono', monospace";
          ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.8 * nodeAlpha})`;
          const label = node.order === 0 ? "PRIMARY EVENT" : node.asset_class.toUpperCase();
          ctx.fillText(label, nx + coreR + 5, ny - 3);

          if (node.order > 0) {
            ctx.font = "500 6px 'JetBrains Mono', monospace";
            ctx.fillStyle = `rgba(200, 210, 220, ${0.5 * nodeAlpha})`;
            const effectLabel = node.effect.length > 30 ? node.effect.substring(0, 30) + "…" : node.effect;
            ctx.fillText(effectLabel, nx + coreR + 5, ny + 7);

            // Direction arrow + magnitude
            const dirSymbol = node.direction === "up" ? "▲" : node.direction === "down" ? "▼" : "◆";
            ctx.fillStyle = node.direction === "up" ? `rgba(80, 200, 120, ${0.8 * nodeAlpha})` :
                           node.direction === "down" ? `rgba(255, 80, 80, ${0.8 * nodeAlpha})` :
                           `rgba(255, 180, 60, ${0.8 * nodeAlpha})`;
            ctx.fillText(`${dirSymbol} ${node.magnitude}`, nx + coreR + 5, ny + 16);
          }
        }

        // Pulse on high-severity nodes
        if (node.confidence > 0.7 && node.order > 0) {
          const pulseR = coreR + 6 + Math.sin(t * 3 + node.confidence * 10) * 3;
          ctx.beginPath();
          ctx.arc(nx, ny, pulseR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.08 * nodeAlpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      });

      // Order labels
      const orderLabels = ["", "1ST ORDER", "2ND ORDER", "3RD ORDER"];
      const orderLabelColors = ["", "rgba(60, 180, 255, 0.3)", "rgba(255, 180, 60, 0.3)", "rgba(255, 80, 80, 0.3)"];
      for (let i = 1; i <= 3; i++) {
        const orderProgress = Math.max(0, waveProgressRef.current * 3 - (i - 1));
        if (orderProgress <= 0) continue;
        ctx.font = "bold 8px 'JetBrains Mono', monospace";
        ctx.fillStyle = orderLabelColors[i];
        ctx.fillText(orderLabels[i], cxo - 25, cyo - i * 140 + 5);
      }

      // HUD
      ctx.font = "600 7px 'JetBrains Mono', monospace";
      ctx.fillStyle = "rgba(60, 130, 255, 0.3)";
      ctx.fillText("CAUSAL GRAPH · LIVE PROPAGATION", 8, 14);
      ctx.fillText(`NODES: ${nodesRef.current.length} · EDGES: ${edgesRef.current.length}`, 8, 26);

      graphAnimRef.current = requestAnimationFrame(drawFrame);
    };

    graphAnimRef.current = requestAnimationFrame(drawFrame);
    return () => cancelAnimationFrame(graphAnimRef.current);
  }, [analysis, density]);

  const orderColors = ["text-primary", "text-warning", "text-loss"];
  const orderLabels = ["1st Order · Immediate", "2nd Order · Ripple", "3rd Order · Structural"];

  return (
    <div className="space-y-4">
      {/* Event Input */}
      <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
        <div className="flex items-center gap-3 mb-3 relative z-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
            <GitBranch className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Causal Effects Engine</h3>
            <p className="text-[9px] text-muted-foreground font-mono tracking-wider">SECOND & THIRD ORDER SIMULATION</p>
          </div>
        </div>

        <div className="flex gap-2 mb-3 relative z-10">
          <input
            type="text"
            value={event}
            onChange={(e) => setEvent(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyze(event)}
            placeholder="Enter geopolitical/economic event to simulate..."
            className="flex-1 rounded-lg glass-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/30 font-mono"
          />
          <Button onClick={() => analyze(event)} disabled={loading || !event.trim()} size="sm" className="gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Simulate
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 relative z-10">
          {PRESET_EVENTS.map((pe) => (
            <button key={pe} onClick={() => analyze(pe)}
              className="glass-subtle rounded-lg px-2 py-1 text-[9px] font-mono text-muted-foreground hover:text-foreground transition-all hover:border-primary/20">
              {pe}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="glass-panel rounded-xl p-12 text-center relative">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3 relative z-10" />
          <p className="text-sm text-muted-foreground font-mono relative z-10">Simulating causal chains...</p>
          <p className="text-[9px] text-muted-foreground/50 font-mono mt-1 relative z-10">Mapping 2nd & 3rd order effects across assets, regions, and time</p>
        </div>
      )}

      {analysis && !loading && (
        <>
          {/* Animated Causal Graph */}
          <div className="glass-panel rounded-xl overflow-hidden relative">
            <div className="flex items-center justify-between p-3 relative z-10">
              <span className="text-[9px] font-bold text-foreground uppercase tracking-widest flex items-center gap-2">
                <GitBranch className="h-3 w-3 text-primary" /> Causal Propagation Graph
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-muted-foreground font-mono">Density</span>
                <input type="range" min="0.5" max="2" step="0.1" value={density}
                  onChange={(e) => setDensity(parseFloat(e.target.value))}
                  className="w-20 h-1 accent-primary" />
              </div>
            </div>
            <canvas ref={graphCanvasRef} className="w-full relative z-10"
              style={{ height: "400px" }} />
            <div className="flex items-center gap-4 p-3 text-[8px] text-muted-foreground font-mono relative z-10">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "rgb(60, 180, 255)" }} /> 1st Order</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "rgb(255, 180, 60)" }} /> 2nd Order</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "rgb(255, 80, 80)" }} /> 3rd Order</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gain" /> Up</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-loss" /> Down</span>
            </div>
          </div>

          {/* Scenario Tree */}
          <div className="glass-panel rounded-xl p-4 sm:p-5 relative">
            <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10">
              <Activity className="h-3.5 w-3.5 text-primary" /> Probabilistic Scenario Tree
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 relative z-10">
              {analysis.scenario_tree.map((branch, i) => {
                const isPositive = branch.capital_impact_pct >= 0;
                return (
                  <div key={i} className={`glass-card rounded-lg p-3 sm:p-4 ${isPositive ? "glass-glow-gain" : "glass-glow-loss"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-foreground uppercase">{branch.label}</span>
                      <span className="rounded bg-surface-3 px-2 py-0.5 text-[9px] font-mono text-muted-foreground">
                        {(branch.probability * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mb-2">
                      {isPositive ? <TrendingUp className="h-4 w-4 text-gain" /> : <TrendingDown className="h-4 w-4 text-loss" />}
                      <span className={`font-mono text-lg font-black ${isPositive ? "text-gain" : "text-loss"}`}>
                        {isPositive ? "+" : ""}{branch.capital_impact_pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="space-y-1">
                      {branch.key_moves.map((m, j) => (
                        <p key={j} className="text-[9px] text-muted-foreground leading-snug">• {m}</p>
                      ))}
                    </div>
                    <div className="mt-2 h-1 rounded-full bg-surface-3 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-1000 ${isPositive ? "bg-gain" : "bg-loss"}`}
                        style={{ width: `${branch.probability * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Causal Chain Details */}
          {[analysis.first_order, analysis.second_order, analysis.third_order].map((order, oi) => (
            order && order.length > 0 && (
              <div key={oi} className="glass-panel rounded-xl p-4 sm:p-5 relative">
                <h3 className={`text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2 relative z-10 ${orderColors[oi]}`}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-[9px] font-mono">{oi + 1}</span>
                  {orderLabels[oi]}
                  <span className="ml-auto text-[8px] text-muted-foreground font-normal">{order.length} effects</span>
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 relative z-10">
                  {order.map((node, i) => (
                    <div key={i} className="glass-subtle rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-mono text-muted-foreground uppercase">{node.asset_class}</span>
                        <span className={`text-[9px] font-mono font-bold ${node.direction === "up" ? "text-gain" : node.direction === "down" ? "text-loss" : "text-warning"}`}>
                          {node.direction === "up" ? "▲" : node.direction === "down" ? "▼" : "◆"} {node.magnitude}
                        </span>
                      </div>
                      <p className="text-[10px] text-foreground leading-snug mb-1">{node.effect}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] text-muted-foreground font-mono">{node.time_horizon}</span>
                        <div className="flex items-center gap-1">
                          <div className="h-1 w-12 rounded-full bg-surface-3 overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${node.confidence * 100}%` }} />
                          </div>
                          <span className="text-[8px] font-mono text-muted-foreground">{(node.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}

          {/* Reflexivity & Scar */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="glass-panel rounded-xl p-4 relative">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-2 relative z-10">Reflexivity Risk</h3>
              <div className="flex items-end gap-2 relative z-10">
                <span className={`font-mono text-3xl font-black ${analysis.reflexivity_score > 70 ? "text-loss" : analysis.reflexivity_score > 40 ? "text-warning" : "text-gain"}`}>
                  {analysis.reflexivity_score}
                </span>
                <span className="text-[9px] text-muted-foreground mb-1">/100</span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-surface-3 overflow-hidden relative z-10">
                <div className={`h-full rounded-full transition-all ${analysis.reflexivity_score > 70 ? "bg-loss" : analysis.reflexivity_score > 40 ? "bg-warning" : "bg-gain"}`}
                  style={{ width: `${analysis.reflexivity_score}%` }} />
              </div>
              <p className="text-[9px] text-muted-foreground mt-2 relative z-10">Measures feedback loop amplification risk</p>
            </div>
            <div className="glass-panel rounded-xl p-4 relative">
              <h3 className="text-[10px] font-bold text-foreground uppercase tracking-widest mb-2 relative z-10">Scar Memory Tag</h3>
              <p className="text-sm text-foreground font-mono relative z-10">{analysis.scar_tag}</p>
              <p className="text-[9px] text-muted-foreground mt-2 relative z-10">Pattern reinforcement for future simulations</p>
            </div>
          </div>
        </>
      )}

      {!analysis && !loading && (
        <div className="glass-panel rounded-xl py-16 text-center relative">
          <GitBranch className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4 relative z-10" />
          <h3 className="text-lg font-semibold text-foreground mb-2 relative z-10">No Simulation Active</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto relative z-10">
            Select or type a geopolitical/economic event above to simulate second and third-order causal effects across all asset classes.
          </p>
        </div>
      )}
    </div>
  );
};

export default CausalEffectsEngine;
