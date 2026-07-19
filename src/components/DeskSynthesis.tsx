import { useEffect, useMemo } from "react";
import { Network, ShieldAlert, TrendingUp, TrendingDown, Minus, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useHistoricalPrices } from "@/hooks/useHistoricalPrices";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import { buildEvidenceGraph } from "@/lib/evidence/build";
import { workstationPath } from "@/components/workstation/registry";
import { synthesize, logNormalHorizon } from "@/lib/evidence/synthesis";
import { normalCdf } from "@/lib/evidence/compute";
import { formatRiskReward } from "@/lib/riskReward";
import type { DeskAnalysis } from "@/lib/evidence/inputs";
import type { Action, EvidenceMetric, BreakerState, Grade } from "@/lib/evidence/types";
import type { PortfolioStock } from "@/components/PortfolioPanel";

/**
 * The Desk's evidence synthesis — the same engine that powers the Equity
 * Workstation, rendered as one decision surface on the main analysis page.
 * Built from the analysis the Desk already holds (no duplicate fetch) plus
 * the asset's real price history, so every number here is the same one the
 * Workstation would show, traceable back to its evidence node.
 */

const ACTION_STYLE: Record<Action, { bg: string; text: string; label: string }> = {
  ACCUMULATE: { bg: "bg-gain/12 border-gain/25", text: "text-gain", label: "Accumulate" },
  HOLD: { bg: "bg-surface-2 border-border", text: "text-foreground", label: "Hold" },
  REDUCE: { bg: "bg-warning/12 border-warning/25", text: "text-warning", label: "Reduce" },
  AVOID: { bg: "bg-loss/12 border-loss/25", text: "text-loss", label: "Avoid" },
};

const GRADE_DOT: Record<Grade, string> = {
  good: "bg-gain", neutral: "bg-muted-foreground", bad: "bg-loss", unknown: "bg-muted-foreground/40",
};

const BREAKER_STYLE: Record<BreakerState, { chip: string; label: string }> = {
  intact: { chip: "bg-gain/10 text-gain border-gain/20", label: "Intact" },
  watch: { chip: "bg-warning/10 text-warning border-warning/20", label: "Watch" },
  tripped: { chip: "bg-loss/10 text-loss border-loss/20", label: "Tripped" },
};

function pillarColor(score: number): string {
  return score >= 68 ? "text-gain" : score >= 45 ? "text-foreground" : "text-loss";
}
function pillarBar(score: number): string {
  return score >= 68 ? "bg-gain" : score >= 45 ? "bg-muted-foreground" : "bg-loss";
}

interface Props {
  analysis: NonNullable<PortfolioStock["analysis"]>;
}

const DeskSynthesis = ({ analysis }: Props) => {
  const { baseCurrency, convertToBase } = useFX();
  const assetCurrency = analysis.currency || "USD";
  const sym = getCurrencySymbol(baseCurrency);
  const ticker: string = analysis.ticker;
  const price: number | null = analysis.currentPrice ?? null;

  const { prices, fetchHistorical } = useHistoricalPrices();
  useEffect(() => {
    if (ticker) fetchHistorical([ticker], "2y");
  }, [ticker, fetchHistorical]);

  const bars = prices[ticker] ?? null;

  const graph = useMemo(
    () =>
      buildEvidenceGraph({
        ticker,
        analysis: analysis as unknown as DeskAnalysis,
        bars,
        dossier: null,
        quote: price != null ? { price, currency: assetCurrency } : null,
        financials: null,
        fetchedAt: { analysis: Date.now(), bars: bars ? Date.now() : null },
      }),
    [ticker, analysis, bars, price, assetCurrency],
  );

  const synthesis = useMemo(() => synthesize(graph, analysis as unknown as DeskAnalysis, price), [graph, analysis, price]);

  const { evPct, pProfit } = useMemo(() => {
    const model = logNormalHorizon(graph, synthesis.pillars, price);
    const pp = model ? normalCdf(model.m / model.sigma) : null;
    const ev = synthesis.cases.some((c) => c.returnPct != null)
      ? synthesis.cases.reduce((s, c) => s + (c.probability / 100) * (c.returnPct ?? 0), 0)
      : null;
    return { evPct: ev, pProfit: pp };
  }, [graph, synthesis, price]);

  const fmtPrice = (v: number) => `${sym}${convertToBase(v, assetCurrency).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const fmtMetric = (m: EvidenceMetric): string => {
    if (m.value == null) return m.displayText ?? "—";
    const v = m.value;
    switch (m.format) {
      case "percent": return `${v > 0 ? "+" : ""}${v}%`;
      case "price": return fmtPrice(v);
      case "rr": return formatRiskReward(v);
      case "ratio": return v.toFixed(2);
      case "score": return `${Math.round(v)}`;
      case "signed": return `${v > 0 ? "+" : ""}${v}`;
      default: return `${v}`;
    }
  };

  const a = ACTION_STYLE[synthesis.action];
  const watchers = synthesis.breakers.filter((b) => b.state !== "intact");

  // Assembling state — never show an empty verdict.
  if (graph.coverage.total < 4) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Network className="h-4 w-4" />
          <span className="text-sm">Assembling evidence synthesis…</span>
        </div>
      </div>
    );
  }

  const net = synthesis.contributions.reduce((s, c) => s + c.scored, 0);
  const estPct = Math.round((graph.coverage.estimated / Math.max(graph.coverage.total, 1)) * 100);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card animate-slide-up">
      {/* ── Terminal header: identity · net weight · verdict · conviction ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Evidence Synthesis</h2>
          <span className="font-mono text-[10px] text-muted-foreground/70">{graph.coverage.total} nodes · {graph.coverage.sources.length} sources</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">net {net >= 0 ? "+" : ""}{net.toFixed(2)}</span>
          <span className={`rounded-sm border px-2 py-0.5 font-mono text-[12px] font-bold uppercase tracking-wide ${a.bg} ${a.text}`}>{a.label}</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{synthesis.confidence}%</span>
        </div>
      </div>

      {/* Headline */}
      <p className="border-b border-border px-4 py-2.5 text-[12.5px] leading-relaxed text-secondary-foreground">{synthesis.headline}</p>

      {/* ── Measured outcome row ── */}
      {(evPct != null || pProfit != null) && (
        <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
          <Cell label="P(profit)" value={pProfit != null ? `${Math.round(pProfit * 100)}%` : "—"} color={pProfit != null && pProfit >= 0.5 ? "text-gain" : "text-loss"} sub="GBM · 21 sessions" />
          <Cell label="E[return] Σ p·r" value={evPct != null ? `${evPct >= 0 ? "+" : ""}${evPct.toFixed(1)}%` : "—"} color={evPct != null && evPct >= 0 ? "text-gain" : "text-loss"} sub="prob-weighted cases" />
          <Cell label="Evidence" value={`${synthesis.ledger.supporting}▲ ${synthesis.ledger.opposing}▼`} sub={`${synthesis.ledger.neutral} neutral`} />
          <Cell label="Breakers" value={`${watchers.length}/${synthesis.breakers.length}`} color={watchers.some((b) => b.state === "tripped") ? "text-loss" : watchers.length ? "text-warning" : "text-gain"} sub="non-intact" />
        </div>
      )}

      {/* ── Pillars — the 0–100 score is shown next to the derived verdict word ── */}
      <SectionHead title="Pillars" note="grade-weighted 0–100 → verdict band" />
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border sm:grid-cols-6">
        {synthesis.pillars.map((p) => (
          <div key={p.pillar} className="px-3 py-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{p.label}</span>
              <span className={`font-mono text-[10px] tabular-nums ${pillarColor(p.score)}`}>{p.score}</span>
            </div>
            <p className={`text-[12px] font-semibold ${pillarColor(p.score)}`}>{p.verdict}</p>
            <div className="mt-1 h-[3px] w-full overflow-hidden bg-muted"><div className={`h-full ${pillarBar(p.score)}`} style={{ width: `${p.score}%` }} /></div>
          </div>
        ))}
      </div>

      {/* ── Scenario distribution ── */}
      <SectionHead title="Scenario distribution" note="log-normal GBM · σ realized · drift tilted ±0.75σ by momentum/risk" />
      <div className="border-b border-border px-4 py-2.5">
        <div className="mb-2 flex h-1.5 w-full overflow-hidden">
          {synthesis.cases.map((c) => (
            <div key={c.id} className={c.id === "bull" ? "bg-gain" : c.id === "bear" ? "bg-loss" : "bg-muted-foreground"} style={{ width: `${c.probability}%` }} title={`${c.label} ${c.probability}%`} />
          ))}
        </div>
        <div className="space-y-0.5">
          {synthesis.cases.map((c) => (
            <div key={c.id} className="flex items-center justify-between font-mono text-[11px] tabular-nums">
              <span className={`font-semibold ${c.id === "bull" ? "text-gain" : c.id === "bear" ? "text-loss" : "text-foreground"}`}>{c.label}</span>
              <span className="text-muted-foreground">
                <span className="text-foreground">{c.probability}%</span>
                {c.target != null && <> · {fmtPrice(c.target)}</>}
                {c.returnPct != null && <span className={c.returnPct >= 0 ? "text-gain" : "text-loss"}> · {c.returnPct >= 0 ? "+" : ""}{c.returnPct}%</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Drivers — hairline rows: grade · label · corroboration · value · provenance · weight ── */}
      <SectionHead title="What's driving it" note="weight = w · (1 + 0.25·aligned − 0.15·conflicting)" />
      <div className="divide-y divide-border/50 border-b border-border">
        {synthesis.keyDrivers.map((d) => {
          const m = graph.metrics[d.id];
          if (!m) return null;
          const via = synthesis.contributions.find((c) => c.id === d.id)?.via ?? [];
          return (
            <div key={d.id} className="flex items-center gap-2 px-4 py-1.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${GRADE_DOT[m.assessment.grade]}`} />
              <span className="min-w-0 flex-1 truncate text-[12px] text-foreground">{m.label}</span>
              {via.length > 0 && <span className="hidden max-w-[26%] truncate font-mono text-[9px] text-muted-foreground/50 md:inline">via {via.slice(0, 2).join(", ")}</span>}
              <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">{fmtMetric(m)}</span>
              <span className="hidden w-16 shrink-0 text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50 sm:inline">{m.provenance}</span>
              <span className={`w-12 shrink-0 text-right font-mono text-[11px] tabular-nums ${d.weight > 0 ? "text-gain" : d.weight < 0 ? "text-loss" : "text-muted-foreground"}`}>{d.weight > 0 ? "+" : ""}{d.weight.toFixed(2)}</span>
            </div>
          );
        })}
      </div>

      {/* ── Thesis breakers ── */}
      {synthesis.breakers.length > 0 && (
        <>
          <SectionHead title="Thesis breakers" note="live early-warning triggers" />
          <div className="divide-y divide-border/50 border-b border-border">
            {synthesis.breakers.map((b) => {
              const s = BREAKER_STYLE[b.state];
              return (
                <div key={b.id} className="flex items-center gap-2 px-4 py-1.5">
                  <ShieldAlert className={`h-3 w-3 shrink-0 ${b.state === "tripped" ? "text-loss" : b.state === "watch" ? "text-warning" : "text-muted-foreground/40"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-foreground">{b.label}</p>
                    <p className="truncate text-[10px] leading-snug text-muted-foreground">{b.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase ${s.chip}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Narrative */}
      {synthesis.narrative.length > 0 && (
        <div className="space-y-1 border-b border-border px-4 py-2.5">
          {synthesis.narrative.map((line, i) => (
            <p key={i} className="text-[12px] leading-relaxed text-secondary-foreground">{line}</p>
          ))}
        </div>
      )}

      {/* ── Methodology + coverage footer — the numbers state how they were derived ── */}
      <div className="space-y-1.5 px-4 py-2.5">
        <p className="font-mono text-[9.5px] leading-relaxed text-muted-foreground/70">
          conviction = logistic(evidence volume, directional agreement, |net|; − estimated share, − active breakers) → 35–90 · net {net >= 0 ? "+" : ""}{net.toFixed(2)} = Σ contribution weights · verdict gated so it cannot contradict Σ p·r
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[9.5px] text-muted-foreground/60">{graph.coverage.total} nodes · {estPct}% estimated provenance · {graph.coverage.sources.join(" · ")}</p>
          <Link to={workstationPath(ticker)} className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-foreground/80 hover:text-foreground">
            open workstation <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
};

const SectionHead = ({ title, note }: { title: string; note?: string }) => (
  <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-1/40 px-4 py-1.5">
    <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
    {note && <span className="hidden truncate font-mono text-[9px] text-muted-foreground/45 sm:inline">{note}</span>}
  </div>
);

const Cell = ({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) => (
  <div className="px-4 py-2">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${color || "text-foreground"}`}>{value}</p>
    {sub && <p className="font-mono text-[8px] text-muted-foreground/60">{sub}</p>}
  </div>
);

export default DeskSynthesis;
