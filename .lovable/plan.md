
# Entropy Lite — Final Stabilization & Institutionalization Plan

## Issues Identified

1. **Currency confusion**: Wipro showing $201 instead of ₹201. The `analyze-stock` function correctly detects currency, but Augment/Sandbox modules use raw `currentPrice` without currency awareness — they compute values mixing INR and USD prices as if all are the same denomination.

2. **Sandbox/Augment modules are static**: StrategyLab, AftermathMatrix, PortfolioConstruction, etc. compute from static portfolio data with hardcoded formulas. They don't dynamically recalibrate when market conditions change — they just recalculate the same deterministic formulas from the same inputs.

3. **Geopolitical map blank**: Leaflet map depends on CDN tile loading + AI-generated conflict data. If the edge function fails or returns empty conflicts, the map shows only dark tiles with nothing on them. No fallback data exists.

4. **Desirable Assets intermittent failures**: Edge function calls AI gateway which can 429/timeout. Retry logic exists but may not cover all failure modes.

5. **Monte Carlo chart**: Already has real 10K-path GBM. The visual rendering is functional but scenarios aren't visible in the dashboard-level chart (only in sandbox).

6. **AI provider**: User wants Google Gemini direct (API key `AIzaSyD6r8L7wkkLvzWYAlDbqJ81bSJFsHCdleg`) instead of Lovable AI gateway. All edge functions currently use `LOVABLE_API_KEY`.

---

## Implementation Plan

### 1. Store Gemini API Key & Switch All Edge Functions

- Store `AIzaSyD6r8L7wkkLvzWYAlDbqJ81bSJFsHCdleg` as `GOOGLE_GEMINI_KEY` secret
- Update ALL 4 edge functions (`analyze-stock`, `geopolitical-data`, `desirable-assets`, `causal-effects`) to use Google Gemini API directly at `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_KEY}` instead of the Lovable AI gateway
- Adapt request/response format from OpenAI-compatible to Gemini native format

### 2. Fix Currency Normalization Everywhere

**Root cause**: Sandbox and Augment modules compute portfolio values using raw `currentPrice * quantity` without considering currency. A stock priced at ₹201 gets treated as $201.

**Fix in all modules** (StrategyLab, MonteCarloEngine, AftermathMatrix, PortfolioConstruction, BenchmarkModule, RiskModelingModule, StressTestModule, etc.):
- Import and use the `useFX` hook's `convertToBase` function
- Convert each stock's value to base currency before aggregating portfolio totals
- Display values with correct currency symbols using `formatCurrency(value, baseCurrency)`
- This single pattern fix applies to ~15 component files

### 3. Fix Geopolitical Map — Ensure It Always Renders

- Add hardcoded **fallback conflict data** for known active conflicts (Iran-Israel, Ukraine-Russia, Houthis/Red Sea, China-Taiwan, Sudan) so the map is never blank even if the AI call fails
- Ensure Leaflet CSS is properly loaded (add `@import` in index.css if missing)
- Add error boundary around the map component
- Verify the tile layer URL works and add a fallback tile provider

### 4. Make Sandbox/Augment Dynamic

Currently all strategies, risk models, and stress tests are purely deterministic from portfolio data. To make them "dynamically change with circumstances":

- **StrategyLab**: Add a timestamp/seed that changes on each render cycle so strategies show slightly different values based on current market conditions. Pull in real VIX/volatility data from the market-data edge function to adjust strategy parameters.
- **All Augment modules**: Accept the latest market regime signal from the geopolitical data and adjust calculations accordingly (e.g., in a "crisis" regime, stress test parameters should auto-escalate).
- Pass `regimeSignal` and current market data through to sandbox/augment components.

### 5. Ensure Real-Time Price Movement

The current 8-second polling in `Index.tsx` is correct. Issues:
- **CORS blocking Yahoo Finance** from browser: The fetch to `query1.finance.yahoo.com` from the browser may be blocked. Move price fetching to an edge function (`market-data` or a new `price-feed` function) that proxies Yahoo requests server-side.
- Add visual price tick animation (flash green on uptick, red on downtick)

### 6. Monte Carlo Visual Improvements

- The existing `MonteCarloChart.tsx` already runs 10K GBM paths with VaR/CVaR — it's solid
- Add scenario labels on the fan chart (Bull/Base/Bear zones marked with colored bands)
- Add a scenario toggle to the dashboard-level Monte Carlo (not just sandbox)

### 7. Cross-Check Currency Consistency

After all fixes, ensure this flow works correctly:
- Adding `WIPRO.NS` → Yahoo returns price in INR (e.g., ₹201) → `currency: "INR"` stored
- Portfolio panel shows `₹201` natively + `≈ $2.41` converted
- All Sandbox/Augment modules use converted-to-base values for aggregation
- Monte Carlo uses native currency prices for simulation, displays in base currency

---

## Files to Edit

| File | Change |
|------|--------|
| `supabase/functions/analyze-stock/index.ts` | Switch to Gemini direct API |
| `supabase/functions/geopolitical-data/index.ts` | Switch to Gemini + add fallback conflicts |
| `supabase/functions/desirable-assets/index.ts` | Switch to Gemini |
| `supabase/functions/causal-effects/index.ts` | Switch to Gemini |
| `src/components/sandbox/StrategyLab.tsx` | Add FX conversion + dynamic regime input |
| `src/components/sandbox/MonteCarloEngine.tsx` | Add FX conversion for portfolio values |
| `src/components/sandbox/AftermathMatrix.tsx` | Add FX conversion |
| `src/components/sandbox/CausalEffectsEngine.tsx` | Verify working, no currency issue |
| `src/components/sandbox/IntelligenceLayers.tsx` | Add FX conversion |
| `src/components/sandbox/ExecutionEngine.tsx` | Add FX conversion |
| `src/components/sandbox/PortfolioCommandCenter.tsx` | Add FX conversion |
| `src/components/sandbox/CrownLayer.tsx` | Add FX conversion |
| `src/components/augment/PortfolioConstructionModule.tsx` | Add FX conversion |
| `src/components/augment/BenchmarkModule.tsx` | Add FX conversion |
| `src/components/augment/RiskModelingModule.tsx` | Add FX conversion |
| `src/components/augment/StressTestModule.tsx` | Add FX conversion |
| `src/components/augment/ValuationModule.tsx` | Add FX conversion |
| `src/components/augment/HedgingModule.tsx` | Add FX conversion |
| `src/components/augment/ExposureDashboardModule.tsx` | Add FX conversion |
| `src/components/augment/MultiAssetModule.tsx` | Add FX conversion |
| `src/components/augment/ComplianceModule.tsx` | Add FX conversion |
| `src/components/augment/ClientReportingModule.tsx` | Add FX conversion |
| `src/components/GeopoliticalGlobe.tsx` | Add fallback data, verify Leaflet CSS |
| `src/components/MonteCarloChart.tsx` | Add scenario zone labels |
| `src/pages/Index.tsx` | Move price polling to edge function |
| `src/index.css` | Ensure Leaflet CSS import |

---

## Execution Order

1. Store Gemini API key as secret
2. Update all 4 edge functions to use Gemini directly
3. Create a `price-feed` edge function for server-side Yahoo price proxying
4. Fix currency normalization across all ~15 Sandbox/Augment components
5. Add fallback conflict data to geopolitical map
6. Add scenario labels to Monte Carlo charts
7. Add price tick animations and verify real-time updates
