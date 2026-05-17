import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EDGAR_BASE = "https://efts.sec.gov/LATEST/search-index?q=";
const EDGAR_FILINGS = "https://efts.sec.gov/LATEST/search-index";
const EDGAR_FULL_TEXT = "https://efts.sec.gov/LATEST/search-index";
const SEC_HEADERS = { "User-Agent": "EntropyLite research@entropy.app", "Accept": "application/json" };

interface Filing {
  ticker: string;
  companyName: string;
  formType: string;
  filedDate: string;
  description: string;
  url: string;
  significance: "high" | "medium" | "low";
}

interface InsiderTrade {
  ticker: string;
  insiderName: string;
  title: string;
  transactionType: "BUY" | "SELL" | "UNKNOWN";
  shares: number | null;
  pricePerShare: number | null;
  totalValue: number | null;
  filedDate: string;
  url: string;
  source: "edgar-form4" | "edgar-listing";
}

// Search SEC EDGAR full-text search
async function searchFilings(tickers: string[]): Promise<Filing[]> {
  const filings: Filing[] = [];
  
  for (const ticker of tickers.slice(0, 5)) {
    try {
      const url = `https://efts.sec.gov/LATEST/search-index?q=%22${ticker}%22&dateRange=custom&startdt=${getDateDaysAgo(30)}&enddt=${getTodayDate()}&forms=10-K,10-Q,8-K,4&from=0&size=5`;
      const res = await fetch(url, { headers: SEC_HEADERS });
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      
      if (data.hits?.hits) {
        for (const hit of data.hits.hits.slice(0, 3)) {
          const source = hit._source || {};
          const formType = source.form_type || source.file_type || "Unknown";
          filings.push({
            ticker,
            companyName: source.display_names?.[0] || source.entity_name || ticker,
            formType,
            filedDate: source.file_date || source.period_of_report || "Unknown",
            description: source.display_description || `${formType} filing for ${ticker}`,
            url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=${formType}&dateb=&owner=include&count=5`,
            significance: formType === "8-K" ? "high" : formType.startsWith("10") ? "medium" : "low",
          });
        }
      }
    } catch (e) {
      console.error(`EDGAR search for ${ticker} failed:`, e);
    }
  }

  // If EDGAR full-text fails, use the simpler company search
  if (filings.length === 0) {
    for (const ticker of tickers.slice(0, 5)) {
      try {
        const url = `https://efts.sec.gov/LATEST/search-index?q=%22${ticker}%22&forms=10-K,10-Q,8-K`;
        const res = await fetch(url, { headers: SEC_HEADERS });
        if (!res.ok) { await res.text(); continue; }
        // No data — return nothing rather than fabricate a row.
      } catch {
        // silently continue
      }
    }
  }

  return filings;
}

// Insider trading from SEC EDGAR Form 4
async function fetchInsiderTrades(tickers: string[]): Promise<InsiderTrade[]> {
  const trades: InsiderTrade[] = [];

  for (const ticker of tickers.slice(0, 5)) {
    try {
      // Use SEC company search for Form 4
      const url = `https://efts.sec.gov/LATEST/search-index?q=%22${ticker}%22&forms=4&dateRange=custom&startdt=${getDateDaysAgo(90)}&enddt=${getTodayDate()}&from=0&size=5`;
      const res = await fetch(url, { headers: SEC_HEADERS });
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();

      if (data.hits?.hits) {
        for (const hit of data.hits.hits.slice(0, 3)) {
          const s = hit._source || {};
          // EDGAR listing API does not give shares/price — those live inside
          // the Form 4 XML. We refuse to fabricate them. Surface only what
          // EDGAR actually returned, with a link so the user can audit.
          const accession = String(hit._id || "").split(":")[0] || "";
          const filingUrl = accession
            ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(s.ciks?.[0] || ticker)}&type=4&dateb=&owner=include&count=10`
            : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${ticker}&type=4&dateb=&owner=include&count=10`;
          trades.push({
            ticker,
            insiderName: s.display_names?.[0] || "Insider",
            title: "Officer/Director",
            transactionType: "UNKNOWN",
            shares: null,
            pricePerShare: null,
            totalValue: null,
            filedDate: s.file_date || getTodayDate(),
            url: filingUrl,
            source: "edgar-listing",
          });
        }
      }
    } catch (e) {
      console.error(`Insider trades for ${ticker} failed:`, e);
    }
  }

  return trades;
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function getDateDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split("T")[0];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const tickers: string[] = body.tickers || ["AAPL", "MSFT", "GOOGL"];

    const [filings, insiderTrades] = await Promise.all([
      searchFilings(tickers),
      fetchInsiderTrades(tickers),
    ]);

    // Compute insider sentiment
    // Insider sentiment requires real BUY/SELL classification from Form 4 XML,
    // which we do not yet parse. Until we do, return null instead of a
    // fabricated coin-flip score.
    const buyCount = insiderTrades.filter(t => t.transactionType === "BUY").length;
    const sellCount = insiderTrades.filter(t => t.transactionType === "SELL").length;
    const insiderSentiment: number | null = (buyCount + sellCount > 0)
      ? ((buyCount - sellCount) / (buyCount + sellCount)) * 100
      : null;

    return new Response(JSON.stringify({
      filings,
      insiderTrades,
      insiderSentiment,
      provenance: {
        filings: "sec.gov EDGAR full-text search",
        insiderTrades: "sec.gov EDGAR Form 4 listing (shares/price not parsed — UNKNOWN until Form 4 XML reader is wired)",
      },
      summary: {
        totalFilings: filings.length,
        totalInsiderTrades: insiderTrades.length,
        highSignificance: filings.filter(f => f.significance === "high").length,
        netInsiderBuying: insiderSentiment !== null ? buyCount > sellCount : null,
      },
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("sec-filings error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
