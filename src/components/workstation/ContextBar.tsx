import { Link } from "react-router-dom";
import { ArrowLeft, PanelRight } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { Action } from "@/lib/evidence/types";
import { useEvidence } from "./EvidenceContext";

interface ContextBarProps {
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

const ACTION_STYLE: Record<Action, string> = {
  ACCUMULATE: "border-gain/50 text-gain",
  HOLD: "border-border text-muted-foreground",
  REDUCE: "border-warning/50 text-warning",
  AVOID: "border-loss/50 text-loss",
};

/**
 * Workstation context bar — identity, live price, the evidence-weighted
 * verdict, and the decision-relevant status that replaced the old bottom
 * strip: per-feed freshness and evidence provenance counts.
 */
const ContextBar = ({ inspectorOpen, onToggleInspector }: ContextBarProps) => {
  const { ticker, data, graph, synthesis } = useEvidence();
  const { quote, status } = data;

  const companyName: string | null = data.dossier?.companyName ?? null;
  const hasEvidence = graph.coverage.total > 0;

  const priceFreshness =
    status.quote.state === "live" && status.quote.fetchedAt
      ? new Date(status.quote.fetchedAt).toISOString().slice(11, 19)
      : null;

  const loadingSources = Object.entries(status)
    .filter(([, s]) => s.state === "loading")
    .map(([k]) => k);

  return (
    <div className="relative flex shrink-0 items-center gap-3 border-b border-border/70 bg-surface-1/60 px-3 py-2 sm:gap-4 sm:px-4">
      <Link
        to="/dashboard"
        title="Back to Desk"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
      </Link>

      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">{ticker}</span>
        {companyName && (
          <span className="hidden max-w-[180px] truncate text-[12px] text-muted-foreground lg:inline">
            {companyName}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        {quote ? (
          <>
            <span className="text-[14px] font-semibold tabular-nums text-foreground">
              {formatCurrency(quote.price, quote.currency)}
            </span>
            <span className="text-[11px] text-muted-foreground">{quote.currency}</span>
          </>
        ) : status.quote.state === "loading" ? (
          <span className="text-[12px] text-muted-foreground animate-breathe">syncing price…</span>
        ) : (
          <span className="text-[12px] text-muted-foreground" title="Live feed will resume automatically">
            price syncing
          </span>
        )}
      </div>

      {hasEvidence && (
        <span
          className={`hidden rounded-md border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] sm:inline ${ACTION_STYLE[synthesis.action]}`}
          title={synthesis.headline}
        >
          {synthesis.action} · {synthesis.confidence}%
        </span>
      )}

      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        {hasEvidence && (
          <span
            className="hidden text-[11px] tabular-nums text-muted-foreground md:inline"
            title="Evidence nodes in the graph; estimated/model nodes carry amber provenance chips"
          >
            {graph.coverage.total} nodes · {graph.coverage.estimated} est.
          </span>
        )}
        <span className="hidden text-[11px] tabular-nums text-muted-foreground lg:inline" title="Last successful price update (UTC)">
          {priceFreshness ? `prices ${priceFreshness} UTC` : status.quote.state === "cached" ? "prices · last known" : "prices —"}
        </span>
        <button
          onClick={onToggleInspector}
          aria-pressed={inspectorOpen}
          title={inspectorOpen ? "Hide inspector" : "Show inspector"}
          className={`hidden h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors xl:flex ${
            inspectorOpen
              ? "border-border bg-surface-3 text-foreground"
              : "border-border/70 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          }`}
        >
          <PanelRight className="h-3.5 w-3.5" strokeWidth={1.75} />
          Inspector
        </button>
      </div>

      {/* Indeterminate load bar — engines still assembling evidence */}
      {loadingSources.length > 0 && (
        <div
          className="absolute inset-x-0 -bottom-px h-[2px] overflow-hidden"
          role="progressbar"
          aria-label={`Loading ${loadingSources.join(", ")}`}
          title={`Assembling evidence — ${loadingSources.join(", ")}`}
        >
          <div className="ws-loadbar h-full w-1/4 rounded-full bg-foreground/50" />
        </div>
      )}
    </div>
  );
};

export default ContextBar;
