import type { SectionDef, WorkspaceDef } from "../registry";
import { useEvidence } from "../EvidenceContext";
import { MetricGrid, MetricStat } from "../Metric";
import { logNormalHorizon, CASE_HORIZON_SESSIONS, type HorizonModel } from "@/lib/evidence/synthesis";
import { lognormalEs, normalCdf, normalQuantile } from "@/lib/evidence/compute";
import { formatCurrency } from "@/lib/currency";
import SectionShell from "./SectionShell";
import { Block, PendingEvidence } from "./blocks";

/**
 * Monte Carlo section — the closed-form outcome distribution over the
 * engine's 21-session horizon. Deterministic by construction: the cone and
 * every statistic are analytic properties of the same log-normal model
 * that prices the thesis cases (GBM, σ from realized volatility, bounded
 * evidence drift). No sampled paths, so the numbers never change between
 * visits, and nothing here can disagree with the Bull/Base/Bear tab.
 */

const PERCENTILES = [5, 25, 50, 75, 95] as const;

interface ConeRow {
  p: number;
  z: number;
  /** Price at each plotted session for this percentile. */
  prices: number[];
}

function buildCone(price: number, model: HorizonModel): { rows: ConeRow[]; sessions: number[] } {
  const H = model.horizonSessions;
  const sessions = Array.from({ length: H + 1 }, (_, t) => t);
  const rows = PERCENTILES.map((p) => {
    const z = normalQuantile(p / 100);
    return {
      p,
      z,
      prices: sessions.map((t) => {
        const f = t / H;
        return price * Math.exp(model.m * f + model.sigma * Math.sqrt(f) * z);
      }),
    };
  });
  return { rows, sessions };
}

const MonteCarloView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data, graph, synthesis } = useEvidence();
  const metrics = sectionMetrics(`${workspace.id}/${section.id}`);
  const a = data.analysis;
  const price = data.quote?.price ?? a?.currentPrice ?? null;

  // The shared evidence model; if the volatility node is missing but the
  // engine bands exist, derive σ from band width so the section still
  // renders honest math (labeled as band-derived).
  let model = logNormalHorizon(graph, synthesis.pillars, price);
  let sigmaSource = "realized volatility";
  if (!model && price != null && price > 0 && Array.isArray(a?.bullRange) && Array.isArray(a?.bearRange)) {
    const annualVolPct = Math.max(5, ((a!.bullRange[1] - a!.bearRange[0]) / (2 * price)) * 100);
    const sigma = (annualVolPct / 100) * Math.sqrt(CASE_HORIZON_SESSIONS / 252);
    model = { m: -(sigma * sigma) / 2, sigma, annualVolPct, horizonSessions: CASE_HORIZON_SESSIONS };
    sigmaSource = "engine band width";
  }

  if (!model || price == null) {
    return (
      <SectionShell workspace={workspace} section={section} wide>
        {data.status.analysis.state === "loading" || data.status.bars.state === "loading" ? (
          <div className="h-56 animate-pulse rounded-sm border border-border/50 bg-surface-2" />
        ) : (
          <Block title="Outcome distribution">
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              The distribution needs a price anchor and a volatility measurement — both re-sync
              automatically. Volatility and drawdown evidence elsewhere in the Risk Lab stays live meanwhile.
            </p>
          </Block>
        )}
        {metrics.length > 0 && (
          <MetricGrid>
            {metrics.map((m) => (
              <MetricStat key={m.id} metric={m} />
            ))}
          </MetricGrid>
        )}
      </SectionShell>
    );
  }

  const { m, sigma } = model;
  const cone = buildCone(price, model);
  const currency = graph.currency;

  // Closed-form statistics of ln(S_T/S0) ~ N(m, σ²).
  const pProfit = normalCdf(m / sigma) * 100;
  const median = price * Math.exp(m);
  const var95 = (Math.exp(m + sigma * normalQuantile(0.05)) - 1) * 100;
  const cvar95 = lognormalEs(m, sigma, 0.05) * 100;
  const oneSigmaLo = price * Math.exp(m - sigma);
  const oneSigmaHi = price * Math.exp(m + sigma);

  const cases = synthesis.cases;
  const bullCase = cases.find((c) => c.id === "bull");
  const baseCase = cases.find((c) => c.id === "base");
  const bearCase = cases.find((c) => c.id === "bear");

  return (
    <SectionShell workspace={workspace} section={section} wide>
      <Block title={`Outcome distribution · ${model.horizonSessions} sessions · closed-form GBM`}>
        <ConeChart price={price} cone={cone} currency={currency} />
        <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground/70">
          Percentile cone of the log-normal terminal distribution — σ from {sigmaSource} (
          {model.annualVolPct.toFixed(1)}% annualized), drift tilted by the momentum and risk pillars,
          bounded to ±0.75σ. Analytic, not sampled: the same inputs always produce the same cone, and
          this is the exact model that prices the Bull / Base / Bear cases in the Thesis workspace.
        </p>
      </Block>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-border/60 bg-border/60 sm:grid-cols-3 lg:grid-cols-6">
        <DistStat label="P(profit)" value={`${pProfit.toFixed(0)}%`} tone={pProfit >= 50 ? "gain" : "loss"} />
        <DistStat label={`Median · ${model.horizonSessions}d`} value={formatCurrency(median, currency)} sub={`${((median / price - 1) * 100).toFixed(1)}%`} />
        <DistStat label="VaR 95%" value={`${var95.toFixed(1)}%`} tone="loss" sub="worst 1-in-20" />
        <DistStat label="CVaR 95%" value={`${cvar95.toFixed(1)}%`} tone="loss" sub="expected shortfall" />
        <DistStat label="±1σ band" value={formatCurrency(oneSigmaLo, currency)} sub={`to ${formatCurrency(oneSigmaHi, currency)}`} />
        <DistStat label="Ann. volatility" value={`${model.annualVolPct.toFixed(1)}%`} sub={sigmaSource} />
      </div>

      {bullCase && baseCase && bearCase && (
        <Block title="Case probabilities · same model">
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-border/60 bg-border/60">
            <CaseCell label="Bear" probability={bearCase.probability} target={bearCase.target} currency={currency} tone="loss" />
            <CaseCell label="Base" probability={baseCase.probability} target={baseCase.target} currency={currency} tone="muted" />
            <CaseCell label="Bull" probability={bullCase.probability} target={bullCase.target} currency={currency} tone="gain" />
          </div>
          <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground/70">
            Probability of finishing inside each engine band under the distribution above — identical
            numbers to Thesis › Bull / Base / Bear, because both read the same model.
          </p>
        </Block>
      )}

      {metrics.length > 0 && (
        <MetricGrid>
          {metrics.map((mm) => (
            <MetricStat key={mm.id} metric={mm} />
          ))}
        </MetricGrid>
      )}
      {metrics.length === 0 && !bullCase && <PendingEvidence section={section} />}
    </SectionShell>
  );
};

/* ── deterministic SVG percentile cone ─────────────────────────── */

const W = 720;
const H = 240;
const PAD = { top: 12, right: 118, bottom: 24, left: 10 };

const ConeChart = ({ price, cone, currency }: { price: number; cone: { rows: ConeRow[]; sessions: number[] }; currency: string }) => {
  const { rows, sessions } = cone;
  const all = rows.flatMap((r) => r.prices);
  const lo = Math.min(...all, price) * 0.995;
  const hi = Math.max(...all, price) * 1.005;
  const x = (t: number) => PAD.left + (t / sessions[sessions.length - 1]) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

  const line = (prices: number[]) => prices.map((v, t) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const band = (upper: number[], lower: number[]) =>
    `${upper.map((v, t) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} ${[...lower]
      .map((v, t) => [x(t), y(v)] as const)
      .reverse()
      .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`)
      .join(" ")}`;

  const byP = (p: number) => rows.find((r) => r.p === p)!.prices;
  const gridTicks = [0, 7, 14, 21];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[560px] w-full" role="img" aria-label="Percentile cone of simulated outcomes">
        {/* session gridlines */}
        {gridTicks.map((t) => (
          <g key={t}>
            <line x1={x(t)} y1={PAD.top} x2={x(t)} y2={H - PAD.bottom} stroke="hsl(var(--border))" strokeOpacity={0.5} strokeDasharray="2 3" />
            <text x={x(t)} y={H - 8} textAnchor={t === 0 ? "start" : "middle"} className="fill-muted-foreground" fontSize={9} fontFamily="ui-monospace, monospace">
              {t === 0 ? "today" : `+${t}d`}
            </text>
          </g>
        ))}

        {/* 5–95 band */}
        <polygon points={band(byP(95), byP(5))} fill="hsl(var(--foreground))" fillOpacity={0.05} />
        {/* 25–75 band */}
        <polygon points={band(byP(75), byP(25))} fill="hsl(var(--foreground))" fillOpacity={0.09} />

        {/* current price reference */}
        <line x1={PAD.left} y1={y(price)} x2={W - PAD.right} y2={y(price)} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.45} strokeDasharray="5 4" />

        {/* median path */}
        <polyline points={line(byP(50))} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.6} />

        {/* terminal labels */}
        {rows.map((r) => {
          const terminal = r.prices[r.prices.length - 1];
          return (
            <g key={r.p}>
              <text x={W - PAD.right + 8} y={y(terminal) + 3} fontSize={9.5} fontFamily="ui-monospace, monospace" className={r.p === 50 ? "fill-foreground" : "fill-muted-foreground"}>
                {`p${r.p} ${formatCurrency(terminal, currency)}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const DistStat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "gain" | "loss" }) => (
  <div className="bg-card px-3 py-2.5">
    <p className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{label}</p>
    <p className={`mt-0.5 font-mono text-[13px] font-semibold tabular-nums ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-foreground"}`}>
      {value}
    </p>
    {sub && <p className="font-mono text-[9px] text-muted-foreground/70">{sub}</p>}
  </div>
);

const CaseCell = ({ label, probability, target, currency, tone }: { label: string; probability: number; target: number | null; currency: string; tone: "gain" | "loss" | "muted" }) => (
  <div className="bg-card px-3 py-2.5">
    <p className="font-mono text-[8.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{label}</p>
    <p className={`mt-0.5 font-mono text-[15px] font-semibold tabular-nums ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-foreground"}`}>
      {probability}%
    </p>
    {target != null && <p className="font-mono text-[9px] text-muted-foreground/70">target {formatCurrency(target, currency)}</p>}
  </div>
);

export default MonteCarloView;
