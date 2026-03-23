import { useRef, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Text, Line } from "@react-three/drei";
import * as THREE from "three";

interface HeatmapPoint {
  x: number; // momentum
  y: number; // vol
  z: number; // pnl
  asset: string;
  regime: string;
}

interface Props {
  data: HeatmapPoint[];
}

// Viridis-inspired color stops for PnL mapping
function viridisColor(t: number): [number, number, number] {
  // t: 0 (low/loss) → 1 (high/profit)
  t = Math.max(0, Math.min(1, t));
  if (t < 0.25) {
    const s = t / 0.25;
    return [0.267 * (1 - s) + 0.127 * s, 0.004 * (1 - s) + 0.357 * s, 0.329 * (1 - s) + 0.506 * s];
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return [0.127 * (1 - s) + 0.134 * s, 0.357 * (1 - s) + 0.658 * s, 0.506 * (1 - s) + 0.517 * s];
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return [0.134 * (1 - s) + 0.477 * s, 0.658 * (1 - s) + 0.821 * s, 0.517 * (1 - s) + 0.318 * s];
  } else {
    const s = (t - 0.75) / 0.25;
    return [0.477 * (1 - s) + 0.993 * s, 0.821 * (1 - s) + 0.906 * s, 0.318 * (1 - s) + 0.144 * s];
  }
}

const GRID_RES = 40;
const SURFACE_SIZE = 5;

function buildSurfaceFromData(data: HeatmapPoint[]) {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // Normalize data ranges
  const xMin = -100, xMax = 100; // momentum
  const yMin = 0, yMax = 100;    // vol
  const zMin = -30, zMax = 30;   // pnl

  // Build height field via inverse-distance weighted interpolation
  const heights: number[][] = [];
  for (let iy = 0; iy <= GRID_RES; iy++) {
    heights[iy] = [];
    for (let ix = 0; ix <= GRID_RES; ix++) {
      const nx = ix / GRID_RES; // 0..1
      const ny = iy / GRID_RES;
      const dataX = xMin + nx * (xMax - xMin);
      const dataY = yMin + ny * (yMax - yMin);

      let totalW = 0, totalZ = 0;
      for (const d of data) {
        const dx = (d.x - dataX) / (xMax - xMin);
        const dy = (d.y - dataY) / (yMax - yMin);
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.02;
        const w = 1 / (dist * dist * dist);
        totalW += w;
        totalZ += w * d.z;
      }
      const z = data.length > 0 ? totalZ / totalW : 0;
      heights[iy][ix] = z;
    }
  }

  // Apply light smoothing pass
  const smoothed: number[][] = [];
  for (let iy = 0; iy <= GRID_RES; iy++) {
    smoothed[iy] = [];
    for (let ix = 0; ix <= GRID_RES; ix++) {
      let sum = heights[iy][ix] * 4;
      let count = 4;
      if (iy > 0) { sum += heights[iy - 1][ix]; count++; }
      if (iy < GRID_RES) { sum += heights[iy + 1][ix]; count++; }
      if (ix > 0) { sum += heights[iy][ix - 1]; count++; }
      if (ix < GRID_RES) { sum += heights[iy][ix + 1]; count++; }
      smoothed[iy][ix] = sum / count;
    }
  }

  // Build vertices
  for (let iy = 0; iy <= GRID_RES; iy++) {
    for (let ix = 0; ix <= GRID_RES; ix++) {
      const nx = ix / GRID_RES;
      const ny = iy / GRID_RES;
      const z = smoothed[iy][ix];

      // Map to 3D space
      const px = (nx - 0.5) * SURFACE_SIZE;
      const pz = (ny - 0.5) * SURFACE_SIZE;
      const py = ((z - zMin) / (zMax - zMin)) * 3 - 0.5; // height

      positions.push(px, py, pz);

      // Color by height (viridis)
      const t = (z - zMin) / (zMax - zMin);
      const [r, g, b] = viridisColor(t);
      colors.push(r, g, b);
    }
  }

  // Build triangle indices
  for (let iy = 0; iy < GRID_RES; iy++) {
    for (let ix = 0; ix < GRID_RES; ix++) {
      const a = iy * (GRID_RES + 1) + ix;
      const b = a + 1;
      const c = a + (GRID_RES + 1);
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  return { positions, colors, indices };
}

function buildWireframeLines(data: HeatmapPoint[]) {
  const xMin = -100, xMax = 100;
  const yMin = 0, yMax = 100;
  const zMin = -30, zMax = 30;
  const wireRes = 20;
  const lines: [number, number, number][][] = [];

  // Build height field
  const heights: number[][] = [];
  for (let iy = 0; iy <= wireRes; iy++) {
    heights[iy] = [];
    for (let ix = 0; ix <= wireRes; ix++) {
      const nx = ix / wireRes;
      const ny = iy / wireRes;
      const dataX = xMin + nx * (xMax - xMin);
      const dataY = yMin + ny * (yMax - yMin);
      let totalW = 0, totalZ = 0;
      for (const d of data) {
        const dx = (d.x - dataX) / (xMax - xMin);
        const dy = (d.y - dataY) / (yMax - yMin);
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.02;
        const w = 1 / (dist * dist * dist);
        totalW += w;
        totalZ += w * d.z;
      }
      heights[iy][ix] = data.length > 0 ? totalZ / totalW : 0;
    }
  }

  const toPos = (ix: number, iy: number): [number, number, number] => {
    const nx = ix / wireRes;
    const ny = iy / wireRes;
    const z = heights[iy][ix];
    return [
      (nx - 0.5) * SURFACE_SIZE,
      ((z - zMin) / (zMax - zMin)) * 3 - 0.5,
      (ny - 0.5) * SURFACE_SIZE,
    ];
  };

  // X-direction lines
  for (let iy = 0; iy <= wireRes; iy++) {
    const line: [number, number, number][] = [];
    for (let ix = 0; ix <= wireRes; ix++) {
      line.push(toPos(ix, iy));
    }
    lines.push(line);
  }
  // Y-direction lines
  for (let ix = 0; ix <= wireRes; ix++) {
    const line: [number, number, number][] = [];
    for (let iy = 0; iy <= wireRes; iy++) {
      line.push(toPos(ix, iy));
    }
    lines.push(line);
  }

  return lines;
}

function Surface({ data }: { data: HeatmapPoint[] }) {
  const { positions, colors, indices } = useMemo(() => buildSurfaceFromData(data), [data]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [positions, colors, indices]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        side={THREE.DoubleSide}
        roughness={0.4}
        metalness={0.1}
      />
    </mesh>
  );
}

function Wireframe({ data }: { data: HeatmapPoint[] }) {
  const lines = useMemo(() => buildWireframeLines(data), [data]);

  return (
    <group>
      {lines.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="rgba(255,255,255,0.08)"
          lineWidth={0.5}
        />
      ))}
    </group>
  );
}

function AxisLabels() {
  const half = SURFACE_SIZE / 2;
  return (
    <group>
      {/* X axis - Momentum */}
      <Text position={[0, -0.9, half + 0.5]} fontSize={0.2} color="#94a3b8" anchorX="center" font={undefined}>
        x (Momentum)
      </Text>
      {/* Z axis - Volatility */}
      <Text position={[half + 0.7, -0.9, 0]} fontSize={0.2} color="#94a3b8" anchorX="center" rotation={[0, -Math.PI / 2, 0]} font={undefined}>
        y (Volatility)
      </Text>
      {/* Y axis - PnL */}
      <Text position={[-half - 0.5, 1.2, -half]} fontSize={0.2} color="#94a3b8" anchorX="center" rotation={[0, 0, Math.PI / 2]} font={undefined}>
        z (PnL %)
      </Text>

      {/* Tick marks on axes */}
      {[-100, -50, 0, 50, 100].map((v) => (
        <Text
          key={`x-${v}`}
          position={[((v + 100) / 200 - 0.5) * SURFACE_SIZE, -0.7, half + 0.2]}
          fontSize={0.13}
          color="#64748b"
          anchorX="center"
          font={undefined}
        >
          {v.toString()}
        </Text>
      ))}
      {[0, 25, 50, 75, 100].map((v) => (
        <Text
          key={`y-${v}`}
          position={[half + 0.3, -0.7, ((v / 100) - 0.5) * SURFACE_SIZE]}
          fontSize={0.13}
          color="#64748b"
          anchorX="center"
          rotation={[0, -Math.PI / 2, 0]}
          font={undefined}
        >
          {v.toString()}
        </Text>
      ))}
      {[-30, -15, 0, 15, 30].map((v) => (
        <Text
          key={`z-${v}`}
          position={[-half - 0.3, ((v + 30) / 60) * 3 - 0.5, -half]}
          fontSize={0.13}
          color="#64748b"
          anchorX="right"
          font={undefined}
        >
          {v.toString()}
        </Text>
      ))}
    </group>
  );
}

function AxisLines() {
  const half = SURFACE_SIZE / 2;
  const bottom = -0.5;
  return (
    <group>
      {/* X axis */}
      <Line points={[[-half, bottom, half], [half, bottom, half]]} color="#475569" lineWidth={1} />
      {/* Z axis (vol) */}
      <Line points={[[half, bottom, -half], [half, bottom, half]]} color="#475569" lineWidth={1} />
      {/* Y axis (pnl) */}
      <Line points={[[-half, bottom, -half], [-half, 2.5, -half]]} color="#475569" lineWidth={1} />
    </group>
  );
}

// Color bar legend as HTML overlay
function ColorBarLegend() {
  const stops = Array.from({ length: 20 }, (_, i) => {
    const t = i / 19;
    const [r, g, b] = viridisColor(t);
    return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
  });
  const gradient = `linear-gradient(to top, ${stops.join(", ")})`;

  return (
    <div className="absolute right-3 top-8 bottom-8 flex flex-col items-center gap-1 z-10">
      <span className="text-[9px] font-mono text-muted-foreground">PnL %</span>
      <div
        className="w-3 flex-1 rounded-sm border border-border/30"
        style={{ background: gradient }}
      />
      <div className="flex flex-col justify-between h-full absolute right-5 top-5 bottom-1">
        {[30, 15, 0, -15, -30].map((v) => (
          <span key={v} className="text-[8px] font-mono text-muted-foreground leading-none">
            {v > 0 ? `+${v}` : v}
          </span>
        ))}
      </div>
    </div>
  );
}

const ProfitHeatmap3D = ({ data }: Props) => {
  if (data.length === 0) {
    return (
      <div className="h-[380px] rounded-xl border border-border bg-card flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Cross trades to populate the 3D profit surface</p>
      </div>
    );
  }

  return (
    <div className="h-[380px] rounded-xl border border-border bg-[hsl(222,20%,6%)] overflow-hidden relative">
      <Canvas camera={{ position: [5, 4, 5], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={0.7} />
        <directionalLight position={[-3, 4, -3]} intensity={0.3} color="#6366f1" />

        <Surface data={data} />
        <Wireframe data={data} />
        <AxisLines />
        <AxisLabels />

        <OrbitControls
          enableZoom
          enablePan={false}
          minDistance={4}
          maxDistance={12}
          autoRotate
          autoRotateSpeed={0.3}
        />
      </Canvas>

      <ColorBarLegend />

      <div className="absolute top-2 left-2 z-10">
        <span className="text-[9px] font-mono text-muted-foreground/70 bg-background/30 px-1.5 py-0.5 rounded">
          PROFIT SURFACE · DRAG TO ROTATE
        </span>
      </div>
    </div>
  );
};

export default ProfitHeatmap3D;
