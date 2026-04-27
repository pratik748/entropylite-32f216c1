
# TWRD Integration — Entropylite Veracity Layer

Goal: every signal that currently feeds prediction, risk and scenarios is replaced by a **truth-weighted** signal `signal × T(x,t)`. Outputs gain explicit **Truth Confidence**, **Source Reliability**, and **Contradiction Risk**. Reflexivity gets a "False Consensus" guard. Sources self-calibrate via Bayesian feedback.

---

## 1. Architecture (text diagram)

```text
                          ┌──────────────────────────────────────────────┐
                          │  RAW INGEST (existing edge functions)        │
                          │  fetch-news │ sentiment-intel │ flow-intel   │
                          │  institutional-flows │ macro │ geo │ polymkt │
                          └───────────────┬──────────────────────────────┘
                                          ▼
                       ┌───────────────────────────────────────┐
                       │  CLAIM EXTRACTOR (twrd/extract.ts)    │
                       │  raw payload → Claim triples          │
                       │  (subject, relation, object,          │
                       │   source_id, ts, raw_text, domain)    │
                       └───────────────┬───────────────────────┘
                                       ▼
                ┌────────────────────────────────────────────────┐
                │  DOMAIN CLEANERS (twrd/cleaners/*)             │
                │  financial │ news │ social │ geo │ scientific  │
                │  → assigns π̂_min, π̂_max, sentence factuality   │
                │  → bot/viral-cluster suppression               │
                └───────────────┬────────────────────────────────┘
                                ▼
            ┌───────────────────────────────────────────────────┐
            │  TRUTH ENGINE (twrd/truth.ts) — pure functions    │
            │  S = α/(α+β)   A = 1−Π(1−θ_i)   D = e^(−λΔt)      │
            │  B = δ·b̂        C = ε·max T(x') over contradictors │
            │  T(x,t) = σ(w1S+w2A+w3D−w4B−w5C+b)                │
            └───────────────┬───────────────────────────────────┘
                            ▼
        ┌───────────────────────────────────────────────────────┐
        │  REALITY STORE (Supabase: twrd_* tables)              │
        │  twrd_sources(α,β) │ twrd_claims(T,α,β,decay,valid_*) │
        │  twrd_contradictions │ twrd_feedback │ twrd_weights   │
        │  versioned, never overwritten, decayed on read        │
        └───────────────┬───────────────────────────────────────┘
                        ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  VERACITY GATE (twrd/gate.ts) — single helper used everywhere    │
   │   weighted(signal) = signal.value * T(x,t)                       │
   │   meta: { T, S, A, contradictionRisk, falseConsensus }           │
   └─────┬─────────────┬──────────────┬──────────────┬────────────────┘
         ▼             ▼              ▼              ▼
   prediction-*    scenarios     risk-intel     regime-detect
   (analyze-     (causal-       (adds Truth    (truth-weighted
    stock,        effects,       Risk; cuts     macro signals
    desirable-    monte-carlo)   size when      replace raw)
    assets)                      T<θ)
                            ▲
                            │
   ┌────────────────────────┴────────────────────────────────────────┐
   │  REFLEXIVITY DEFENSE (reflexivity-engine + twrd guard)          │
   │  if A↑ AND H(sources)↓ AND C↑ → flag FALSE_CONSENSUS            │
   │  → reduce position size, delay trade, add hedge weight          │
   └─────────────────────────────────────────────────────────────────┘
                            ▲
                            │
   ┌────────────────────────┴────────────────────────────────────────┐
   │  FEEDBACK LOOP (twrd-feedback edge fn, nightly cron)            │
   │  outcome y∈{0,1} → update (α_s,β_s)                             │
   │  → SGD step on (w1..w5,b) against logistic loss                 │
   └─────────────────────────────────────────────────────────────────┘
```

---

## 2. Modular code structure

```text
supabase/functions/_shared/twrd/
  types.ts            // Claim, Source, TruthScore, FailureFlag, Triple
  extract.ts          // payload → Claim[]
  cleaners/
    financial.ts      // π̂ ∈ [0.10, 0.90]
    news.ts           // π̂ ∈ [0.20, 0.85] + sentence factuality
    social.ts         // π̂ ∈ [0.05, 0.50] + bot/viral cluster
    geopolitical.ts   // π̂ ∈ [0.00, 0.80]
    scientific.ts     // π̂ ∈ [0.10, 0.75]
    index.ts          // dispatch by domain
  truth.ts            // S, A, D, B, C, T (pure)
  store.ts            // Supabase reads/writes; decay-on-read
  gate.ts             // veracityGate(signals) → weighted + meta
  failureGuards.ts    // false-consensus, adversarial-spike, stale, overfit
  feedback.ts         // Beta posterior + SGD on weights

supabase/functions/twrd-ingest/index.ts     // HTTP: cleaners→TRUTH→store
supabase/functions/twrd-feedback/index.ts   // HTTP/cron: outcomes→learn
supabase/functions/twrd-query/index.ts      // HTTP: read truth-weighted view

src/hooks/useTruthWeightedSignals.ts        // client gate for hooks
src/components/twrd/TruthBadge.tsx          // T%, contradiction icon
src/components/twrd/VeracityPanel.tsx       // sources, contradictions, decay
```

---

## 3. Database schema (new migration)

```sql
create table twrd_sources (
  id text primary key,                 -- e.g. "yahoo", "reuters", "twitter:user"
  domain text not null,                -- financial|news|social|geo|scientific
  alpha numeric not null default 5,    -- π0=0.5, n0=10
  beta  numeric not null default 5,
  updated_at timestamptz not null default now()
);

create table twrd_claims (
  id uuid primary key default gen_random_uuid(),
  subject text not null, relation text not null, object text not null,
  domain text not null,
  truth_score numeric not null,        -- T(x,t) at write time
  alpha numeric not null, beta numeric not null,
  decay_rate numeric not null,         -- λ_d
  valid_from timestamptz not null default now(),
  valid_until timestamptz,             -- null = open
  evidence jsonb not null default '[]'::jsonb, -- [{source_id, raw_text, ts}]
  superseded_by uuid references twrd_claims(id),
  created_at timestamptz not null default now()
);
create index on twrd_claims (subject, relation);
create index on twrd_claims (domain, valid_from desc);

create table twrd_contradictions (
  claim_a uuid references twrd_claims(id) on delete cascade,
  claim_b uuid references twrd_claims(id) on delete cascade,
  detected_at timestamptz not null default now(),
  primary key (claim_a, claim_b)
);

create table twrd_feedback (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references twrd_claims(id) on delete cascade,
  outcome smallint not null check (outcome in (0,1)),
  observed_at timestamptz not null default now()
);

create table twrd_weights (
  id smallint primary key default 1 check (id = 1),  -- single row
  w1 numeric not null default 1.2,  -- S
  w2 numeric not null default 1.0,  -- A
  w3 numeric not null default 0.8,  -- D
  w4 numeric not null default 1.1,  -- B
  w5 numeric not null default 1.3,  -- C
  b  numeric not null default -0.5,
  updated_at timestamptz not null default now()
);
```

RLS: `twrd_sources`, `twrd_claims`, `twrd_contradictions`, `twrd_weights` → public read, service-role write. `twrd_feedback` → authenticated insert/select on own (`user_id` added if user-scoped).

---

## 4. Core TRUTH engine (production code)

```ts
// supabase/functions/_shared/twrd/truth.ts
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

// S — Beta posterior mean
export const sourceCredibility = (alpha: number, beta: number) =>
  alpha / (alpha + beta);

// A — Noisy-OR; thetas already deduped by ownership/fingerprint upstream
export const agreement = (thetas: number[]) =>
  1 - thetas.reduce((p, t) => p * (1 - Math.max(0, Math.min(1, t))), 1);

// D — exponential decay; lambda derived from domain half-life
export const decay = (deltaSeconds: number, halfLifeSeconds: number) =>
  Math.exp(-(Math.LN2 / halfLifeSeconds) * deltaSeconds);

// B — bias penalty; bHat ∈ [0,1] from cleaner classifier
export const biasPenalty = (bHat: number, delta = 0.5) =>
  delta * Math.max(0, Math.min(1, bHat));

// C — contradiction penalty; max T over contradictors already in store
export const contradictionPenalty = (maxContradictorT: number, eps = 0.6) =>
  eps * Math.max(0, Math.min(1, maxContradictorT));

export interface TruthFactors { S: number; A: number; D: number; B: number; C: number; }
export interface Weights { w1:number; w2:number; w3:number; w4:number; w5:number; b:number; }

export const truthScore = (f: TruthFactors, w: Weights): number =>
  sigmoid(w.w1*f.S + w.w2*f.A + w.w3*f.D - w.w4*f.B - w.w5*f.C + w.b);

// Streaming-friendly: incremental update when a new corroborating source arrives.
// A_new = 1 - (1 - A_old)(1 - theta_new)
export const updateAgreement = (Aold: number, thetaNew: number) =>
  1 - (1 - Aold) * (1 - thetaNew);
```

Failure guards (`failureGuards.ts`):

```ts
import { agreement } from "./truth.ts";

// Shannon entropy of source distribution (normalised 0..1)
export const sourceEntropy = (counts: number[]): number => {
  const n = counts.reduce((a,b)=>a+b,0);
  if (!n) return 0;
  const H = -counts.reduce((s,c)=> c? s + (c/n)*Math.log2(c/n) : s, 0);
  const Hmax = Math.log2(counts.length || 1) || 1;
  return H / Hmax;
};

export interface Guards {
  falseConsensus: boolean;   // high A, low entropy, rising C
  adversarialSpike: boolean; // velocity > 10x baseline OR many <30d sources
  staleFact: boolean;        // D < 0.2
  overfitDrift: boolean;     // calibration error trending up
}
```

---

## 5. Veracity Gate — how every existing engine consumes TWRD

```ts
// supabase/functions/_shared/twrd/gate.ts
export interface RawSignal {
  id: string; value: number;            // signed strength, -1..+1 or any scale
  claim: { subject: string; relation: string; object: string };
  domain: "financial"|"news"|"social"|"geo"|"scientific";
}
export interface WeightedSignal extends RawSignal {
  T: number; S: number; A: number;
  contradictionRisk: number;           // = C in [0,1]
  falseConsensus: boolean;
  weighted: number;                     // = value * T
}
export async function veracityGate(signals: RawSignal[]): Promise<WeightedSignal[]> { /* … */ }
```

### Integration hooks

| Existing module | Change |
|---|---|
| `supabase/functions/analyze-stock/index.ts` | Wrap fundamentals/news inputs with `veracityGate`. Pass `weightedInput = signal * T` into the prompt; reject inputs with `T < 0.35`. |
| `supabase/functions/desirable-assets/index.ts` | Each AI candidate's evidence triples scored. Veto candidates whose median evidence `T < 0.5`. Surface `truthConfidence` per pick. |
| `supabase/functions/causal-effects/index.ts` | Every scenario node carries `truthConfidence` of its trigger fact. Final scenario probability = `P(event) × min(T of preconditions)`. |
| `supabase/functions/risk-intelligence/index.ts` | New term **Truth Risk** = `1 − meanT(portfolio_signals)`. If `T < 0.4` → cut position size by `(0.4 − T)/0.4`, raise hedge weight proportionally. |
| `supabase/functions/macro-intelligence/index.ts` + regime hook | Aggregate truth-weighted macro signals; regime classifier uses `Σ wᵢ·T(xᵢ)·signalᵢ` not raw. |
| `supabase/functions/reflexivity-engine/index.ts` | Add fourth component `veracity` to the consensus fusion; if `falseConsensus=true`, override `shiftETA.label = "FALSE CONSENSUS"` and force position-size cut downstream. |
| `useReflexivity.ts`, `useAIIntelligence.ts`, `RiskDashboard.tsx`, `Recommendation.tsx` | Surface `T%`, source count, contradiction badge via `TruthBadge`. |

---

## 6. Reflexivity Defense (the critical guard)

In `reflexivity-engine/index.ts`, after `deriveConsensus`:

```ts
const sourceCounts = bucketSourcesByDomain(input);   // [news, social, flow, ...]
const H = sourceEntropy(sourceCounts);
const A = consensusAgreementFromTWRD(input);          // mean A across active claims
const Crisk = meanContradictionRisk(input);

const falseConsensus = A > 0.85 && H < 0.35 && Crisk > 0.25;
if (falseConsensus) {
  shiftETA.label = "FALSE CONSENSUS";
  shiftETA.probability = Math.max(shiftETA.probability, 70);
  // emit to risk-intel: sizeMult = 0.5, hedgeWeight += 0.15, tradeDelaySec = 900
}
```

---

## 7. Feedback loop (self-correction)

`supabase/functions/twrd-feedback/index.ts` — POST `{ claim_id, outcome }`:

1. Insert into `twrd_feedback`.
2. For each source on that claim: `outcome=1 → α+=1` else `β+=1`.
3. Online SGD step on weights using logistic loss:
   ```
   p = σ(w·x + b);  g = (p − y)
   wᵢ ← wᵢ − η · g · xᵢ;  b ← b − η · g
   project wᵢ ≥ 0.01, clip ‖w‖∞ ≤ 5
   ```
4. Persist to `twrd_weights`. `η = 0.01` with decay.

Triggered (a) live from trade close events in `useSellNotifications`/`lodger_trades`, (b) nightly cron over `user_analysis_history` outcomes vs current price.

---

## 8. Output upgrade — every recommendation now carries

```json
{
  "scenario": "AAPL breakout into earnings",
  "probability": 0.62,
  "truthConfidence": 0.78,
  "sourceReliability": { "mean_theta": 0.71, "k_independent": 4 },
  "contradictionRisk": 0.18,
  "falseConsensus": false,
  "guards": { "stale": false, "adversarialSpike": false }
}
```

Rendered by `TruthBadge` and `VeracityPanel` on `Recommendation`, `DesirableAssets`, `RiskDashboard`, `ReflexivityEngine`, `CausalEffectsEngine`.

---

## 9. Failure-mode guards (always-on)

| Guard | Detection | Action |
|---|---|---|
| False consensus | `A>0.85 ∧ H<0.35 ∧ C>0.25` | `T *= 0.6`, flag UI, cut size |
| Adversarial spike | claim velocity > 10× baseline OR > 60% sources <30d old | quarantine until secondary review; `T` capped at 0.25 |
| Stale fact | `D < 0.2` | flag, force re-ingest before use |
| Overfitting | rolling Brier score worsening 5 cycles | freeze weight updates, widen `η` reset |

Each guard pushes a row to a future `twrd_alerts` table for the dashboard.

---

## 10. Example end-to-end flow

```text
1. fetch-news returns: "Reuters: Apple to acquire Pixelmator" (ts=T0, source=reuters)
2. extract → claim ⟨AAPL, acquires, Pixelmator⟩, domain=financial
3. financial cleaner → π̂ = 0.85 (named acquirer + named target + named outlet)
4. store lookup → 1 corroborating claim from "9to5mac" (θ=0.55)
   → S = θ_reuters = 0.86;  A = 1 − (1−0.86)(1−0.55) = 0.937
   → D = e^(−ln2/(7d) · 1h) ≈ 0.996;  B = 0.5·0.10 = 0.05;  C = 0
   → T = σ(1.2·.86 + 1·.937 + .8·.996 − 1.1·.05 − 1.3·0 − 0.5) ≈ 0.86
5. write twrd_claims row, T=0.86; no contradictions
6. analyze-stock(AAPL) ingests recommendation signal value=+0.6 (bullish M&A)
   → veracityGate → weighted = 0.6 · 0.86 = 0.516
   → reflexivity sees A=0.937 but H(sources)=0.62 → no false consensus
7. risk-intelligence: Truth Risk = 1 − 0.86 = 0.14 → no size cut
8. Recommendation renders: BUY AAPL, conviction 62%, TruthConfidence 86%,
   Sources 2 (Reuters, 9to5mac), Contradiction risk 0%
9. T+3d outcome = deal confirmed → twrd-feedback POST {claim_id, outcome:1}
   → α_reuters += 1; α_9to5mac += 1; SGD nudges w2 (agreement) up slightly
```

---

## 11. Implementation order (build phases)

1. Migration: `twrd_sources`, `twrd_claims`, `twrd_contradictions`, `twrd_feedback`, `twrd_weights` + seed source priors.
2. `_shared/twrd/{types,truth,failureGuards,store,gate,cleaners/*,extract}.ts`.
3. Edge functions: `twrd-ingest`, `twrd-query`, `twrd-feedback`.
4. Wire `veracityGate` into `analyze-stock`, `desirable-assets`, `causal-effects`, `risk-intelligence`, `macro-intelligence`, `reflexivity-engine` (one PR per function, behind a `TWRD_ENABLED` flag for safe rollout).
5. UI: `TruthBadge`, `VeracityPanel`; mount in `Recommendation`, `DesirableAssets`, `RiskDashboard`, `ReflexivityEngine`, `CausalEffectsEngine`.
6. Feedback wiring: `useSellNotifications` and a nightly `twrd-feedback` cron over `user_analysis_history`.
7. Memory file `mem://features/platform-modules/twrd-veracity-layer` documenting the contract.

After approval I switch to default mode and build phases 1→7.
