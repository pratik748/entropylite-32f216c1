import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Line } from "@react-three/drei";
import * as THREE from "three";
import { Badge } from "@/components/ui/badge";

interface HeatmapPoint {
  x: number; // momentum
  y: number; // vol
  z: number; // pnl
  asset: string;
  regime: string;
}

interface Props {
  data: HeatmapPoint[];
  featureImportance?: { feature: string; importance: number; correlation: number }[];
  regimeAlpha?: Record<string, number>;
  gradient?: {
    featureWeights: { feature: string; weight: number; delta: number }[];
    assetBiases: Record<string, number>;
  };
}

// ─── Viridis Color Ramp ──────────────────────────────
const VIRIDIS: [number, number, number][] = [
  [0.267, 0.004, 0.329],
  [0.282, 0.140, 0.458],
  [0.253, 0.265, 0.530],
  [0.191, 0.407, 0.556],
  [0.127, 0.566, 0.550],
  [0.134, 0.658, 0.517],
  [0.267, 0.749, 0.441],
  [0.477, 0.821, 0.318],
  [0.741, 0.873, 0.150],
  [0.993, 0.906, 0.144],
];

function viridis(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const idx = t * (VIRIDIS.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, VIRIDIS.length - 1);
  const f = idx - lo;
  return [
    VIRIDIS[lo][0] * (1 - f) + VIRIDIS[hi][0] * f,
    VIRIDIS[lo][1] * (1 - f) + VIRIDIS[hi][1] * f,
    VIRIDIS[lo][2] * (1 - f) + VIRIDIS[hi][2] * f,
  ];
}

function viridisCSS(t: number): string {
  const [r, g, b] = viridis(t);
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

const regimeColor: Record<string, string> = {
  trending: "#22c55e",
  volatile: "#ef4444",
  range: "#3b82f6",
  crisis: "#f59e0b",
  unknown: "#8b5cf6",
};

// ─── Constants ───────────────────────────────────────
const GRID = 36;
const SIZE = 5;
const X_RANGE: [number, number] = [-100, 100];
const Y_RANGE: [number, number] = [0, 100];
const Z_RANGE: [number, number] = [-30, 30];

function normalize(v: number, min: number, max: number) {
  return (v - min) / (max - min);
}

// ─── Build Interpolated Height Field ─────────────────
function buildHeightField(data: HeatmapPoint[], res: number) {
  const heights: number[][] = [];
  for (let iy = 0; iy <= res; iy++) {
    heights[iy] = [];
    for (let ix = 0; ix <= res; ix++) {
      const dataX = X_RANGE[0] + (ix / res) * (X_RANGE[1] - X_RANGE[0]);
      const dataY = Y_RANGE[0] + (iy / res) * (Y_RANGE[1] - Y_RANGE[0]);
      let totalW = 0, totalZ = 0;
      for (const d of data) {
        const dx = (d.x - dataX) / (X_RANGE[1] - X_RANGE[0]);
        const dy = (d.y - dataY) / (Y_RANGE[1] - Y_RANGE[0]);
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.015;
        const w = 1 / (dist * dist * dist);
        totalW += w;
        totalZ += w * d.z;
      }
      heights[iy][ix] = data.length > 0 ? totalZ / totalW : 0;
    }
  }
  // Smooth
  const smoothed: number[][] = [];
  for (let iy = 0; iy <= res; iy++) {
    smoothed[iy] = [];
    for (let ix = 0; ix <= res; ix++) {
      let sum = heights[iy][ix] * 4, count = 4;
      if (iy > 0) { sum += heights[iy - 1][ix]; count++; }
      if (iy < res) { sum += heights[iy + 1][ix]; count++; }
      if (ix > 0) { sum += heights[iy][ix - 1]; count++; }
      if (ix < res) { sum += heights[iy][ix + 1]; count++; }
      smoothed[iy][ix] = sum / count;
    }
  }
  return smoothed;
}

function heightToWorld(ix: number, iy: number, res: number, heights: number[][]): [number, number, number] {
  const nx = ix / res;
  const ny = iy / res;
  const z = heights[iy][ix];
  return [
    (nx - 0.5) * SIZE,
    normalize(z, Z_RANGE[0], Z_RANGE[1]) * 3 - 0.3,
    (ny - 0.5) * SIZE,
  ];
}

// ─── Smooth Surface Mesh ─────────────────────────────
function SurfaceMesh({ data }: { data: HeatmapPoint[] }) {
  const geometry = useMemo(() => {
    const heights = buildHeightField(data, GRID);
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];

    for (let iy = 0; iy <= GRID; iy++) {
      for (let ix = 0; ix <= GRID; ix++) {
        const [px, py, pz] = heightToWorld(ix, iy, GRID, heights);
        positions.push(px, py, pz);
        const t = normalize(heights[iy][ix], Z_RANGE[0], Z_RANGE[1]);
        const [r, g, b] = viridis(t);
        colors.push(r, g, b);
      }
    }
    for (let iy = 0; iy < GRID; iy++) {
      for (let ix = 0; ix < GRID; ix++) {
        const a = iy * (GRID + 1) + ix;
        const b = a + 1;
        const c = a + (GRID + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [data]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} roughness={0.35} metalness={0.05} />
    </mesh>
  );
}

// ─── Wireframe Grid on Surface ───────────────────────
function SurfaceWireframe({ data }: { data: HeatmapPoint[] }) {
  const lines = useMemo(() => {
    const wireRes = 18;
    const heights = buildHeightField(data, wireRes);
    const result: [number, number, number][][] = [];

    for (let iy = 0; iy <= wireRes; iy++) {
      const line: [number, number, number][] = [];
      for (let ix = 0; ix <= wireRes; ix++) line.push(heightToWorld(ix, iy, wireRes, heights));
      result.push(line);
    }
    for (let ix = 0; ix <= wireRes; ix++) {
      const line: [number, number, number][] = [];
      for (let iy = 0; iy <= wireRes; iy++) line.push(heightToWorld(ix, iy, wireRes, heights));
      result.push(line);
    }
    return result;
  }, [data]);

  return (
    <group>
      {lines.map((pts, i) => (
        <Line key={i} points={pts} color="rgba(255,255,255,0.06)" lineWidth={0.4} />
      ))}
    </group>
  );
}

// ─── Data Point Markers (individual trades) ──────────
function TradeMarkers({ data }: { data: HeatmapPoint[] }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.children.forEach((child, i) => {
        if (child instanceof THREE.Mesh) {
          child.position.y += Math.sin(clock.elapsedTime * 0.8 + i * 0.7) * 0.0005;
        }
      });
    }
  });

  return (
    <group ref={groupRef}>
      {data.map((pt, i) => {
        const nx = normalize(pt.x, X_RANGE[0], X_RANGE[1]);
        const ny = normalize(pt.y, Y_RANGE[0], Y_RANGE[1]);
        const nz = normalize(pt.z, Z_RANGE[0], Z_RANGE[1]);
        const px = (nx - 0.5) * SIZE;
        const py = nz * 3 - 0.3 + 0.08;
        const pz = (ny - 0.5) * SIZE;
        const color = regimeColor[pt.regime] || regimeColor.unknown;
        const size = Math.max(0.04, Math.min(0.14, Math.abs(pt.z) * 0.004 + 0.04));

        return (
          <mesh key={i} position={[px, py, pz]}>
            <sphereGeometry args={[size, 10, 10]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={pt.z > 0 ? 0.6 : 0.15}
              transparent
              opacity={0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ─── Gradient Flow Arrows ────────────────────────────
function GradientFlowArrows({ data }: { data: HeatmapPoint[] }) {
  const arrows = useMemo(() => {
    if (data.length < 3) return [];
    // Show gradient direction from low-pnl to high-pnl regions
    const sorted = [...data].sort((a, b) => a.z - b.z);
    const bottom = sorted.slice(0, Math.ceil(sorted.length * 0.3));
    const top = sorted.slice(-Math.ceil(sorted.length * 0.3));

    const avgBot = {
      x: bottom.reduce((s, d) => s + d.x, 0) / bottom.length,
      y: bottom.reduce((s, d) => s + d.y, 0) / bottom.length,
      z: bottom.reduce((s, d) => s + d.z, 0) / bottom.length,
    };
    const avgTop = {
      x: top.reduce((s, d) => s + d.x, 0) / top.length,
      y: top.reduce((s, d) => s + d.y, 0) / top.length,
      z: top.reduce((s, d) => s + d.z, 0) / top.length,
    };

    // Create a few arrows along the gradient
    const result: { from: [number, number, number]; to: [number, number, number] }[] = [];
    for (let t = 0; t < 3; t++) {
      const f = t / 3;
      const mx = avgBot.x + (avgTop.x - avgBot.x) * f;
      const my = avgBot.y + (avgTop.y - avgBot.y) * f;
      const mz = avgBot.z + (avgTop.z - avgBot.z) * f;
      const ex = mx + (avgTop.x - avgBot.x) * 0.25;
      const ey = my + (avgTop.y - avgBot.y) * 0.25;
      const ez = mz + (avgTop.z - avgBot.z) * 0.25;

      const from: [number, number, number] = [
        (normalize(mx, X_RANGE[0], X_RANGE[1]) - 0.5) * SIZE,
        normalize(mz, Z_RANGE[0], Z_RANGE[1]) * 3 - 0.3 + 0.2,
        (normalize(my, Y_RANGE[0], Y_RANGE[1]) - 0.5) * SIZE,
      ];
      const to: [number, number, number] = [
        (normalize(ex, X_RANGE[0], X_RANGE[1]) - 0.5) * SIZE,
        normalize(ez, Z_RANGE[0], Z_RANGE[1]) * 3 - 0.3 + 0.2,
        (normalize(ey, Y_RANGE[0], Y_RANGE[1]) - 0.5) * SIZE,
      ];
      result.push({ from, to });
    }
    return result;
  }, [data]);

  return (
    <group>
      {arrows.map((a, i) => (
        <Line key={i} points={[a.from, a.to]} color="#22c55e" lineWidth={2} dashed dashSize={0.08} gapSize={0.04} />
      ))}
    </group>
  );
}

// ─── Regime Zone Planes (subtle floor projection) ────
function RegimeZones({ data }: { data: HeatmapPoint[] }) {
  const zones = useMemo(() => {
    const groups: Record<string, HeatmapPoint[]> = {};
    for (const d of data) {
      const r = d.regime || "unknown";
      if (!groups[r]) groups[r] = [];
      groups[r].push(d);
    }
    return Object.entries(groups)
      .filter(([, pts]) => pts.length >= 2)
      .map(([regime, pts]) => {
        const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
        const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
        const spread = Math.sqrt(
          pts.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) / pts.length
        );
        return {
          regime,
          cx: (normalize(cx, X_RANGE[0], X_RANGE[1]) - 0.5) * SIZE,
          cz: (normalize(cy, Y_RANGE[0], Y_RANGE[1]) - 0.5) * SIZE,
          radius: Math.max(0.3, Math.min(1.2, spread * 0.015)),
          color: regimeColor[regime] || regimeColor.unknown,
        };
      });
  }, [data]);

  return (
    <group>
      {zones.map((z, i) => (
        <mesh key={i} position={[z.cx, -0.28, z.cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[z.radius, 24]} />
          <meshStandardMaterial color={z.color} transparent opacity={0.08} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Axes ────────────────────────────────────────────
function Axes() {
  const half = SIZE / 2;
  const bot = -0.3;
  const top = 2.7;

  return (
    <group>
      <Line points={[[-half, bot, half], [half, bot, half]]} color="#475569" lineWidth={1} />
      <Line points={[[half, bot, -half], [half, bot, half]]} color="#475569" lineWidth={1} />
      <Line points={[[-half, bot, -half], [-half, top, -half]]} color="#475569" lineWidth={1} />

      {/* X axis ticks & labels */}
      {[-100, -50, 0, 50, 100].map(v => (
        <Text key={`x${v}`} position={[(normalize(v, X_RANGE[0], X_RANGE[1]) - 0.5) * SIZE, bot - 0.15, half + 0.15]} fontSize={0.12} color="#64748b" anchorX="center" font={undefined}>
          {v.toString()}
        </Text>
      ))}
      <Text position={[0, bot - 0.35, half + 0.3]} fontSize={0.16} color="#94a3b8" anchorX="center" font={undefined}>
        Momentum →
      </Text>

      {/* Y axis ticks (vol) */}
      {[0, 25, 50, 75, 100].map(v => (
        <Text key={`y${v}`} position={[half + 0.2, bot - 0.15, (normalize(v, Y_RANGE[0], Y_RANGE[1]) - 0.5) * SIZE]} fontSize={0.12} color="#64748b" anchorX="center" rotation={[0, -Math.PI / 2, 0]} font={undefined}>
          {v.toString()}
        </Text>
      ))}
      <Text position={[half + 0.5, bot - 0.1, 0]} fontSize={0.16} color="#94a3b8" anchorX="center" rotation={[0, -Math.PI / 2, 0]} font={undefined}>
        Volatility →
      </Text>

      {/* Z axis ticks (pnl) */}
      {[-30, -15, 0, 15, 30].map(v => (
        <Text key={`z${v}`} position={[-half - 0.2, normalize(v, Z_RANGE[0], Z_RANGE[1]) * 3 - 0.3, -half]} fontSize={0.12} color="#64748b" anchorX="right" font={undefined}>
          {v > 0 ? `+${v}` : v.toString()}
        </Text>
      ))}
      <Text position={[-half - 0.4, 1.2, -half - 0.2]} fontSize={0.16} color="#94a3b8" anchorX="center" rotation={[0, 0, Math.PI / 2]} font={undefined}>
        PnL % →
      </Text>
    </group>
  );
}

// ─── HTML Overlays ───────────────────────────────────
function ColorBar() {
  const stops = Array.from({ length: 30 }, (_, i) => viridisCSS(i / 29));
  const gradient = `linear-gradient(to top, ${stops.join(", ")})`;

  return (
    <div className="absolute right-3 top-10 bottom-10 flex items-start gap-1.5 z-10">
      <div className="flex flex-col justify-between h-full py-0.5">
        {["+30%", "+15%", "0%", "-15%", "-30%"].map(v => (
          <span key={v} className="text-[7px] font-mono text-muted-foreground leading-none whitespace-nowrap">{v}</span>
        ))}
      </div>
      <div className="w-2.5 h-full rounded-sm border border-border/20" style={{ background: gradient }} />
      <span className="text-[7px] font-mono text-muted-foreground writing-mode-vertical" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
        PnL
      </span>
    </div>
  );
}

function StatsOverlay({ data, featureImportance, regimeAlpha }: {
  data: HeatmapPoint[];
  featureImportance?: Props["featureImportance"];
  regimeAlpha?: Record<string, number>;
}) {
  // Compute live stats from data
  const stats = useMemo(() => {
    if (data.length === 0) return null;
    const pnls = data.map(d => d.z);
    const avg = pnls.reduce((s, v) => s + v, 0) / pnls.length;
    const max = Math.max(...pnls);
    const min = Math.min(...pnls);
    const positive = pnls.filter(p => p > 0).length;
    const winRate = (positive / pnls.length * 100);

    // Regime distribution
    const regimes: Record<string, number> = {};
    for (const d of data) {
      regimes[d.regime] = (regimes[d.regime] || 0) + 1;
    }

    // Unique assets
    const assets = new Set(data.map(d => d.asset));

    // Momentum/Vol centroid
    const avgMom = data.reduce((s, d) => s + d.x, 0) / data.length;
    const avgVol = data.reduce((s, d) => s + d.y, 0) / data.length;

    return { avg, max, min, winRate, regimes, assetCount: assets.size, avgMom, avgVol, total: data.length };
  }, [data]);

  if (!stats) return null;

  return (
    <div className="absolute left-2 top-2 z-10 space-y-1.5">
      {/* Micro stats strip */}
      <div className="bg-background/60 backdrop-blur-sm rounded-sm border border-border/20 px-2 py-1.5 space-y-1">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-[7px] font-mono text-muted-foreground block">TRADES</span>
            <span className="text-[10px] font-mono font-bold text-foreground">{stats.total}</span>
          </div>
          <div>
            <span className="text-[7px] font-mono text-muted-foreground block">WIN RATE</span>
            <span className={`text-[10px] font-mono font-bold ${stats.winRate >= 50 ? "text-gain" : "text-loss"}`}>
              {stats.winRate.toFixed(0)}%
            </span>
          </div>
          <div>
            <span className="text-[7px] font-mono text-muted-foreground block">AVG PnL</span>
            <span className={`text-[10px] font-mono font-bold ${stats.avg >= 0 ? "text-gain" : "text-loss"}`}>
              {stats.avg >= 0 ? "+" : ""}{stats.avg.toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-[7px] font-mono text-muted-foreground block">ASSETS</span>
            <span className="text-[10px] font-mono font-bold text-foreground">{stats.assetCount}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div>
            <span className="text-[7px] font-mono text-muted-foreground block">PEAK</span>
            <span className="text-[10px] font-mono font-bold text-gain">+{stats.max.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-[7px] font-mono text-muted-foreground block">TROUGH</span>
            <span className="text-[10px] font-mono font-bold text-loss">{stats.min.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-[7px] font-mono text-muted-foreground block">MOM μ</span>
            <span className="text-[10px] font-mono font-bold text-foreground">{stats.avgMom.toFixed(0)}</span>
          </div>
          <div>
            <span className="text-[7px] font-mono text-muted-foreground block">VOL μ</span>
            <span className="text-[10px] font-mono font-bold text-foreground">{stats.avgVol.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Feature importance mini-bars */}
      {featureImportance && featureImportance.length > 0 && (
        <div className="bg-background/60 backdrop-blur-sm rounded-sm border border-border/20 px-2 py-1.5">
          <span className="text-[7px] font-mono text-muted-foreground block mb-1">FEATURE IMPORTANCE</span>
          {featureImportance.map(f => (
            <div key={f.feature} className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[7px] font-mono text-muted-foreground w-[50px] truncate">{f.feature}</span>
              <div className="flex-1 h-1.5 bg-muted/20 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, f.importance)}%`,
                    background: f.correlation >= 0
                      ? `linear-gradient(90deg, hsl(142,71%,35%), hsl(142,71%,50%))`
                      : `linear-gradient(90deg, hsl(0,72%,45%), hsl(0,72%,55%))`,
                  }}
                />
              </div>
              <span className={`text-[7px] font-mono font-bold ${f.correlation >= 0 ? "text-gain" : "text-loss"}`}>
                {f.correlation >= 0 ? "+" : ""}{(f.correlation * 100).toFixed(0)}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Regime alpha badges */}
      {regimeAlpha && Object.keys(regimeAlpha).length > 0 && (
        <div className="bg-background/60 backdrop-blur-sm rounded-sm border border-border/20 px-2 py-1.5">
          <span className="text-[7px] font-mono text-muted-foreground block mb-1">REGIME α</span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(regimeAlpha).map(([regime, alpha]) => (
              <div
                key={regime}
                className="flex items-center gap-1 px-1 py-0.5 rounded-sm"
                style={{ backgroundColor: `${regimeColor[regime] || regimeColor.unknown}15` }}
              >
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: regimeColor[regime] || regimeColor.unknown }} />
                <span className="text-[7px] font-mono text-muted-foreground uppercase">{regime}</span>
                <span className={`text-[7px] font-mono font-bold ${alpha >= 0 ? "text-gain" : "text-loss"}`}>
                  {alpha >= 0 ? "+" : ""}{alpha.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────
const ProfitHeatmap3D = ({ data, featureImportance, regimeAlpha, gradient }: Props) => {
  const [layer, setLayer] = useState<"pnl" | "regime">("pnl");

  if (data.length === 0) {
    return (
      <div className="h-[420px] rounded-sm border border-border bg-card flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Cross trades to populate the 3D profit surface</p>
      </div>
    );
  }

  return (
    <div className="h-[420px] rounded-sm border border-border bg-[hsl(222,20%,4%)] overflow-hidden relative">
      <Canvas camera={{ position: [5.5, 4.5, 5.5], fov: 42 }}>
        <ambientLight intensity={0.45} />
        <directionalLight position={[6, 10, 6]} intensity={0.65} />
        <directionalLight position={[-4, 5, -4]} intensity={0.2} color="#6366f1" />
        <hemisphereLight intensity={0.15} color="#f0f0ff" groundColor="#0a0a0a" />

        <SurfaceMesh data={data} />
        <SurfaceWireframe data={data} />
        <TradeMarkers data={data} />
        <RegimeZones data={data} />
        <GradientFlowArrows data={data} />
        <Axes />

        <OrbitControls
          enableZoom
          enablePan={false}
          minDistance={4}
          maxDistance={14}
          autoRotate
          autoRotateSpeed={0.25}
          minPolarAngle={0.3}
          maxPolarAngle={1.4}
        />
      </Canvas>

      {/* Overlays */}
      <StatsOverlay data={data} featureImportance={featureImportance} regimeAlpha={regimeAlpha} />
      <ColorBar />

      {/* Bottom regime legend */}
      <div className="absolute bottom-2 left-2 flex items-center gap-2 z-10">
        {Object.entries(regimeColor)
          .filter(([k]) => k !== "unknown")
          .map(([regime, color]) => (
            <div key={regime} className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[7px] font-mono text-muted-foreground uppercase">{regime}</span>
            </div>
          ))}
        <span className="text-[7px] font-mono text-muted-foreground/40 ml-2">● TRADE MARKERS</span>
        <span className="text-[7px] font-mono text-muted-foreground/40">⤑ GRADIENT FLOW</span>
      </div>

      {/* Controls */}
      <div className="absolute bottom-2 right-2 z-10">
        <span className="text-[7px] font-mono text-muted-foreground/50 bg-background/30 px-1.5 py-0.5 rounded-sm">
          DRAG ROTATE · SCROLL ZOOM
        </span>
      </div>
    </div>
  );
};

export default ProfitHeatmap3D;
