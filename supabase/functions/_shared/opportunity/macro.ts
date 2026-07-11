// Macro context layer — the engine understands the environment before it
// scores securities. Every field is measured from a market instrument;
// nothing is asserted from opinion:
//
//   Interest rates      ^TNX (10y yield), ^IRX (13-week yield)
//   Yield curve         10y − 3m slope
//   Dollar strength     UUP (Invesco DB USD Index Bullish)
//   Volatility regime   ^VIX level + 1y percentile
//   Credit conditions   HYG vs LQD relative strength (high-yield vs IG)
//   Sector leadership   S&P sector ETF 63-day relative strength vs SPY
//
// The context feeds regime detection, the macro-alignment model, the
// causal chain model, and is exposed verbatim in the engine response so
// the UI can show WHY the environment reads the way it does.

import { fetchDailyChart, type ChartSeries } from "./evidence.ts";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function ret(closes: number[], window: number): number | null {
  if (closes.length <= window) return null;
  const a = closes[closes.length - 1 - window];
  const b = closes[closes.length - 1];
  return a > 0 ? (b - a) / a : null;
}

function last(series: ChartSeries | null): number | null {
  if (!series || series.closes.length === 0) return null;
  return series.closes[series.closes.length - 1];
}

function percentileOfLast(closes: number[]): number | null {
  if (closes.length < 60) return null;
  const lastV = closes[closes.length - 1];
  let below = 0;
  for (const c of closes) if (c < lastV) below++;
  return below / closes.length;
}

export interface SectorLeadership {
  symbol: string;      // sector ETF
  sector: string;      // canonical sector name
  relStrength63d: number; // sector 63d return minus SPY 63d return
}

export interface MacroContext {
  rates: {
    tenYearPct: number | null;        // e.g. 4.25
    threeMonthPct: number | null;
    curveSlopePct: number | null;     // 10y − 3m, percentage points
    tenYearChange63dPct: number | null; // change in yield, percentage points
  };
  dollar: {
    ret63d: number | null;                 // UUP 63-day return
    usdinrRet63d?: number | null;          // USD/INR 63-day change (India mode only)
  };
  volatility: { vix: number | null; vixPercentile1y: number | null };
  credit: { highYieldRelStrength63d: number | null }; // HYG 63d − LQD 63d; negative = spreads widening
  sectors: {
    ranked: SectorLeadership[];       // best → worst relative strength
    bySector: Record<string, number>; // canonical sector name → rel strength
  };
  evidence: string[];
  /** Instruments that could not be fetched — reported, never faked. */
  missing: string[];
}

// Sector ETF grids ↔ Yahoo `assetProfile.sector` names, per region.
// US: S&P sector SPDRs vs SPY. India: NSE BeES sector ETFs vs NIFTYBEES —
// the liquid on-exchange proxies for institutional sector rotation there.
const US_SECTOR_ETFS: Array<{ symbol: string; sector: string }> = [
  { symbol: "XLK", sector: "Technology" },
  { symbol: "XLF", sector: "Financial Services" },
  { symbol: "XLE", sector: "Energy" },
  { symbol: "XLV", sector: "Healthcare" },
  { symbol: "XLI", sector: "Industrials" },
  { symbol: "XLP", sector: "Consumer Defensive" },
  { symbol: "XLY", sector: "Consumer Cyclical" },
  { symbol: "XLU", sector: "Utilities" },
  { symbol: "XLB", sector: "Basic Materials" },
  { symbol: "XLRE", sector: "Real Estate" },
  { symbol: "XLC", sector: "Communication Services" },
];

const INDIA_SECTOR_ETFS: Array<{ symbol: string; sector: string }> = [
  { symbol: "BANKBEES.NS", sector: "Financial Services" },
  { symbol: "ITBEES.NS", sector: "Technology" },
  { symbol: "PHARMABEES.NS", sector: "Healthcare" },
  { symbol: "AUTOBEES.NS", sector: "Consumer Cyclical" },
];

function sectorGrid(indiaMode: boolean): Array<{ symbol: string; sector: string }> {
  return indiaMode ? INDIA_SECTOR_ETFS : US_SECTOR_ETFS;
}

/**
 * Every instrument the macro layer measures for a region — both execution
 * venues fetch this list. US rates / dollar / credit are kept in India mode
 * too: they are the global drivers of FII flows into Indian equities. India
 * adds its own vol index (^INDIAVIX), the USD/INR rate, and NSE sector ETFs.
 */
export function macroSymbols(indiaMode: boolean): string[] {
  const base = ["^TNX", "^IRX", "UUP", "^VIX", "HYG", "LQD"];
  const india = indiaMode ? ["^INDIAVIX", "USDINR=X"] : [];
  return [...base, ...india, ...sectorGrid(indiaMode).map((s) => s.symbol)];
}

/** Backwards-compatible US list. */
export const MACRO_SYMBOLS: string[] = macroSymbols(false);

/**
 * Pure builder: derive the macro context from already-fetched chart
 * series. The edge function feeds it via `collectMacroContext`; the
 * browser fallback feeds it from the deployed `historical-prices`
 * function. Same math either way.
 */
export function buildMacroContext(
  charts: Map<string, ChartSeries | null>,
  benchmark: ChartSeries | null,
  indiaMode = false,
): MacroContext {
  const symbols = macroSymbols(indiaMode);
  const missing: string[] = symbols.filter((s) => !charts.get(s));
  const evidence: string[] = [];

  // ── Rates & curve (Yahoo's ^TNX/^IRX chart closes are the yield in %,
  //    e.g. 4.28 — verified against live data) ───────────────────
  const tnx = charts.get("^TNX") ?? null;
  const irx = charts.get("^IRX") ?? null;
  const tenYearPct = last(tnx) != null ? Number(last(tnx)!.toFixed(2)) : null;
  const threeMonthPct = last(irx) != null ? Number(last(irx)!.toFixed(2)) : null;
  const curveSlopePct = tenYearPct != null && threeMonthPct != null
    ? Number((tenYearPct - threeMonthPct).toFixed(2))
    : null;
  let tenYearChange63dPct: number | null = null;
  if (tnx && tnx.closes.length > 63) {
    tenYearChange63dPct = Number((tnx.closes[tnx.closes.length - 1] - tnx.closes[tnx.closes.length - 64]).toFixed(2));
  }
  if (tenYearPct != null) {
    evidence.push(
      `10-year yield ${tenYearPct}%${tenYearChange63dPct != null ? ` (${tenYearChange63dPct >= 0 ? "+" : ""}${tenYearChange63dPct}pt over 63d)` : ""}` +
      (curveSlopePct != null ? `; 10y−3m curve ${curveSlopePct >= 0 ? "+" : ""}${curveSlopePct}pt${curveSlopePct < 0 ? " (inverted)" : ""}` : "") + ".",
    );
  }

  // ── Dollar (plus USD/INR in India mode — the FII-flow channel) ─
  const uup = charts.get("UUP") ?? null;
  const dollarRet63d = uup ? ret(uup.closes, 63) : null;
  if (dollarRet63d != null) {
    evidence.push(`Dollar (UUP) ${dollarRet63d >= 0 ? "+" : ""}${pct(dollarRet63d)} over 63 days — ${dollarRet63d > 0.02 ? "strengthening" : dollarRet63d < -0.02 ? "weakening" : "stable"}.`);
  }
  const usdinr = indiaMode ? charts.get("USDINR=X") ?? null : null;
  const usdinrRet63d = usdinr ? ret(usdinr.closes, 63) : null;
  if (usdinrRet63d != null) {
    evidence.push(
      `USD/INR ${usdinrRet63d >= 0 ? "+" : ""}${pct(usdinrRet63d)} over 63 days — rupee ${usdinrRet63d > 0.01 ? "weakening (FII outflow pressure)" : usdinrRet63d < -0.01 ? "strengthening (FII inflow support)" : "stable"}.`,
    );
  }

  // ── Volatility regime (India VIX preferred in India mode) ─────
  const usVix = charts.get("^VIX") ?? null;
  const indiaVix = indiaMode ? charts.get("^INDIAVIX") ?? null : null;
  const vixSeries = indiaVix ?? usVix;
  const vixName = indiaVix ? "India VIX" : "VIX";
  const vix = last(vixSeries);
  const vixPercentile1y = vixSeries ? percentileOfLast(vixSeries.closes) : null;
  if (vix != null) {
    evidence.push(
      `${vixName} ${vix.toFixed(1)}${vixPercentile1y != null ? ` — ${Math.round(vixPercentile1y * 100)}th percentile of its 1-year range` : ""} (${vixPercentile1y != null && vixPercentile1y > 0.7 ? "stressed" : vixPercentile1y != null && vixPercentile1y < 0.3 ? "calm" : "mid-range"}).`,
    );
  }

  // ── Credit conditions ─────────────────────────────────────────
  const hyg = charts.get("HYG") ?? null;
  const lqd = charts.get("LQD") ?? null;
  const hygRet = hyg ? ret(hyg.closes, 63) : null;
  const lqdRet = lqd ? ret(lqd.closes, 63) : null;
  const highYieldRelStrength63d = hygRet != null && lqdRet != null ? Number((hygRet - lqdRet).toFixed(4)) : null;
  if (highYieldRelStrength63d != null) {
    evidence.push(
      `High-yield vs investment-grade credit (HYG−LQD) ${highYieldRelStrength63d >= 0 ? "+" : ""}${pct(highYieldRelStrength63d)} over 63d — spreads ${highYieldRelStrength63d < -0.01 ? "widening (risk aversion)" : highYieldRelStrength63d > 0.01 ? "tightening (risk appetite)" : "steady"}.`,
    );
  }

  // ── Sector leadership (region-appropriate grid vs its benchmark) ─
  const benchName = indiaMode ? "NIFTYBEES" : "SPY";
  const benchRet63 = benchmark ? ret(benchmark.closes, 63) : null;
  const ranked: SectorLeadership[] = [];
  for (const { symbol, sector } of sectorGrid(indiaMode)) {
    const series = charts.get(symbol);
    const r = series ? ret(series.closes, 63) : null;
    if (r != null && benchRet63 != null) {
      ranked.push({ symbol, sector, relStrength63d: Number((r - benchRet63).toFixed(4)) });
    }
  }
  ranked.sort((a, b) => b.relStrength63d - a.relStrength63d);
  const bySector: Record<string, number> = {};
  for (const s of ranked) bySector[s.sector] = s.relStrength63d;
  if (ranked.length >= 3) {
    evidence.push(
      `Sector leadership (63d vs ${benchName}): ${ranked.slice(0, 3).map((s) => `${s.sector} ${s.relStrength63d >= 0 ? "+" : ""}${pct(s.relStrength63d)}`).join(", ")}; ` +
      `lagging: ${ranked.slice(-2).map((s) => `${s.sector} ${pct(s.relStrength63d)}`).join(", ")}.`,
    );
  }

  return {
    rates: { tenYearPct, threeMonthPct, curveSlopePct, tenYearChange63dPct },
    dollar: { ret63d: dollarRet63d, usdinrRet63d },
    volatility: { vix, vixPercentile1y },
    credit: { highYieldRelStrength63d },
    sectors: { ranked, bySector },
    evidence,
    missing,
  };
}

/** Edge-venue collector: fetch every macro instrument, then build. */
export async function collectMacroContext(benchmark: ChartSeries | null, indiaMode = false): Promise<MacroContext> {
  const charts = new Map<string, ChartSeries | null>();
  await Promise.all(macroSymbols(indiaMode).map(async (s) => charts.set(s, await fetchDailyChart(s).catch(() => null))));
  return buildMacroContext(charts, benchmark, indiaMode);
}

/**
 * Sector relative strength for a candidate, from its Yahoo sector name.
 * Returns null when the sector is unknown — the models must abstain on
 * that dimension rather than assume.
 */
export function sectorRelStrength(macro: MacroContext, sector: string | null | undefined): number | null {
  if (!sector) return null;
  if (sector in macro.sectors.bySector) return macro.sectors.bySector[sector];
  // Tolerate Yahoo naming drift ("Financial Services" vs "Financials" etc.)
  const norm = sector.toLowerCase();
  for (const [name, v] of Object.entries(macro.sectors.bySector)) {
    const n = name.toLowerCase();
    if (n.includes(norm) || norm.includes(n.split(" ")[0])) return v;
  }
  return null;
}
