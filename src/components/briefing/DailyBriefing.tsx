import { useMemo } from "react";
import { Flame, ShieldAlert, Activity, Compass, ArrowUpRight, ArrowDownRight, ScrollText, Sparkles } from "lucide-react";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import { useMarketRegime } from "@/hooks/useMarketRegime";
import { useQuantSnapshot } from "@/hooks/useQuantSnapshot";
import { useOutcomeGradient } from "@/hooks/useOutcomeGradient";
import { useReadingStreak } from "@/hooks/useReadingStreak";
import { evaluateConstraints, computeClankScore, clankLevel } from "@/lib/clank-engine";
import { computePortfolioHealth, healthInputFromSnapshot } from "@/lib/portfolio-health";

/**
 * SCR-01 · Daily Briefing — the anchor ritual of the Behavioral OS.
 *
 * A one-screen, 90-second synthesis composed entirely from data the platform
 * already computes: market regime (HMM), CLANK structural pressure, the real
 * quant snapshot (Portfolio Health), your holdings' moves, and scar memory.
 * The reading streak rewards *reviewing intelligence*, never trading.
 *
 * Visual language: institutional white/black/green/red — green = signal /
 * competence, red = risk. Reuses the app's existing card/border/mono tokens.
 */

interface Props {
  stocks: PortfolioStock[];
  refreshKey?: number;
}

const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

export default function DailyBriefing({ stocks, refreshKey = 0 }: Props) {
  const regime = useMarketRegime(15000, refreshKey);
  const snapshot = useQuantSnapshot(stocks);
  const { scarMemory, entries } = useOutcomeGradient();
  const streak = useReadingStreak();

  const analyzed = useMemo(() => stocks.filter((s) => s.analysis?.currentPrice), [stocks]);

  // ── CLANK structural pressure (real-signal path) ──
  const clank = useMemo(() => {
    const realSignals = {
      vix: regime?.vix,
      realizedVolAnnual: snapshot.ready ? snapshot.portfolio.sigmaAnnual * 100 : undefined,
      ar1: undefined,
    };
    const statuses = evaluateConstraints(stocks, undefined, realSignals);
    const score = computeClankScore(statuses);
    const top = [...statuses].sort((a, b) => b.pressureContribution - a.pressureContribution)[0];
    return { score, level: clankLevel(score), top };
  }, [stocks, regime?.vix, snapshot.ready, snapshot.portfolio.sigmaAnnual]);

  // ── Portfolio Health vital ──
  const health = useMemo(() => {
    const input = healthInputFromSnapshot(snapshot, regime?.regime);
    return input ? computePortfolioHealth(input) : null;
  }, [snapshot, regime?.regime]);

  // ── "For you" — holdings that crossed a line ──
  const movers = useMemo(() => {
    return analyzed
      .map((s) => {
        const cp = s.analysis.currentPrice as number;
        const pnlPct = ((cp - s.buyPrice) / s.buyPrice) * 100;
        const suggestion = s.analysis.suggestion as string | undefined;
        const flagged = Math.abs(pnlPct) >= 5 || suggestion === "Exit";
        return { ticker: s.ticker, pnlPct, suggestion, flagged };
      })
      .filter((m) => m.flagged)
      .sort((a, b) => Math.abs(b.pnlPct) - Math.abs(a.pnlPct))
      .slice(0, 4);
  }, [analyzed]);

  // ── Scar memory: patterns you've logged (avoided/repeated) ──
  const scars = useMemo(() => {
    const losses = (scarMemory || []).filter((s) => (s.realized_pnl_pct ?? 0) < 0);
    const recent = losses[0];
    return { count: losses.length, recent };
  }, [scarMemory]);

  const regimeStressed = /crisis|high vol|bear/i.test(regime?.regime || "");
  const streakDays = Math.max(streak.current, 1);
  const streakCells = Array.from({ length: 14 }, (_, i) => i < ((streakDays - 1) % 14) + 1);

  return (
    <div className="mx-auto max-w-5xl px-3 py-4 sm:py-6 space-y-4">
      {/* ── Header row: greeting + streak ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            SCR-01 · Morning Briefing
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Ahead of the open
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            A 90-second read on what changed — no trade required to win the day.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Flame className={`h-4 w-4 ${streak.current > 0 ? "text-gain" : "text-muted-foreground"}`} />
            <span className="font-mono text-lg font-semibold tabular-nums text-foreground">{streak.current}</span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">day streak</span>
          </div>
          <div className="mt-1.5 flex gap-[3px]" aria-hidden="true">
            {streakCells.map((on, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-[1px] ${on ? "bg-gain" : "bg-muted"} ${
                  on && i === (((streakDays - 1) % 14)) ? "animate-pulse-glow" : ""
                }`}
              />
            ))}
          </div>
          <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            best {streak.best} · reading, not trading
          </p>
        </div>
      </div>

      {/* ── Top grid: Health vital + Regime ── */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* Portfolio Health */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-gain" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Portfolio Health
            </span>
          </div>
          {health ? (
            <div className="flex items-center gap-4">
              <HealthRing score={health.score} band={health.band} />
              <div className="min-w-0 flex-1 space-y-1.5">
                {health.gauges.map((g) => (
                  <div key={g.key} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${g.score >= 55 ? "bg-gain" : "bg-loss"}`}
                        style={{ width: `${g.score}%` }}
                      />
                    </div>
                    <span className="w-8 shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground">
                      {Math.round(g.score)}
                    </span>
                  </div>
                ))}
                <p className="pt-1 font-mono text-[9px] leading-relaxed text-muted-foreground">
                  {health.gauges.map((g) => g.detail).join(" · ")}
                </p>
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Add 2+ analyzed holdings to compute your health vital.
            </p>
          )}
        </div>

        {/* Market Regime */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Compass className="h-3.5 w-3.5 text-gain" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Market Regime
            </span>
          </div>
          {regime ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className={`text-xl font-semibold tracking-tight ${regimeStressed ? "text-loss" : "text-foreground"}`}>
                  {regime.regime}
                </span>
                {regime.hmm && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    HMM {(regime.hmm.persistence * 100).toFixed(0)}% persistence
                  </span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="VIX" value={regime.vix.toFixed(1)} tone={regime.vix > 25 ? "bad" : "neutral"} />
                <Stat label="Mood" value={regime.moodScore.toFixed(0)} tone={regime.moodScore < -20 ? "bad" : regime.moodScore > 20 ? "good" : "neutral"} />
                <Stat label="Conditions" value={String(regime.conditions.length)} tone="neutral" />
              </div>
              {regime.conditions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {regime.conditions.slice(0, 3).map((c) => (
                    <span
                      key={c.id}
                      className={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                        c.severity === "high"
                          ? "border-loss/40 bg-loss/10 text-loss"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground animate-pulse">Reading the tape…</p>
          )}
        </div>
      </div>

      {/* ── CLANK pressure ── */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className={`h-3.5 w-3.5 ${clank.score >= 60 ? "text-loss" : "text-gain"}`} />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              CLANK Structural Pressure
            </span>
          </div>
          <span className={`font-mono text-[10px] uppercase tracking-wider ${clank.score >= 60 ? "text-loss" : "text-muted-foreground"}`}>
            {clank.level.label}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-1">
            <span className={`text-3xl font-semibold tabular-nums ${clank.score >= 60 ? "text-loss" : "text-foreground"}`}>
              {clank.score}
            </span>
            <span className="font-mono text-xs text-muted-foreground">/100</span>
          </div>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full ${clank.score >= 60 ? "bg-loss" : "bg-gain"}`}
              style={{ width: `${clank.score}%` }}
            />
          </div>
        </div>
        {clank.top && clank.top.activationProbability > 0.1 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Leading constraint:{" "}
            <span className="text-foreground">{clank.top.constraint.name}</span>{" "}
            — {(clank.top.activationProbability * 100).toFixed(0)}% activation, forced{" "}
            {clank.top.constraint.forcedAction.toLowerCase()} pressure.
          </p>
        )}
      </div>

      {/* ── For you + Scar journal ── */}
      <div className="grid gap-3 md:grid-cols-2">
        {/* For you */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-gain" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              For You — Holdings That Crossed a Line
            </span>
          </div>
          {movers.length > 0 ? (
            <ul className="space-y-2">
              {movers.map((m) => (
                <li key={m.ticker} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    {m.pnlPct >= 0 ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-gain" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5 text-loss" />
                    )}
                    <span className="font-mono text-sm text-foreground">{m.ticker}</span>
                    {m.suggestion === "Exit" && (
                      <span className="rounded border border-loss/40 bg-loss/10 px-1.5 py-0.5 font-mono text-[9px] uppercase text-loss">
                        review
                      </span>
                    )}
                  </div>
                  <span className={`font-mono text-sm tabular-nums ${m.pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                    {fmtPct(m.pnlPct)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {analyzed.length > 0 ? "Nothing crossed a threshold — a calm book today." : "Analyze a holding to populate this."}
            </p>
          )}
        </div>

        {/* Scar journal */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2">
            <ScrollText className="h-3.5 w-3.5 text-gain" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Scar Journal
            </span>
          </div>
          {scars.count > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-foreground">{scars.count}</span>
                <span className="text-xs text-muted-foreground">logged failure {scars.count === 1 ? "pattern" : "patterns"}</span>
              </div>
              {scars.recent && (
                <p className="text-xs text-muted-foreground">
                  Most recent:{" "}
                  <span className="text-foreground">{scars.recent.ticker}</span>{" "}
                  <span className="font-mono">{(scars.recent.failure_pattern || "loss").replace(/_/g, " ")}</span>{" "}
                  <span className="text-loss">{fmtPct(scars.recent.realized_pnl_pct ?? 0)}</span>. Watch the same setup before repeating it.
                </p>
              )}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No scars yet. Closed losing trades are journaled here so the pattern doesn&apos;t repeat.
            </p>
          )}
        </div>
      </div>

      <p className="pt-1 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {entries.length} decisions logged · every number links to its source module
      </p>
    </div>
  );
}

/* ── Health ring ── */
function HealthRing({ score, band }: { score: number; band: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const strong = band === "strong" || band === "steady";
  const stroke = strong ? "hsl(var(--gain))" : "hsl(var(--loss))";
  const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="relative h-[74px] w-[74px] shrink-0">
      <svg viewBox="0 0 74 74" className="h-full w-full -rotate-90">
        <circle cx="37" cy="37" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
        <circle
          cx="37" cy="37" r={r} fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums text-foreground">{score}</span>
        <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">{band}</span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-gain" : tone === "bad" ? "text-loss" : "text-foreground";
  return (
    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-mono text-sm tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
