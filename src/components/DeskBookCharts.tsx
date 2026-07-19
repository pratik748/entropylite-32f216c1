import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell, ComposedChart,
} from "recharts";
import type {
  GrowthPoint, RollingVolPoint, RiskWeightRow, DriftRow, LadderPoint, BetaPoint, FactorBarRow,
} from "@/lib/desk-book-charts";
import type { FanPoint, HistogramBin } from "@/lib/quant/simulation";

/**
 * The Book's chart deck — thin JSX over tested transforms in
 * src/lib/desk-book-charts.ts.
 *
 * Dataviz discipline applied throughout:
 *  - one axis per chart; multi-scale series are indexed to a common 1.0
 *    base before they share a plot;
 *  - identity in this monochrome system is lightness + line style
 *    (solid foreground vs dashed muted), with a legend and per-chart
 *    titles — never hue alone;
 *  - gain/loss is polarity, not identity: signed marks anchor to a zero
 *    baseline and tooltips carry the sign, so red-green CVD readers get
 *    position, not just hue;
 *  - thin marks (2px lines, slim bars with rounded data-ends), recessive
 *    grid, crosshair tooltips on every plot.
 */

const INK = {
  fg: "hsl(var(--foreground))",
  muted: "hsl(var(--muted-foreground))",
  faint: "hsl(var(--muted-foreground) / 0.55)",
  border: "hsl(var(--border))",
  gain: "hsl(var(--gain))",
  loss: "hsl(var(--loss))",
  warning: "hsl(var(--warning))",
};

const TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 9 } as const;
const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
  fontSize: 11,
  padding: "6px 8px",
} as const;
const CURSOR = { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "3 3" } as const;

/** Legend chip row — identity by swatch style, text in text tokens. */
export const ChartLegend = ({ items }: { items: Array<{ label: string; swatch: "solid" | "dashed" | "bar-muted" | "bar-fg" }> }) => (
  <div className="flex flex-wrap items-center gap-3 px-1 pb-1">
    {items.map((it) => (
      <span key={it.label} className="inline-flex items-center gap-1.5 font-mono text-[9px] text-muted-foreground">
        {it.swatch === "solid" && <span className="inline-block h-[2px] w-4 bg-foreground" />}
        {it.swatch === "dashed" && (
          <span className="inline-block h-[2px] w-4" style={{ backgroundImage: `repeating-linear-gradient(90deg, ${INK.muted} 0 3px, transparent 3px 5px)` }} />
        )}
        {it.swatch === "bar-muted" && <span className="inline-block h-2 w-2 rounded-[2px] bg-muted-foreground/50" />}
        {it.swatch === "bar-fg" && <span className="inline-block h-2 w-2 rounded-[2px] bg-foreground" />}
        {it.label}
      </span>
    ))}
  </div>
);

/** Growth of 1.0 — book (solid) vs benchmark (dashed), common base, one axis. */
export const GrowthChart = ({ data, benchmarkLabel }: { data: GrowthPoint[]; benchmarkLabel: string | null }) => (
  <div>
    {benchmarkLabel && (
      <ChartLegend items={[{ label: "Book", swatch: "solid" }, { label: benchmarkLabel, swatch: "dashed" }]} />
    )}
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={INK.border} strokeOpacity={0.4} vertical={false} />
          <XAxis dataKey="i" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v) => `${v}d`} minTickGap={40} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={38} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(2)} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} cursor={CURSOR}
            labelFormatter={(v) => `session ${v}`}
            formatter={(v: number, name: string) => [`${((v - 1) * 100).toFixed(1)}% (${v.toFixed(3)})`, name === "book" ? "Book" : benchmarkLabel ?? "Benchmark"]}
          />
          <ReferenceLine y={1} stroke={INK.faint} strokeDasharray="2 4" />
          {benchmarkLabel && (
            <Line dataKey="bench" stroke={INK.muted} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} isAnimationActive={false} />
          )}
          <Line dataKey="book" stroke={INK.fg} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

/** Underwater curve — drawdown ≤ 0, polarity anchored to the zero baseline. */
export const UnderwaterChart = ({ data }: { data: GrowthPoint[] }) => (
  <div className="h-36">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.border} strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="i" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v) => `${v}d`} minTickGap={40} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={38} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE} cursor={CURSOR}
          labelFormatter={(v) => `session ${v}`}
          formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, "Drawdown"]}
        />
        <ReferenceLine y={0} stroke={INK.faint} />
        <Area dataKey="drawdown" stroke={INK.loss} strokeWidth={1.5} fill={INK.loss} fillOpacity={0.12} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

/** Rolling annualized volatility, single series. */
export const RollingVolChart = ({ data }: { data: RollingVolPoint[] }) => (
  <div className="h-32">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.border} strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="i" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v) => `${v}d`} minTickGap={40} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={38} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} labelFormatter={(v) => `session ${v}`} formatter={(v: number) => [`${v.toFixed(1)}%`, "σ 60d ann."]} />
        <Line dataKey="volPct" stroke={INK.fg} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

/** Rolling VaR / CVaR — same unit (currency loss), VaR solid, CVaR dashed. */
export const RollingVarChart = ({ data, fmt }: { data: Array<{ day: string; var: number; cvar: number }>; fmt: (v: number) => string }) => (
  <div>
    <ChartLegend items={[{ label: "VaR₉₅", swatch: "solid" }, { label: "CVaR₉₅", swatch: "dashed" }]} />
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={INK.border} strokeOpacity={0.4} vertical={false} />
          <XAxis dataKey="day" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} minTickGap={50} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => fmt(v)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} formatter={(v: number, name: string) => [fmt(v), name === "var" ? "VaR₉₅ 1-day" : "CVaR₉₅ 1-day"]} />
          <Line dataKey="cvar" stroke={INK.muted} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
          <Line dataKey="var" stroke={INK.fg} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

/** Capital weight vs Euler risk contribution — the risk-parity diagnostic. */
export const RiskWeightChart = ({ rows }: { rows: RiskWeightRow[] }) => (
  <div>
    <ChartLegend items={[{ label: "Capital weight", swatch: "bar-muted" }, { label: "Risk contribution", swatch: "bar-fg" }]} />
    <div style={{ height: Math.max(96, rows.length * 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={INK.border} strokeOpacity={0.4} horizontal={false} />
          <XAxis type="number" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
          <YAxis dataKey="ticker" type="category" tick={{ ...TICK, fontSize: 10 }} axisLine={false} tickLine={false} width={62} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted-foreground) / 0.06)" }}
            formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name === "weightPct" ? "Capital weight" : "Risk contribution (σ²)"]}
          />
          <Bar dataKey="weightPct" fill={INK.muted} fillOpacity={0.45} radius={[0, 3, 3, 0]} barSize={8} isAnimationActive={false} />
          <Bar dataKey="riskPct" fill={INK.fg} radius={[0, 3, 3, 0]} barSize={8} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

/** Current vs optimizer-target weights. */
export const DriftChart = ({ rows, targetLabel }: { rows: DriftRow[]; targetLabel: string }) => (
  <div>
    <ChartLegend items={[{ label: "Held", swatch: "bar-muted" }, { label: `Target · ${targetLabel}`, swatch: "bar-fg" }]} />
    <div style={{ height: Math.max(96, rows.length * 30) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid stroke={INK.border} strokeOpacity={0.4} horizontal={false} />
          <XAxis type="number" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
          <YAxis dataKey="ticker" type="category" tick={{ ...TICK, fontSize: 10 }} axisLine={false} tickLine={false} width={62} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted-foreground) / 0.06)" }}
            formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name === "currentPct" ? "Held" : "Target"]}
          />
          <Bar dataKey="currentPct" fill={INK.muted} fillOpacity={0.45} radius={[0, 3, 3, 0]} barSize={8} isAnimationActive={false} />
          <Bar dataKey="targetPct" fill={INK.fg} radius={[0, 3, 3, 0]} barSize={8} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

/** Signed factor β bars — polarity by zero baseline + sign, not hue alone. */
export const FactorExposureChart = ({ rows }: { rows: FactorBarRow[] }) => (
  <div style={{ height: Math.max(96, rows.length * 26) }}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.border} strokeOpacity={0.4} horizontal={false} />
        <XAxis type="number" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v: number) => v.toFixed(1)} />
        <YAxis dataKey="label" type="category" tick={{ ...TICK, fontSize: 9.5 }} axisLine={false} tickLine={false} width={118} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted-foreground) / 0.06)" }}
          formatter={(v: number) => [`β ${v >= 0 ? "+" : ""}${v.toFixed(2)}`, "Portfolio exposure"]}
        />
        <ReferenceLine x={0} stroke={INK.faint} />
        <Bar dataKey="beta" radius={[0, 3, 3, 0]} barSize={9} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.label} fill={r.beta >= 0 ? INK.gain : INK.loss} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

/** Rolling 60d β with the full-sample β as a dashed reference. */
export const BetaStabilityChart = ({ points, fullBeta }: { points: BetaPoint[]; fullBeta: number | null }) => (
  <div className="h-32">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.border} strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="i" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v) => `${v}`} minTickGap={40} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={34} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(1)} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} formatter={(v: number) => [v.toFixed(2), "β 60d"]} />
        {fullBeta != null && <ReferenceLine y={fullBeta} stroke={INK.muted} strokeDasharray="4 3" />}
        <Line dataKey="beta" stroke={INK.fg} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

/** Simulation percentile fan — 5–95 and 25–75 bands + median line, one axis. */
export const SimulationFanChart = ({ fan }: { fan: FanPoint[] }) => (
  <div className="h-44">
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={fan} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.border} strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="day" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v) => `${v}d`} minTickGap={30} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={40} tickFormatter={(v: number) => `${v.toFixed(0)}%`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE} cursor={CURSOR}
          labelFormatter={(v) => `day ${v}`}
          formatter={(v: number | number[], name: string) => {
            if (Array.isArray(v)) return [`${v[0].toFixed(1)}% … ${v[1].toFixed(1)}%`, name === "band90" ? "5–95 pct" : "25–75 pct"];
            return [`${v.toFixed(1)}%`, "Median"];
          }}
        />
        <ReferenceLine y={0} stroke={INK.faint} />
        <Area name="band90" dataKey={(d: FanPoint) => [d.p5, d.p95]} stroke="none" fill={INK.muted} fillOpacity={0.12} isAnimationActive={false} />
        <Area name="band50" dataKey={(d: FanPoint) => [d.p25, d.p75]} stroke="none" fill={INK.muted} fillOpacity={0.2} isAnimationActive={false} />
        <Line dataKey="p50" stroke={INK.fg} strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  </div>
);

/** Terminal-return histogram — polarity by zero baseline, loss bins red. */
export const SimulationHistogram = ({ bins }: { bins: HistogramBin[] }) => (
  <div className="h-44">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={bins.map((b) => ({ ...b, mid: (b.x0 + b.x1) / 2 }))} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap={1}>
        <CartesianGrid stroke={INK.border} strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="mid" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v: number) => `${v.toFixed(0)}%`} minTickGap={28} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={36} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE} cursor={{ fill: "hsl(var(--muted-foreground) / 0.06)" }}
          labelFormatter={(v: number) => `${v.toFixed(1)}% terminal return`}
          formatter={(v: number) => [`${(v * 100).toFixed(1)}% of paths`, "Share"]}
        />
        <ReferenceLine x={0} stroke={INK.faint} />
        <Bar dataKey="share" isAnimationActive={false}>
          {bins.map((b, i) => (
            <Cell key={i} fill={b.x1 <= 0 ? INK.loss : b.x0 >= 0 ? INK.gain : INK.muted} fillOpacity={0.7} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>
);

/** Liquidation ladder — cumulative % of covered value exitable vs days. */
export const LiquidityLadderChart = ({ points }: { points: LadderPoint[] }) => (
  <div className="h-32">
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={INK.border} strokeOpacity={0.4} vertical={false} />
        <XAxis dataKey="day" tick={TICK} axisLine={{ stroke: INK.border }} tickLine={false} tickFormatter={(v: number) => `${v}d`} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={38} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} labelFormatter={(v) => `within ${v} trading days`} formatter={(v: number) => [`${v.toFixed(0)}%`, "Exitable"]} />
        <Area dataKey="cumPct" type="stepAfter" stroke={INK.fg} strokeWidth={2} fill={INK.fg} fillOpacity={0.08} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);
