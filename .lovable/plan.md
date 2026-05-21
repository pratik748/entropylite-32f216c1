## Goal

Replace the heuristic weight formulas in **Portfolio Construction** with real, citable portfolio math driven by the covariance matrix we already compute in `useQuantSnapshot`. Everything new must be deterministic, derived from real historical returns, and labeled with its source.

## Why this slice first

You picked "Portfolio & risk" + "real math where feasible" + "drop infra items entirely." `useQuantSnapshot` already produces:

- log-return series per ticker
- σ vector
- covariance matrix Σ
- correlation matrix

That's the full input set for Markowitz / min-var / Kelly / RMT. We can ship real math without touching data plumbing.

## What gets implemented

**1. New library `src/lib/portfolio-math.ts**` — pure functions, fully tested-shape:

- `minVarianceWeights(Σ, longOnly=true)` — analytical solution `w* = Σ⁻¹·1 / (1ᵀΣ⁻¹1)`. Long-only variant via projected gradient (Lagrangian with Σwᵢ=1, wᵢ≥0). Uses Cholesky (already need a small linear solver — Gauss-Jordan is fine for n≤30).
- `meanVarianceWeights(μ, Σ, λ)` — Markowitz utility max `μᵀw − λ·wᵀΣw`, closed-form `w* ∝ Σ⁻¹μ`, normalized & clipped. Reference: Markowitz 1952.
- `riskParityWeights(Σ)` — real ERC (equal risk contribution) via Newton iteration on `wᵢ·(Σw)ᵢ = const`, not the current `1/σᵢ` shortcut.
- `fractionalKelly(μ, Σ, fraction=0.25)` — `w_kelly = Σ⁻¹μ`, then scaled by `fraction` and cash-padded. Reference: Kelly 1956, Thorp 2006.
- `marchenkoPastur(eigenvalues, T, N)` — returns the MP upper edge `λ₊ = σ²(1+√(N/T))²` and the share of eigenvalues exceeding it (genuine signal vs noise). Reference: Marchenko-Pastur 1967, Laloux et al. 1999.
- `pc1Concentration(Σ)` — power-iteration to get the top eigenvalue's share of total variance. Flag systemic-risk regime when PC1 share > 40%. Reference: Bouchaud & Potters.
- `wilsonInterval(successes, trials, z=1.96)` — two-sided 95% binomial CI for win-rate displays. Reference: Wilson 1927.

All functions: pure, deterministic, no `Math.random()`, no fallbacks to fabricated values. Return `null` when input is degenerate (n<2, Σ singular, T<N+5 for MP) and the UI shows "—".

**2. Update `src/components/augment/PortfolioConstructionModule.tsx**`:

- Replace the four `case` branches in `computeTargets` with calls to the new lib using the covariance matrix from `useQuantSnapshot(stocks)`.
- Add a **"Noise vs Signal"** strip: shows MP upper edge `λ₊`, count of eigenvalues above it, PC1 concentration %, and a colored badge (green / amber / red) when PC1 > 40%.
- Add a **methodology tooltip** on each strategy chip with formula + citation (we already have `MethodologyTooltip`).
- When `useQuantSnapshot` has insufficient history (< 30 days for any ticker), gray out min-var / Markowitz and show "needs ≥30d history" — never silently fall back to heuristics.

**3. Update `direct-profit/index.ts` Kelly block**:

- Current code uses the binary win/loss Kelly. Wrap with `wilsonInterval` so `kellyFraction` includes a CI; pass the lower-bound win-prob into the Kelly formula (conservative). Apply `fractional = 0.25` cap that's already there. Reference comment added.

**4. Wire the systemic-risk flag**:

- Surface PC1 > 40% concentration as a chip in `RiskDashboard.tsx` ("Systemic concentration: 47% in PC1 — diversification illusory"). Pure read from the new `pc1Concentration` helper, no new data calls.

## What does NOT get added (per your "drop entirely" choice)

Removed from scope: FPGA, Xilinx Alveo, NY4/LD5 colo, microwave links, Equinix, SIMD/AVX-512, CPU pinning, Kafka, Redis, Arctic, A100, PyTorch/Ray, ML-KEM/Dilithium, post-quantum TLS, Quantum Sentinel, Apache anything. None of these can run in a browser/edge stack and pretending otherwise is the credibility risk you flagged. They don't get a roadmap page either — fully dropped.

Also out of scope for *this plan* (legitimate but belongs in their own clusters you didn't pick first): GARCH/DCC-GARCH, HMM regime, Hurst/DFA, Lyapunov, Lee-Ready, Kyle's λ, Amihud, Engle-Granger, OU MLE, Sobol/QMC. Happy to plan any of these next.

## Files touched

```text
NEW   src/lib/portfolio-math.ts
EDIT  src/components/augment/PortfolioConstructionModule.tsx
EDIT  src/components/RiskDashboard.tsx          (PC1 chip)
EDIT  supabase/functions/direct-profit/index.ts (Wilson-bounded Kelly)
```

## Acceptance check

- All 4 strategy weights come from real Σ — no `1/σᵢ` shortcuts left.
- MP edge and PC1 share render real numbers or "—", never fabricated.
- Wilson-bounded Kelly fraction appears in Direct Profit risk metrics with a citation in the comment.
- No new `Math.random()`, no new mock arrays, no new hardcoded ratios.
- Each strategy chip's tooltip cites its paper (Markowitz 1952 / Kelly 1956 / Marchenko-Pastur 1967 / Wilson 1927).
- First: ban “equivalent approximations” explicitly.
  Your prompts should contain hard constraints like:
  - “Do not approximate this with inverse volatility.”
  - “Do not substitute heuristics.”
  - “Do not fabricate outputs under degenerate conditions.”
  - “If optimization fails, return null.”
  - “Every output must derive from Σ or μ directly.”
  - “No fallback weights.”
  - “No synthetic smoothing.”
  - “No random initialization.”