

# Plan: Remove Blacklisting + Sell Grace Period + India-Only Mode

## Three changes requested:

### 1. Remove ODGS Blacklisting of Sold Assets

**Problem**: Assets get blacklisted after a -15% drawdown, preventing future profit opportunities.

**Fix in `src/hooks/useOutcomeGradient.ts`**:
- Remove the blacklist state entirely (`useLocalStorage("odgs-blacklist", [])`)
- Remove all blacklist checks in `computeAndApplyGradient` (lines 365-377)
- Remove `isBlacklisted` from `AssetScore` and `getAssetBoost`
- Remove `blacklistedAssets` from `SafetyStatus`
- Instead of blacklisting, cold assets just get lower bias (already happens via `coldAssets` logic) — soft penalty, no hard block
- Update `OutcomeGradientDashboard.tsx` to remove blacklist UI references

### 2. Prevent Immediate Sell-off on Newly Added Assets

**Problem**: When a stock is added, `useSellNotifications` can instantly fire sell alerts (e.g., if analysis target is close to current price).

**Fix in `src/hooks/useSellNotifications.ts`**:
- Add a grace period: skip all sell alerts for the first 60 seconds after a tracker is created
- Store `createdAt` timestamp in `PeakTracker`
- Check `now - tracker.createdAt > 60_000` before any alert fires
- This allows the price to stabilize and the analysis to settle before triggering notifications

### 3. India-Only Mode Toggle

**What it does**: A global context switch that forces all feeds, recommendations, strategies, and risk models to Indian markets only (NSE/BSE equities, F&O, Indian ETFs/bonds). Outputs in INR, respects SEBI/RBI rules, filters global noise.

**Implementation**:

**A. Extend FXProvider context (`src/hooks/useFX.tsx`)**:
- Add `indiaMode: boolean` and `setIndiaMode` to context
- Persist in `localStorage("entropy-india-mode")`
- When enabled, auto-set `baseCurrency` to `"INR"`

**B. Add toggle in Header (`src/components/Header.tsx`)**:
- Small toggle switch next to the currency selector: "🇮🇳 India" with a Switch component
- When toggled ON: sets `indiaMode = true`, currency locks to INR

**C. Propagate to edge functions**:
- All `governedInvoke` calls that send body data will include `indiaMode: true` when enabled
- Create a thin wrapper or modify key callers: `analyze-stock`, `desirable-assets`, `fetch-news`, `geopolitical-data`, `macro-intelligence`, `sentiment-intel`, `strategy-generate`, `derivatives-intelligence`

**D. Edge function behavior when `indiaMode: true`**:
- AI prompts get appended with India-specific context: "Focus exclusively on Indian markets (NSE/BSE). Only recommend Indian equities, ETFs, F&O instruments. Consider RBI/SEBI regulations, Indian tax structure, INR denomination. Global events included only if they directly impact Indian markets."
- News feeds filter for India-relevant keywords (NSE, BSE, Nifty, Sensex, RBI, SEBI)
- Desirable assets funnel: candidate universe restricted to `.NS`/`.BO` suffixed tickers + Indian ETFs

**E. Key edge functions to modify** (add India context block to AI prompts):
- `supabase/functions/analyze-stock/index.ts`
- `supabase/functions/desirable-assets/index.ts`
- `supabase/functions/fetch-news/index.ts`
- `supabase/functions/macro-intelligence/index.ts`
- `supabase/functions/sentiment-intel/index.ts`
- `supabase/functions/strategy-generate/index.ts`
- `supabase/functions/derivatives-intelligence/index.ts`
- `supabase/functions/geopolitical-data/index.ts`

Each gets a simple conditional prompt injection: if `body.indiaMode` is truthy, append the India-localization paragraph to the system prompt.

**F. Client-side propagation (`src/lib/apiGovernor.ts` or individual callers)**:
- Read `indiaMode` from localStorage in the governor or pass it through from hooks
- Inject into every `governedInvoke` body automatically

## Files to create/modify:

| File | Action |
|------|--------|
| `src/hooks/useOutcomeGradient.ts` | Remove blacklist logic |
| `src/components/sandbox/OutcomeGradientDashboard.tsx` | Remove blacklist UI |
| `src/hooks/useSellNotifications.ts` | Add 60s grace period |
| `src/hooks/useFX.tsx` | Add `indiaMode` state to context |
| `src/components/Header.tsx` | Add India toggle switch |
| `src/lib/apiGovernor.ts` | Auto-inject `indiaMode` into invoke bodies |
| 8 edge functions | Add India-context prompt injection |

## Technical detail

```text
India Mode Flow:
Header Toggle → FXProvider.indiaMode → localStorage
                                      ↓
                          apiGovernor reads localStorage
                                      ↓
                          All edge function bodies get indiaMode: true
                                      ↓
                          AI prompts append India-localization block
                          News filters add NSE/BSE/Nifty keywords
                          Desirable assets restrict to .NS/.BO tickers
```

