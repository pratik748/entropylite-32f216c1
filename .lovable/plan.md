

# Plan: Fix India-Only Mode to Actually Work Everywhere

## Root Causes

1. **Desirable Assets** — The `ELITE_FALLBACK_UNIVERSE` (line 498-519) is 100% US stocks (MSFT, NVDA, AMZN, etc.) and ALWAYS gets blended into candidates (line 766-767), regardless of India mode. The reliability backstop (line 1120-1168) also injects these US stocks. The `deriveHedgePlan` function (line 255-302) hardcodes US hedge instruments (VIXY, PSQ, XLE, SH).

2. **Desirable Assets homeMarketRule** — When `indiaMode` is true but baseCurrency isn't INR (edge case), the system defaults to US stocks.

## Changes

### 1. `supabase/functions/desirable-assets/index.ts`

**A. Add Indian Elite Fallback Universe** (~20 blue-chip Indian stocks):
```
RELIANCE.NS, TCS.NS, HDFCBANK.NS, INFY.NS, ICICIBANK.NS, 
BHARTIARTL.NS, ITC.NS, SBIN.NS, LT.NS, KOTAKBANK.NS,
HINDUNILVR.NS, BAJFINANCE.NS, MARUTI.NS, TATAMOTORS.NS, 
AXISBANK.NS, SUNPHARMA.NS, TITAN.NS, WIPRO.NS, POWERGRID.NS
```

**B. Gate the fallback universe selection on `indiaMode`**:
- Line 766: `const deterministicCandidates = buildDeterministicCandidates(previousTickers, indiaMode);`
- The function picks from `INDIA_FALLBACK_UNIVERSE` when indiaMode is true, `ELITE_FALLBACK_UNIVERSE` when false

**C. Force `homeMarketRule` when `indiaMode`**:
- Override: if `indiaMode`, always use India rule regardless of baseCurrency

**D. India-specific `deriveHedgePlan`**:
- When `indiaMode`: use Nifty PUT, Bank Nifty hedge, Gold Bees, etc. instead of VIXY/PSQ/SH/XLE

**E. Reliability backstop** (line 1120-1168): already uses `deterministicCandidates`, so fixing `buildDeterministicCandidates` fixes this too

### 2. `supabase/functions/derivatives-intelligence/index.ts`

Already has `indiaBlock` in system prompt — this should work. No changes needed unless testing reveals issues.

### 3. Other edge functions

Already have `indiaMode` prompt injection from the previous implementation. The AI prompts correctly instruct India-only focus. No additional changes needed for `analyze-stock`, `fetch-news`, `geopolitical-data`, `macro-intelligence`, `sentiment-intel`, `strategy-generate`.

## Summary

The fix is concentrated in **one file**: `supabase/functions/desirable-assets/index.ts`. The problem is entirely that hardcoded US fallback data overrides AI-generated Indian candidates. Adding an Indian fallback universe and gating the selection on `indiaMode` solves it completely.

