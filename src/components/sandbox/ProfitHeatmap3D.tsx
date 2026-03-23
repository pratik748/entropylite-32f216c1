import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
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

const regimeColor: Record<string, string> = {
  trending: "#22c55e",
  volatile: "#ef4444",
  range: "#3b82f6",
  crisis: "#f59e0b",
  unknown: "#8b5cf6",
};

function DataPoint({ point, index }: { point: HeatmapPoint; index: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = regimeColor[point.regime] || regimeColor.unknown;
  const size = Math.max(0.08, Math.min(0.3, Math.abs(point.z) * 0.02 + 0.08));

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.position.y = (point.z / 30) * 2 + Math.sin(clock.elapsedTime * 0.5 + index * 0.3) * 0.02;
    }
  });

  return (
    <mesh
      ref={meshRef}
      position={[point.x / 50, (point.z / 30) * 2, point.y / 50]}
    >
      <sphereGeometry args={[size, 12, 12]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={point.z > 0 ? 0.4 : 0.1}
        transparent
        opacity={0.85}
      />
    </mesh>
  );
}

function GridFloor() {
  return (
    <group position={[0, -2.2, 0]}>
      <gridHelper args={[6, 12, "#334155", "#1e293b"]} />
      {/* Axis labels */}
      <Text position={[3.5, 0.1, 0]} fontSize={0.18} color="#64748b" anchorX="center">
        MOMENTUM →
      </Text>
      <Text position={[0, 0.1, 3.5]} fontSize={0.18} color="#64748b" anchorX="center" rotation={[0, -Math.PI / 2, 0]}>
        VOLATILITY →
      </Text>
      <Text position={[-3.5, 1, 0]} fontSize={0.18} color="#64748b" anchorX="center" rotation={[0, 0, Math.PI / 2]}>
        PnL % →
      </Text>
    </group>
  );
}

function ProfitPlane({ data }: { data: HeatmapPoint[] }) {
  const geometry = useMemo(() => {
    // Create a profit surface from data
    const size = 6;
    const segments = 20;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      // Find nearest data points and interpolate
      let totalW = 0, totalPnl = 0;
      for (const d of data) {
        const dx = px - d.x / 50;
        const dz = pz - d.y / 50;
        const dist = Math.sqrt(dx * dx + dz * dz) + 0.1;
        const w = 1 / (dist * dist);
        totalW += w;
        totalPnl += w * d.z;
      }
      const interpolated = data.length > 0 ? (totalPnl / totalW) / 30 * 0.5 : 0;
      pos.setY(i, interpolated - 2);
      
      // Color based on pnl
      const t = (interpolated + 0.5);
      colors[i * 3] = t < 0.5 ? 0.9 : 0.1 + t * 0.3;
      colors[i * 3 + 1] = t > 0.3 ? 0.3 + t * 0.5 : 0.1;
      colors[i * 3 + 2] = t < 0.3 ? 0.4 : 0.1;
    }
    
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [data]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.8, 0]}>
      <meshStandardMaterial
        vertexColors
        transparent
        opacity={0.35}
        wireframe={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

const ProfitHeatmap3D = ({ data }: Props) => {
  if (data.length === 0) {
    return (
      <div className="h-[320px] rounded-xl border border-border bg-card flex items-center justify-center">
        <p className="text-xs text-muted-foreground">Cross trades to populate the 3D profit field</p>
      </div>
    );
  }

  return (
    <div className="h-[320px] rounded-xl border border-border bg-[hsl(222,20%,6%)] overflow-hidden relative">
      <Canvas camera={{ position: [4, 3, 4], fov: 50 }}>
        <ambientLight intensity={0.4} />
        <pointLight position={[5, 5, 5]} intensity={0.8} />
        <pointLight position={[-5, 3, -5]} intensity={0.3} color="#3b82f6" />
        
        <GridFloor />
        <ProfitPlane data={data} />
        
        {data.map((point, i) => (
          <DataPoint key={i} point={point} index={i} />
        ))}
        
        <OrbitControls
          enableZoom={true}
          enablePan={false}
          minDistance={3}
          maxDistance={10}
          autoRotate
          autoRotateSpeed={0.5}
        />
      </Canvas>
      
      {/* Legend overlay */}
      <div className="absolute bottom-2 left-2 flex gap-2 z-10">
        {Object.entries(regimeColor).filter(([k]) => k !== "unknown").map(([regime, color]) => (
          <div key={regime} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[8px] font-mono text-muted-foreground uppercase">{regime}</span>
          </div>
        ))}
      </div>
      <div className="absolute top-2 right-2 z-10">
        <span className="text-[8px] font-mono text-muted-foreground/60">DRAG TO ROTATE · SCROLL TO ZOOM</span>
      </div>
    </div>
  );
};

export default ProfitHeatmap3D;
