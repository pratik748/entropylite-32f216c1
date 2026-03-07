import { useMemo } from "react";
import { getCurrencySymbol, formatCompact } from "@/lib/currency";
import { useFX } from "@/hooks/useFX";
import { type PortfolioStock } from "@/components/PortfolioPanel";

/** Shared hook for all modules that need FX-normalized portfolio values */
export function useNormalizedPortfolio(stocks: PortfolioStock[]) {
  const { baseCurrency, convertToBase } = useFX();
  const sym = getCurrencySymbol(baseCurrency);
  const analyzed = stocks.filter(s => s.analysis);

  const { totalValue, totalInvested, totalPnl, holdings } = useMemo(() => {
    let tv = 0, ti = 0;
    const h = analyzed.map(st => {
      const cur = st.analysis?.currency || "USD";
      const price = st.analysis?.currentPrice || st.buyPrice;
      const rawValue = price * st.quantity;
      const rawInvested = st.buyPrice * st.quantity;
      const value = convertToBase(rawValue, cur);
      const invested = convertToBase(rawInvested, cur);
      const pnl = value - invested;
      const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
      tv += value;
      ti += invested;
      return {
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
      };
    });
    return { totalValue: tv, totalInvested: ti, totalPnl: tv - ti, holdings: h };
  }, [analyzed, convertToBase]);

  const fmt = (v: number) => formatCompact(v, baseCurrency);

  return { baseCurrency, sym, analyzed, totalValue, totalInvested, totalPnl, holdings, fmt, convertToBase };
}
