import { useMemo } from "react";
import { getCurrencySymbol, formatCompact, resolveAssetCurrency } from "@/lib/currency";
import { useFX } from "@/hooks/useFX";
import { type PortfolioStock } from "@/components/PortfolioPanel";

/**
 * The ONE portfolio valuation. Every module that states what the book is
 * worth — blotter, Desk book mode, Augment, Risk — must read these totals.
 * ─────────────────────────────────────────────────────────────────────────
 * Doctrine:
 *  - EVERY position is valued, analyzed or not. A position awaiting
 *    analysis is priced at cost basis and flagged (`priceBasis: "cost"`),
 *    never silently dropped — dropping positions is how one tab said 5.3M
 *    while another said 3M for the same book.
 *  - Currency is resolved through `resolveAssetCurrency` (explicit
 *    analysis currency first, then exchange-suffix inference). No module
 *    may assume USD.
 *  - FX conversion goes through useFX, which falls back to disclosed
 *    static rates rather than a silent 1:1.
 */

export interface NormalizedHolding {
  /** Stable position id (same id as the PortfolioStock). */
  id: string;
  /** Display ticker (exchange suffix stripped) — keys the quant maps. */
  ticker: string;
  /** Exact ticker as held. */
  rawTicker: string;
  /** Market value in base currency. */
  value: number;
  invested: number;
  pnl: number;
  pnlPct: number;
  /** Native-currency price used for valuation (live or cost basis). */
  price: number;
  buyPrice: number;
  currency: string;
  quantity: number;
  risk: number;
  beta: number;
  sector: string;
  suggestion: string;
  analysis: PortfolioStock["analysis"] | undefined;
  /** Whether an analysis payload exists for this position. */
  analyzed: boolean;
  /** "live" = analysis currentPrice; "cost" = buyPrice fallback (stale). */
  priceBasis: "live" | "cost";
}

export function useNormalizedPortfolio(stocks: PortfolioStock[]) {
  const { baseCurrency, convertToBase, rateIsLive } = useFX();
  const sym = getCurrencySymbol(baseCurrency);
  const analyzed = stocks.filter(s => s.analysis);

  const { totalValue, totalInvested, totalPnl, holdings, livePricedShare, fxAllLive } = useMemo(() => {
    let tv = 0, ti = 0, liveValue = 0;
    let allLive = true;
    const h: NormalizedHolding[] = stocks.map(st => {
      const cur = resolveAssetCurrency(st.ticker, st.analysis?.currency);
      const livePrice = st.analysis?.currentPrice;
      const hasLive = typeof livePrice === "number" && livePrice > 0;
      const price = hasLive ? livePrice : st.buyPrice;
      const rawValue = price * st.quantity;
      const rawInvested = st.buyPrice * st.quantity;
      const value = convertToBase(rawValue, cur);
      const invested = convertToBase(rawInvested, cur);
      const pnl = value - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      tv += value;
      ti += invested;
      if (hasLive) liveValue += value;
      if (!rateIsLive(cur)) allLive = false;
      return {
        id: st.id,
        ticker: st.ticker.replace(".NS", "").replace(".BO", ""),
        rawTicker: st.ticker,
        value,
        invested,
        pnl,
        pnlPct,
        price,
        buyPrice: st.buyPrice,
        currency: cur,
        quantity: st.quantity,
        risk: st.analysis?.riskScore || 40,
        beta: st.analysis?.beta || 1,
        sector: st.analysis?.sector || "Unknown",
        suggestion: st.analysis?.suggestion || "Hold",
        analysis: st.analysis,
        analyzed: !!st.analysis,
        priceBasis: (hasLive ? "live" : "cost") as "live" | "cost",
      };
    });
    return {
      totalValue: tv,
      totalInvested: ti,
      totalPnl: tv - ti,
      holdings: h,
      livePricedShare: tv > 0 ? liveValue / tv : 1,
      fxAllLive: allLive,
    };
  }, [stocks, convertToBase, rateIsLive]);

  const fmt = (v: number) => formatCompact(v, baseCurrency);

  return {
    baseCurrency, sym, analyzed, totalValue, totalInvested, totalPnl,
    holdings, fmt, convertToBase,
    /** Share of book value priced from a live analysis price (rest = cost basis). */
    livePricedShare,
    /** False when any holding converted through a static fallback FX rate. */
    fxAllLive,
  };
}
