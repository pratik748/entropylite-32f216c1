## Goal

Repair the Outcome-Driven Gradient (ODG) so it stops emitting BUY/INVEST signals on desirable assets that go on to lose money. Today the engine is purely **post-trade** (it learns from PnL after the fact). It never asks: *"Even if this asset is great, is the trade survivable from here?"*

We will convert ODG from a signal-confidence engine into an **outcome-path validated gatekeeper** that sits between signal detection and execution. Core principle baked into the code: **desirable asset ≠ desirable trade.**

---

## Architecture (lite, no model training)

```text
[ Signal Detection ]   <-- existing: profitField, desirableZones, intelligenceSignals
        |
        v
[ Trade Validation Pipeline ]   <-- NEW
   1. Reflexivity Filter         (crowding / liquidity trap)
   2. Outcome Path Simulator     (3 paths: favorable / drift / adverse)
   3. Drawdown Gate              (hard kill switch, vol-scaled)
   4. Entry Timing Engine        (micro-confirmation triggers)
   5. Scar Memory Lookup         (penalize repeat failure patterns)
        |
   pass / reject + reason
        v
[ Execution Trigger ]   <-- only fires on pass + confirmed entry
        |
   on-trade hooks:
   - CROWN-lite micro-hedge on adverse-path detection
   - On loss → write Scar
```

Signal detection stays where it is. Validation is a new, pure module. Existing intelligence signals get a `validation` block and only `INVEST/SCALE_UP/PAIR` types of urgency `high` may set `executable: true`.

---

## Redefined ODG formula

Old gradient (signal direction):
```text
G_old(asset) = bias(asset) · Σ w_i · feature_i
```

New gradient (probability of profitable execution path within bounded drawdown):
```text
G_new(asset) =  bias(asset)
              · P_favorable
              · (1 - P_adverse)            # reflexive-loss penalty
              · payoff_asymmetry           # E[gain]/E[loss]
              · timeliness                 # exp(-τ_to_profit / horizon)
              · (1 - crowding)             # reflexivity discount
              · scar_factor                # 1 − historical_failure_rate(pattern)

Reject if:
   P_adverse > 0.30
   OR expected_drawdown_pct > drawdown_budget(vol)
   OR crowding > 0.75 AND liquidity_thin
   OR scar_factor < 0.4
```

`drawdown_budget(vol) = clamp(0.6 · realized_vol_5d · √horizon_days, 1.5%, 8%)` per position.

---

## New module: `src/lib/odg-validator.ts`

Pure, deterministic, no network calls. Inputs are already in memory (history entries, regime, vix, momentum, sentiment).

```ts
export interface PathSimResult {
  path: 'favorable' | 'drift' | 'adverse';
  probability: number;
  expectedReturnPct: number;
  maxDrawdownPct: number;
  timeToProfitDays: number;
  reflexTriggers: string[];
}

export interface ValidationResult {
  executable: boolean;
  rejectReasons: string[];          // e.g. ['adverse_p>0.30', 'drawdown_gate', 'crowded_signal']
  paths: PathSimResult[];
  pAdverse: number;
  expectedDrawdownPct: number;
  drawdownBudgetPct: number;
  crowding: number;                 // 0..1
  reflexivityScore: number;         // 0..1, higher = more self-defeating
  scarFactor: number;
  entryConfirmed: boolean;
  microHedge: { enabled: boolean; instrument: string; trigger: string } | null;
  gNew: number;                     // redefined gradient value
}

export function validateTrade(input: {
  ticker: string;
  signalType: IntelligenceSignal['type'];
  features: { momentum: number; vol: number; sentiment: number };
  regime: string;
  vix?: number;
  history: ProfitFieldEntry[];      // from useOutcomeGradient
  scarMemory: ScarRecord[];         // new, see below
  liquidityProxy?: number;          // 0..1, thin..deep
  crowdingProxy?: number;           // 0..1 from sentiment dispersion
}): ValidationResult
```

### Path simulator (lite, closed-form, no MC loop)
Three paths with regime-tilted priors:
- `favorable`: P = 0.35 · regimeTilt(bull), expReturn = +1.5σ, maxDD = 0.4σ
- `drift`:     P = 0.40, expReturn = 0, maxDD = 0.7σ
- `adverse`:   P = 0.25 + crowding·0.15 + (vix>22?0.10:0), expReturn = -1.2σ, maxDD = 1.4σ

Where σ = realized 5-day vol from history (or VIX/√52 fallback). Probabilities normalized to sum to 1.

### Reflexivity filter
- `crowding = clamp(|sentiment| · momentum_alignment, 0, 1)`
- `liquidity_thin = liquidityProxy < 0.3` (default false if absent)
- `reflexivityScore = crowding · liquidity_thin_factor`
- Reject when `reflexivityScore > 0.6` for `INVEST/SCALE_UP`.

### Drawdown gate
Hard kill switch — non-negotiable. Computed before timing.

### Entry Timing Engine
Three micro-confirmations (boolean each, need ≥2):
- `momentum_aligned`: sign(momentum_now) == sign(signal_direction)
- `vol_contraction_to_expansion`: vol_now > vol_5d_avg AND vol_5d_avg < vol_20d_avg
- `liquidity_absorption`: liquidityProxy >= 0.5

If signal fires but timing not confirmed → `executable=false, rejectReasons=['await_confirmation']`. UI shows ARMED state instead of EXECUTABLE.

### Scar Memory
New table + new hook. After every losing trade we capture the *pattern*, not just PnL.

---

## New table: `scar_memory` (Lovable Cloud migration)

```sql
create table public.scar_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  ticker text not null,
  signal_type text not null,
  regime text not null,
  vol_bucket text not null,              -- 'low'|'mid'|'high'|'crisis'
  sentiment_bucket text not null,        -- 'neg'|'neu'|'pos'
  momentum_bucket text not null,
  failure_pattern text not null,         -- e.g. 'adverse_reflex','timing_premature','liquidity_trap'
  realized_pnl_pct numeric not null,
  created_at timestamptz not null default now()
);
alter table public.scar_memory enable row level security;
create policy "scar_select_own" on public.scar_memory for select to authenticated using (auth.uid() = user_id);
create policy "scar_insert_own" on public.scar_memory for insert to authenticated with check (auth.uid() = user_id);
create policy "scar_delete_own" on public.scar_memory for delete to authenticated using (auth.uid() = user_id);
create index scar_lookup on public.scar_memory (user_id, ticker, regime, vol_bucket);
```

`scar_factor = 1 - min(0.6, similar_failures / max(5, similar_total))`. Clamped so it can only depress, never inflate, the gradient.

---

## Integration changes

### `src/hooks/useOutcomeGradient.ts`
- Add `scarMemory` state hydrated from `scar_memory` table on auth.
- Inside `ingestTrade`: if `pnlPct < 0`, derive `failure_pattern` from features + most recent validation (stored in localStorage briefly) and insert a scar row.
- Add `validateSignal(signal): ValidationResult` returned from the hook — thin wrapper around `validateTrade()`.
- Decorate every entry of `intelligenceSignals` with `validation: ValidationResult`. Sort `executable` first, then by `gNew`.
- Replace the current "fallback starter signal" path with a clearly-tagged `ARMED, awaiting confirmation` card so we never auto-suggest weak trades.

### `src/components/sandbox/OutcomeGradientDashboard.tsx`
- Each signal card gets:
  - `EXECUTABLE` badge (gain) or `ARMED` (warning) or `BLOCKED` (loss) with reason tags.
  - 3-path strip: favorable / drift / adverse with probability bars and expected DD.
  - Drawdown gate readout: `DD budget 3.2% · expected 4.1% → BLOCKED`.
  - Reflexivity meter (0..100).
  - Scar count if pattern previously failed: `Scar: 3 prior failures in this regime`.
- Add a new top-row metric: `Block Rate (last 20)` so the user sees the gate is actually filtering.

### `src/components/DesirableAssets.tsx`
- Where it currently calls `getAssetBoost`, also call `validateSignal` and:
  - hide the BUY CTA when `!executable`,
  - show `BLOCKED — <top reason>` chip,
  - or `ARMED — waiting on <missing confirmation>`.
- This is the primary user-visible fix for the "desirable but loss-making" complaint.

### CROWN-lite micro-hedge (in-component, no new function)
On the dashboard, after a position is marked executable and `pAdverse > 0.20`, show `Auto-Hedge` toggle. When enabled and ODG later detects adverse-path conditions on the live signal (sentiment flip + vol expansion), surface a `HEDGE NOW` action card (no auto-execution — surfacing only, since we don't auto-trade).

---

## Files to create / change

Create:
- `src/lib/odg-validator.ts` — pure validator, path sim, reflexivity, drawdown gate, timing.
- `src/lib/odg-scar.ts` — failure-pattern classifier + scar lookup helpers.
- Migration: `scar_memory` table + RLS.

Change:
- `src/hooks/useOutcomeGradient.ts` — wire scar hydration, decorate signals, expose `validateSignal`, write scars on losses.
- `src/components/sandbox/OutcomeGradientDashboard.tsx` — render validation block per signal, block-rate metric.
- `src/components/DesirableAssets.tsx` — gate the BUY CTA on `executable`.
- `src/components/TradeJournal.tsx` — when logging a loss, call scar writer.

No edge-function changes required — validation is fully client-side and deterministic, fitting the lightweight constraint.

---

## Acceptance criteria

1. A signal on a desirable asset with `pAdverse > 0.30` renders as `BLOCKED` with the reason chip, and the Desirable Assets BUY CTA is hidden.
2. The dashboard shows a non-zero block rate within a few signals of normal usage.
3. After two losing trades on the same `(ticker, regime, vol_bucket)` pattern, the third matching signal's `scar_factor` ≤ 0.6 and the signal degrades to `ARMED` or `BLOCKED`.
4. Drawdown gate cannot be bypassed by raising confidence — it is checked before the gradient score is even computed.
5. Existing tests still pass; no edge functions touched.
