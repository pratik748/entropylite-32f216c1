// Cadence — daily research stream
// One concept per 24h. Rotation is driven by day-of-year over ENTRIES.

import previewRisk from "@/assets/preview-risk.webp";
import previewSandbox from "@/assets/preview-sandbox.webp";
import previewMarkets from "@/assets/preview-markets.webp";

export type CadenceSection = {
  heading: string;
  body: string;
  equation?: string;
};

export type CadenceEntry = {
  slug: string;
  concept: string;
  tagline: string;
  discipline: string;
  readMinutes: number;
  whyItMatters: string;
  insideTheSystem: {
    caption: string;
    image: string;
    annotation: string;
  };
  mathematicalCore: CadenceSection[];
  failureModes: string[];
};

export const ENTRIES: CadenceEntry[] = [
  {
    slug: "kelly-criterion",
    concept: "The Kelly Criterion",
    tagline: "Position sizing under uncertainty — the bridge between edge and ruin.",
    discipline: "Information Theory · Capital Allocation",
    readMinutes: 7,
    whyItMatters:
      "Most blow-ups are not bad trades. They are correctly-identified edges sized incorrectly. Kelly answers a question every allocator faces silently on every position: given an estimated edge and an estimated variance, what fraction of capital maximizes long-run geometric growth without driving the account to zero? Sub-Kelly leaves compounding on the table; super-Kelly guarantees ruin in finite time, even with a positive expectancy. Inside Entropy Lite, this is the spine of every position-sizing recommendation — the system never sizes by conviction alone, because conviction is not a unit of risk.",
    insideTheSystem: {
      image: previewRisk,
      caption: "Risk dashboard — sizing surfaces alongside VaR/CVaR",
      annotation:
        "When the Risk Engine returns a recommended allocation, the underlying call is a fractional-Kelly computation (typically ¼ to ½ Kelly) bounded by portfolio CVaR and the asset's liquidity score. The displayed 'Optimal Size' is never raw f* — it is the intersection of Kelly, drawdown elasticity, and the user's regime exposure.",
    },
    mathematicalCore: [
      {
        heading: "The classical formulation",
        body: "For a binary outcome with win probability p, loss probability q = 1 − p, and net odds b (payoff per unit risked), the Kelly-optimal fraction of bankroll to wager is the value of f that maximizes the expected logarithm of wealth.",
        equation: "f* = (b·p − q) / b   =   p − (1 − p)/b",
      },
      {
        heading: "Continuous-return generalization",
        body: "For an asset with excess return μ and variance σ² (the regime under which financial markets actually operate), the continuous Kelly fraction collapses to a remarkably clean ratio. This is the form Entropy Lite uses, parameterized by the live μ and σ surfaced from the Quantitative Engine.",
        equation: "f* = μ / σ²",
      },
      {
        heading: "Why we always run fractional Kelly",
        body: "Full Kelly is volatility-optimal only if μ and σ are known exactly. They are not. They are estimates with their own variance. A standard result is that estimation error in μ degrades realized growth roughly as the square of the over-bet ratio — meaning a 2× over-estimate of edge halves long-run growth and dramatically increases drawdown depth. ½-Kelly captures roughly 75% of the growth with roughly 25% of the variance.",
      },
    ],
    failureModes: [
      "Kelly assumes you know μ and σ. You do not — you have noisy estimators. Treat the output as an upper bound, not a target.",
      "Kelly is geometric-growth optimal, not utility optimal. A pension fund with a drawdown mandate should run a small fraction of Kelly even with a perfect edge.",
      "On portfolios, naive per-asset Kelly ignores covariance. Entropy Lite uses the multi-asset form f* = Σ⁻¹μ, which can suggest negative weights when correlation structure shifts — a known instability we suppress with Ledoit-Wolf shrinkage.",
      "Kelly says nothing about the cost of being wrong about p. In regimes with fat-tailed loss distributions, the log-wealth objective itself becomes questionable.",
    ],
  },
  {
    slug: "regime-detection-hmm",
    concept: "Hidden Markov Regimes",
    tagline: "The market is not one process. It is several, and you only see one at a time.",
    discipline: "Stochastic Processes · State-Space Models",
    readMinutes: 8,
    whyItMatters:
      "Every quantitative strategy has a regime in which it earns and a regime in which it bleeds. Mean-reversion works in range-bound, low-vol regimes and dies in trending high-vol regimes; momentum is the mirror image. The empirical reality of markets is that they switch between a small number of latent states — typically 2 to 4 — with persistence and abrupt transitions. A Hidden Markov Model treats those states as unobservable and infers the most likely current regime from observed returns and volatility. Inside Entropy Lite, regime is not a label; it is a posterior distribution that conditions every downstream module — sizing, hedging, rebalance frequency, and which strategies are even allowed to fire.",
    insideTheSystem: {
      image: previewMarkets,
      caption: "Macro Regime strip — live posterior over latent states",
      annotation:
        "The 'Regime' tag in the header is the argmax of a 3-state HMM (low-vol drift / high-vol mean-reversion / crisis) fit on a rolling window of index returns and implied vol. The Strategy Lab and Augment dashboard read this state and refuse to surface trades whose historical Sharpe in the current regime is negative.",
    },
    mathematicalCore: [
      {
        heading: "The model",
        body: "Observed returns r_t are emitted from one of K hidden states S_t with state-specific Gaussian (or Student-t) parameters. The hidden state evolves as a discrete Markov chain with transition matrix A. The full model is parameterized by initial state distribution π, transition matrix A, and emission parameters θ_k for each state.",
        equation: "P(r₁..T, S₁..T) = π_{S₁} · ∏ A_{S_{t-1}, S_t} · f(r_t | θ_{S_t})",
      },
      {
        heading: "Inference: the forward-backward recursion",
        body: "Given a fitted model, the probability of being in state k at time t given all observations is computed by the forward-backward algorithm in O(T·K²). This is what produces the live 'regime probability' we display — not a hard label, but a soft posterior over states.",
        equation: "γ_t(k) = α_t(k)·β_t(k) / Σ_j α_t(j)·β_t(j)",
      },
      {
        heading: "Fitting: Baum-Welch (EM)",
        body: "Parameters are estimated by expectation-maximization: alternate between computing γ and ξ given current parameters (E-step) and updating π, A, θ to maximize expected complete-data log-likelihood (M-step). We refit weekly on a 5-year rolling window with K=3 — chosen by BIC, not by aesthetics.",
      },
    ],
    failureModes: [
      "HMMs assume the underlying Markov chain is stationary. It is not — the transition matrix itself drifts over decades. We mitigate with rolling refits, but a true regime-of-regimes (HHMM) is on the roadmap.",
      "K is chosen, not discovered. K=2 misses crisis dynamics; K=5 over-fits and produces ghost regimes. K=3 is a deliberate compromise.",
      "Gaussian emissions underestimate tail risk. Switching to Student-t emissions improves crisis detection at the cost of slower convergence.",
      "Regime labels are nameless — state 0 is not 'bull' inherently. We assign semantic labels post-hoc by ranking states on realized vol and drift, which can flip during refits and requires careful continuity tracking.",
    ],
  },
  {
    slug: "cvar-expected-shortfall",
    concept: "Conditional Value-at-Risk",
    tagline: "VaR tells you the door. CVaR tells you what is behind it.",
    discipline: "Risk Theory · Coherent Risk Measures",
    readMinutes: 6,
    whyItMatters:
      "Value-at-Risk became the industry standard because it produces a single, communicable number — '1-day 99% VaR is $4.2M.' But VaR is silent on the magnitude of losses beyond the threshold and, critically, is not subadditive: combining two portfolios can produce a VaR larger than the sum of their individual VaRs, which violates the basic intuition that diversification reduces risk. CVaR — the expected loss conditional on being beyond the VaR threshold — fixes both problems. It is a coherent risk measure (Artzner et al., 1999) and answers the question regulators actually care about: when things go wrong, how wrong do they go on average?",
    insideTheSystem: {
      image: previewRisk,
      caption: "Risk panel — VaR alongside CVaR at 95% and 99%",
      annotation:
        "Every portfolio displays both 1-day VaR and CVaR at the 95th and 99th percentile. The CVaR/VaR ratio is shown as a 'tail thickness' indicator — values above ~1.4 signal a fat-tailed return distribution where Gaussian-VaR is materially understating risk.",
    },
    mathematicalCore: [
      {
        heading: "Definitions",
        body: "For a loss distribution L with confidence level α (typically 0.95 or 0.99), VaR is the α-quantile of losses. CVaR is the conditional expectation of loss given that loss exceeds VaR.",
        equation: "VaR_α(L) = inf { ℓ : P(L ≤ ℓ) ≥ α }\nCVaR_α(L) = E[ L | L ≥ VaR_α(L) ]",
      },
      {
        heading: "Why CVaR is coherent and VaR is not",
        body: "A coherent risk measure satisfies four axioms: monotonicity, translation invariance, positive homogeneity, and — crucially — subadditivity (ρ(X+Y) ≤ ρ(X) + ρ(Y)). VaR fails subadditivity in fat-tailed and discrete-loss settings. CVaR satisfies all four for any distribution. This is not academic: portfolio optimization under VaR is non-convex; under CVaR it is a linear program (Rockafellar-Uryasev, 2000), which is why every modern risk-budgeting engine has migrated.",
      },
      {
        heading: "Estimation in Entropy Lite",
        body: "We run three estimators in parallel: parametric (Gaussian, fast but tail-blind), historical (empirical quantile, no distribution assumption but limited by sample size), and a Cornish-Fisher expansion that adjusts the Gaussian quantile for sample skew and kurtosis. The displayed CVaR is the maximum of the three — a deliberate conservative bias. Backtest breach counts are tracked Kupiec-style on a rolling 60-day window.",
      },
    ],
    failureModes: [
      "Historical CVaR at 99% with 250 days of data uses ~2-3 observations. The estimator variance is enormous. We weight historical and parametric estimates inversely to sample size in the deep tail.",
      "CVaR assumes the future loss distribution resembles the past. In regime transitions, both VaR and CVaR systematically understate risk — which is why the Risk Engine cross-checks against the live HMM regime posterior.",
      "CVaR is a single-period measure. Multi-day liquidation risk requires either time-scaling (which compounds estimation error) or full path simulation (which is what Monte Carlo Engine provides for portfolios above a size threshold).",
    ],
  },
  {
    slug: "reflexivity-soros",
    concept: "Reflexivity",
    tagline: "The map changes the territory. Then the territory changes the map.",
    discipline: "Behavioral Finance · Feedback Dynamics",
    readMinutes: 7,
    whyItMatters:
      "Classical finance assumes prices reflect fundamentals. Soros's contribution — formalized only loosely in his own writing but extensively in subsequent literature — is that participants' beliefs about fundamentals partially constitute those fundamentals. A rising stock price improves a company's cost of capital, which improves its actual fundamentals, which justifies the higher price, which attracts more buyers. The loop runs in both directions and is the structural source of bubbles and crashes. Reflexivity is unfalsifiable as a universal theory but operationally precise as a signal: when belief metrics (flow, sentiment, positioning) and fundamental metrics (earnings, macro) diverge sharply, the system is in a reflexive regime where price is increasingly self-referential and increasingly fragile.",
    insideTheSystem: {
      image: previewSandbox,
      caption: "Reflexivity Engine — contradiction map and shift-ETA",
      annotation:
        "The Reflexivity tab does not predict price. It quantifies the gap between flow-implied conviction and fundamental-implied conviction across our signal stack, surfaces contradictions of 40+ points, and computes a 'shift-ETA' — the probability-weighted window in which the loop is likely to break or amplify. The actionable output is always asymmetric: define the trigger, the trade expression, and the invalidation — never a directional prediction.",
    },
    mathematicalCore: [
      {
        heading: "A formal sketch",
        body: "Let F_t denote fundamentals, B_t denote aggregate belief about fundamentals, and P_t denote price. The classical view is P_t = g(F_t). The reflexive view is a coupled system where belief affects fundamentals through capital flows, financing terms, and corporate behavior.",
        equation: "P_t = g(F_t, B_t)\nB_{t+1} = h(P_t, B_t, news_t)\nF_{t+1} = F_t + φ(P_t, F_t)",
      },
      {
        heading: "Detecting the regime",
        body: "We do not estimate the structural model — its parameters are non-identifiable in real time. We instead compute a divergence statistic between flow-derived conviction (options skew, dealer positioning, ETF creation/redemption) and fundamental-derived conviction (revisions, macro nowcasts). The shift-ETA is a logistic function of contradiction magnitude × inverse signal-conviction × VIX percentile.",
        equation: "ShiftETA = σ( β₀ + β₁·|Δ| + β₂·(1 − conv) + β₃·VIX_pct )",
      },
    ],
    failureModes: [
      "Reflexivity is most visible in hindsight. Live, it is indistinguishable from a strong fundamental trend until the loop breaks.",
      "The contradiction signal has many false positives in low-vol drift regimes — flow and fundamentals routinely diverge by small amounts without consequence. We require a minimum 40-point gap and conditioning on regime.",
      "The model is silent on direction. It identifies fragility, not the side of the eventual break. This is by design — directional reflexivity calls require additional structural inputs (CLANK constraints, positioning extremes) which are surfaced in adjacent modules.",
    ],
  },
];

export function getTodayEntry(): CadenceEntry {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const diff = Date.now() - start.getTime();
  const dayOfYear = Math.floor(diff / 86400000);
  return ENTRIES[dayOfYear % ENTRIES.length];
}

export function getEntryBySlug(slug: string): CadenceEntry | undefined {
  return ENTRIES.find((e) => e.slug === slug);
}

export function getOrderedEntries(): CadenceEntry[] {
  const today = getTodayEntry();
  const rest = ENTRIES.filter((e) => e.slug !== today.slug);
  return [today, ...rest];
}

export function getEntryDateLabel(_entry: CadenceEntry, index: number): string {
  const d = new Date();
  d.setDate(d.getDate() - index);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
