# Fix Geopolitical Polling + Global Currency Normalization.

## Problem 1: Geopolitical Section is Static

The `geopolitical-data` endpoint is in the `"slow"` tier (60s cache TTL) in `apiGovernor.ts`, and `useGeoIntelligence.ts` polls every 20s — but the cache blocks refreshes for 60s, making it effectively static.

**Fix:** Move `geopolitical-data` to the `"frequent"` tier (15s TTL) in the API Governor so it actually updates on new headlines every ~20s poll cycle.also try to make corporate intelligence faster but never use lovable ai 

## Problem 2: Hardcoded `$` Currency Symbols

Multiple components display monetary values with hardcoded `$` instead of using the FX-normalized currency symbol. Affected files:


| File                                      | Issue                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `StatArbEngine.tsx` (Foresight FGM chart) | Y-axis and tooltips use `$`                                                                                                            |
| `StrategyLab.tsx`                         | Trade cards: entry, SL, TP, dollar_amount, entry_zone, PriceLevelChart all hardcode `$`                                                |
| `CompanyIntelligence.tsx`                 | Analyst target chart uses `$`                                                                                                          |
| `MarketOverview.tsx`                      | Commodity prices (gold, crude, BTC) use `$` — these are USD-denominated globally so acceptable, but FX pairs should use proper symbols |


## Changes

### 1. `src/lib/apiGovernor.ts`

- Change `"geopolitical-data"` from `"slow"` to `"frequent"` tier

### 2. `src/components/sandbox/StatArbEngine.tsx`

- Import `getCurrencySymbol` from currency lib
- Use `sym` from `useNormalizedPortfolio` in FGM chart Y-axis `tickFormatter` and Tooltip `formatter` instead of `$`

### 3. `src/components/sandbox/StrategyLab.tsx`

- Import `getCurrencySymbol` and `useFX`
- Get `baseCurrency` + symbol from the hook (already uses `useNormalizedPortfolio`)
- Replace all `$${inst.entry_price.toFixed(2)}` patterns with `${sym}${...}` across: dollar_amount, entry_price, entry_zone, stop_loss_price, take_profit_price, and PriceLevelChart markers

### 4. `src/components/CompanyIntelligence.tsx`

- Use the asset's own currency (from analysis data) for analyst target formatting instead of hardcoded `$`

## Files to Edit


| File                                       | Change                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `src/lib/apiGovernor.ts`                   | `geopolitical-data` → `"frequent"` tier                                             |
| `src/components/sandbox/StatArbEngine.tsx` | Replace `$` with `sym` in FGM chart                                                 |
| `src/components/sandbox/StrategyLab.tsx`   | Replace all hardcoded `$` in trade cards and price level chart with currency symbol |
| `src/components/CompanyIntelligence.tsx`   | Use asset currency symbol in analyst targets                                        |
