import { useRef, useMemo, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import * as THREE from "three";

interface SurfaceProps {
  data: { momentum: number; vol: number; pnl: number }[];
}

// Generate a smooth surface mesh from sparse data points
function generateSurfaceGrid(data: SurfaceProps["data"], res: number = 24) {
  const heights = new Float32Array(res * res);
  const colors = new Float32Array(res * res * 3);

  // Fill grid using inverse-distance weighting from data points
  for (let iy = 0; iy < res; iy++) {
    for (let ix = 0; ix < res; ix++) {
      const nx = (ix / (res - 1)) * 2 - 1; // -1 to 1 → momentum
      const ny = (iy / (res - 1)) * 2 - 1; // -1 to 1 → vol

      let weightedSum = 0;
      let totalWeight = 0;

      for (const d of data) {
        const dm = d.momentum / 100; // normalize to -1..1
        const dv = (d.vol - 25) / 25; // normalize ~0-50 to -1..1
        const dist = Math.sqrt((nx - dm) ** 2 + (ny - dv) ** 2) + 0.05;
        const w = 1 / (dist * dist);
        weightedSum += d.pnl * w;
        totalWeight += w;
      }

      const pnl = totalWeight > 0 ? weightedSum / totalWeight : 0;
      heights[iy * res + ix] = pnl;

      // Color: blue-green-yellow gradient based on pnl
      const t = Math.max(0, Math.min(1, (pnl + 10) / 20)); // map -10..+10 to 0..1
      // Viridis-like: dark purple → teal → yellow
      colors[(iy * res + ix) * 3 + 0] = 0.27 + t * 0.73; // R
      colors[(iy * res + ix) * 3 + 1] = 0.0 + t * 0.85;  // G
      colors[(iy * res + ix) * 3 + 2] = 0.33 + (1 - t) * 0.2 - t * 0.15; // B
    }
  }

  return { heights, colors, res };
}

function SurfaceMesh({ data }: SurfaceProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const { geometry } = useMemo(() => {
    const paddedData = data.length === 0
      ? [
          { momentum: -50, vol: 10, pnl: 0 },
          { momentum: 50, vol: 10, pnl: 0 },
          { momentum: 0, vol: 40, pnl: 0 },
          { momentum: -50, vol: 40, pnl: 0 },
        ]
      : data;

    const { heights, colors, res } = generateSurfaceGrid(paddedData);
    const geo = new THREE.PlaneGeometry(4, 4, res - 1, res - 1);
    const pos = geo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const ix = i % res;
      const iy = Math.floor(i / res);
      pos.setZ(i, heights[iy * res + ix] * 0.15); // scale height
    }

    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return { geometry: geo };
  }, [data]);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += delta * 0.03;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 3, 0, Math.PI / 6]} position={[0, -0.3, 0]}>
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} flatShading={false} metalness={0.1} roughness={0.6} />
    </mesh>
  );
}

function AxisLabels() {
  return (
    <>
      <Text position={[-2.5, -1.8, 0]} fontSize={0.18} color="#94a3b8" anchorX="center">
        Momentum
      </Text>
      <Text position={[2.5, -1.8, 0]} fontSize={0.18} color="#94a3b8" anchorX="center">
        Volatility
      </Text>
      <Text position={[0, 1.8, 0]} fontSize={0.18} color="#94a3b8" anchorX="center">
        PnL Density
      </Text>
    </>
  );
}

export default function ProfitSurface3D({ data }: SurfaceProps) {
  return (
    <div className="w-full h-[280px] rounded-lg overflow-hidden bg-background/50 border border-border/30">
      <Canvas camera={{ position: [3, 2.5, 3], fov: 50 }} dpr={[1, 2]}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={0.8} />
        <directionalLight position={[-3, -2, -4]} intensity={0.3} />
        <SurfaceMesh data={data} />
        <AxisLabels />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.5} minPolarAngle={Math.PI / 6} maxPolarAngle={Math.PI / 2.5} />
      </Canvas>
      {/* Color Legend */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-background/80 backdrop-blur-sm rounded px-2 py-1 border border-border/30">
        <span className="text-[8px] font-mono text-muted-foreground">Loss</span>
        <div className="w-20 h-2 rounded-sm" style={{ background: "linear-gradient(to right, #44236e, #218380, #e8e847)" }} />
        <span className="text-[8px] font-mono text-muted-foreground">Profit</span>
      </div>
    </div>
  );
}
