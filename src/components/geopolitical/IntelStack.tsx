import { useMemo, useState } from "react";
import { ExternalLink, X, TrendingUp, TrendingDown, Activity } from "lucide-react";
import type { ScoredGeoEvent } from "@/hooks/useGeoEvents";
import type { TickerThreat } from "@/hooks/useGeoIntelligence";
import CausalGraph from "./CausalGraph";
import { cn } from "@/lib/utils";

interface Props {
  event: ScoredGeoEvent | null;
  onClear: () => void;
  portfolioTickers: string[];
  tickerThreats: Record<string, TickerThreat>;
}

function deriveTradeSignal(e: ScoredGeoEvent): { stance: "Bullish" | "Bearish" | "Volatile"; confidence: number; horizon: string; tone: string } {
  // Heuristic mapping — causal-effects gives the precise picture; this is the at-a-glance chip.
  const sev = e.severity;
  const rel = e.market_relevance;
  const conf = Math.round((0.5 * e.confidence + 0.3 * rel + 0.2 * sev) * 100);

  let stance: "Bullish" | "Bearish" | "Volatile" = "Volatile";
  if (e.category === "military" || e.category === "supply_chain") stance = "Bearish";
  else if (e.category === "economic" && sev > 0.6) stance = "Volatile";
  else if (e.category === "political") stance = "Volatile";
  else stance = "Volatile";

  const horizon = sev > 0.7 ? "1-3 days" : sev > 0.4 ? "1-2 weeks" : "weeks → months";
  const tone =
    stance === "Bearish"
      ? "border-loss/40 bg-loss/5 text-loss"
      : stance === "Bullish"
      ? "border-gain/40 bg-gain/5 text-gain"
      : "border-warning/40 bg-warning/5 text-warning";
  return { stance, confidence: conf, horizon, tone };
}

export default function IntelStack({ event, onClear, portfolioTickers, tickerThreats }: Props) {
  const [tab, setTab] = useState<"snapshot" | "causal">("snapshot");

  const exposed = useMemo(() => {
    if (!event) return [];
    const eventTickers = new Set((event.entities?.tickers || []).map(t => t.toUpperCase()));
    return portfolioTickers.filter(t => {
      const bare = t.replace(/\.(NS|BO|L|T|HK|SS|SZ|DE|F|PA)$/i, "").toUpperCase();
      return eventTickers.has(t.toUpperCase()) || eventTickers.has(bare);
    });
  }, [event, portfolioTickers]);

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground border border-dashed border-border rounded-md">
        <Activity className="h-5 w-5 mb-2 opacity-50" />
        <p className="text-[11px] font-mono uppercase tracking-widest">Intel Stack</p>
        <p className="text-[10px] mt-1.5 max-w-[200px]">Tap any event on the map or in the wire to drill into its causal cascade.</p>
      </div>
    );
  }

  const sig = deriveTradeSignal(event);

  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-1/60">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-widest text-foreground">
            Intel Stack
          </span>
        </div>
        <button
          onClick={onClear}
          className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Snapshot — always visible at top */}
      <div className="px-3 py-2.5 border-b border-border space-y-2">
        <div className="text-[12px] font-medium leading-snug text-foreground">
          {event.title}
        </div>
        <div className="flex items-center justify-between font-mono text-[9px] text-muted-foreground">
          <span>{event.source}</span>
          <span>{new Date(event.ts).toUTCString().slice(5, 22)}</span>
        </div>
        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            Source <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}

        {/* Trade Impact Signal */}
        <div className={cn("flex items-center justify-between gap-2 mt-2 px-2 py-1.5 rounded-sm border", sig.tone)}>
          <div className="flex items-center gap-1.5">
            {sig.stance === "Bearish" ? <TrendingDown className="h-3 w-3" /> : sig.stance === "Bullish" ? <TrendingUp className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
            <span className="font-mono text-[10px] uppercase tracking-widest font-bold">{sig.stance}</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[9px]">
            <span>conf {sig.confidence}%</span>
            <span className="opacity-70">· {sig.horizon}</span>
          </div>
        </div>

        {exposed.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[9px] uppercase text-muted-foreground">Exposed:</span>
            {exposed.slice(0, 6).map(t => {
              const score = tickerThreats[t]?.score;
              return (
                <span key={t} className="inline-flex items-center gap-1 rounded-sm bg-loss/10 border border-loss/30 px-1 py-0.5 font-mono text-[9px] text-loss">
                  {t}{score != null && <span className="opacity-70">· {score}</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center border-b border-border bg-surface-1/40">
        {(["snapshot", "causal"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest transition-colors",
              tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "snapshot" ? "Entities" : "Causal Chain"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "snapshot" ? (
          <div className="p-3 space-y-3 overflow-y-auto h-full">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Location</div>
              <div className="text-[11px] text-foreground">
                {event.loc?.place || `${event.loc.lat.toFixed(2)}, ${event.loc.lng.toFixed(2)}`}
              </div>
            </div>
            {event.entities?.countries?.length > 0 && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Countries</div>
                <div className="flex flex-wrap gap-1">
                  {event.entities.countries.slice(0, 8).map(c => (
                    <span key={c} className="px-1.5 py-0.5 rounded-sm bg-muted/50 font-mono text-[9px] text-foreground/80">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {event.entities?.tickers?.length > 0 && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Tickers</div>
                <div className="flex flex-wrap gap-1">
                  {event.entities.tickers.slice(0, 10).map(t => (
                    <span key={t} className="px-1.5 py-0.5 rounded-sm bg-primary/10 border border-primary/20 font-mono text-[9px] text-primary">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {event.entities?.commodities?.length > 0 && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Commodities</div>
                <div className="flex flex-wrap gap-1">
                  {event.entities.commodities.slice(0, 8).map(c => (
                    <span key={c} className="px-1.5 py-0.5 rounded-sm bg-warning/10 border border-warning/20 font-mono text-[9px] text-warning">{c}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border">
              {[
                { l: "Severity", v: event.severity },
                { l: "Mkt Rel", v: event.market_relevance },
                { l: "Velocity", v: event.velocity },
              ].map(m => (
                <div key={m.l}>
                  <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">{m.l}</div>
                  <div className="font-mono text-sm tabular-nums text-foreground">{Math.round(m.v * 100)}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full h-full" style={{ minHeight: 320 }}>
            <CausalGraph
              eventKey={event.id}
              rootLabel={event.title}
              portfolio={exposed.join(", ")}
            />
          </div>
        )}
      </div>
    </div>
  );
}