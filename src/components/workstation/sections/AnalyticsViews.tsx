import type { SectionDef, WorkspaceDef } from "../registry";
import { useEvidence } from "../EvidenceContext";
import { MetricGrid, MetricStat } from "../Metric";
import SectionShell from "./SectionShell";
import { Block, PendingEvidence } from "./blocks";
import {
  computeCapitalStructure,
  computeCashCascade,
  computeDuPont,
  computeHealthScore,
  computeRiskDecomposition,
  type CapitalStructure,
} from "@/lib/evidence/analytics";

/* ── shared institutional primitives ───────────────────────────── */

const B = (v: number | null | undefined): string =>
  v == null ? "—" : `${(v / 1e9).toLocaleString(undefined, { maximumFractionDigits: 1 })}B`;

/** A factor in a multiplicative decomposition (DuPont), joined by ×. */
const FactorChain = ({
  result,
  resultLabel,
  factors,
}: {
  result: string;
  resultLabel: string;
  factors: { label: string; value: string; read: string }[];
}) => (
  <div>
    <div className="flex flex-wrap items-stretch gap-2">
      <div className="flex min-w-[92px] flex-col justify-center rounded-sm border border-foreground/25 bg-surface-2 px-3 py-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">{resultLabel}</span>
        <span className="mt-0.5 font-mono text-[19px] font-semibold tabular-nums text-foreground">{result}</span>
      </div>
      <div className="flex items-center font-mono text-[15px] text-muted-foreground/50">=</div>
      {factors.map((f, i) => (
        <div key={f.label} className="flex items-stretch gap-2">
          {i > 0 && <div className="flex items-center font-mono text-[15px] text-muted-foreground/50">×</div>}
          <div className="flex min-w-[104px] flex-1 flex-col rounded-sm border border-border/70 bg-card px-3 py-2">
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">{f.label}</span>
            <span className="mt-0.5 font-mono text-[16px] font-semibold tabular-nums text-foreground">{f.value}</span>
            <span className="mt-1 text-[10.5px] leading-snug text-muted-foreground">{f.read}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** Horizontal magnitude bar for a labeled value against a max. */
const MagnitudeBar = ({
  label,
  value,
  display,
  max,
  tone,
  detail,
}: {
  label: string;
  value: number;
  display: string;
  max: number;
  tone: "fg" | "gain" | "loss" | "neutral";
  detail?: string;
}) => {
  const pct = max > 0 ? Math.min(100, (Math.abs(value) / max) * 100) : 0;
  const bar = tone === "gain" ? "bg-gain/70" : tone === "loss" ? "bg-loss/70" : tone === "neutral" ? "bg-muted-foreground/50" : "bg-foreground/60";
  return (
    <div className="flex items-center gap-3 py-[3px]">
      <span className="w-36 shrink-0 truncate text-[12px] tracking-tight text-foreground">{label}</span>
      <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-[1px] bg-surface-3">
        <span className={`ws-grow-x absolute inset-y-0 left-0 origin-left rounded-[1px] ${bar}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-[11.5px] font-semibold tabular-nums text-foreground">{display}</span>
      {detail && <span className="hidden w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground sm:inline">{detail}</span>}
    </div>
  );
};

/* ── Profitability — DuPont decomposition ──────────────────────── */

export const ProfitabilityView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data } = useEvidence();
  const metrics = sectionMetrics(`${workspace.id}/${section.id}`);
  const dupont = computeDuPont(data.financials, data.analysis);

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {dupont ? (
        <Block title="DuPont decomposition of return on equity">
          <FactorChain
            resultLabel="ROE"
            result={`${dupont.roe}%`}
            factors={dupont.factors.map((f) => ({
              label: f.label,
              value: f.unit === "%" ? `${f.value}%` : `${f.value}×`,
              read: f.read,
            }))}
          />
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground/60">
            {dupont.identity} · {dupont.source}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            The decomposition separates <span className="text-foreground">operating quality</span> (margin), <span className="text-foreground">capital efficiency</span> (turnover) and <span className="text-foreground">financial leverage</span> — a headline ROE flatters when the last term is carrying it.
          </p>
        </Block>
      ) : (
        <PendingEvidence section={section} note="The DuPont decomposition computes once net margin, asset turnover and leverage are available from the statement pipeline." />
      )}
      {metrics.length > 0 && (
        <MetricGrid>
          {metrics.slice(0, 9).map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </MetricGrid>
      )}
    </SectionShell>
  );
};

/* ── Financial Health — computed distress scorecard ────────────── */

export const HealthView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data } = useEvidence();
  const metrics = sectionMetrics(`${workspace.id}/${section.id}`);
  const health = computeHealthScore(data.financials, data.analysis);

  const bandTone =
    health?.band === "Fortress" || health?.band === "Sound" ? "text-gain" : health?.band === "Watch" ? "text-warning" : "text-loss";

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {health ? (
        <Block title="Solvency scorecard">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className={`font-mono text-[26px] font-semibold tabular-nums leading-none ${bandTone}`}>
                {health.score}
                <span className="text-[15px] text-muted-foreground/60">/{health.max}</span>
              </span>
              <span className={`mt-1 text-[13px] font-semibold tracking-tight ${bandTone}`}>{health.band}</span>
            </div>
            <div className="flex-1">
              <div className="flex gap-1">
                {Array.from({ length: health.max }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-6 flex-1 rounded-[1px] ${i < health.score ? (health.band === "Strained" ? "bg-loss/60" : health.band === "Watch" ? "bg-warning/60" : "bg-gain/60") : "bg-surface-3"}`}
                  />
                ))}
              </div>
              <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
                {health.score} of {health.max} solvency checks passed · {health.source}
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-0.5 border-t border-border/60 pt-2">
            {health.checks.map((c) => (
              <div key={c.id} className="flex items-baseline gap-2.5 py-1 text-[12px]">
                <span className={`shrink-0 font-mono text-[11px] ${c.pass ? "text-gain" : "text-loss"}`}>{c.pass ? "✓" : "✕"}</span>
                <span className="min-w-0 flex-1 tracking-tight text-foreground">{c.label}</span>
                <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">{c.detail}</span>
              </div>
            ))}
          </div>
        </Block>
      ) : (
        <PendingEvidence section={section} note="The solvency scorecard computes its checks once profitability, cash and liquidity figures load." />
      )}
      {metrics.length > 0 && (
        <MetricGrid>
          {metrics.slice(0, 6).map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </MetricGrid>
      )}
    </SectionShell>
  );
};

/* ── Cash Generation — conversion cascade ──────────────────────── */

export const CashGenerationView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data } = useEvidence();
  const metrics = sectionMetrics(`${workspace.id}/${section.id}`);
  const cascade = computeCashCascade(data.financials);
  const max = cascade ? Math.max(...cascade.map((s) => Math.abs(s.value))) : 0;

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {cascade ? (
        <Block title="Cash conversion cascade">
          <div className="space-y-1">
            {cascade.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-[12px] tracking-tight text-foreground">{s.label}</span>
                <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-[1px] bg-surface-3">
                  <span
                    className={`ws-grow-x absolute inset-y-0 left-0 origin-left rounded-[1px] ${s.tone === "gain" ? "bg-gain/60" : s.tone === "loss" ? "bg-loss/50" : "bg-foreground/50"}`}
                    style={{ width: `${max > 0 ? (Math.abs(s.value) / max) * 100 : 0}%` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-[11.5px] font-semibold tabular-nums text-foreground">{B(s.value)}</span>
                <span className={`w-14 shrink-0 text-right font-mono text-[10.5px] tabular-nums ${s.conversionPct == null ? "text-muted-foreground/50" : s.conversionPct >= 80 ? "text-gain" : s.conversionPct >= 50 ? "text-muted-foreground" : "text-loss"}`}>
                  {s.conversionPct == null ? "—" : `${s.conversionPct}%`}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
            right column: conversion vs the prior line · reported
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            The cascade traces every dollar of revenue down to cash returned to holders. The step where conversion
            collapses is where the business model's real cost lives — and everything returned is paid from the bottom line, not the top.
          </p>
        </Block>
      ) : (
        <PendingEvidence section={section} note="The conversion cascade renders once the cash-flow statement loads from the pipeline." />
      )}
      {metrics.length > 0 && (
        <MetricGrid>
          {metrics.slice(0, 6).map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </MetricGrid>
      )}
    </SectionShell>
  );
};

/* ── Risk Analysis — factor decomposition ──────────────────────── */

export const RiskAnalysisView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data } = useEvidence();
  const metrics = sectionMetrics(`${workspace.id}/${section.id}`);
  const decomp = computeRiskDecomposition(data.analysis);

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {decomp ? (
        <Block title="Composite risk decomposition">
          <div className="flex items-baseline gap-2">
            <span className={`font-mono text-[24px] font-semibold tabular-nums ${decomp.composite >= 65 ? "text-loss" : decomp.composite >= 45 ? "text-warning" : "text-gain"}`}>
              {decomp.composite}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground/60">composite / 100</span>
          </div>
          <div className="mt-2.5 space-y-0.5">
            {decomp.factors.map((f) => (
              <MagnitudeBar
                key={f.id}
                label={f.label}
                value={f.value}
                display={`${f.value}`}
                max={100}
                tone={f.tone}
                detail={`${f.share}%`}
              />
            ))}
          </div>
          <p className="mt-2.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
            right column: share of total risk · engine-decomposed
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
            The bar that dominates is the risk to hedge first. A high composite driven by volatility is sized
            around; one driven by balance sheet or regulation is structural and cannot be diversified away within the name.
          </p>
        </Block>
      ) : (
        <PendingEvidence section={section} />
      )}
      {metrics.length > 0 && (
        <MetricGrid>
          {metrics.slice(0, 6).map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </MetricGrid>
      )}
    </SectionShell>
  );
};

/* ── Balance Sheet — computed capital structure (never blank) ───── */

const StructureBar = ({ s }: { s: CapitalStructure }) => {
  const equity = s.bookEquity ?? 0;
  const debt = s.totalDebt ?? 0;
  const total = equity + debt;
  if (total <= 0) return null;
  const eqPct = (equity / total) * 100;
  const debtPct = (debt / total) * 100;
  return (
    <div>
      <div className="flex h-8 w-full overflow-hidden rounded-sm border border-border/70">
        <span className="flex items-center justify-center bg-gain/25 font-mono text-[10px] tabular-nums text-foreground" style={{ width: `${eqPct}%` }}>
          {eqPct >= 12 ? `${Math.round(eqPct)}%` : ""}
        </span>
        <span className="flex items-center justify-center bg-loss/25 font-mono text-[10px] tabular-nums text-foreground" style={{ width: `${debtPct}%` }}>
          {debtPct >= 12 ? `${Math.round(debtPct)}%` : ""}
        </span>
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.08em]">
        <span className="text-gain">Equity {B(s.bookEquity)}</span>
        <span className="text-loss">Debt {B(s.totalDebt)}</span>
      </div>
    </div>
  );
};

export const CapitalStructureView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data } = useEvidence();
  const metrics = sectionMetrics(`${workspace.id}/${section.id}`);
  const s = computeCapitalStructure(data.financials, data.analysis);

  const balRows = (data.financials?.balance ?? []).filter((r) => r.totalAssets != null);

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {s ? (
        <Block title="Capital structure">
          <StructureBar s={s} />
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            {[
              { l: "Market equity", v: B(s.marketEquity) },
              { l: "Book equity", v: B(s.bookEquity) },
              { l: "Total debt", v: B(s.totalDebt) },
              { l: "Cash", v: s.cash != null ? B(s.cash) : "—" },
              { l: "Net debt", v: B(s.netDebt) },
              { l: "Net debt / EBITDA", v: s.netDebtToEbitda != null ? `${s.netDebtToEbitda}×` : "—" },
            ].map((x) => (
              <div key={x.l} className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1">
                <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/70">{x.l}</span>
                <span className="font-mono text-[12px] font-semibold tabular-nums text-foreground">{x.v}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">{s.note}</p>
        </Block>
      ) : (
        <PendingEvidence section={section} note="Capital structure computes from market cap, price-to-book and leverage the moment the analysis feed lands." />
      )}

      {balRows.length > 0 && (
        <Block title="Balance sheet · annual">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-3 text-left font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Line item</th>
                  {balRows.map((r) => (
                    <th key={r.period} className="py-1.5 pl-3 text-right font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      {r.period ?? "FY"}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { l: "Total assets", k: "totalAssets" as const },
                  { l: "Cash & equivalents", k: "cash" as const },
                  { l: "Current assets", k: "currentAssets" as const },
                  { l: "Current liabilities", k: "currentLiabilities" as const },
                  { l: "Long-term debt", k: "longTermDebt" as const },
                  { l: "Shareholder equity", k: "equity" as const },
                ].map((line) => (
                  <tr key={line.k} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-medium text-foreground">{line.l}</td>
                    {balRows.map((r) => (
                      <td key={r.period} className="py-1.5 pl-3 text-right font-mono tabular-nums text-foreground">
                        {B(r[line.k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      )}

      {metrics.length > 0 && (
        <MetricGrid>
          {metrics.slice(0, 6).map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </MetricGrid>
      )}
    </SectionShell>
  );
};
