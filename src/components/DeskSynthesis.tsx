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

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up space-y-5">
      {/* Header + verdict */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Network className="h-5 w-5 text-foreground" />
          <h2 className="text-base font-semibold text-foreground">Evidence Synthesis</h2>
          <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {graph.coverage.total} nodes · {graph.coverage.sources.length} sources
          </span>
        </div>
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${a.bg}`}>
          <span className={`font-mono text-sm font-bold uppercase tracking-wide ${a.text}`}>{a.label}</span>
          <span className="text-[11px] text-muted-foreground">conviction {synthesis.confidence}%</span>
        </div>
      </div>

      {/* Headline */}
      <p className="text-sm leading-relaxed text-secondary-foreground">{synthesis.headline}</p>

      {/* Expected outcome strip */}
      {(evPct != null || pProfit != null) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Prob. of profit" value={pProfit != null ? `${Math.round(pProfit * 100)}%` : "—"} color={pProfit != null && pProfit >= 0.5 ? "text-gain" : "text-loss"} />
          <Stat label="Exp. return (Σ p·r)" value={evPct != null ? `${evPct >= 0 ? "+" : ""}${evPct.toFixed(1)}%` : "—"} color={evPct != null && evPct >= 0 ? "text-gain" : "text-loss"} sub="21-session horizon" />
          <Stat label="Evidence balance" value={`${synthesis.ledger.supporting}▲ / ${synthesis.ledger.opposing}▼`} sub={`${synthesis.ledger.neutral} neutral`} />
          <Stat label="Breakers" value={`${watchers.length}/${synthesis.breakers.length}`} color={watchers.some((b) => b.state === "tripped") ? "text-loss" : watchers.length ? "text-warning" : "text-gain"} sub="non-intact" />
        </div>
      )}

      {/* Pillar verdicts */}
      <div>
        <SectionLabel>Pillar verdicts</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {synthesis.pillars.map((p) => (
            <div key={p.pillar} className="rounded-lg bg-surface-2 p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{p.label}</p>
              <p className={`mt-0.5 text-[13px] font-semibold ${pillarColor(p.score)}`}>{p.verdict}</p>
              <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${pillarBar(p.score)}`} style={{ width: `${p.score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scenario cases */}
      <div>
        <SectionLabel>Scenario distribution</SectionLabel>
        <div className="flex h-2 w-full overflow-hidden rounded-full mb-2">
          {synthesis.cases.map((c) => (
            <div
              key={c.id}
              className={c.id === "bull" ? "bg-gain" : c.id === "bear" ? "bg-loss" : "bg-muted-foreground"}
              style={{ width: `${c.probability}%` }}
              title={`${c.label} ${c.probability}%`}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {synthesis.cases.map((c) => (
            <div key={c.id} className="rounded-lg bg-surface-2 p-2.5">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${c.id === "bull" ? "text-gain" : c.id === "bear" ? "text-loss" : "text-foreground"}`}>{c.label}</span>
                <span className="font-mono text-[13px] font-bold text-foreground">{c.probability}%</span>
              </div>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {c.target != null ? fmtPrice(c.target) : "—"}
                {c.returnPct != null && (
                  <span className={c.returnPct >= 0 ? "text-gain" : "text-loss"}> · {c.returnPct >= 0 ? "+" : ""}{c.returnPct}%</span>
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Key drivers — the causal "why" behind the verdict */}
      <div>
        <SectionLabel>What's driving the verdict</SectionLabel>
        <div className="space-y-1">
          {synthesis.keyDrivers.map((d) => {
            const m = graph.metrics[d.id];
            if (!m) return null;
            const dir = d.weight > 0 ? "for" : d.weight < 0 ? "against" : "neutral";
            return (
              <div key={d.id} className="flex items-center gap-2 rounded-md bg-surface-2/60 px-2.5 py-1.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${GRADE_DOT[m.assessment.grade]}`} />
                <span className="flex-1 truncate text-[12px] text-foreground">{m.label}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{fmtMetric(m)}</span>
                <span className="hidden sm:inline font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">{m.provenance}</span>
                <span className={`w-14 text-right font-mono text-[11px] ${dir === "for" ? "text-gain" : dir === "against" ? "text-loss" : "text-muted-foreground"}`}>
                  {d.weight > 0 ? "+" : ""}{d.weight.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Thesis breakers */}
      {synthesis.breakers.length > 0 && (
        <div>
          <SectionLabel>Thesis breakers — the live early-warning panel</SectionLabel>
          <div className="space-y-1">
            {synthesis.breakers.map((b) => {
              const s = BREAKER_STYLE[b.state];
              return (
                <div key={b.id} className="flex items-start gap-2 rounded-md bg-surface-2/60 px-2.5 py-1.5">
                  <ShieldAlert className={`mt-0.5 h-3 w-3 shrink-0 ${b.state === "tripped" ? "text-loss" : b.state === "watch" ? "text-warning" : "text-muted-foreground/50"}`} />
                  <div className="flex-1">
                    <p className="text-[12px] text-foreground">{b.label}</p>
                    <p className="text-[10px] leading-snug text-muted-foreground">{b.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase ${s.chip}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Narrative */}
      {synthesis.narrative.length > 0 && (
        <div className="rounded-lg bg-surface-2 p-3 space-y-1.5">
          {synthesis.narrative.map((line, i) => (
            <p key={i} className="text-[12px] leading-relaxed text-secondary-foreground">{line}</p>
          ))}
        </div>
      )}

      {/* Coverage footer + deep-dive link */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <p className="font-mono text-[10px] text-muted-foreground">
          {graph.coverage.total} evidence nodes · {Math.round((graph.coverage.estimated / Math.max(graph.coverage.total, 1)) * 100)}% estimated provenance · {graph.coverage.sources.join(" · ")}
        </p>
        <Link
          to={workstationPath(ticker)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/80 hover:text-foreground"
        >
          Inspect every node in the Workstation <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{children}</p>
);

const Stat = ({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) => (
  <div className="rounded-lg bg-surface-2 p-2.5">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`mt-0.5 font-mono text-sm font-bold ${color || "text-foreground"}`}>{value}</p>
    {sub && <p className="text-[8px] text-muted-foreground/70">{sub}</p>}
  </div>
);

export default DeskSynthesis;
