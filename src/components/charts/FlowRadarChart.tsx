import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";

interface FlowSignal {
  name: string;
  intensity: number;
  impact: number;
}

interface Props {
  signals: FlowSignal[];
}

const FlowRadarChart = ({ signals }: Props) => {
  if (signals.length === 0) return null;

  const data = signals.map(s => ({
    name: s.name.length > 12 ? s.name.slice(0, 12) + "…" : s.name,
    intensity: s.intensity,
    impact: s.impact,
  }));

  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.5} />
          <PolarAngleAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
          <Radar dataKey="intensity" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={1.5} />
          <Radar dataKey="impact" stroke="hsl(var(--loss))" fill="hsl(var(--loss))" fillOpacity={0.1} strokeWidth={1} strokeDasharray="4 2" />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default FlowRadarChart;
