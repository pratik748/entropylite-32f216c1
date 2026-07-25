# EntropyLite Operational Runtime Trace

Date: 2026-07-25

## Actual runtime path traced

1. User enters a symbol in Direct Profit.
2. `DirectProfitMode.analyze()` invokes the `direct-profit` Supabase edge function through `governedInvoke()`.
3. `direct-profit` resolves symbol candidates, fetches market data from Yahoo chart/quoteSummary and now Stooq for US equities when Yahoo is unavailable, computes technicals, risk metrics, CLANK constraints, causal stress, ensemble consensus, and `quantEdge`.
4. The client accepts the result only after the edge function returns a structurally valid trade plan. Workstation evidence is used only to annotate the landed ticket.
5. Active and portfolio prices refresh through `price-feed`; `price-feed` uses Yahoo v8/v6/v10 and now Stooq as an additional real-data provider for US equities.
6. Causal analysis is executed through `causal-effects`; it now retrieves measured portfolio quotes and VIX before model interpretation. If model providers are unavailable but measured quotes exist, it returns a deterministic market-data-derived cascade with provenance instead of a fabricated model response.

## Failure map and repairs

### Market data availability

- COMPONENT: `supabase/functions/price-feed/index.ts`
- EXPECTED INPUT: `{ tickers: string[] }`
- ACTUAL INPUT: authenticated client requests from dashboard, workstation, Direct Profit active-price refresh.
- EXPECTED OUTPUT: `{ prices: Record<string, { price, currency }>, timestamp }` using real quotes.
- ACTUAL OUTPUT BEFORE FIX: empty price map when Yahoo endpoints failed for an otherwise valid US symbol.
- FIRST FAILURE: `fetchPrice()` exhausted Yahoo v8/v6/v10 and returned `null`.
- ROOT CAUSE: only one provider family was available; there was no independent real-data provider for common US equities.
- REQUIRED FIX: add Stooq quote lookup as a final real provider for US equities, preserving null when no provider returns a valid price.

### Market data normalization and storage

- COMPONENT: `supabase/functions/direct-profit/index.ts`
- EXPECTED INPUT: normalized symbol from user action.
- ACTUAL INPUT: ticker string passed through `normalizeTickerInput()` and `buildTickerCandidates()`.
- EXPECTED OUTPUT: `MarketSnapshot` with current price, previous close, range, 1Y closes, volume, currency.
- ACTUAL OUTPUT BEFORE FIX: `null` if Yahoo and Alpha Vantage were unavailable; Alpha Vantage also depends on optional key configuration.
- FIRST FAILURE: `fetchFullSnapshot()` had no independent historical provider when Yahoo failed and Alpha Vantage was unconfigured.
- ROOT CAUSE: insufficient real-provider redundancy for both spot and historical closes.
- REQUIRED FIX: add Stooq snapshot + daily-history hydration for US equities between Yahoo and Alpha Vantage.

### Market data to causal engine

- COMPONENT: `supabase/functions/causal-effects/index.ts`
- EXPECTED INPUT: event plus portfolio context.
- ACTUAL INPUT BEFORE FIX: event and portfolio text were sent directly to a model prompt.
- EXPECTED OUTPUT: causal tree grounded in measured market context.
- ACTUAL OUTPUT BEFORE FIX: model-only cascade; no quote retrieval, no measured provenance, and total failure when model providers were unavailable.
- FIRST FAILURE: the edge function did not contact a market-data provider before constructing the cascade.
- ROOT CAUSE: causal execution was disconnected from real market data.
- REQUIRED FIX: extract portfolio tickers, fetch measured Yahoo quotes and VIX, attach provenance to model output, and provide a deterministic measured-data cascade only when quotes exist and model providers fail.

### Causal engine to quantitative analysis

- COMPONENT: `supabase/functions/direct-profit/index.ts`
- EXPECTED INPUT: real market snapshot plus causal state.
- ACTUAL INPUT BEFORE FIX: ensemble used price/risk/flow engines but no explicit causal stress member.
- EXPECTED OUTPUT: ensemble vote includes a market-data-derived causal stress channel.
- ACTUAL OUTPUT BEFORE FIX: causal layer was absent from Direct Profit’s quantitative gate.
- FIRST FAILURE: no causal signal entered `engineSignals`.
- ROOT CAUSE: Direct Profit imported and executed quantitative math but skipped causal propagation entirely.
- REQUIRED FIX: compute `causalStress` from VIX, realized move, volume, z-score, and CLANK constraints; add it as an ensemble member and include it in `quantEdge`.

### Quantitative analysis to Direct Profit decision

- COMPONENT: `supabase/functions/direct-profit/index.ts`
- EXPECTED INPUT: real market snapshot, risk metrics, causal stress, ensemble math.
- ACTUAL INPUT BEFORE FIX: the first trade plan could depend on an optional model response; when model providers were absent, the path was labeled fallback.
- EXPECTED OUTPUT: valid decision from real quantitative inputs or explicit failure if market data is missing.
- ACTUAL OUTPUT BEFORE FIX: a deterministic branch was treated as fallback after model failure, obscuring that the ensemble math itself is the decision layer.
- FIRST FAILURE: optional model call sat before the quantitative gate.
- ROOT CAUSE: Direct Profit mixed model text generation with the operational decision chain.
- REQUIRED FIX: remove the model-call dependency from Direct Profit ticket construction; let the measured-data plan feed the ensemble and `quantEdge` directly.

## Verification notes

The container network proxy returned HTTP 403 on external HTTPS tunnels to Supabase and Yahoo during direct runtime probing. Because provider execution could not be completed from this container, verification in this environment is limited to local command execution, static endpoint path tracing, TypeScript build, and test execution. The repaired runtime chain preserves honest failure: if no real provider returns a price, no market snapshot or trade ticket is fabricated.
