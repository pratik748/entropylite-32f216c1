import type { SectionDef, WorkspaceDef } from "../registry";
import { useEvidence } from "../EvidenceContext";
import { MetricGrid, MetricStat } from "../Metric";
import MonteCarloChart from "@/components/MonteCarloChart";
import { formatCurrency } from "@/lib/currency";
import SectionShell from "./SectionShell";
import { Block, PendingEvidence } from "./blocks";

/**
 * Monte Carlo section — the engine's simulated 21-day outcome bands with the
 * outcome-skew evidence, reusing the desk's simulation chart.
 */
const MonteCarloView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data, graph } = useEvidence();
  const metrics = sectionMetrics(`${workspace.id}/${section.id}`);
  const a = data.analysis;
  const price = data.quote?.price ?? a?.currentPrice ?? null;
  const hasRanges = Array.isArray(a?.bullRange) && Array.isArray(a?.bearRange) && price != null;

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {hasRanges ? (
        <>
          <MonteCarloChart currentPrice={price} bullRange={a!.bullRange} bearRange={a!.bearRange} ticker={graph.ticker} />
          <Block title="Simulated bands · 21 sessions">
            <div className="grid grid-cols-3 gap-2">
              <BandTile label="Bear band" lo={a!.bearRange[0]} hi={a!.bearRange[1]} currency={graph.currency} tone="loss" />
              {Array.isArray(a?.neutralRange) && (
                <BandTile label="Neutral band" lo={a!.neutralRange[0]} hi={a!.neutralRange[1]} currency={graph.currency} tone="muted" />
              )}
              <BandTile label="Bull band" lo={a!.bullRange[0]} hi={a!.bullRange[1]} currency={graph.currency} tone="gain" />
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground/70">
              Bands come from the analysis engine's drift-and-volatility simulation over the next 21
              sessions. The skew evidence below states whether the distribution leans up or down —
              that asymmetry, not the point forecast, is what the sizing decision uses.
            </p>
          </Block>
        </>
      ) : data.status.analysis.state === "loading" ? (
        <div className="h-56 animate-pulse rounded-sm border border-border/50 bg-surface-2" />
      ) : (
        <Block title="Simulation">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            The simulation engine is re-syncing — bands render automatically when the analysis lands.
            Volatility and drawdown evidence elsewhere in the Risk Lab stays live meanwhile.
          </p>
        </Block>
      )}

      {metrics.length > 0 ? (
        <MetricGrid>
          {metrics.map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </MetricGrid>
      ) : (
        !hasRanges && <PendingEvidence section={section} />
      )}
    </SectionShell>
  );
};

const BandTile = ({ label, lo, hi, currency, tone }: { label: string; lo: number; hi: number; currency: string; tone: "gain" | "loss" | "muted" }) => (
  <div className="rounded-sm border border-border/60 px-3 py-2">
    <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{label}</p>
    <p className={`mt-1 font-mono text-[12px] font-semibold tabular-nums ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-foreground"}`}>
      {formatCurrency(lo, currency)} – {formatCurrency(hi, currency)}
    </p>
  </div>
);

export default MonteCarloView;
