import { useMemo, useState } from "react";
import { Briefcase, ShieldAlert, Newspaper, ArrowRight, SigmaSquare, Droplets } from "lucide-react";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import { useInstitutionalAnalytics } from "@/hooks/useInstitutionalAnalytics";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useMarketRegime } from "@/hooks/useMarketRegime";
import { useFactorModel } from "@/hooks/useFactorModel";
import { liquidityProfile } from "@/lib/quant/liquidity";
import { computePortfolioHealth, healthInputFromSnapshot } from "@/lib/portfolio-health";
import {
  aggregateBookNews, buildBookDirectives, sortDirectives, summarizeBook,
  DRIFT_MATERIAL_PP, NEWS_PRESSURE_BAR,
  type BookDirective, type BookPositionInput, type SignalVote,
} from "@/lib/desk-book";
import {
  buildGrowthSeries, rollingVolSeries, riskWeightRows, driftRows,
  liquidityLadderPoints, betaSeriesPoints, factorBarRows,
} from "@/lib/desk-book-charts";
import {
  GrowthChart, UnderwaterChart, RollingVolChart, RollingVarChart,
  RiskWeightChart, DriftChart, FactorExposureChart, BetaStabilityChart,
  LiquidityLadderChart,
} from "@/components/DeskBookCharts";
import { kupiecBacktest, sharpeReport, volatilityCI } from "@/lib/quant/integrity";
import type { OptimizerId } from "@/lib/analytics/types";
import { OPTIMIZER_LABELS } from "@/lib/analytics/optimizers";

/** Target models the analyst can flip between (same engine as Augment). */
const TARGET_MODELS: Array<{ id: OptimizerId; short: string }> = [
  { id: "equal_weight", short: "EW" },
  { id: "min_variance", short: "MinVar" },
  { id: "risk_parity", short: "ERC" },
  { id: "hrp", short: "HRP" },
  { id: "mean_variance", short: "MV" },
];

const PARTICIPATION_CHOICES = [0.1, 0.2, 0.3];

/**
 * Desk Book Mode — the full-portfolio pass. One surface, one spine:
 * every figure here comes from the same engines the other tabs read
 * (useQuantSnapshot Σ/VaR, the institutional analytics layer, the desk
 * verdicts from analyze-stock, the analysis-layer news scores, and the
 * same Portfolio Health the Daily Briefing shows). Directives merge the
 * optimizer, the desk verdict and news pressure per position; conflicts
 * are surfaced as REVIEW, never averaged away. Advisory only.
 */

interface Props {
  stocks: PortfolioStock[];
  /** Focus a position back in instrument view. */
  onSelectTicker?: (rawTicker: string) => void;
}

const ACTION_CHIP: Record<BookDirective["action"], string> = {
  ADD: "bg-gain/12 border-gain/25 text-gain",
  TRIM: "bg-warning/12 border-warning/25 text-warning",
  REVIEW: "bg-loss/12 border-loss/25 text-loss",
  HOLD: "bg-surface-2 border-border text-muted-foreground",
};

const VOTE_COLOR: Record<SignalVote, string> = {
  add: "text-gain",
  trim: "text-loss",
  flat: "text-muted-foreground/70",
  na: "text-muted-foreground/30",
};

const BAND_STYLE: Record<string, string> = {
  strong: "bg-gain/12 border-gain/25 text-gain",
  steady: "bg-surface-2 border-border text-foreground",
  fragile: "bg-warning/12 border-warning/25 text-warning",
  critical: "bg-loss/12 border-loss/25 text-loss",
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

const DeskPortfolioMode = ({ stocks, onSelectTicker }: Props) => {
  // Analyst controls — target model feeds the SAME optimizer engine Augment
  // uses; participation resizes the liquidity constraint. Both disclosed.
  const [targetModel, setTargetModel] = useState<OptimizerId>("hrp");
  const [participation, setParticipation] = useState(0.2);

  const ia = useInstitutionalAnalytics(stocks, { recommendedId: targetModel });
  const norm = useNormalizedPortfolio(stocks);
  const regime = useMarketRegime(30000);
  const snap = ia.snapshot;
  const hasInr = useMemo(() => norm.holdings.some((h) => h.currency === "INR"), [norm.holdings]);
  const factor = useFactorModel(snap, hasInr);

  const health = useMemo(() => {
    const input = healthInputFromSnapshot(snap, regime?.regime);
    return input ? computePortfolioHealth(input) : null;
  }, [snap, regime?.regime]);

  // Liquidity: real 20d median volumes through the same history pipeline.
  const liquidity = useMemo(() => {
    if (!snap.ready) return null;
    return liquidityProfile(
      norm.holdings.map((h) => ({
        ticker: h.ticker,
        quantity: h.quantity,
        valueBase: h.value,
        volumes: snap.volumesByTicker[h.ticker],
      })),
      participation,
    );
  }, [snap, norm.holdings, participation]);

  // Share of book VALUE inside the quant coverage (assets with ≥30d history).
  const coveredValueShare = useMemo(() => {
    if (norm.totalValue <= 0) return 0;
    const covered = norm.holdings.reduce(
      (s, h) => s + (snap.weights[h.ticker] != null ? h.value : 0), 0);
    return covered / norm.totalValue;
  }, [norm.holdings, norm.totalValue, snap.weights]);

  // ── Assemble per-position inputs on the covered-book weight basis ──
  const positions = useMemo<BookPositionInput[]>(() => {
    const targetByTicker: Record<string, number> = {};
    if (ia.recommended?.diagnostics.converged) {
      ia.recommended.tickers.forEach((t, i) => { targetByTicker[t] = ia.recommended!.weights[i]; });
    }
    const rcByTicker: Record<string, number | null> = {};
    ia.attribution?.positions.forEach((p) => { rcByTicker[p.ticker] = p.riskContributionPct; });

    return norm.holdings.map((h) => {
      const covered = snap.weights[h.ticker] != null;
      const weight = covered
        ? snap.weights[h.ticker]
        : norm.totalValue > 0 ? h.value / norm.totalValue : 0;
      return {
        ticker: h.ticker,
        rawTicker: h.rawTicker,
        weight,
        valueBase: h.value,
        priceBase: h.quantity > 0 ? h.value / h.quantity : 0,
        pnlPct: h.pnlPct,
        suggestion: h.analysis?.suggestion,
        confidence: h.analysis?.confidence,
        news: h.analysis?.news,
        totalPressure: h.analysis?.totalPressure,
        overallSentiment: h.analysis?.overallSentiment,
        riskContribution: rcByTicker[h.ticker] ?? null,
        targetWeight: covered && targetByTicker[h.ticker] != null ? targetByTicker[h.ticker] : null,
      };
    });
  }, [norm.holdings, norm.totalValue, snap.weights, ia.recommended, ia.attribution]);

  const directives = useMemo(
    () => sortDirectives(buildBookDirectives(positions, snap.totalValue > 0 ? snap.totalValue : norm.totalValue)),
    [positions, snap.totalValue, norm.totalValue],
  );
  const summary = useMemo(() => summarizeBook(directives), [directives]);
  const news = useMemo(() => aggregateBookNews(positions), [positions]);

  // ── Chart data (pure transforms, tested in desk-book-charts.ts) ──
  const growth = useMemo(
    () => (snap.ready ? buildGrowthSeries(snap.portfolio.returns, ia.benchmarkReturns) : []),
    [snap, ia.benchmarkReturns],
  );
  const rollingVol = useMemo(
    () => (snap.ready ? rollingVolSeries(snap.portfolio.returns, 60) : []),
    [snap],
  );
  // ── Model integrity: the numbers audit themselves ──
  const kupiec = useMemo(
    () => (snap.ready ? kupiecBacktest(snap.portfolio.returns, { window: 60, confidence: 0.95 }) : null),
    [snap],
  );
  const sharpeRep = useMemo(
    () => (snap.ready ? sharpeReport(snap.portfolio.returns) : null),
    [snap],
  );
  const volCi = useMemo(
    () => (snap.ready ? volatilityCI(snap.portfolio.sigmaDaily, snap.lookbackDays) : null),
    [snap],
  );

  const rwRows = useMemo(() => riskWeightRows(ia.attribution?.positions ?? []), [ia.attribution]);
  const dRows = useMemo(() => driftRows(directives), [directives]);
  const ladder = useMemo(() => liquidityLadderPoints(liquidity?.perPosition ?? []), [liquidity]);
  const betaPts = useMemo(() => betaSeriesPoints(factor.rollingBeta), [factor.rollingBeta]);
  const fRows = useMemo(
    () => factorBarRows(factor.model?.factors ?? [], factor.model?.portfolio?.exposures ?? {}),
    [factor.model],
  );

  const analyzedCount = norm.holdings.length;
  if (analyzedCount < 2) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 animate-slide-up">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Briefcase className="h-4 w-4" />
          <span className="text-sm">Book mode needs at least two analyzed positions.</span>
        </div>
      </div>
    );
  }

  const pnlPct = norm.totalInvested > 0 ? (norm.totalPnl / norm.totalInvested) * 100 : 0;
  const effN = health?.gauges.find((g) => g.key === "diversification")?.detail ?? null;
  const risk = ia.risk;
  const worstReplay = ia.replays.length > 0 ? ia.replays[ia.replays.length - 1] : null;
  const topStresses = ia.stresses.slice(0, 2);
  const topInsights = ia.insights.slice(0, 3);
  const coveredCount = Object.keys(snap.weights).length;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card animate-slide-up">
      {/* ── Terminal header: identity · directive summary · health verdict ── */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-[13px] font-semibold tracking-tight text-foreground">Book Synthesis</h2>
          <span className="font-mono text-[10px] text-muted-foreground/70">
            {analyzedCount} positions · {snap.ready
              ? `${snap.lookbackDays}d history · quant covers ${Math.round(coveredValueShare * 100)}% of value`
              : "assembling history…"}
            {norm.livePricedShare < 1 && ` · ${Math.round(norm.livePricedShare * 100)}% live-priced`}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {health && (
            <>
              <span className={`rounded-sm border px-2 py-0.5 font-mono text-[12px] font-bold uppercase tracking-wide ${BAND_STYLE[health.band]}`}>
                {health.band}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{health.score}/100</span>
            </>
          )}
        </div>
      </div>

      {/* Headline */}
      <p className="border-b border-border px-4 py-2.5 text-[12.5px] leading-relaxed text-secondary-foreground">
        {summary.headline}
        {summary.largestMove?.deltaValue != null && (
          <> — largest move {summary.largestMove.action.toLowerCase()} {summary.largestMove.ticker} ≈ {norm.fmt(Math.abs(summary.largestMove.deltaValue))}</>
        )}
        .
      </p>

      {/* ── Analyst controls — one row, above every chart they affect ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-border px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Target model</span>
          <div className="inline-flex items-center rounded-md border border-border bg-surface-1 p-0.5">
            {TARGET_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => setTargetModel(m.id)}
                title={OPTIMIZER_LABELS[m.id]}
                className={`rounded-[4px] px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  targetModel === m.id ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.short}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Exit participation</span>
          <div className="inline-flex items-center rounded-md border border-border bg-surface-1 p-0.5">
            {PARTICIPATION_CHOICES.map((p) => (
              <button
                key={p}
                onClick={() => setParticipation(p)}
                title={`Assume exits at ${Math.round(p * 100)}% of 20-day median daily volume`}
                className={`rounded-[4px] px-2 py-0.5 font-mono text-[10px] transition-colors ${
                  participation === p ? "bg-surface-3 text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {Math.round(p * 100)}%
              </button>
            ))}
          </div>
        </div>
        <span className="ml-auto hidden font-mono text-[9px] text-muted-foreground/50 lg:inline">
          controls re-run the engines — nothing is cached into the verdicts
        </span>
      </div>

      {/* ── Vitals ── */}
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
        <Cell
          label="Book value"
          value={norm.fmt(norm.totalValue)}
          sub={`base ${norm.baseCurrency} · every position${norm.livePricedShare < 1 ? ` · ${Math.round((1 - norm.livePricedShare) * 100)}% at cost basis` : ""}${norm.fxAllLive ? "" : " · fallback FX"}`}
        />
        <Cell
          label="P&L"
          value={`${norm.totalPnl >= 0 ? "+" : "−"}${norm.fmt(Math.abs(norm.totalPnl))}`}
          color={norm.totalPnl >= 0 ? "text-gain" : "text-loss"}
          sub={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% vs cost`}
        />
        <Cell
          label="VaR₉₅ 1-day"
          value={snap.ready && snap.portfolio.var95 > 0 ? norm.fmt(snap.portfolio.var95) : "—"}
          color="text-loss"
          sub={snap.ready ? `historical · ${snap.lookbackDays}d` : "needs history"}
        />
        <Cell
          label="σ annual"
          value={snap.ready ? `${(snap.portfolio.sigmaAnnual * 100).toFixed(1)}%` : "—"}
          sub={snap.ready ? `Sharpe ${snap.portfolio.sharpe.toFixed(2)}` : undefined}
        />
      </div>
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
        <Cell label="Effective breadth" value={effN ?? "—"} sub="1/Σwᵢ² of covered book" />
        <Cell
          label="PC1 share"
          value={risk?.correlation.pc1Share ? `${(risk.correlation.pc1Share.value * 100).toFixed(0)}%` : "—"}
          color={risk?.correlation.pc1Share && risk.correlation.pc1Share.value > 0.55 ? "text-loss" : undefined}
          sub="variance in first component"
        />
        <Cell
          label="Avg pairwise ρ"
          value={risk ? risk.correlation.avgPairwise.value.toFixed(2) : "—"}
          color={risk && risk.correlation.avgPairwise.value > 0.6 ? "text-warning" : undefined}
          sub={`Pearson · ${snap.lookbackDays}d`}
        />
        <Cell
          label="Market β"
          value={ia.exposure?.marketBeta ? ia.exposure.marketBeta.value.toFixed(2) : "—"}
          sub={ia.benchmarkReady ? `vs ${ia.benchmarkTicker}` : ia.betaBasis}
        />
      </div>

      {/* ── Performance — growth of 1.0 and the underwater curve ── */}
      {growth.length >= 20 && (
        <>
          <SectionHead
            title="Performance"
            note={`growth of 1.0, ${growth.length} sessions${ia.benchmarkReady ? ` · vs ${ia.benchmarkTicker}, common base` : ""} · drawdown from running peak`}
          />
          <div className="grid grid-cols-1 gap-2 border-b border-border px-3 py-2 lg:grid-cols-2">
            <GrowthChart data={growth} benchmarkLabel={ia.benchmarkReady ? ia.benchmarkTicker : null} />
            <UnderwaterChart data={growth} />
          </div>
        </>
      )}

      {/* ── Rolling risk — how the book's risk moved, not just where it is ── */}
      {(rollingVol.length > 0 || snap.portfolio.rollingVar.length > 0) && (
        <>
          <SectionHead title="Rolling risk" note="60-day trailing windows over the book's own return history" />
          <div className="grid grid-cols-1 gap-2 border-b border-border px-3 py-2 lg:grid-cols-2">
            {rollingVol.length > 0 && (
              <div>
                <p className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">σ annualized · 60d window</p>
                <RollingVolChart data={rollingVol} />
              </div>
            )}
            {snap.portfolio.rollingVar.length > 0 && (
              <div>
                <p className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">1-day tail loss at today's value</p>
                <RollingVarChart data={snap.portfolio.rollingVar} fmt={norm.fmt} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Model integrity — every headline number audits itself ── */}
      {(kupiec || sharpeRep || volCi) && (
        <>
          <SectionHead
            title="Model integrity"
            note="out-of-sample backtest + estimation uncertainty on the numbers above"
          />
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
            {kupiec && (
              <Cell
                label="VaR₉₅ backtest"
                value={`${kupiec.breaches}/${kupiec.tests} breaches`}
                color={
                  kupiec.verdict === "consistent" ? "text-gain"
                  : kupiec.verdict === "underestimates risk" ? "text-loss" : "text-warning"
                }
                sub={`expected ${(kupiec.expectedRate * 100).toFixed(0)}% · Kupiec p=${kupiec.pValue.toFixed(2)} · ${kupiec.verdict}`}
              />
            )}
            {sharpeRep && (
              <Cell
                label="Sharpe ± SE"
                value={`${sharpeRep.sharpeAnnual.toFixed(2)} ± ${sharpeRep.seAnnual.toFixed(2)}`}
                color={sharpeRep.psrVsZero >= 0.95 ? "text-gain" : sharpeRep.psrVsZero <= 0.5 ? "text-loss" : undefined}
                sub={`Lo(2002) SE · P(SR>0) ${(sharpeRep.psrVsZero * 100).toFixed(0)}%`}
              />
            )}
            {volCi && (
              <Cell
                label="σ 95% CI"
                value={`${(volCi.lowAnnual * 100).toFixed(1)}–${(volCi.highAnnual * 100).toFixed(1)}%`}
                sub={`χ² interval · ${volCi.n}d · i.i.d. approximation`}
              />
            )}
            {factor.model?.portfolio && (
              <Cell
                label="Market β significance"
                value={`${(factor.model.portfolio.marketBetaSignificantShare * 100).toFixed(0)}%`}
                color={factor.model.portfolio.marketBetaSignificantShare < 0.5 ? "text-warning" : undefined}
                sub="of fitted weight with |t| ≥ 2 on the market factor"
              />
            )}
          </div>
        </>
      )}

      {/* ── Health gauges — same computation as the Daily Briefing ── */}
      {health && (
        <>
          <SectionHead title="Health" note="identical gauge math to SCR-01 briefing · healthInputFromSnapshot" />
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
            {health.gauges.map((g) => (
              <div key={g.key} className="px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{g.label}</span>
                  <span className={`font-mono text-[10px] tabular-nums ${g.score >= 68 ? "text-gain" : g.score >= 45 ? "text-foreground" : "text-loss"}`}>
                    {Math.round(g.score)}
                  </span>
                </div>
                <p className="truncate text-[11px] text-secondary-foreground">{g.detail}</p>
                <div className="mt-1 h-[3px] w-full overflow-hidden bg-muted">
                  <div className={`h-full ${g.score >= 68 ? "bg-gain" : g.score >= 45 ? "bg-muted-foreground" : "bg-loss"}`} style={{ width: `${g.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Directives — the add / trim / review ledger ── */}
      <SectionHead
        title="Directives"
        note={`optimizer target ${ia.recommended ? ia.recommended.label : "unavailable"} · drift bar ${DRIFT_MATERIAL_PP}pp · news bar ±${NEWS_PRESSURE_BAR}`}
      />
      <div className="divide-y divide-border/50 border-b border-border">
        {directives.map((d) => (
          <button
            key={d.rawTicker}
            type="button"
            onClick={onSelectTicker ? () => onSelectTicker(d.rawTicker) : undefined}
            className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-surface-2 disabled:cursor-default"
            disabled={!onSelectTicker}
            title="Open this position in instrument view"
          >
            <span className={`w-16 shrink-0 rounded-sm border px-1.5 py-0.5 text-center font-mono text-[10px] font-bold uppercase ${ACTION_CHIP[d.action]}`}>
              {d.action}
            </span>
            <span className="w-16 shrink-0 truncate font-mono text-[12px] font-semibold text-foreground">{d.ticker}</span>
            <span className="hidden w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground sm:inline">
              {(d.currentWeight * 100).toFixed(1)}%
              {d.targetWeight != null && <span className="text-muted-foreground/50"> → {(d.targetWeight * 100).toFixed(1)}%</span>}
            </span>
            <span className="hidden w-20 shrink-0 text-right font-mono text-[11px] tabular-nums md:inline">
              {d.deltaValue != null && d.action !== "HOLD" ? (
                <span className={d.deltaValue >= 0 ? "text-gain" : "text-loss"}>
                  {d.deltaValue >= 0 ? "+" : "−"}{norm.fmt(Math.abs(d.deltaValue))}
                  {d.deltaUnits != null && d.deltaUnits > 0 && <span className="text-muted-foreground/60"> · {d.deltaUnits}u</span>}
                </span>
              ) : (
                <span className="text-muted-foreground/40">—</span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[11px] leading-snug text-muted-foreground">{d.rationale}</span>
            <span className="flex shrink-0 items-center gap-1 font-mono text-[9px]" title="Signal families: Q optimizer · V desk verdict · N news pressure">
              <span className={VOTE_COLOR[d.signals.quant]}>Q</span>
              <span className={VOTE_COLOR[d.signals.verdict]}>V</span>
              <span className={VOTE_COLOR[d.signals.news]}>N</span>
            </span>
            {d.riskContribution != null && (
              <span
                className={`hidden w-14 shrink-0 text-right font-mono text-[10px] tabular-nums lg:inline ${d.riskContribution > d.currentWeight * 1.5 ? "text-warning" : "text-muted-foreground"}`}
                title="Euler share of portfolio variance"
              >
                {(d.riskContribution * 100).toFixed(0)}%σ²
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Capital vs risk + drift — where the money sits vs where the risk sits ── */}
      {(rwRows.length >= 2 || dRows.length >= 2) && (
        <>
          <SectionHead
            title="Capital vs risk"
            note={`risk = Euler share of portfolio variance from Σ · target = ${ia.recommended?.label ?? OPTIMIZER_LABELS[targetModel]}`}
          />
          <div className="grid grid-cols-1 gap-2 border-b border-border px-3 py-2 lg:grid-cols-2">
            {rwRows.length >= 2 && (
              <div>
                <p className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Weight vs risk contribution</p>
                <RiskWeightChart rows={rwRows} />
              </div>
            )}
            {dRows.length >= 2 && (
              <div>
                <p className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Held vs target allocation</p>
                <DriftChart rows={dRows} targetLabel={ia.recommended?.label ?? OPTIMIZER_LABELS[targetModel]} />
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Book news impact ── */}
      {news && (
        <>
          <SectionHead
            title="News pressure on the book"
            note={`weight-averaged · covers ${(news.coverageWeight * 100).toFixed(0)}% of book · ${news.itemCount} headlines`}
          />
          <div className="border-b border-border px-4 py-2.5">
            <div className="mb-1.5 flex items-center gap-3 font-mono text-[11px] tabular-nums">
              <Newspaper className="h-3 w-3 text-muted-foreground" />
              <span className={news.weightedPressure >= 0 ? "text-gain" : "text-loss"}>
                pressure {news.weightedPressure >= 0 ? "+" : ""}{news.weightedPressure.toFixed(1)}
              </span>
              <span className={news.weightedSentiment >= 0 ? "text-gain" : "text-loss"}>
                sentiment {news.weightedSentiment >= 0 ? "+" : ""}{news.weightedSentiment.toFixed(1)}
              </span>
            </div>
            <div className="space-y-1">
              {news.top.slice(0, 4).map((n, i) => (
                <div key={i} className="flex items-center gap-2 font-mono text-[10.5px]">
                  <span className="w-14 shrink-0 truncate font-semibold text-foreground">{n.ticker}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{n.headline}</span>
                  <span className={`w-12 shrink-0 text-right tabular-nums ${n.bookImpact > 0 ? "text-gain" : n.bookImpact < 0 ? "text-loss" : "text-muted-foreground"}`}
                    title="position weight × short-term pressure score">
                    {n.bookImpact > 0 ? "+" : ""}{n.bookImpact.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[9.5px] leading-relaxed text-muted-foreground/60">
              Scores reflect headline tone and source weight only — not measured or predicted price moves. News never
              trades alone here; it corroborates or contests the quant and verdict signals above.
            </p>
          </div>
        </>
      )}

      {/* ── Factor decomposition — the regression layer ── */}
      {factor.ready && factor.model?.portfolio && (
        <>
          <SectionHead
            title="Factor decomposition"
            note={`OLS on ETF/index-proxy daily returns · ${factor.model.portfolio.n}d · avg R² ${factor.model.portfolio.avgR2.toFixed(2)}`}
          />
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
            <Cell
              label="Systematic share"
              value={`${(factor.model.portfolio.systematicShare * 100).toFixed(0)}%`}
              color={factor.model.portfolio.systematicShare > 0.8 ? "text-warning" : undefined}
              sub="of model variance is factor-driven"
            />
            <Cell label="Systematic σ" value={`${(factor.model.portfolio.sysVolAnnual * 100).toFixed(1)}%`} sub="eᵀΣ_f e · annualized" />
            <Cell label="Idiosyncratic σ" value={`${(factor.model.portfolio.idioVolAnnual * 100).toFixed(1)}%`} sub="Σwᵢ²σ²(εᵢ) · annualized" />
            <Cell
              label="Model σ vs realized"
              value={`${(factor.model.portfolio.totalVolAnnual * 100).toFixed(1)}% / ${(snap.portfolio.sigmaAnnual * 100).toFixed(1)}%`}
              sub="factor model vs measured book σ"
            />
          </div>
          <div className="divide-y divide-border/50 border-b border-border">
            {factor.model.factors.map((f) => {
              const p = factor.model!.portfolio!;
              const exp = p.exposures[f.id] ?? 0;
              const contrib = p.contributions[f.id] ?? 0;
              const scen = factor.model!.scenarios.find((s) => s.factorId === f.id);
              return (
                <div key={f.id} className="flex items-center gap-2 px-4 py-1.5">
                  <SigmaSquare className="h-3 w-3 shrink-0 text-muted-foreground/40" />
                  <span className="w-40 shrink-0 truncate text-[12px] text-foreground">{f.label}</span>
                  <span className={`w-14 shrink-0 text-right font-mono text-[11px] tabular-nums ${Math.abs(exp) >= 0.5 ? "text-foreground" : "text-muted-foreground"}`} title="Portfolio factor exposure Σwᵢβᵢ">
                    β {exp >= 0 ? "+" : ""}{exp.toFixed(2)}
                  </span>
                  <div className="hidden h-[3px] min-w-0 flex-1 overflow-hidden bg-muted sm:block" title="Share of systematic variance (Euler)">
                    <div className={contrib >= 0 ? "h-full bg-muted-foreground" : "h-full bg-loss"} style={{ width: `${Math.min(100, Math.abs(contrib) * 100)}%` }} />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground" title="Share of systematic variance">
                    {(contrib * 100).toFixed(0)}%
                  </span>
                  {scen && (
                    <span className={`w-24 shrink-0 text-right font-mono text-[10px] tabular-nums ${scen.impactPct < 0 ? "text-loss" : "text-gain"}`} title={`If ${f.label} moves ${scen.shockPct.toFixed(1)}% (−2σ month), first-order book impact`}>
                      −2σ → {scen.impactPct >= 0 ? "+" : ""}{scen.impactPct.toFixed(1)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {(fRows.length >= 2 || betaPts.length > 0) && (
            <div className="grid grid-cols-1 gap-2 border-b border-border px-3 py-2 lg:grid-cols-2">
              {fRows.length >= 2 && (
                <div>
                  <p className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Factor exposures · signed β</p>
                  <FactorExposureChart rows={fRows} />
                </div>
              )}
              {betaPts.length > 0 && (
                <div>
                  <p className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    Rolling 60d β vs {factor.marketFactorLabel}
                    {factor.fullBeta != null && <span className="text-muted-foreground/60"> · dashed = full sample</span>}
                  </p>
                  <BetaStabilityChart points={betaPts} fullBeta={factor.fullBeta} />
                </div>
              )}
            </div>
          )}
          {factor.fullBeta != null && factor.rollingBeta.length > 0 && (() => {
            const recent = factor.rollingBeta[factor.rollingBeta.length - 1];
            const drift = Math.abs(recent - (factor.fullBeta as number));
            return (
              <p className={`border-b border-border px-4 py-1.5 font-mono text-[10px] ${drift > 0.3 ? "text-warning" : "text-muted-foreground"}`}>
                β stability vs {factor.marketFactorLabel}: 60d {recent.toFixed(2)} vs full-sample {(factor.fullBeta as number).toFixed(2)}
                {drift > 0.3 ? " — market sensitivity has shifted regime; stress numbers scale with the 60d figure" : " — stable"}
              </p>
            );
          })()}
          {factor.model.coveredWeight < 0.999 && (
            <p className="border-b border-border px-4 py-1.5 font-mono text-[9.5px] text-muted-foreground/60">
              model fits {Math.round(factor.model.coveredWeight * 100)}% of covered weight — assets with thin factor overlap are excluded, not guessed
            </p>
          )}
        </>
      )}

      {/* ── Liquidity & capacity ── */}
      {liquidity && (
        <>
          <SectionHead
            title="Liquidity & capacity"
            note={`exit at ${Math.round(liquidity.participation * 100)}% of 20d median volume · participation constraint, not an impact model`}
          />
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-4">
            <Cell label="Exitable in 1d" value={`${(liquidity.shareWithin.d1 * 100).toFixed(0)}%`} color={liquidity.shareWithin.d1 < 0.5 ? "text-warning" : "text-gain"} sub="of volume-covered value" />
            <Cell label="Within 5d" value={`${(liquidity.shareWithin.d5 * 100).toFixed(0)}%`} sub="of volume-covered value" />
            <Cell label="Within 20d" value={`${(liquidity.shareWithin.d20 * 100).toFixed(0)}%`} color={liquidity.shareWithin.d20 < 1 ? "text-loss" : undefined} sub="of volume-covered value" />
            <Cell label="Weighted exit" value={`${liquidity.weightedDaysToExit.toFixed(1)}d`} sub={`volume data covers ${Math.round(liquidity.coveredValueShare * 100)}% of book`} />
          </div>
          {ladder.length >= 2 && (
            <div className="border-b border-border px-3 py-2">
              <p className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Liquidation ladder · cumulative share exitable at {Math.round(liquidity.participation * 100)}% participation
              </p>
              <LiquidityLadderChart points={ladder} />
            </div>
          )}
          {liquidity.perPosition.filter((p) => p.daysToExit != null && p.daysToExit > 5).slice(0, 3).map((p) => (
            <div key={p.ticker} className="flex items-center gap-2 border-b border-border/50 px-4 py-1.5">
              <Droplets className="h-3 w-3 shrink-0 text-warning" />
              <span className="w-16 shrink-0 font-mono text-[12px] font-semibold text-foreground">{p.ticker}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {(p.daysToExit as number).toFixed(1)} trading days to exit · position is {(p.advMultiple as number).toFixed(1)}× one day's volume
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{norm.fmt(p.valueBase)}</span>
            </div>
          ))}
        </>
      )}

      {/* ── Exposures ── */}
      {ia.exposure && (ia.exposure.sector.length > 1 || ia.exposure.currency.length > 1) && (
        <>
          <SectionHead title="Exposures" note="base-currency value weights" />
          <div className="grid grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className="px-4 py-2 space-y-1">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sector</p>
              {ia.exposure.sector.slice(0, 4).map((b) => (
                <div key={b.label} className="flex items-center gap-2 font-mono text-[10.5px]">
                  <span className="w-28 truncate text-foreground">{b.label}</span>
                  <div className="h-[3px] min-w-0 flex-1 overflow-hidden bg-muted">
                    <div className={`h-full ${b.weight > 0.5 ? "bg-warning" : "bg-muted-foreground"}`} style={{ width: `${Math.min(100, b.weight * 100)}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">{(b.weight * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
            <div className="px-4 py-2 space-y-1">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Currency</p>
              {ia.exposure.currency.slice(0, 4).map((b) => (
                <div key={b.label} className="flex items-center gap-2 font-mono text-[10.5px]">
                  <span className="w-28 truncate text-foreground">{b.label}</span>
                  <div className="h-[3px] min-w-0 flex-1 overflow-hidden bg-muted">
                    <div className="h-full bg-muted-foreground" style={{ width: `${Math.min(100, b.weight * 100)}%` }} />
                  </div>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">{(b.weight * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Stress ── */}
      {(worstReplay || topStresses.length > 0) && (
        <>
          <SectionHead title="Stress" note="measured windows are this book's own history · scenarios are β-propagated hypotheticals" />
          <div className="grid grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {ia.replays.map((r) => (
              <Cell
                key={r.windowDays}
                label={`Worst ${r.windowDays}-day · measured`}
                value={`${(r.worstReturn.value * 100).toFixed(1)}%`}
                color="text-loss"
                sub={`${norm.fmt(r.lossValue)} at today's value`}
              />
            ))}
            {ia.replays.length === 0 && topStresses.map((s) => (
              <Cell
                key={s.scenario.id}
                label={`${s.scenario.name} · hypothetical`}
                value={`${(s.portfolioImpact.value * 100).toFixed(1)}%`}
                color="text-loss"
                sub={`β-propagated · ${norm.fmt(s.lossValue)}`}
              />
            ))}
          </div>
        </>
      )}

      {/* ── Insights (cited) ── */}
      {topInsights.length > 0 && (
        <>
          <SectionHead title="What the numbers flag" note="deterministic rules over cited metrics — no generative step" />
          <div className="divide-y divide-border/50 border-b border-border">
            {topInsights.map((ins) => (
              <div key={ins.id} className="flex items-start gap-2 px-4 py-1.5">
                <ShieldAlert className={`mt-0.5 h-3 w-3 shrink-0 ${ins.severity === "action" ? "text-loss" : ins.severity === "watch" ? "text-warning" : "text-muted-foreground/50"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-foreground">{ins.title}</p>
                  <p className="text-[10.5px] leading-snug text-muted-foreground">{ins.statement}</p>
                  {ins.recommendation && <p className="text-[10.5px] leading-snug text-secondary-foreground">→ {ins.recommendation}</p>}
                </div>
                <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-wider text-muted-foreground/50">{ins.provenance.confidence}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Methodology footer ── */}
      <div className="space-y-1.5 px-4 py-2.5">
        <p className="font-mono text-[9.5px] leading-relaxed text-muted-foreground/70">
          weights = covered-book capital weights ({coveredCount}/{analyzedCount} with ≥30d history) · target ={" "}
          {ia.recommended
            ? `${ia.recommended.label} on shrunk Σ (${ia.recommended.diagnostics.confidence} confidence) — same engine as Augment · Portfolio Construction`
            : "unavailable (needs ≥2 assets with return history)"}{" "}
          · directive = optimizer ∧ desk verdict ∧ news, conflicts → REVIEW · health = same gauge math as the Daily Briefing
          {factor.ready && factor.model?.portfolio && (
            <> · factor model = ridge-OLS on {factor.model.factors.length} ETF/index proxies, Σ_f sample covariance, residuals assumed uncorrelated</>
          )}
          {liquidity && <> · liquidity = 20d median volume, {Math.round(liquidity.participation * 100)}% participation, no impact model</>}
          {kupiec && <> · integrity = walking 60d Kupiec POF backtest, Lo(2002) Sharpe SE, χ² σ interval (Wilson–Hilferty)</>}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[9.5px] text-muted-foreground/60">
            VaR/σ/ρ measured on {snap.lookbackDays}d daily history · β {ia.betaBasis} · advisory only — nothing here auto-executes
          </p>
          <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-foreground/80">
            select a row to open the position <ArrowRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  );
};

export default DeskPortfolioMode;
