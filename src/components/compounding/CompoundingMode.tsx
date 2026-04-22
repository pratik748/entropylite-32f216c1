import { useCallback, useEffect, useMemo, useState } from "react";
import { Target, ShieldAlert, Activity, BookOpen, BarChart3, AlertTriangle, Gauge } from "lucide-react";
import { useLodgers } from "@/hooks/useLodgers";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PreTradeValidator from "./PreTradeValidator";
import ActiveLodge, { type OpenLodge } from "./ActiveLodge";
import LodgerLedger from "./LodgerLedger";
import EdgeGraph from "./EdgeGraph";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { ValidatorResult } from "@/hooks/useIntradayValidator";
import { governedInvoke } from "@/lib/apiGovernor";
import { toast } from "@/hooks/use-toast";
import { useIntradayMode } from "@/hooks/useIntradayMode";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { type PortfolioStock } from "@/components/PortfolioPanel";

const DEFAULT_CAPITAL = 10000;

interface Props {
  stocks?: PortfolioStock[];
}

const CompoundingMode = ({ stocks = [] }: Props) => {
  const lodgers = useLodgers();
  const { intradayMode } = useIntradayMode();
  const { totalValue, holdings } = useNormalizedPortfolio(stocks);
  const [capital, setCapital] = useLocalStorage<number>("compounding-capital", DEFAULT_CAPITAL);
  const [openLodges, setOpenLodges] = useLocalStorage<OpenLodge[]>("compounding-open-lodges", []);
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  // When intraday mode is ON and the user has a live portfolio, default capital to portfolio value
  const effectiveCapital = useMemo(() => {
    if (intradayMode && totalValue > 0) return totalValue;
    return capital;
  }, [intradayMode, totalValue, capital]);

  const tickerSuggestions = useMemo(
    () => holdings.map(h => h.ticker).slice(0, 12),
    [holdings]
  );

  // Live price polling for active lodges
  useEffect(() => {
    if (openLodges.length === 0) return;
    let alive = true;
    const tickers = Array.from(new Set(openLodges.map(l => l.ticker)));
    const poll = async () => {
      try {
        const { data } = await governedInvoke<{ prices: Record<string, { price: number }> }>("price-feed", { body: { tickers } });
        if (!alive || !data?.prices) return;
        const next: Record<string, number> = {};
        for (const t of tickers) {
          if (data.prices[t]?.price > 0) next[t] = data.prices[t].price;
        }
        setLivePrices(prev => ({ ...prev, ...next }));
      } catch { /* silent */ }
    };
    poll();
    const i = setInterval(poll, 15_000);
    return () => { alive = false; clearInterval(i); };
  }, [openLodges]);

  const livePriceFor = useCallback((ticker: string) => livePrices[ticker] ?? null, [livePrices]);

  const handleAcceptLodge = useCallback((r: ValidatorResult, _shares: number) => {
    const live = livePrices[r.ticker];
    const entryPx = live && live > 0 ? live : 100; // fallback notional if no live
    const qty = Math.max(1, Math.floor((capital * r.sizePct) / Math.max(0.01, entryPx)));
    const lodge: OpenLodge = {
      id: crypto.randomUUID(),
      ticker: r.ticker,
      side: "long",
      entryPx,
      qty,
      entryTs: Date.now(),
      expected: r,
      liquidityScore: r.liquidityScore,
      reflexScore: r.reflexScore,
      regime: r.regime,
    };
    setOpenLodges(prev => [...prev, lodge]);
    toast({ title: "Lodge opened", description: `${r.ticker} · ${qty} units · ${(r.sizePct * 100).toFixed(2)}% of capital` });
  }, [capital, livePrices, setOpenLodges]);

  const handleCloseLodge = useCallback(async (id: string, exitPx: number, latencyMs: number) => {
    const l = openLodges.find(x => x.id === id);
    if (!l) return;
    const pnlPct = l.side === "long"
      ? ((exitPx - l.entryPx) / l.entryPx) * 100
      : ((l.entryPx - exitPx) / l.entryPx) * 100;
    const pnlAbs = (l.side === "long" ? exitPx - l.entryPx : l.entryPx - exitPx) * l.qty;
    const actualHoldMin = Math.max(0.1, (Date.now() - l.entryTs) / 60_000);
    const slippageBps = Math.max(2, l.expected.vol * 4); // proxy
    await lodgers.closeLodge({
      ticker: l.ticker,
      side: l.side,
      entry_ts: l.entryTs,
      exit_ts: Date.now(),
      entry_px: l.entryPx,
      exit_px: exitPx,
      qty: l.qty,
      pnl_pct: pnlPct,
      pnl_abs: pnlAbs,
      expected_pct: l.expected.expectedReturnPct,
      expected_hold_min: l.expected.expectedHoldMin,
      actual_hold_min: actualHoldMin,
      regime: l.regime,
      vol_at_entry: l.expected.vol,
      liquidity_score: l.liquidityScore,
      reflex_score: l.reflexScore,
      exec_latency_ms: latencyMs,
      slippage_bps: slippageBps,
    });
    setOpenLodges(prev => prev.filter(x => x.id !== id));
    toast({
      title: pnlPct >= 0 ? "Lodge closed (gain)" : "Lodge closed (loss)",
      description: `${l.ticker} ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% in ${actualHoldMin.toFixed(1)}m`,
    });
  }, [openLodges, lodgers, setOpenLodges]);

  const targetBand = lodgers.targetProb;
  const today = lodgers.todayStats;
  const discipline = lodgers.discipline;

  return (
    <div className="space-y-3">
      {/* Daily Target Band */}
      <div className="rounded-sm border border-primary/30 bg-gradient-to-r from-primary/5 via-card to-card p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground">Daily Target Band</h3>
          </div>
          <Badge variant="outline" className="text-[9px] font-mono">Probability range — not a promise</Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <BandStat label="Target" value="1.0–2.0%" />
          <BandStat label="Today P&L" value={`${today.pnlPct >= 0 ? "+" : ""}${today.pnlPct.toFixed(2)}%`} accent={today.pnlPct >= 0 ? "gain" : "loss"} />
          <BandStat label="P(hit ≥1%)" value={`${(targetBand.pHitMin * 100).toFixed(0)}%`} accent="primary" />
          <BandStat label="P(hit ≥2%)" value={`${(targetBand.pHitMax * 100).toFixed(0)}%`} accent="primary" />
          <BandStat label="P(ruin ≤−2%)" value={`${(targetBand.pRuin * 100).toFixed(0)}%`} accent="loss" />
        </div>
        <p className="mt-2 text-[9px] font-mono text-muted-foreground italic">
          Closed-loop sim of σ, μ, and reflexivity from your last 30 trades. Compounding is the byproduct of structured repetition, not aggression.
        </p>
      </div>

      {/* Discipline Governor row */}
      <div className={`rounded-sm border px-3 py-2 flex items-center gap-3 flex-wrap ${discipline.blocked ? "border-loss/40 bg-loss/5" : "border-border bg-card"}`}>
        <div className="flex items-center gap-1.5">
          {discipline.blocked
            ? <ShieldAlert className="h-3.5 w-3.5 text-loss" />
            : <Gauge className="h-3.5 w-3.5 text-gain" />}
          <span className={`text-[10px] font-mono uppercase tracking-wider ${discipline.blocked ? "text-loss" : "text-gain"}`}>
            {discipline.blocked ? "Discipline Block Active" : "Discipline OK"}
          </span>
        </div>
        <span className="text-[9px] font-mono text-muted-foreground">Today: {today.count} trades · Consecutive losses: {discipline.consecutiveLosses}</span>
        <span className="text-[9px] font-mono text-muted-foreground">Residual budget: <span className="text-foreground">{discipline.residualBudgetPct.toFixed(2)}%</span></span>
        <span className="text-[9px] font-mono text-muted-foreground">Sharpe<sub>30</sub>: <span className="text-foreground">{lodgers.sharpe.toFixed(2)}</span></span>
        <span className="text-[9px] font-mono text-muted-foreground">Sortino<sub>30</sub>: <span className="text-foreground">{lodgers.sortino.toFixed(2)}</span></span>
        <span className="text-[9px] font-mono text-muted-foreground">DD-elasticity: <span className="text-foreground">{(lodgers.elasticity * 100).toFixed(0)}%</span></span>
        {discipline.reasons.length > 0 && (
          <div className="basis-full text-[9px] font-mono text-loss/80 flex items-center gap-1 mt-1">
            <AlertTriangle className="h-3 w-3" />
            {discipline.reasons.join(" · ")}
          </div>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <label className="text-[9px] font-mono uppercase text-muted-foreground">
            {intradayMode && totalValue > 0 ? "Capital (portfolio)" : "Capital"}
          </label>
          <input
            type="number"
            value={Math.round(effectiveCapital)}
            onChange={e => setCapital(Math.max(100, parseFloat(e.target.value) || DEFAULT_CAPITAL))}
            disabled={intradayMode && totalValue > 0}
            className="h-6 w-24 rounded-sm border border-border bg-background px-2 text-[10px] font-mono"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PreTradeValidator
          capital={effectiveCapital}
          residualBudgetPct={discipline.residualBudgetPct}
          blocked={discipline.blocked}
          blockReasons={discipline.reasons}
          onAccept={handleAcceptLodge}
          intradayMode={intradayMode}
          tickerSuggestions={tickerSuggestions}
        />
        <div className="rounded-sm border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground">Active Lodges</h3>
            <Badge variant="outline" className="text-[9px] font-mono ml-auto">{openLodges.length} open</Badge>
          </div>
          <ActiveLodge lodges={openLodges} livePriceFor={livePriceFor} onClose={handleCloseLodge} />
        </div>
      </div>

      <Tabs defaultValue="ledger" className="w-full">
        <TabsList className="h-8">
          <TabsTrigger value="ledger" className="text-[10px] font-mono uppercase">
            <BookOpen className="h-3 w-3 mr-1" /> Lodger Ledger
          </TabsTrigger>
          <TabsTrigger value="graph" className="text-[10px] font-mono uppercase">
            <BarChart3 className="h-3 w-3 mr-1" /> Edge Graph
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ledger" className="mt-2">
          <LodgerLedger trades={lodgers.trades} />
        </TabsContent>
        <TabsContent value="graph" className="mt-2">
          <EdgeGraph
            histogram={lodgers.histogram}
            decay={lodgers.decay}
            overtrade={lodgers.overtrade}
            equityCurve={lodgers.equityCurve}
            envelopes={lodgers.envelopes}
            trades={lodgers.trades}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const BandStat = ({ label, value, accent }: { label: string; value: string; accent?: "gain" | "loss" | "primary" }) => (
  <div className="rounded-sm border border-border/60 bg-surface-1 px-2 py-1.5">
    <div className="text-[9px] font-mono uppercase text-muted-foreground">{label}</div>
    <div className={`text-[14px] font-mono font-bold ${
      accent === "gain" ? "text-gain" :
      accent === "loss" ? "text-loss" :
      accent === "primary" ? "text-primary" : "text-foreground"
    }`}>{value}</div>
  </div>
);

export default CompoundingMode;