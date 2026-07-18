/**
 * Model registry — institutional memory for every methodology that emits a
 * user-facing belief. Each engine attaches its registry entry to its
 * responses, so a stored output can always answer: which model produced
 * you, which version, validated how, wrong how.
 *
 * RULES:
 *  - Bump `version` on ANY change to a model's methodology, inputs, gates,
 *    or output semantics. Historical outputs must never silently appear to
 *    come from today's methodology.
 *  - `validationStatus` may only claim what has actually been done.
 *  - `knownLimitations` is mandatory and must stay honest — it is the error
 *    budget in prose.
 */

export interface ModelRegistryEntry {
  id: string;
  version: string;
  effectiveDate: string;
  methodology: string;
  inputs: string[];
  outputSemantics: string;
  validationStatus:
    | "unvalidated"
    | "outcome-logged (nightly settlement, reliability reported)"
    | "backtested"
    | "live-validated";
  knownLimitations: string[];
}

const REGISTRY: Record<string, ModelRegistryEntry> = {
  "ensemble-consensus": {
    id: "ensemble-consensus",
    version: "2.2.0",
    effectiveDate: "2026-07-17",
    methodology:
      "Inverse-variance-weighted engine votes in 3 orthogonal buckets; prior Platt map σ(α|score|+β·agreement+δ·buckets+γ) with hand-set α=3.2, β=1.4, γ=−0.7; Cornish-Fisher fat-tail expected R after round-trip costs; AND-gate on engines/buckets/prob/agreement/E[R].",
    inputs: ["engine directional votes + confidences", "engine reliability priors", "realized skew/kurtosis", "per-ticker cost haircut"],
    outputSemantics:
      "calibratedProb is a PRIOR-MAP model probability (probBasis=prior_platt_map), clamped [0.50, 0.95]; not an empirically calibrated frequency. expectedR is a model E[R] in R-multiples after costs and tail adjustment.",
    validationStatus: "outcome-logged (nightly settlement, reliability reported)",
    knownLimitations: [
      "Platt constants are hand-set priors, not fitted; empirical reliability is measured but not yet fed back into the map",
      "engine votes are partially correlated within buckets; the bucket layer mitigates but does not eliminate double counting",
      "T+5 binary settlement ignores path (stop-outs inside the window)",
    ],
  },
  "direct-profit": {
    id: "direct-profit",
    version: "3.1.0",
    effectiveDate: "2026-07-17",
    methodology:
      "AI trade-structuring over a deterministic technical/risk snapshot (canonical stats spine), gated by ensemble-consensus with decision-theoretic thresholds (p ≥ 0.53, E[R] ≥ 0.05R after costs); historical VaR/CVaR at n ≥ 20 else labeled parametric estimate; currency-aware risk-free.",
    inputs: ["Yahoo/AlphaVantage OHLCV", "VIX", "news titles", "ensemble-consensus verdict", "riskFree snapshot"],
    outputSemantics:
      "action/entry/target/stop are a model TRADE PLAN (hypothesis), not a forecast; win-prob inherits ensemble-consensus semantics; risk metrics are measured from history where sample permits.",
    validationStatus: "outcome-logged (nightly settlement, reliability reported)",
    knownLimitations: [
      "AI narrative layer can mis-structure levels; server promote/rebuild branch guards but does not eliminate this",
      "betaEstimate is a VIX/vol proxy, not a regression",
      "no intraday data — gap risk between daily closes is invisible",
    ],
  },
  "analyze-stock": {
    id: "analyze-stock",
    version: "4.1.0",
    effectiveDate: "2026-07-17",
    methodology:
      "Deterministic desk snapshot from live-scraped fundamentals (Screener/Yahoo/Finviz) + canonical return statistics with currency-aware risk-free + cross-source conflict detection; heuristic risk composite with stated weights; AI used for news categorization only.",
    inputs: ["Screener.in scrape", "Yahoo quoteSummary", "2y daily bars", "news/filings feeds", "riskFree snapshot"],
    outputSemantics:
      "quantMetrics are measured statistics (sample sizes attached); riskScore/riskBreakdown are HEURISTIC composites (stated weights, uncalibrated); ranges are model scenario bands, not prediction intervals; betaSource declares provider vs heuristic.",
    validationStatus: "unvalidated",
    knownLimitations: [
      "risk composite weights (0.28/0.16/0.22/0.20/0.14) are judgmental and have never been validated against outcomes",
      "scraped fundamentals can be stale up to 15 minutes (cache) or wrong after corporate actions",
      "bull/neutral/bear ranges are volatility bands, not calibrated prediction intervals",
    ],
  },
  "desirable-assets": {
    id: "desirable-assets",
    version: "2.3.0",
    effectiveDate: "2026-07-17",
    methodology:
      "AI candidate generation constrained to a real-quote universe; per-candidate measured stats (canonical spine, currency-aware rf); ensemble-consensus gate; diversity-constrained conviction ranking.",
    inputs: ["AI candidate lists", "3mo daily bars per candidate", "portfolio context", "macro calendar", "riskFree snapshot"],
    outputSemantics:
      "ranking is a CONVICTION ORDER, not a probability; maxProfitTarget confidence is an uncalibrated heuristic score (known limitation); consensus fields inherit ensemble-consensus semantics.",
    validationStatus: "outcome-logged (nightly settlement, reliability reported)",
    knownLimitations: [
      "candidate generation is AI-driven — selection bias toward well-covered names",
      "maxProfitTarget 'confidence' formula (80 − uplift·1.5 + Sharpe·10 − vol·0.3) is uncalibrated score theatre, retained pending replacement",
      "3-month lookback makes per-candidate stats noisy (SE on Sharpe is large at n≈60)",
    ],
  },
  "risk-intelligence": {
    id: "risk-intelligence",
    version: "1.2.0",
    effectiveDate: "2026-07-17",
    methodology:
      "Deterministic heuristic risk surface: sigma inferred from VIX×beta×risk-score multipliers; CVaR as scalar multiples of VaR; factor exposures from PE/cap/momentum proxies; scenario templates scaled by beta/concentration (basis=hypothetical_template).",
    inputs: ["portfolio holdings (client-supplied)", "VIX", "TWRD truth gate"],
    outputSemantics:
      "ALL outputs are heuristic ESTIMATES (methodology block attached to every response); clients holding real return history must prefer measured VaR/CVaR/correlations.",
    validationStatus: "unvalidated",
    knownLimitations: [
      "no return-history input reaches this function — nothing here is measured",
      "factor 'exposures' are bucket proxies, not regressions; contributions are invented scalings",
      "scenario impacts are templates, not repriced portfolios",
    ],
  },
  "causal-effects": {
    id: "causal-effects",
    version: "1.1.0",
    effectiveDate: "2026-07-17",
    methodology:
      "AI-generated multi-order shock-propagation tree from a single event, with a 4-branch scenario tree. Fully model-authored; no market data enters the cascade.",
    inputs: ["user-described event", "portfolio description (optional)"],
    outputSemantics:
      "Every effect is a HYPOTHESIS about a transmission mechanism, not established causality. Per-effect 'confidence' and scenario 'probability' are UNCALIBRATED model estimates — magnitudes and time horizons are illustrative analogues, not forecasts.",
    validationStatus: "unvalidated",
    knownLimitations: [
      "no market data grounds the cascade — it is a reasoned narrative, not a measured impulse response",
      "confidence and probability values are model-invented and have never been scored against outcomes",
      "second/third-order effects compound the uncertainty of each prior link",
    ],
  },
  "market-data-macro": {
    id: "market-data-macro",
    version: "2.0.0",
    effectiveDate: "2026-07-17",
    methodology:
      "Live Yahoo quotes for indices/sectors/commodities/FX/crypto; deterministic mood score (VIX 40% + breadth 30% + avg move 30%); top movers = largest measured |Δ%|; AI restricted to interpreting the given numbers (watch items, outlook, rotation, risk appetite).",
    inputs: ["Yahoo v8/v10 quotes", "region context"],
    outputSemantics:
      "indices/sectors/moodScore/topMovers/breadth are MEASURED or computed-from-measured; fields listed in aiGeneratedFields are model commentary; fiiFlow/diiFlow are null (no source connected).",
    validationStatus: "unvalidated",
    knownLimitations: [
      "mood-score weights are judgmental (stated in moodBasis) and uncalibrated",
      "AI watch items are model suggestions, not a verified calendar",
    ],
  },
};

/** Look up a registry entry. Throws on unknown id — an unregistered model may not ship outputs. */
export function modelInfo(id: string): ModelRegistryEntry {
  const entry = REGISTRY[id];
  if (!entry) throw new Error(`modelRegistry: unregistered model "${id}"`);
  return { ...entry, knownLimitations: [...entry.knownLimitations], inputs: [...entry.inputs] };
}

export const MODEL_REGISTRY: Readonly<Record<string, ModelRegistryEntry>> = REGISTRY;
