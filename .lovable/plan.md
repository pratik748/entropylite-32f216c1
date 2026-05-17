# Veracity Audit — Remaining Non-Deterministic / Synthetic Code

Scanned `src/` and `supabase/functions/` for `Math.random`, `mock`, `fake`, `synthetic`, `placeholder`, `hardcoded`, `stub`. Below is every remaining hit, classified by whether it is a **legitimate stochastic draw** (Monte Carlo / Box-Muller), a **cosmetic-only** jitter, or a **real fabrication** that still pollutes user-facing numbers.

## 1. Legitimate stochastic math (KEEP — calibrated by real μ, σ)

These are valid Monte Carlo / GBM / jump-diffusion draws. Parameters come from `useQuantSnapshot` (real history). Randomness is the simulation itself, not fabricated output.

| File | Lines | Purpose |
|---|---|---|
| `src/lib/statarb-math.ts` | 10–11, 59, 228, 431 | Box-Muller + jump draws inside GBM path generator |
| `src/lib/future-graph-machine.ts` | 50–51 | Box-Muller for forward-graph projections |
| `src/components/MonteCarloChart.tsx` | 21–22 | Box-Muller for chart paths |
| `src/components/sandbox/MonteCarloEngine.tsx` | 19–20, 140, 156 | Box-Muller + Poisson jump in MC engine |
| `supabase/functions/desirable-assets/index.ts` | 1628–1629 | Box-Muller inside per-asset 5,000-path GBM win-rate sim, driven by real `mu60`, `sig60` from `returns` |

Recommendation: leave as-is. Optionally swap to a seeded PRNG for reproducibility — not a credibility issue.

## 2. Cosmetic-only randomness (LOW PRIORITY — does not affect quant output)

| File | Lines | What it does | Risk |
|---|---|---|---|
| `src/lib/selfRepair.ts` | 44 | 0–400ms jitter on retry backoff | None — networking hygiene |
| `src/components/ui/sidebar.tsx` | 536 | Random skeleton-shimmer width 50–90% | None — shadcn loading skeleton |

Recommendation: keep.

## 3. Fabricated user-facing values (FIX — still violates credibility-first rule)

These render numbers the user reads as if they were real telemetry.

### 3a. `src/components/terminal/SystemStatusBar.tsx` (lines 12, 13, 27)
```ts
const [simCount] = useState(() => Math.floor(Math.random() * 3) + 1);
const [cpuLoad]  = useState(() => (Math.random() * 20 + 8).toFixed(1));
const latencyMs  = priceLatency ?? Math.floor(Math.random() * 40 + 12);
```
The terminal status bar invents "simulations running", "CPU load %", and a fallback latency. These are visible in the chrome on every page.
- **Fix**: derive `simCount` from the actual continuous-sim hook count; drop `cpuLoad` entirely (or compute from `performance.now()` frame timing); when `priceLatency` is unavailable show `—` instead of a fake number.

### 3b. `supabase/functions/desirable-assets/index.ts` line 951
```ts
const seed = Math.floor(Math.random() * 99999);
```
A random seed is injected into the AI prompt, meaning identical inputs produce different recommendation lists across calls. Not fabrication per se, but it makes the desk look non-deterministic.
- **Fix**: replace with a deterministic seed from `hash(portfolioTickers + dateKey)` so the same portfolio yields stable recommendations within a session/day.

## 4. Modules still labelled "synthetic" in code (REVIEW)

These call themselves synthetic in comments or strings; verify they are gated behind a fallback / clearly badged in UI.

| File | Context |
|---|---|
| `supabase/functions/alternative-signals/index.ts:123` | "Generate a synthetic but meaningful trade flow signal based on date patterns" — flow score derived from calendar, not real volume. **Action: replace with volume z-score from `historical-prices`, as already proposed in `.lovable/plan.md` §6.** |
| `src/lib/future-graph-machine.ts:311` | "Generate synthetic historical data" — only used when no real series passed in. **Action: confirm the caller always passes real `closes`; otherwise add a `provenance: 'synthetic-fallback'` badge.** |
| `src/lib/clank-engine.ts:167` | "Derive synthetic market signals from portfolio" — heuristic signals, not real. **Action: rebuild on top of `useQuantSnapshot` σ / corr or mark as `heuristic` in the Clank UI.** |
| `src/hooks/useGeoEvents.ts:27`, `src/components/geopolitical/GeopoliticalMap.tsx:259` | Skip a synthetic "Global" marker — already handled correctly, no fabrication. |
| `src/components/DesirableAssets.tsx:314` | Just a string explaining the no-fallback policy. OK. |
| `src/components/landing/MathResearch.tsx:395` | Marketing copy. OK. |

## 5. Verified clean (previously fixed)

- `src/components/augment/ESGModule.tsx` — random scores removed
- `src/components/augment/OrderManagementModule.tsx` — Almgren-Chriss slippage, deterministic
- `src/components/sandbox/ExecutionEngine.tsx` — comment explicitly notes "no Math.random"
- `src/components/sandbox/CausalEffectsEngine.tsx` — comments confirm deterministic edges
- `src/components/sandbox/StatArbEngine.tsx` — shrinkage/clamping done
- `supabase/functions/sec-filings/index.ts` — fabricated insider rows removed

## Recommended next actions (in priority order)

1. **`SystemStatusBar.tsx`** — strip the three fake telemetry numbers; this is the most visible fabrication left.
2. **`alternative-signals/index.ts`** — implement volume z-score flow signal (already in `.lovable/plan.md`).
3. **`clank-engine.ts`** — rebase "synthetic market signals" onto real σ / correlation from `useQuantSnapshot`, or label as heuristic.
4. **`desirable-assets` seed** — make deterministic for session/day stability.
5. **`future-graph-machine.ts`** — verify every caller passes real history; otherwise add provenance badge.

No code changes made — plan mode.
