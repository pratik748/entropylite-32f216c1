import { useMemo } from "react";
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SectionDef, WorkspaceDef } from "../registry";
import { useEvidence } from "../EvidenceContext";
import { MetricStat } from "../Metric";
import { sma } from "@/lib/evidence/compute";
import SectionShell from "./SectionShell";
import { Block, PendingEvidence } from "./blocks";

/**
 * Technical structure — the 2y price path with its trend anchors and the
 * engine's support/resistance, plus the structure evidence nodes. Chart
 * colors come from CSS tokens so both themes render correctly.
 */
const TechnicalView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data, graph } = useEvidence();
  const metrics = sectionMetrics(`${workspace.id}/${section.id}`);
  const bars = data.bars;

  const series = useMemo(() => {
    if (!bars || bars.closes.length < 40) return [];
    const out: { t: string; price: number; sma50: number | null }[] = [];
    const step = Math.max(1, Math.floor(bars.closes.length / 160));
    for (let i = 0; i < bars.closes.length; i += step) {
      const ts = bars.timestamps[i] ? new Date(bars.timestamps[i] * 1000) : null;
      out.push({
        t: ts ? `${ts.toLocaleString("en", { month: "short" })} ’${String(ts.getFullYear()).slice(2)}` : "",
        price: bars.closes[i],
        sma50: i >= 50 ? sma(bars.closes.slice(0, i + 1), 50) : null,
      });
    }
    return out;
  }, [bars]);

  const support = data.analysis?.technicals?.support ?? null;
  const resistance = data.analysis?.technicals?.resistance ?? null;

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {series.length > 0 ? (
        <Block title={`Price structure · 2y · ${graph.currency}`}>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="ws-price-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  minTickGap={48}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 11,
                    color: "hsl(var(--foreground))",
                  }}
                  labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                  formatter={(value: number, name: string) => [
                    value?.toLocaleString(undefined, { maximumFractionDigits: 2 }),
                    name === "price" ? "Price" : "50-DMA",
                  ]}
                />
                {support != null && (
                  <ReferenceLine
                    y={support}
                    stroke="hsl(var(--loss))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    label={{ value: "support", position: "insideBottomRight", fontSize: 9, fill: "hsl(var(--loss))" }}
                  />
                )}
                {resistance != null && (
                  <ReferenceLine
                    y={resistance}
                    stroke="hsl(var(--gain))"
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    label={{ value: "resistance", position: "insideTopRight", fontSize: 9, fill: "hsl(var(--gain))" }}
                  />
                )}
                <Area type="monotone" dataKey="price" stroke="hsl(var(--foreground))" strokeWidth={1.5} fill="url(#ws-price-fill)" dot={false} />
                <Area type="monotone" dataKey="sma50" stroke="hsl(var(--muted-foreground))" strokeWidth={1} strokeDasharray="3 3" fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1.5 text-[10.5px] text-muted-foreground/70">
            Solid line: daily closes. Dashed: 50-session average. Bands: the engine's support and
            resistance — the levels the risk:reward evidence is computed against.
          </p>
        </Block>
      ) : data.status.bars.state === "loading" ? (
        <div className="h-56 animate-pulse rounded-xl border border-border/50 bg-surface-2" />
      ) : (
        <Block title="Price structure">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            The price-history feed is re-syncing — the chart appears automatically when it lands. The
            structure evidence below is computed from the analysis engine and remains live.
          </p>
        </Block>
      )}

      {metrics.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {metrics.map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </div>
      ) : (
        <PendingEvidence section={section} />
      )}
    </SectionShell>
  );
};

export default TechnicalView;
