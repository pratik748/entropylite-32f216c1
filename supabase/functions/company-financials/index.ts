import { requireAuth } from "../_shared/auth.ts";
import { buildTickerCandidates, normalizeTickerInput } from "../_shared/ticker.ts";

/**
 * company-financials — deterministic statement pipeline.
 *
 * Fetches real income statement, balance sheet and cash-flow history plus
 * the ratio/margin block from Yahoo's quoteSummary endpoint and normalizes
 * it into a compact typed payload. No LLM anywhere: every number is a
 * reported figure or a trivial arithmetic derivation (FCF = OCF − capex).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MODULES = [
  "incomeStatementHistory",
  "balanceSheetHistory",
  "cashflowStatementHistory",
  "financialData",
  "defaultKeyStatistics",
  "summaryDetail",
  "price",
].join(",");

// Isolate-lifetime cache: statements move quarterly, not per request.
const cache = new Map<string, { ts: number; data: unknown }>();
const TTL = 6 * 60 * 60 * 1000;

const raw = (v: unknown): number | null => {
  const n = (v as { raw?: number })?.raw;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

function periodLabel(endDate: unknown): string {
  const ts = raw(endDate);
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return `FY${d.getUTCFullYear()}${d.getUTCMonth() < 6 ? "" : ""}`;
}

// deno-lint-ignore no-explicit-any
function normalize(sym: string, q: any) {
  const inc = (q?.incomeStatementHistory?.incomeStatementHistory ?? []) as any[];
  const bal = (q?.balanceSheetHistory?.balanceSheetStatements ?? []) as any[];
  const cf = (q?.cashflowStatementHistory?.cashflowStatements ?? []) as any[];
  const fin = q?.financialData ?? {};
  const stats = q?.defaultKeyStatistics ?? {};
  const summary = q?.summaryDetail ?? {};
  const priceMod = q?.price ?? {};

  const income = inc.slice(0, 4).map((r) => ({
    period: periodLabel(r?.endDate),
    endDate: raw(r?.endDate),
    revenue: raw(r?.totalRevenue),
    grossProfit: raw(r?.grossProfit),
    operatingIncome: raw(r?.operatingIncome),
    netIncome: raw(r?.netIncome),
  }));

  const balance = bal.slice(0, 4).map((r) => ({
    period: periodLabel(r?.endDate),
    endDate: raw(r?.endDate),
    totalAssets: raw(r?.totalAssets),
    totalLiabilities: raw(r?.totalLiab),
    equity: raw(r?.totalStockholderEquity),
    cash: raw(r?.cash),
    longTermDebt: raw(r?.longTermDebt),
    currentAssets: raw(r?.totalCurrentAssets),
    currentLiabilities: raw(r?.totalCurrentLiabilities),
  }));

  const cashflow = cf.slice(0, 4).map((r) => {
    const ocf = raw(r?.totalCashFromOperatingActivities);
    const capex = raw(r?.capitalExpenditures);
    return {
      period: periodLabel(r?.endDate),
      endDate: raw(r?.endDate),
      operatingCF: ocf,
      capex,
      freeCF: ocf != null && capex != null ? ocf + capex : null, // capex reported negative
      dividendsPaid: raw(r?.dividendsPaid),
      buybacks: raw(r?.repurchaseOfStock),
      netIncome: raw(r?.netIncome),
    };
  });

  // Only ship a payload that actually carries statements or ratios.
  const hasStatements = income.some((r) => r.revenue != null) || balance.length > 0 || cashflow.length > 0;
  const ratios = {
    grossMargin: raw(fin?.grossMargins),
    operatingMargin: raw(fin?.operatingMargins),
    netMargin: raw(fin?.profitMargins),
    returnOnEquity: raw(fin?.returnOnEquity),
    returnOnAssets: raw(fin?.returnOnAssets),
    currentRatio: raw(fin?.currentRatio),
    quickRatio: raw(fin?.quickRatio),
    debtToEquity: raw(fin?.debtToEquity),
    totalCash: raw(fin?.totalCash),
    totalDebt: raw(fin?.totalDebt),
    ebitda: raw(fin?.ebitda),
    operatingCashflow: raw(fin?.operatingCashflow),
    freeCashflow: raw(fin?.freeCashflow),
    revenueGrowth: raw(fin?.revenueGrowth),
    earningsGrowth: raw(fin?.earningsGrowth),
  };
  const hasRatios = Object.values(ratios).some((v) => v != null);
  if (!hasStatements && !hasRatios) return null;

  return {
    symbol: sym,
    currency: fin?.financialCurrency ?? priceMod?.currency ?? "USD",
    marketCap: raw(priceMod?.marketCap) ?? raw(summary?.marketCap),
    sharesOutstanding: raw(stats?.sharesOutstanding),
    income,
    balance,
    cashflow,
    ratios,
    asOf: Date.now(),
  };
}

async function fetchQuoteSummary(sym: string): Promise<unknown | null> {
  for (const host of ["query1", "query2"]) {
    try {
      const url = `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${MODULES}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
      if (!res.ok) {
        await res.text().catch(() => "");
        continue;
      }
      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];
      if (result) {
        const normalized = normalize(sym, result);
        if (normalized) return normalized;
      }
    } catch {
      /* try next host / candidate */
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const { ticker: rawTicker } = await req.json();
    if (!rawTicker) throw new Error("ticker required");
    const ticker = normalizeTickerInput(rawTicker);

    const cached = cache.get(ticker);
    if (cached && Date.now() - cached.ts < TTL) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data: unknown | null = null;
    for (const sym of buildTickerCandidates(ticker)) {
      data = await fetchQuoteSummary(sym);
      if (data) break;
    }

    if (!data) {
      return new Response(JSON.stringify({ error: "no statement data available" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    cache.set(ticker, { ts: Date.now(), data });
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: (err as Error).message || "failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
