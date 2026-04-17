/**
 * Fortress Execution Layer
 * Translates abstract DefensiveActions into REAL Alpaca paper-trading orders.
 * No synthetic UI badges — every applied action submits a market order.
 */
import type { DefensiveAction } from "./fortress-engine";
import type { PortfolioStock } from "@/components/PortfolioPanel";

/** Map abstract hedge instruments → real tradable inverse/protective ETFs (Alpaca-supported). */
const INSTRUMENT_MAP: Array<{ match: RegExp; symbol: string; note: string }> = [
  { match: /VIX/i,                     symbol: "VXX",  note: "VIX-linked volatility ETN" },
  { match: /index put|β.?overlay|beta overlay/i, symbol: "SH",   note: "Inverse S&P 500 (-1x)" },
  { match: /collar/i,                  symbol: "SH",   note: "Defensive S&P inverse proxy" },
  { match: /tech|nasdaq|qqq/i,         symbol: "PSQ",  note: "Inverse Nasdaq-100 (-1x)" },
  { match: /financial|bank/i,          symbol: "SEF",  note: "Inverse Financials" },
  { match: /energy|oil/i,              symbol: "DUG",  note: "Inverse Oil & Gas (-2x)" },
  { match: /gold|metal/i,              symbol: "GLD",  note: "Gold (flight-to-safety)" },
  { match: /bond|treasury|rate/i,      symbol: "TLT",  note: "Long Treasuries" },
  { match: /dollar|usd|fx/i,           symbol: "UUP",  note: "USD index" },
];

const DEFAULT_HEDGE_SYMBOL = "SH"; // broad inverse S&P as universal portfolio hedge

export function resolveHedgeSymbol(action: DefensiveAction): { symbol: string; note: string } {
  const hint = `${action.instrument || ""} ${action.target || ""}`;
  const hit = INSTRUMENT_MAP.find((m) => m.match.test(hint));
  if (hit) return { symbol: hit.symbol, note: hit.note };
  // If the action target is itself a real ticker (sector pair-hedge picked a low-β holding),
  // fall back to the universal hedge — we want an inverse, not more long exposure.
  return { symbol: DEFAULT_HEDGE_SYMBOL, note: "Inverse S&P 500 (default portfolio hedge)" };
}

/** Compute integer share quantity for a sell/trim from local portfolio state. */
export function computeTrimQty(
  stock: PortfolioStock | undefined,
  sizePct: number,
): number {
  if (!stock) return 0;
  const reduction = Math.max(0.01, Math.min(0.95, sizePct / 100));
  // Alpaca paper supports fractional shares for most equities; round to 4dp for safety.
  const qty = +(stock.quantity * reduction).toFixed(4);
  return qty > 0 ? qty : 0;
}

/** Compute hedge quantity given target notional and a reference price. */
export function computeHedgeQty(notionalUsd: number, refPrice: number): number {
  if (refPrice <= 0 || notionalUsd <= 0) return 0;
  const qty = +(notionalUsd / refPrice).toFixed(4);
  return qty > 0 ? qty : 0;
}
