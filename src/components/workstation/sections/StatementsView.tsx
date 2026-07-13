import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SectionDef, WorkspaceDef } from "../registry";
import { useEvidence } from "../EvidenceContext";
import { MetricGrid, MetricStat } from "../Metric";
import SectionShell from "./SectionShell";
import { Block, PendingEvidence } from "./blocks";
import type { Financials } from "@/lib/evidence/inputs";

/**
 * Financial statements — real multi-year tables from the deterministic
 * statement pipeline with YoY deltas, an institutional read per line, and
 * a gradient-filled chart of the statement's defining series. W2 delivered.
 */

const fmtB = (v: number | null | undefined): string =>
  v == null ? "—" : `${(v / 1e9).toLocaleString(undefined, { maximumFractionDigits: 1 })}B`;

const yoy = (curr: number | null | undefined, prev: number | null | undefined): number | null =>
  curr != null && prev != null && prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : null;

const DeltaCell = ({ v }: { v: number | null }) =>
  v == null ? (
    <span className="text-muted-foreground/50">—</span>
  ) : (
    <span className={`font-mono tabular-nums ${v >= 0 ? "text-gain" : "text-loss"}`}>
      {v >= 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );

interface LineDef {
  label: string;
  value: (i: number) => number | null | undefined;
  read: (latest: number | null, delta: number | null) => string;
}

const StatementTable = ({
  periods,
  lines,
  count,
}: {
  periods: string[];
  lines: LineDef[];
  count: number;
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-[12px]">
      <thead>
        <tr className="border-b border-border">
          <th className="py-1.5 pr-3 text-left font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Line item
          </th>
          {periods.map((p) => (
            <th key={p} className="py-1.5 pl-3 text-right font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {p}
            </th>
          ))}
          <th className="py-1.5 pl-3 text-right font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Δ YoY
          </th>
          <th className="hidden py-1.5 pl-4 text-left font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground lg:table-cell">
            Read
          </th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const latest = line.value(0) ?? null;
          const delta = yoy(line.value(0), line.value(1));
          return (
            <tr key={line.label} className="border-b border-border/50">
              <td className="py-1.5 pr-3 font-medium text-foreground">{line.label}</td>
              {Array.from({ length: count }).map((_, i) => (
                <td key={i} className="py-1.5 pl-3 text-right font-mono tabular-nums text-foreground">
                  {fmtB(line.value(i))}
                </td>
              ))}
              <td className="py-1.5 pl-3 text-right text-[11px]">
                <DeltaCell v={delta} />
              </td>
              <td className="hidden max-w-[300px] py-1.5 pl-4 text-[11px] leading-snug text-muted-foreground lg:table-cell">
                {line.read(latest, delta)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const chartTheme = {
  tick: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
  tooltip: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 6,
    fontSize: 11,
    color: "hsl(var(--foreground))",
  },
};

const StatementChart = ({
  data,
  series,
}: {
  data: Record<string, string | number | null>[];
  series: { key: string; label: string; tone: "fg" | "gain" | "loss" }[];
}) => (
  <div className="h-52">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
        <defs>
          <linearGradient id="ws-bar-fg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity={0.75} />
            <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity={0.25} />
          </linearGradient>
          <linearGradient id="ws-bar-gain" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--gain))" stopOpacity={0.8} />
            <stop offset="100%" stopColor="hsl(var(--gain))" stopOpacity={0.25} />
          </linearGradient>
          <linearGradient id="ws-bar-loss" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--loss))" stopOpacity={0.8} />
            <stop offset="100%" stopColor="hsl(var(--loss))" stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
        <XAxis dataKey="period" tick={chartTheme.tick} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
        <YAxis tick={chartTheme.tick} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => `${v}B`} />
        <Tooltip
          contentStyle={chartTheme.tooltip}
          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          cursor={{ fill: "hsl(var(--muted-foreground))", fillOpacity: 0.06 }}
          formatter={(v: number, name: string) => [`${Number(v).toFixed(1)}B`, series.find((s) => s.key === name)?.label ?? name]}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            fill={`url(#ws-bar-${s.tone})`}
            stroke={`hsl(var(--${s.tone === "fg" ? "foreground" : s.tone}))`}
            strokeOpacity={0.35}
            strokeWidth={1}
            radius={[2, 2, 0, 0]}
            animationDuration={650}
            animationBegin={i * 120}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  </div>
);

const Legend = ({ series }: { series: { label: string; tone: "fg" | "gain" | "loss" }[] }) => (
  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
    {series.map((s) => (
      <span key={s.label} className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
        <span
          className={`h-1.5 w-3 rounded-[1px] ${s.tone === "gain" ? "bg-gain/70" : s.tone === "loss" ? "bg-loss/70" : "bg-foreground/60"}`}
        />
        {s.label}
      </span>
    ))}
  </div>
);

/* ── the view ─────────────────────────────────────────────────── */

const StatementsView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data } = useEvidence();
  const key = `${workspace.id}/${section.id}`;
  const metrics = sectionMetrics(key);
  const f = data.financials;

  const content = useMemo(() => (f ? renderStatement(section.id, f) : null), [f, section.id]);

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {content}
      {!content &&
        (data.status.financials.state === "loading" ? (
          <div className="h-64 animate-pulse rounded-sm border border-border/50 bg-surface-2" />
        ) : (
          <Block title="Statement pipeline">
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Reported statements for this name are still syncing from the exchange-data pipeline —
              the table and chart render automatically when they land. The derived evidence below
              stays live meanwhile.
            </p>
          </Block>
        ))}
      {metrics.length > 0 ? (
        <MetricGrid>
          {metrics.slice(0, 9).map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </MetricGrid>
      ) : (
        !content && <PendingEvidence section={section} />
      )}
    </SectionShell>
  );
};

function renderStatement(sectionId: string, f: Financials) {
  if (sectionId === "income-statement") {
    const rows = (f.income ?? []).filter((r) => r.revenue != null);
    if (rows.length === 0) return null;
    const periods = rows.map((r) => r.period ?? "FY");
    const chart = [...rows].reverse().map((r) => ({
      period: r.period ?? "FY",
      revenue: r.revenue != null ? r.revenue / 1e9 : null,
      netIncome: r.netIncome != null ? r.netIncome / 1e9 : null,
    }));
    const series = [
      { key: "revenue", label: "Revenue", tone: "fg" as const },
      { key: "netIncome", label: "Net income", tone: "gain" as const },
    ];
    return (
      <>
        <Block title={`Revenue vs net income · ${f.currency ?? ""}`}>
          <StatementChart data={chart} series={series} />
          <Legend series={series} />
        </Block>
        <Block title="Income statement · annual">
          <StatementTable
            periods={periods}
            count={rows.length}
            lines={[
              {
                label: "Revenue",
                value: (i) => rows[i]?.revenue,
                read: (_, d) =>
                  d == null ? "Top line — the claim everything else is priced on." : d >= 8 ? "Genuine top-line compounding." : d >= 0 ? "Roughly flat — margins must carry the story." : "Contracting — every line below fights gravity.",
              },
              {
                label: "Gross profit",
                value: (i) => rows[i]?.grossProfit,
                read: (_, d) => (d == null ? "Pricing power before opex." : d >= 0 ? "Gross economics holding or improving." : "Input costs or pricing are eroding the moat's margin."),
              },
              {
                label: "Operating income",
                value: (i) => rows[i]?.operatingIncome,
                read: (_, d) => (d == null ? "Profit after running the business." : d >= 0 ? "Operating leverage working for holders." : "Costs growing faster than revenue."),
              },
              {
                label: "Net income",
                value: (i) => rows[i]?.netIncome,
                read: (_, d) => (d == null ? "The line the market caps." : d >= 0 ? "Bottom line advancing." : "Check whether the driver is operational or one-off."),
              },
            ]}
          />
        </Block>
      </>
    );
  }

  if (sectionId === "balance-sheet") {
    const rows = (f.balance ?? []).filter((r) => r.totalAssets != null);
    if (rows.length === 0) return null;
    const periods = rows.map((r) => r.period ?? "FY");
    const chart = [...rows].reverse().map((r) => ({
      period: r.period ?? "FY",
      assets: r.totalAssets != null ? r.totalAssets / 1e9 : null,
      liabilities: r.totalLiabilities != null ? r.totalLiabilities / 1e9 : null,
      equity: r.equity != null ? r.equity / 1e9 : null,
    }));
    const series = [
      { key: "assets", label: "Total assets", tone: "fg" as const },
      { key: "liabilities", label: "Liabilities", tone: "loss" as const },
      { key: "equity", label: "Equity", tone: "gain" as const },
    ];
    return (
      <>
        <Block title={`Balance sheet structure · ${f.currency ?? ""}`}>
          <StatementChart data={chart} series={series} />
          <Legend series={series} />
        </Block>
        <Block title="Balance sheet · annual">
          <StatementTable
            periods={periods}
            count={rows.length}
            lines={[
              { label: "Total assets", value: (i) => rows[i]?.totalAssets, read: () => "The full base the business earns on." },
              { label: "Cash & equivalents", value: (i) => rows[i]?.cash, read: (_, d) => (d == null ? "Optionality in a downturn." : d >= 0 ? "War chest building." : "Cash being deployed or consumed — see the cash-flow statement for which.") },
              { label: "Current assets", value: (i) => rows[i]?.currentAssets, read: () => "What converts to cash within the year." },
              { label: "Current liabilities", value: (i) => rows[i]?.currentLiabilities, read: () => "What falls due within the year — read against current assets." },
              { label: "Long-term debt", value: (i) => rows[i]?.longTermDebt, read: (_, d) => (d == null ? "The structural obligation." : d <= 0 ? "Deleveraging — equity claims strengthening." : "Leverage building — fine while returns exceed its cost.") },
              { label: "Shareholder equity", value: (i) => rows[i]?.equity, read: (_, d) => (d == null ? "The residual owners hold." : d >= 0 ? "Book value compounding." : "Equity shrinking — buybacks or losses; check which.") },
            ]}
          />
        </Block>
      </>
    );
  }

  if (sectionId === "cash-flow") {
    const rows = (f.cashflow ?? []).filter((r) => r.operatingCF != null);
    if (rows.length === 0) return null;
    const periods = rows.map((r) => r.period ?? "FY");
    const chart = [...rows].reverse().map((r) => ({
      period: r.period ?? "FY",
      ocf: r.operatingCF != null ? r.operatingCF / 1e9 : null,
      fcf: r.freeCF != null ? r.freeCF / 1e9 : null,
      returned: r.dividendsPaid != null || r.buybacks != null ? (Math.abs(r.dividendsPaid ?? 0) + Math.abs(r.buybacks ?? 0)) / 1e9 : null,
    }));
    const series = [
      { key: "ocf", label: "Operating CF", tone: "fg" as const },
      { key: "fcf", label: "Free cash flow", tone: "gain" as const },
      { key: "returned", label: "Returned to holders", tone: "loss" as const },
    ];
    return (
      <>
        <Block title={`Cash generation vs distribution · ${f.currency ?? ""}`}>
          <StatementChart data={chart} series={series} />
          <Legend series={series} />
        </Block>
        <Block title="Cash flow statement · annual">
          <StatementTable
            periods={periods}
            count={rows.length}
            lines={[
              { label: "Operating cash flow", value: (i) => rows[i]?.operatingCF, read: (_, d) => (d == null ? "Cash the operations actually produce." : d >= 0 ? "The cash engine is strengthening." : "Operating cash weakening ahead of earnings — the early warning.") },
              { label: "Capital expenditure", value: (i) => (rows[i]?.capex != null ? Math.abs(rows[i]!.capex!) : null), read: () => "Reinvestment required to sustain and grow the machine." },
              { label: "Free cash flow", value: (i) => rows[i]?.freeCF, read: (_, d) => (d == null ? "What's left for holders after reinvestment." : d >= 0 ? "Deployable cash growing." : "Free cash compressing — capex or working capital is absorbing it.") },
              { label: "Dividends paid", value: (i) => (rows[i]?.dividendsPaid != null ? Math.abs(rows[i]!.dividendsPaid!) : null), read: () => "The contractual-feeling commitment — cut only in distress." },
              { label: "Buybacks", value: (i) => (rows[i]?.buybacks != null ? Math.abs(rows[i]!.buybacks!) : null), read: () => "The flexible return lever — and a read on management's own valuation view." },
            ]}
          />
        </Block>
      </>
    );
  }

  return null;
}

export default StatementsView;
