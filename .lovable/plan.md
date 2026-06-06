# Structural Rebuild — From "Strict Filter" to "Real Edge"

## Honest framing first
No public-data retail system sustainably hits **>80% win rate**. Renaissance Medallion runs ~50–55%. What you can realistically get:
- **Hit-rate 60–68%** on the trades that *do* fire
- **Average winner 2–3× average loser** (expected R)
- **Most days: STAND_ASIDE** — that is the feature, not the bug

The previous patch made the *gate* stricter but left the *signals* unchanged. Stricter filter on weak signals = "wait" most of the time AND still wrong when it fires. We need to fix the **signals**, not just the gate.

## Root causes of current inconsistency

1. **Engines are not independent.** AI verdict, momentum, mean-reversion, intel summary — they all ultimately read recent price. Ensemble math assumes independence; correlated engines produce false agreement.
2. **Reliability priors are global, not per-ticker / per-regime.** A momentum signal is great in trending regimes, terrible in chop. Treating it as 0.55 always is wrong.
3. **No out-of-sample calibration.** Platt scaling constants (α=3.2, β=1.4) were guessed, not fit to historical hit-rates. Calibrated probability is currently theatre.
4. **No survivorship / look-ahead check.** Desirable Assets ranks on metrics computed from the same window it recommends from.
5. **No transaction-cost / slippage haircut.** Indian small-caps (GTL INFRA etc.) have 1–3% effective spread. A signal with 1.5% edge is a loss after costs.
6. **Returns Estimate uses bootstrap of past returns** as if stationary. That's why it shows 104%. Needs regime conditioning and cost haircut.
7. **No regime filter on the recommendation itself.** A BUY in a -2σ VIX spike day is a different animal than a BUY on a quiet day.

## The rebuild — 6 structural changes

### 1. Decorrelate engines (signal hygiene)
Group engines into **3 truly independent buckets**, vote at bucket level, not engine level:
- **Bucket A — Price/flow**: technicals + momentum + volume + institutional flows
- **Bucket B — Fundamental/intel**: AI verdict + company intelligence + sentiment + news
- **Bucket C — Risk/regime**: VIX regime + reflexivity contradictions + TWRD veracity + CLANK

Decision requires **agreement across ≥2 buckets**, not ≥3 engines. This kills the false-consensus problem where 5 price-based engines all agree because they read the same chart.

### 2. Per-ticker, per-regime reliability priors (new table)
New table `engine_reliability` rolling window of last 200 fired signals per (engine, ticker_class, regime). Hit-rate becomes the prior, not a hard-coded 0.55. Updated nightly from `trade_logger` + closed positions.

```
engine_id | ticker_class | regime    | n   | wins | hit_rate
momentum  | LARGECAP_IN  | TRENDING  | 187 | 121  | 0.647
momentum  | SMALLCAP_IN  | CHOPPY    | 92  | 41   | 0.446   <- auto-deweighted
```

### 3. Walk-forward Platt calibration (replace guessed constants)
Nightly cron edge function `calibration-fit` reads last 90 days of (ensemble_score, agreement, outcome) tuples, fits α, β, γ via logistic regression, writes to `calibration_params`. `ensemble.ts` reads from DB instead of constants. Now `calibratedProb=0.62` actually means 62% of historical signals at that score won.

### 4. Cost-aware expected R
`expectedR = p·rUp − (1−p)·rDown − costHaircut(ticker)` where costHaircut is:
- US large-cap: 0.05%
- US small-cap: 0.25%
- India NSE F&O top-50: 0.15%
- India small-cap (GTL INFRA tier): **1.5%**
Loaded from a static `liquidity_tiers.ts` keyed by avg-daily-volume & spread. This alone will silently filter most of the bad small-cap "deals" Desirable Assets is currently emitting.

### 5. Desirable Assets — train/test split
Compute ranking metrics on **t-180 → t-30** window, evaluate on **t-30 → t-0** for confidence. Only surface assets whose t-30→t-0 realized return was within 1σ of the t-180→t-30 expectation (i.e., the signal *generalized*). Plus the consensus block from §1, plus cost haircut from §4.

### 6. Returns Estimate — regime-conditional + cost
Replace stationary bootstrap with **regime-conditional block bootstrap**: sample 20-day blocks from periods matching current VIX regime ±1 band, apply cost haircut, cap displayed annualized return at min(historical_max, bootstrap_p95). No more 104% theatre.

### Honest UI
Direct Profit will now show:
- **Action** (BUY/SELL/WAIT)
- **Calibrated win-prob** (real, not guessed)
- **Per-bucket vote**: A ✓ / B ✗ / C ✓
- **Cost-adjusted expected R**
- **Sample size warning** if engine_reliability n<30 for this ticker class

When STAND_ASIDE: shows *which bucket disagreed and why*, plus the closest condition that would flip it to BUY (e.g., "Bucket B will agree if AI confidence rises >65 OR sentiment flips positive").

## Files touched

**New**
- `supabase/migrations/<ts>_engine_reliability.sql` — tables + grants + RLS
- `supabase/functions/calibration-fit/index.ts` — nightly walk-forward fit
- `supabase/functions/_shared/buckets.ts` — bucket assignment + vote logic
- `supabase/functions/_shared/costs.ts` — liquidity-tier haircut
- `src/lib/liquidity-tiers.ts` — static tier table

**Rewritten**
- `supabase/functions/_shared/ensemble.ts` — bucket voting + DB-loaded calibration + cost-aware expected R
- `supabase/functions/desirable-assets/index.ts` — train/test split + cost haircut
- `supabase/functions/direct-profit/index.ts` — bucket display payload
- `src/components/augment/ReturnsEstimateModule.tsx` — regime-conditional block bootstrap + cost cap

**UI updates**
- `src/components/DirectProfitMode.tsx` — per-bucket ✓/✗ + "what would flip it" hint
- `src/components/DesirableAssets.tsx` — train/test confidence chip + cost-adjusted return

## What this will and won't do
- **Will**: cut Desirable Assets false-positives sharply (cost haircut + train/test); make Direct Profit BUY/SELL fire less often but be right more often; make calibrated probabilities mean what they say.
- **Won't**: deliver 80% win-rate — anyone promising that is lying. Realistic target after this rebuild: **62–68% hit-rate on fired trades, expected R ≥ 0.4 after costs**.

## One question before I build
The nightly calibration job needs **closed trade outcomes** to learn from. Two options:
- **(A)** Treat every Direct Profit BUY/SELL as a paper trade, mark-to-market at T+5 trading days, use that as ground truth. Works immediately, learns from synthetic outcomes.
- **(B)** Only learn from real user trades logged in `trade_logger` after they're closed. Truer signal, but ~weeks before calibration converges.

Reply **A**, **B**, or **both** (recommended: both, with A weighted 0.3 and B weighted 0.7 once B has n≥50).