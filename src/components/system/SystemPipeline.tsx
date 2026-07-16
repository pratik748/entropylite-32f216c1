import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, Database, Sigma, Target, Zap, Monitor, PieChart, RefreshCw } from "lucide-react";
import { getGovernorMetrics } from "@/lib/apiGovernor";
import { useQuantSnapshot } from "@/hooks/useQuantSnapshot";
import { useInstitutionalAnalytics } from "@/hooks/useInstitutionalAnalytics";
import { useOpportunities } from "@/hooks/useOpportunities";
import { useTradeLogger } from "@/hooks/useTradeLogger";
import { DP_ENGINE_STATUS_KEY } from "@/components/DirectProfitMode";
import type { PortfolioStock } from "@/components/PortfolioPanel";

/**
 * System — the platform's data-flow architecture as a live status board.
 *
 *   Market Data Layer
 *     → Quantitative Core Engine (risk · factor · MC · volatility · sentiment)
 *       → Discovery (opportunity ranking)  |  → Direct Profit (decision engine)
 *         → Institutional Workstation (research · portfolio · execution · monitoring)
 *           → Performance Attribution
 *             → Continuous Feedback
 *
 * Every figure on this board is read from the same stores the modules
 * themselves use (governor metrics, quant snapshot, opportunity repository,
 * engine breadcrumbs, trade log). Layers with no data show their designed
 * pending state — the board never invents a status.
 */

interface SystemPipelineProps {
  stocks: PortfolioStock[];
  onNavigate: (tab: string) => void;
}

type Tone = "live" | "pending" | "warn";

interface EngineBreadcrumb {
  state: "live" | "unreachable";
  ts: number;
  reason?: string;
}

function readEngineBreadcrumb(): EngineBreadcrumb | null {
  try {
    const raw = localStorage.getItem(DP_ENGINE_STATUS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.state === "live" || parsed.state === "unreachable") && typeof parsed.ts === "number") return parsed;
    return null;
  } catch {
    return null;
  }
}

function agoLabel(ts: number | null): string {
  if (!ts) return "never";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const TONE_DOT: Record<Tone, string> = {
  live: "bg-gain",
  pending: "bg-muted-foreground/50",
  warn: "bg-warning",
};

const Connector = ({ label }: { label?: string }) => (
  <div className="flex flex-col items-center py-0.5" aria-hidden>
    <div className="h-3 w-px bg-border" />
    <ArrowDown className="h-3 w-3 text-muted-foreground/60 -my-0.5" strokeWidth={1.75} />
    {label && <span className="text-[8.5px] font-mono uppercase tracking-widest text-muted-foreground/50 mt-0.5">{label}</span>}
  </div>
);

const LayerCard = ({
  icon,
  title,
  subtitle,
  tone,
  statusLabel,
  metrics,
  note,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  tone: Tone;
  statusLabel: string;
  metrics: { label: string; value: string }[];
  note?: string;
  action?: { label: string; onClick: () => void };
}) => (
  <div className="w-full rounded-xl border border-border/80 bg-card shadow-soft p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-surface-2 text-muted-foreground">
          {icon}
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground">{title}</div>
          {subtitle && <div className="text-[9.5px] font-mono uppercase tracking-wider text-muted-foreground/70 truncate">{subtitle}</div>}
        </div>
      </div>
      <span className="flex items-center gap-1.5 shrink-0 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
        <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]} ${tone === "live" ? "animate-pulse" : ""}`} />
        {statusLabel}
      </span>
    </div>

    {metrics.length > 0 && (
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        {metrics.map((m) => (
          <div key={m.label} className="min-w-0">
            <div className="text-[8.5px] font-mono uppercase tracking-wider text-muted-foreground/70">{m.label}</div>
            <div className="text-[13px] font-bold font-mono text-foreground truncate">{m.value}</div>
          </div>
        ))}
      </div>
    )}

    {(note || action) && (
      <div className="mt-3 flex items-end justify-between gap-3">
        {note ? <p className="text-[10px] text-muted-foreground leading-relaxed">{note}</p> : <span />}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 text-[9px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-surface-2/60 transition-colors"
          >
            {action.label} →
          </button>
        )}
      </div>
    )}
  </div>
);

const SystemPipeline = ({ stocks, onNavigate }: SystemPipelineProps) => {
  const navigate = useNavigate();
  const snapshot = useQuantSnapshot(stocks);
  const inst = useInstitutionalAnalytics(stocks);
  // auto: false — the board reports the opportunity repository as it stands;
  // it never fires the heavy engine just to render a status.
  const { opportunities, fetchedAt } = useOpportunities({}, { auto: false });
  const { entries } = useTradeLogger();

  const [governor, setGovernor] = useState(() => getGovernorMetrics());
  const [engineCrumb, setEngineCrumb] = useState<EngineBreadcrumb | null>(() => readEngineBreadcrumb());
  useEffect(() => {
    const t = setInterval(() => {
      setGovernor(getGovernorMetrics());
      setEngineCrumb(readEngineBreadcrumb());
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const attribution = inst.attribution;
  const portReturn = useMemo(
    () => (attribution ? attribution.positions.reduce((s, p) => s + p.contributionPct, 0) : null),
    [attribution],
  );
  const topContributor = useMemo(() => {
    if (!attribution || attribution.positions.length === 0) return null;
    return [...attribution.positions].sort((a, b) => b.contributionPct - a.contributionPct)[0];
  }, [attribution]);
  const topDetractor = useMemo(() => {
    if (!attribution || attribution.positions.length === 0) return null;
    const sorted = [...attribution.positions].sort((a, b) => a.contributionPct - b.contributionPct);
    return sorted[0].contributionPct < 0 ? sorted[0] : null;
  }, [attribution]);

  const lessons = entries.filter((e) => e.lesson && e.lesson.trim().length > 0);
  const wins = entries.filter((e) => e.pnl > 0).length;

  const pct = (n: number | null | undefined, d = 1) =>
    n == null || !Number.isFinite(n) ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`;

  return (
    <div className="max-w-3xl mx-auto space-y-0">
      <div className="mb-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">System</div>
        <h1 className="text-title-3 text-foreground mt-0.5">Signal path</h1>
        <p className="text-footnote text-muted-foreground mt-1 max-w-xl">
          The platform's data flow, live. Each layer reports the same stores the modules read — nothing on this board is asserted without data behind it.
        </p>
      </div>

      {/* 1 — Market Data Layer */}
      <LayerCard
        icon={<Database className="h-3.5 w-3.5" strokeWidth={1.75} />}
        title="Market Data Layer"
        subtitle="price feed · historical bars · statements · news · macro"
        tone={governor.requestsTotal > 0 ? "live" : "pending"}
        statusLabel={governor.requestsTotal > 0 ? "flowing" : "idle"}
        metrics={[
          { label: "Requests / hr", value: String(governor.requestsPerHour) },
          { label: "Cache hits", value: String(governor.cacheHits) },
          { label: "Endpoints", value: String(Object.keys(governor.endpointCounts).length) },
          { label: "Saved by governor", value: `${governor.savingsPercent}%` },
        ]}
        note="Every call routes through the API governor: TTL cache, inflight dedup, AI cooldowns. Source states (live / cached / unavailable) travel with each payload."
      />
      <Connector />

      {/* 2 — Quantitative Core Engine */}
      <LayerCard
        icon={<Sigma className="h-3.5 w-3.5" strokeWidth={1.75} />}
        title="Quantitative Core Engine"
        subtitle="risk · factor · monte carlo · volatility · sentiment"
        tone={snapshot.ready ? "live" : "pending"}
        statusLabel={snapshot.ready ? `σ from ${snapshot.lookbackDays}d history` : stocks.length === 0 ? "awaiting positions" : "hydrating"}
        metrics={[
          { label: "σ annual", value: snapshot.ready ? `${(snapshot.portfolio.sigmaAnnual * 100).toFixed(1)}%` : "—" },
          {
            label: "VaR 95 (1d)",
            value: snapshot.ready && snapshot.totalValue > 0 ? `${((snapshot.portfolio.var95 / snapshot.totalValue) * 100).toFixed(1)}% of book` : "—",
          },
          {
            label: "CVaR 95 (1d)",
            value: snapshot.ready && snapshot.totalValue > 0 ? `${((snapshot.portfolio.cvar95 / snapshot.totalValue) * 100).toFixed(1)}% of book` : "—",
          },
          { label: "Sharpe", value: snapshot.ready ? snapshot.portfolio.sharpe.toFixed(2) : "—" },
        ]}
        note={
          snapshot.ready
            ? "Historical σ/μ/VaR/CVaR from real returns via the shared quant snapshot — the single risk source every module must consume. Monte Carlo is seeded and deterministic."
            : "Activates when the book has positions with price history — the core never substitutes assumed volatility."
        }
        action={{ label: "Risk", onClick: () => onNavigate("risk") }}
      />
      <Connector />

      {/* 3 — the two decision engines, side by side as in the architecture */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <LayerCard
          icon={<Target className="h-3.5 w-3.5" strokeWidth={1.75} />}
          title="Discovery"
          subtitle="opportunity ranking"
          tone={opportunities.length > 0 ? "live" : "pending"}
          statusLabel={opportunities.length > 0 ? `ranked ${agoLabel(fetchedAt)}` : "not yet run"}
          metrics={[
            { label: "Validated", value: String(opportunities.length) },
            {
              label: "Top conviction",
              value: opportunities.length > 0 ? `${opportunities[0].symbol} ${(opportunities[0].confidence * 100).toFixed(0)}%` : "—",
            },
          ]}
          note="Ranked by |edge| × calibrated confidence / risk. Confidence is capped at 95% — never certainty."
          action={{ label: "Discover", onClick: () => onNavigate("desirable") }}
        />
        <LayerCard
          icon={<Zap className="h-3.5 w-3.5" strokeWidth={1.75} />}
          title="Direct Profit"
          subtitle="decision engine"
          tone={engineCrumb ? (engineCrumb.state === "live" ? "live" : "warn") : "pending"}
          statusLabel={
            engineCrumb
              ? engineCrumb.state === "live"
                ? `engine live ${agoLabel(engineCrumb.ts)}`
                : `unreachable ${agoLabel(engineCrumb.ts)}`
              : "no run this session"
          }
          metrics={[
            { label: "Trade gate", value: "p ≥ 53%" },
            { label: "Edge gate", value: "E[R] ≥ 0.05R" },
          ]}
          note={
            engineCrumb?.state === "unreachable"
              ? `Last attempt failed${engineCrumb.reason ? `: ${engineCrumb.reason}` : ""}. The surface falls back to evidence synthesis and says so.`
              : "Calibrated ensemble: cost-adjusted expected value, cointegration, walk-forward, structural credit. Every ticket ships with its audit."
          }
        />
      </div>
      <Connector />

      {/* 4 — Institutional Workstation */}
      <LayerCard
        icon={<Monitor className="h-3.5 w-3.5" strokeWidth={1.75} />}
        title="Institutional Workstation"
        subtitle="research · portfolio · execution · monitoring"
        tone={stocks.length > 0 ? "live" : "pending"}
        statusLabel={stocks.length > 0 ? `${stocks.length} position${stocks.length === 1 ? "" : "s"} on the book` : "book empty"}
        metrics={[
          { label: "Positions", value: String(stocks.length) },
          { label: "Analyzed", value: String(stocks.filter((s) => s.analysis).length) },
        ]}
        note="Every position opens into the workstation: evidence graph, thesis breakers, statements, risk lab — the research surface both engines feed."
        action={
          stocks.length > 0
            ? { label: "Workstation", onClick: () => navigate(`/company/${encodeURIComponent(stocks[0].ticker)}`) }
            : { label: "Desk", onClick: () => onNavigate("dashboard") }
        }
      />
      <Connector />

      {/* 5 — Performance Attribution */}
      <LayerCard
        icon={<PieChart className="h-3.5 w-3.5" strokeWidth={1.75} />}
        title="Performance Attribution"
        subtitle="contribution · risk decomposition · brinson"
        tone={attribution && attribution.positions.length > 0 ? "live" : "pending"}
        statusLabel={attribution && attribution.positions.length > 0 ? "decomposed" : "awaiting book"}
        metrics={[
          { label: "Portfolio return", value: pct(portReturn) },
          { label: "Top contributor", value: topContributor ? `${topContributor.ticker} ${pct(topContributor.contributionPct)}` : "—" },
          { label: "Top detractor", value: topDetractor ? `${topDetractor.ticker} ${pct(topDetractor.contributionPct)}` : "—" },
          { label: "Risk shares", value: attribution?.positions.some((p) => p.riskContributionPct != null) ? "Euler ∂σ" : "—" },
        ]}
        note="Contribution = weight × return, exactly additive to the portfolio return. Risk shares are the Euler decomposition of portfolio σ from the real covariance matrix."
        action={{ label: "Augment", onClick: () => onNavigate("augment") }}
      />
      <Connector />

      {/* 6 — Continuous Feedback */}
      <LayerCard
        icon={<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />}
        title="Continuous Feedback"
        subtitle="signal outcomes · trade lessons · calibration"
        tone={entries.length > 0 ? "live" : "pending"}
        statusLabel={entries.length > 0 ? `${entries.length} logged trade${entries.length === 1 ? "" : "s"}` : "no closed loops yet"}
        metrics={[
          { label: "Trades logged", value: String(entries.length) },
          { label: "Wins", value: entries.length > 0 ? `${wins}/${entries.length}` : "—" },
          { label: "Lessons", value: String(lessons.length) },
        ]}
        note="Every directional signal is logged and marked to market T+5 by the nightly walk-forward job; the fitted calibration feeds back into the ensemble's win-probabilities. Trade lessons close the human loop."
      />
    </div>
  );
};

export default SystemPipeline;
