/**
 * SASHA Sub-100ms Heuristic Intent Router
 *
 * Fast deterministic parser that recognizes financial and quantitative intents
 * in < 5ms without network calls. Maps raw queries to strongly-typed execution
 * instructions for EntropyLite's quantitative engines.
 */

import { normalizeUserTicker } from "@/lib/ticker";
import { SYMBOL_DIRECTORY } from "@/lib/symbolDirectory";
import type {
  SashaParsedIntent,
  SubsetRiskIntent,
  StockComparisonIntent,
  NewsImpactIntent,
  StressTestIntent,
  LLMFallbackIntent,
} from "./types";

// Common sector mappings to recognize subsets
const SECTOR_ALIASES: Record<string, string[]> = {
  banking: ["bank", "banking", "finance", "financials", "fin", "nbfc", "lenders"],
  tech: ["tech", "technology", "software", "semis", "semiconductor", "cloud", "saas", "ai"],
  energy: ["energy", "oil", "gas", "petroleum", "power", "renewables", "crude"],
  auto: ["auto", "automotive", "ev", "motor", "vehicles", "cars"],
  pharma: ["pharma", "healthcare", "biotech", "drug", "hospital"],
  consumer: ["consumer", "fmcg", "retail", "staples", "discretionary"],
  industrial: ["industrial", "metals", "mining", "steel", "infra", "infrastructure"],
  crypto: ["crypto", "bitcoin", "ethereum", "web3", "tokens"],
  defense: ["defense", "defence", "aerospace", "military"],
};

/** Match words to canonical sector */
export function matchSectorFromText(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [sector, aliases] of Object.entries(SECTOR_ALIASES)) {
    for (const alias of aliases) {
      const regex = new RegExp(`\\b${alias}\\b`, "i");
      if (regex.test(lower)) return sector;
    }
  }
  return null;
}

/** Resolve symbol or company alias to canonical ticker */
export function resolveSymbolCandidate(word: string): string | null {
  const clean = word.replace(/[^a-zA-Z0-9^.=-]/g, "").trim().toUpperCase();
  if (!clean) return null;

  // Direct match in symbol directory
  const direct = SYMBOL_DIRECTORY.find(
    (s) => s.ticker.toUpperCase() === clean || s.ticker.replace(/\.(NS|BO)$/i, "").toUpperCase() === clean
  );
  if (direct) return direct.ticker;

  // Exact alias / name match in symbol directory
  const lowerWord = word.toLowerCase().trim();
  const exactAlias = SYMBOL_DIRECTORY.find(
    (s) => s.aliases?.some((a) => a.toLowerCase() === lowerWord) || s.name.toLowerCase() === lowerWord
  );
  if (exactAlias) return exactAlias.ticker;

  // Normalize check (Indian base / aliases)
  const normalized = normalizeUserTicker(clean);
  if (normalized && normalized !== clean) return normalized;

  // Alias / Name partial match
  const aliasHit = SYMBOL_DIRECTORY.find((s) => {
    if (s.name.toLowerCase().includes(lowerWord)) return true;
    if (s.aliases?.some((a) => a.toLowerCase().includes(lowerWord) || lowerWord.includes(a.toLowerCase()))) return true;
    return false;
  });
  if (aliasHit) return aliasHit.ticker;

  if (normalized) return normalized;
  if (/^[A-Z0-9^.-]{2,12}$/.test(clean)) {
    return clean;
  }
  return null;
}

/**
 * Route a query string to a Sasha intent in < 5ms.
 */
export function routeSashaIntent(rawQuery: string): SashaParsedIntent {
  const query = rawQuery.trim();
  const lower = query.toLowerCase();

  // ── 1. Stock Comparison & Pairs Trading ─────────────────────────────────
  // Patterns: "compare X and Y", "X vs Y", "compare X to Y", "pairs trade X and Y", "correlation X and Y"
  const compareMatch =
    query.match(/compare\s+([\w^.-]+(?:\s+\w+)?)\s+(?:and|vs|versus|with|to)\s+([\w^.-]+(?:\s+\w+)?)/i) ||
    query.match(/([\w^.-]+(?:\s+\w+)?)\s+(?:vs|versus)\s+([\w^.-]+(?:\s+\w+)?)/i) ||
    query.match(/pairs?\s+trade\s+([\w^.-]+(?:\s+\w+)?)\s+(?:and|vs|to)\s+([\w^.-]+(?:\s+\w+)?)/i) ||
    query.match(/correlation\s+between\s+([\w^.-]+(?:\s+\w+)?)\s+and\s+([\w^.-]+(?:\s+\w+)?)/i);

  if (compareMatch && compareMatch[1] && compareMatch[2]) {
    const rawA = compareMatch[1].trim();
    const rawB = compareMatch[2].trim();
    const tickerA = resolveSymbolCandidate(rawA) || rawA.toUpperCase();
    const tickerB = resolveSymbolCandidate(rawB) || rawB.toUpperCase();

    if (tickerA && tickerB && tickerA !== tickerB) {
      return {
        type: "stock_comparison",
        rawQuery: query,
        tickerA,
        tickerB,
        range: "6mo",
      };
    }
  }

  // ── 2. Scenario Stress Tests ────────────────────────────────────────────
  // Patterns: "what happens in a oil shock?", "what happens if oil spikes 15% and Nifty drops 2%?", "what if oil spikes 15%", "stress test +20% vix", "market crash"
  const isStressQuery =
    /\b(what happens (?:in|if|during)|what if|stress test|simulate|shock|spikes?|drops?|plunges?|crashes?|scenario|drawdown under|impact of)\b/i.test(lower) &&
    (/(?:oil|crude|petroleum|market|nifty|sp500|s&p|vix|rate|rates|yield|recession|crash|inflation|tariff)/i.test(lower) ||
     /(\d+%\s*|\d+\s*bps|\d+\s*percent)/i.test(lower));

  if (isStressQuery) {
    let marketShockPct: number | undefined;
    let commodityShockPct: { commodity: string; shockPct: number } | undefined;
    let vixShockPct: number | undefined;
    let interestRateShockBps: number | undefined;

    // Detect oil / crude shock (e.g. "oil spikes 15%", "what happens in a oil shock", "crude surge")
    const oilPctMatch = lower.match(/(?:oil|crude|petroleum)\s+(?:spikes|surges|jumps|up|rises|shock)\s+(\d+(?:\.\d+)?)\s*%/i) ||
      lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:oil|crude)\s*(?:spike|jump|surge|shock)/i);
    if (oilPctMatch) {
      commodityShockPct = { commodity: "Brent Crude Oil", shockPct: parseFloat(oilPctMatch[1]) };
    } else if (/\b(oil|crude|petroleum)\s*(?:shock|spike|surge|crisis|jump)?\b/i.test(lower)) {
      // Standard calibrated institutional oil shock scenario (+15% crude, -2.5% market)
      commodityShockPct = { commodity: "Brent Crude Oil", shockPct: 15 };
      if (marketShockPct === undefined) marketShockPct = -2.5;
    }

    // Detect market / index drops (e.g. "nifty drops 2%", "s&p drops 5%", "market crash")
    const marketMatch = lower.match(/(?:nifty|sp500|s&p|market|index)\s+(?:drops|falls|down|plunges|slumps|crashes)\s+(\d+(?:\.\d+)?)\s*%/i) ||
      lower.match(/(?:drops|falls|down|plunges)\s+(\d+(?:\.\d+)?)\s*%/i);
    if (marketMatch) {
      marketShockPct = -Math.abs(parseFloat(marketMatch[1]));
    } else if (/\b(market crash|recession|liquidity crunch|flash crash)\b/i.test(lower)) {
      marketShockPct = -10;
      if (vixShockPct === undefined) vixShockPct = 35;
    }

    // Detect VIX spike
    const vixMatch = lower.match(/vix\s+(?:spikes|surges|jumps|up|\+)\s*(\d+(?:\.\d+)?)\s*%/i) ||
      lower.match(/\+\s*(\d+(?:\.\d+)?)\s*%\s*vix/i);
    if (vixMatch) {
      vixShockPct = parseFloat(vixMatch[1]);
    } else if (/\b(vix spike|volatility spike)\b/i.test(lower)) {
      vixShockPct = 25;
    }

    // Detect Rate hike (e.g. "rates rise 50 bps", "rate hike 75 bps", "interest rate hike")
    const rateMatch = lower.match(/(?:rates?|interest\s*rates?)\s+(?:rise|hike|increase|up)\s*(\d+)\s*bps/i);
    if (rateMatch) {
      interestRateShockBps = parseInt(rateMatch[1], 10);
    } else if (/\b(rate hike|interest rate hike|tightening)\b/i.test(lower)) {
      interestRateShockBps = 50;
      if (marketShockPct === undefined) marketShockPct = -2;
    }

    // Default market shock if only custom description was given
    if (marketShockPct === undefined && !commodityShockPct && !vixShockPct && !interestRateShockBps) {
      const anyPct = lower.match(/(-?\d+(?:\.\d+)?)\s*%/);
      if (anyPct) {
        marketShockPct = parseFloat(anyPct[1]);
      }
    }

    return {
      type: "stress_test",
      rawQuery: query,
      shockDescription: query,
      marketShockPct: marketShockPct ?? -5,
      commodityShockPct,
      vixShockPct,
      interestRateShockBps,
    };
  }

  // ── 3. Incoming News & Macro Headwinds ──────────────────────────────────
  // Patterns: "what's moving energy?", "summarize geopolitical headwinds", "what is moving NVDA?", "news on tech"
  const isNewsQuery =
    /\b(moving|news|headwinds|tailwinds|geopolitical|headlines|catalysts|macro|inflation|fed|war|conflict)\b/i.test(lower) ||
    /what(?:'s|\s+is)\s+moving/i.test(lower);

  if (isNewsQuery) {
    const sector = matchSectorFromText(lower);
    // Check if query targets a specific ticker
    const words = query.split(/\s+/);
    let specificTicker: string | undefined;
    for (const w of words) {
      const cand = resolveSymbolCandidate(w);
      if (cand && cand.length >= 2 && !["NEWS", "MACRO", "FED", "WAR", "WHAT", "MOVING"].includes(cand)) {
        specificTicker = cand;
        break;
      }
    }

    return {
      type: "news_impact",
      rawQuery: query,
      topicOrSector: sector || (specificTicker ? `${specificTicker} Equity` : "Global Macro & Energy"),
      ticker: specificTicker,
    };
  }

  // ── 4. Subset Portfolio Analysis ─────────────────────────────────────────
  // Patterns: "analyze my banking subset", "tech subset", "high-beta positions", "energy holdings", "risk of banking"
  const isSubsetQuery =
    /\b(subset|holdings|positions|portfolio|allocation|risk|euler|var|cvar|volatility|exposure)\b/i.test(lower) ||
    matchSectorFromText(lower) !== null ||
    /\b(high[\s-]beta|low[\s-]beta|gainers|losers)\b/i.test(lower);

  if (isSubsetQuery) {
    const sector = matchSectorFromText(lower);
    let betaThreshold: "high" | "low" | undefined;
    if (/\b(high[\s-]beta|high beta)\b/i.test(lower)) betaThreshold = "high";
    if (/\b(low[\s-]beta|low beta|defensive)\b/i.test(lower)) betaThreshold = "low";

    let pnlStatus: "gainers" | "losers" | undefined;
    if (/\b(gainers|winners|profitable|in the green)\b/i.test(lower)) pnlStatus = "gainers";
    if (/\b(losers|underperformers|in the red|drag)\b/i.test(lower)) pnlStatus = "losers";

    if (sector || betaThreshold || pnlStatus || /\b(subset|breakdown|euler|cvar)\b/i.test(lower)) {
      return {
        type: "subset_risk",
        rawQuery: query,
        subsetFilter: {
          sector: sector ?? undefined,
          betaThreshold,
          pnlStatus,
        },
        range: "6mo",
      };
    }
  }

  // ── 5. Fallback for Open-Ended Synthesis ─────────────────────────────────
  return {
    type: "llm_fallback",
    rawQuery: query,
  };
}
