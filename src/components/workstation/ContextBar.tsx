import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, PanelRight } from "lucide-react";
import { governedInvoke } from "@/lib/apiGovernor";
import { formatCurrency } from "@/lib/currency";

interface ContextBarProps {
  ticker: string;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
}

interface LivePrice {
  price: number;
  currency: string;
  asOf: number;
}

/**
 * Workstation context bar — company identity, live price and data freshness.
 * Always visible; carries the decision-relevant status that used to be
 * scattered in the bottom status strip (feed freshness, provenance counts).
 */
const ContextBar = ({ ticker, inspectorOpen, onToggleInspector }: ContextBarProps) => {
  const [live, setLive] = useState<LivePrice | null>(null);
  const [stale, setStale] = useState(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    setLive(null);
    setStale(false);

    const refresh = async () => {
      try {
        const { data, error } = await governedInvoke("price-feed", { body: { tickers: [ticker] } });
        if (!aliveRef.current) return;
        const quote = data?.prices?.[ticker];
        if (!error && quote?.price > 0) {
          setLive({ price: quote.price, currency: quote.currency || "USD", asOf: Date.now() });
          setStale(false);
        } else {
          setStale(true);
        }
      } catch {
        if (aliveRef.current) setStale(true);
      }
    };

    refresh();
    const interval = setInterval(refresh, 15000);
    return () => {
      aliveRef.current = false;
      clearInterval(interval);
    };
  }, [ticker]);

  const freshness = live ? new Date(live.asOf).toISOString().slice(11, 19) : null;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-border/70 bg-surface-1/60 px-3 py-2 sm:gap-4 sm:px-4">
      <Link
        to="/dashboard"
        title="Back to Desk"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
      </Link>

      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">{ticker}</span>
        <span className="hidden text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground/70 sm:inline">
          Equity Workstation
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        {live ? (
          <>
            <span className="text-[14px] font-semibold tabular-nums text-foreground">
              {formatCurrency(live.price, live.currency)}
            </span>
            <span className="text-[11px] text-muted-foreground">{live.currency}</span>
          </>
        ) : (
          <span className="text-[12px] text-muted-foreground">{stale ? "price unavailable" : "loading price…"}</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3 sm:gap-4">
        <span className="hidden text-[11px] tabular-nums text-muted-foreground md:inline" title="Last successful price update (UTC)">
          {freshness ? `prices ${freshness} UTC` : "prices —"}
          {stale && live && <span className="text-warning"> · stale</span>}
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
    </div>
  );
};

export default ContextBar;
