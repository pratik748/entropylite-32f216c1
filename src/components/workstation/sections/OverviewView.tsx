import { Link } from "react-router-dom";
import type { SectionDef, WorkspaceDef } from "../registry";
import { sectionPath } from "../registry";
import { useEvidence } from "../EvidenceContext";
import { MetricRow } from "../Metric";
import SectionShell from "./SectionShell";
import { Block, PendingEvidence } from "./blocks";
import type { Action } from "@/lib/evidence/types";

const ACTION_TONE: Record<Action, string> = {
  ACCUMULATE: "text-gain border-gain/40",
  HOLD: "text-muted-foreground border-border",
  REDUCE: "text-warning border-warning/40",
  AVOID: "text-loss border-loss/40",
};

/**
 * Executive landing — the call and why on one screen: verdict, six pillar
 * scores, strongest evidence each way, and where to go deeper.
 */
const OverviewView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { ticker, graph, synthesis, select, data } = useEvidence();

  if (data.bootstrapping) {
    return (
      <SectionShell workspace={workspace} section={section} wide>
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-sm border border-border/50 bg-surface-2" />
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-border/50 bg-border/50 sm:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse bg-surface-2" />
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground/70 animate-breathe">
            Running twelve engines against {ticker} — fundamentals, price structure, dossier, simulation…
          </p>
        </div>
      </SectionShell>
    );
  }

  if (graph.coverage.total === 0) {
    return (
      <SectionShell workspace={workspace} section={section} wide>
        <Block title="Evidence engines are re-syncing">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            No feed answered on the first pass for {ticker} — the desk keeps retrying in the background
            and this page fills in the moment any engine lands. Live prices, fundamentals and the
            dossier each recover independently, so a single slow feed never blocks the rest.
          </p>
        </Block>
        <PendingEvidence section={section} />
      </SectionShell>
    );
  }

  const supporting = synthesis.ledger.movers.filter((m) => m.weight > 0).slice(0, 4);
  const opposing = synthesis.ledger.movers.filter((m) => m.weight < 0).slice(0, 4);

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {/* Verdict banner */}
      <Block>
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`rounded-sm border px-2.5 py-1 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] ${ACTION_TONE[synthesis.action]}`}
          >
            {synthesis.action}
          </span>
          <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
            confidence {synthesis.confidence}% · {graph.coverage.total} evidence nodes ·{" "}
            {graph.coverage.estimated} estimated
          </span>
        </div>
        <p className="mt-2.5 text-[14px] leading-relaxed text-foreground">{synthesis.headline}</p>
        <div className="mt-2 space-y-1">
          {synthesis.narrative.map((line, i) => (
            <p key={i} className="text-[12px] leading-relaxed text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </Block>

      {/* Pillars — hairline matrix */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-border/80 bg-border/70 sm:grid-cols-6">
        {synthesis.pillars.map((p) => {
          const top = p.nodeIds
            .map((id) => graph.metrics[id])
            .sort((a, b) => Math.abs(b.thesisWeight) - Math.abs(a.thesisWeight))[0];
          return (
            <button
              key={p.pillar}
              onClick={() => top && select(top.id)}
              title={top ? `Strongest evidence: ${top.label}` : "No evidence yet"}
              className="flex flex-col bg-card px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
            >
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                {p.label}
              </span>
              <span
                className={`mt-1 font-mono text-[18px] font-semibold tabular-nums ${
                  p.score >= 70 ? "text-gain" : p.score <= 38 ? "text-loss" : "text-foreground"
                }`}
              >
                {p.score}
              </span>
              <span className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-surface-3">
                <span
                  className={`block h-full rounded-full ${p.score >= 70 ? "bg-gain" : p.score <= 38 ? "bg-loss" : "bg-muted-foreground/60"}`}
                  style={{ width: `${p.score}%` }}
                />
              </span>
              <span className="mt-1 truncate text-[10px] text-muted-foreground">{p.read}</span>
            </button>
          );
        })}
      </div>

      {/* Evidence for / against */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Strongest evidence — for">
          {supporting.length > 0 ? (
            <div className="space-y-0.5">
              {supporting.map((m) => (
                <MetricRow key={m.id} metric={graph.metrics[m.id]} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              Nothing on the long side clears the evidence bar right now — that in itself is the finding.
            </p>
          )}
        </Block>
        <Block title="Strongest evidence — against">
          {opposing.length > 0 ? (
            <div className="space-y-0.5">
              {opposing.map((m) => (
                <MetricRow key={m.id} metric={graph.metrics[m.id]} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              No material opposing evidence in the current graph — verify with the Risk Lab before sizing up.
            </p>
          )}
        </Block>
      </div>

      {/* Breaker digest + deep links */}
      <Block
        title="Thesis breakers"
        action={
          <Link
            to={sectionPath(ticker, "thesis", "breakers")}
            className="text-[10.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Full panel ⟩
          </Link>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {synthesis.breakers.map((b) => (
            <span
              key={b.id}
              title={b.detail}
              className={`rounded-sm border px-2 py-1 font-mono text-[10px] tracking-tight ${
                b.state === "tripped"
                  ? "border-loss/50 text-loss"
                  : b.state === "watch"
                    ? "border-warning/50 text-warning"
                    : "border-border/70 text-muted-foreground"
              }`}
            >
              {b.label} · {b.state}
            </span>
          ))}
          {synthesis.breakers.length === 0 && (
            <p className="text-[12px] text-muted-foreground">
              Breakers arm as soon as structure and risk evidence finish loading.
            </p>
          )}
        </div>
      </Block>
    </SectionShell>
  );
};

export default OverviewView;
