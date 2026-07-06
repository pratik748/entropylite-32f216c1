import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useInstitutionalAnalytics } from "@/hooks/useInstitutionalAnalytics";
import { MethodologyTooltip } from "@/components/quant/MethodologyTooltip";
import { Loader2 } from "lucide-react";
import type { ExposureBucket } from "@/lib/analytics/types";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };
const PIE_COLORS = ["hsl(0,0%,90%)", "hsl(0,0%,75%)", "hsl(0,0%,60%)", "hsl(0,0%,48%)", "hsl(0,0%,36%)", "hsl(0,0%,25%)"];

const BucketBars = ({ title, buckets, fmt }: { title: string; buckets: ExposureBucket[]; fmt: (v: number) => string }) => (
  <div className="rounded-xl border border-border bg-card p-5">
    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">{title}</h3>
    <div className="space-y-2">
      {buckets.map(b => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-32 text-xs text-muted-foreground truncate">{b.label}</span>
          <div className="flex-1 h-3 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.min(b.weight * 100, 100)}%` }} />
          </div>
          <span className="font-mono text-xs text-foreground w-12 text-right">{(b.weight * 100).toFixed(1)}%</span>
          <span className="font-mono text-[10px] text-muted-foreground/60 w-16 text-right">{fmt(b.value)}</span>
        </div>
      ))}
    </div>
  </div>
);

const ExposureDashboardModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);
  const ia = useInstitutionalAnalytics(stocks);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see real exposure data.</p>
      </div>
    );
  }

  if (!ia.ready && ia.loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading history for exposure analytics…</p>
      </div>
    );
  }

  const exposure = ia.exposure;
  const conc = ia.risk?.concentration ?? null;
  const corr = ia.risk?.correlation ?? null;

  const sectorPie = (exposure?.sector ?? []).map(s => ({ name: s.label, value: +(s.weight * 100).toFixed(1) }));

  // Realized per-asset volatility vs weight — the honest "risk factor" view
  const volBars = holdings
    .map(h => {
      const stats = ia.snapshot.assetStats[h.ticker];
      return stats ? {
        name: h.ticker,
        vol: +(stats.sigmaAnnual * 100).toFixed(1),
        fill: stats.sigmaAnnual > 0.45 ? "hsl(0,90%,55%)" : stats.sigmaAnnual > 0.25 ? "hsl(38,92%,55%)" : "hsl(152,90%,45%)",
      } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.vol - a.vol);

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid gap-3 md:grid-cols-5">
        {[
          { label: "Portfolio Value", value: fmt(totalValue), sub: `${holdings.length} holdings` },
          { label: "Effective N", value: conc ? conc.effectiveN.value.toFixed(1) : "—", sub: conc ? `HHI ${(conc.hhi.value * 10000).toFixed(0)}` : "needs history" },
          { label: "Top Position", value: conc ? `${(conc.topPositionWeight.value * 100).toFixed(1)}%` : "—", sub: "single-name weight" },
          { label: "Portfolio β", value: exposure?.marketBeta ? exposure.marketBeta.value.toFixed(2) : "—", sub: exposure?.marketBeta ? `vs ${ia.benchmarkTicker}` : "no benchmark" },
          { label: "Avg Pairwise ρ", value: corr ? corr.avgPairwise.value.toFixed(2) : "—", sub: corr?.diversificationRatio ? `DR ${corr.diversificationRatio.value.toFixed(2)}` : "correlation" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-lg font-bold text-foreground">{s.value}</p>
            <p className="text-[9px] text-muted-foreground/60 mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Sector pie + realized vol */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Sector Allocation</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sectorPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={50} strokeWidth={2} stroke={CARD_BG}>
                  {sectorPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Weight"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1">
            {sectorPie.map((p, i) => (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground">{p.name}</span>
                </div>
                <span className="font-mono text-foreground">{p.value}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Realized Volatility by Position</h3>
            <MethodologyTooltip
              title="Exposure Methodology"
              methods={[
                { label: "Realized σₐ", formula: "stdev(daily log-returns) × √252", source: "1y price history per holding" },
                { label: "Style terciles", formula: "vol / trailing-return terciles of the book", source: "Realized statistics, not vendor style boxes" },
                { label: "Portfolio β", formula: "value-weighted per-asset OLS betas", source: `${ia.benchmarkTicker} daily returns` },
                { label: "Effective N", formula: "1 / Σwᵢ²", source: "Portfolio state" },
              ]}
            />
          </div>
          <div className="h-64">
            {volBars.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Needs ≥30d history per holding.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volBars} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v}%`} />
                  <YAxis dataKey="name" type="category" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} width={55} />
                  <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Ann. Vol"]} />
                  <Bar dataKey="vol" radius={[0, 4, 4, 0]}>
                    {volBars.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Currency + style exposures */}
      <div className="grid gap-5 lg:grid-cols-2">
        {exposure && <BucketBars title="Currency Exposure" buckets={exposure.currency} fmt={fmt} />}
        {exposure?.volatilityStyle && <BucketBars title="Volatility Style (Realized Terciles)" buckets={exposure.volatilityStyle} fmt={fmt} />}
        {exposure?.momentumStyle && <BucketBars title="Momentum Style (Trailing-Return Terciles)" buckets={exposure.momentumStyle} fmt={fmt} />}
        {exposure && <BucketBars title="Sector Exposure" buckets={exposure.sector} fmt={fmt} />}
      </div>
    </div>
  );
};

export default ExposureDashboardModule;
