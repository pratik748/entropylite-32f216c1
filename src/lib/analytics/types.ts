/**
 * Institutional Analytics — shared typed models.
 * ───────────────────────────────────────────────
 * Every number the reporting layer shows is a `MetricValue`: the value plus
 * its provenance (data source, calculation, sample size) and a confidence
 * grade derived from the sample, never asserted. Insights and reports are
 * composed exclusively from these — there is no path for an uncited figure
 * to reach the UI.
 */

/** Where a number came from. */
export type DataSource =
  | "historical-prices"     // daily closes via the historical-prices edge fn
  | "portfolio-state"       // user holdings: quantity, cost basis, live price
  | "benchmark-prices"      // real benchmark index series
  | "covariance-estimate"   // Σ estimated from aligned return history
  | "derived";              // computed from other MetricValues

/** Confidence grade, derived mechanically from sample size / method fit. */
export type ConfidenceGrade = "high" | "medium" | "low";

export interface MetricProvenance {
  source: DataSource;
  /** Human-readable formula or method, e.g. "OLS of r_p on r_b, 252 obs". */
  calculation: string;
  /** Observations backing the number (0 for pure state reads). */
  sampleSize: number;
  confidence: ConfidenceGrade;
  /** Assumptions that materially affect the number. */
  assumptions?: string[];
}

export interface MetricValue {
  value: number;
  provenance: MetricProvenance;
}

/** Grade confidence from a daily-return sample size. */
export function gradeSample(n: number, minMedium = 60, minHigh = 180): ConfidenceGrade {
  if (n >= minHigh) return "high";
  if (n >= minMedium) return "medium";
  return "low";
}

export function metric(
  value: number,
  source: DataSource,
  calculation: string,
  sampleSize: number,
  assumptions?: string[],
  confidence?: ConfidenceGrade,
): MetricValue {
  return {
    value,
    provenance: {
      source,
      calculation,
      sampleSize,
      confidence: confidence ?? gradeSample(sampleSize),
      ...(assumptions && assumptions.length > 0 ? { assumptions } : {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// Performance
// ─────────────────────────────────────────────────────────────────

export interface PerformanceMetrics {
  cagr: MetricValue;
  annualReturn: MetricValue;
  annualVol: MetricValue;
  sharpe: MetricValue;
  sortino: MetricValue;
  calmar: MetricValue;
  omega: MetricValue;
  maxDrawdown: MetricValue;
  /** Present only when a real benchmark series was regressed. */
  benchmark?: BenchmarkRelativeMetrics;
  rolling: RollingMetrics;
}

export interface BenchmarkRelativeMetrics {
  benchmarkTicker: string;
  alphaAnnual: MetricValue;
  beta: MetricValue;
  rSquared: MetricValue;
  trackingError: MetricValue;
  informationRatio: MetricValue;
  upCapture: MetricValue;
  downCapture: MetricValue;
  correlation: MetricValue;
  benchmarkReturnAnnual: MetricValue;
}

export interface RollingPoint {
  /** Index of the last observation in the window (aligns to return series). */
  endIndex: number;
  value: number;
}

export interface RollingMetrics {
  window: number;
  sharpe: RollingPoint[];
  volatilityAnnual: RollingPoint[];
  returnAnnual: RollingPoint[];
}

// ─────────────────────────────────────────────────────────────────
// Risk
// ─────────────────────────────────────────────────────────────────

export interface DrawdownEpisode {
  peakIndex: number;
  troughIndex: number;
  recoveryIndex: number | null; // null = still underwater
  depth: number;                // positive fraction, e.g. 0.23
  lengthDays: number;           // peak → trough
  recoveryDays: number | null;  // trough → recovery
}

export interface DrawdownAnalysis {
  maxDrawdown: MetricValue;
  currentDrawdown: MetricValue;
  episodes: DrawdownEpisode[];
  /** Mean trough→recovery time of completed episodes deeper than 5%. */
  avgRecoveryDays: MetricValue | null;
  underwaterCurve: number[]; // per-observation drawdown fractions (≥ 0)
}

export interface ConcentrationAnalysis {
  hhi: MetricValue;                 // Σ wᵢ², ∈ (0, 1]
  effectiveN: MetricValue;          // 1 / HHI
  topPositionWeight: MetricValue;
  topSectorWeight: MetricValue;
  positionCount: number;
  sectorCount: number;
}

export interface CorrelationRisk {
  avgPairwise: MetricValue;
  maxPairwise: MetricValue;
  pc1Share: MetricValue | null;     // null when Σ unavailable
  diversificationRatio: MetricValue | null; // Σwᵢσᵢ / σ_p
}

export interface TailRisk {
  skewness: MetricValue;
  excessKurtosis: MetricValue;
  var95: MetricValue;   // 1-day loss fraction (positive)
  var99: MetricValue;
  cvar95: MetricValue;
  evtVar99: MetricValue | null; // EVT extrapolated, null if < 100 obs
  evtEs99: MetricValue | null;
}

export interface RiskMetrics {
  drawdown: DrawdownAnalysis;
  concentration: ConcentrationAnalysis;
  correlation: CorrelationRisk;
  tail: TailRisk;
}

// ─────────────────────────────────────────────────────────────────
// Stress testing — scenarios are DEFINED as market-factor shocks and
// PROPAGATED through each asset's real regression beta. No per-scenario
// portfolio multipliers exist anywhere.
// ─────────────────────────────────────────────────────────────────

export interface StressScenario {
  id: string;
  name: string;
  /** The historical episode or hypothetical the shock is calibrated to. */
  basis: string;
  /** Market-factor return shock, e.g. -0.38 for a 38% index decline. */
  marketShock: number;
  /** Multiplier on current pairwise correlations toward 1 (0 = unchanged). */
  correlationStress?: number;
}

export interface StressResult {
  scenario: StressScenario;
  /** Portfolio return under the shock: Σ wᵢ·βᵢ·shock (β from real history). */
  portfolioImpact: MetricValue;
  /** Currency loss at current portfolio value. */
  lossValue: number;
  /** Per-position contribution to the loss. */
  positionImpacts: Array<{ ticker: string; beta: number; weight: number; impact: number }>;
  /** Estimated recovery from the portfolio's own realized recovery speed; null if never observed. */
  estimatedRecoveryDays: MetricValue | null;
}

export interface HistoricalReplayResult {
  /** Worst realized h-day windows from the portfolio's own return series. */
  windowDays: number;
  worstReturn: MetricValue;
  worstStartIndex: number;
  lossValue: number;
}

// ─────────────────────────────────────────────────────────────────
// Optimization
// ─────────────────────────────────────────────────────────────────

export type OptimizerId =
  | "equal_weight"
  | "min_variance"
  | "mean_variance"
  | "robust_mean_variance"
  | "risk_parity"
  | "risk_budget"
  | "hrp"
  | "black_litterman"
  | "min_cvar";

export interface OptimizerConstraints {
  /** Cap on any single weight, e.g. 0.25. */
  maxWeight?: number;
  /** L1 turnover cap vs current weights, e.g. 0.3. */
  maxTurnover?: number;
  /** Annualized target volatility; scales risk allocation, remainder to cash. */
  targetVolAnnual?: number;
}

export interface OptimizerDiagnostics {
  /** Condition number of Σ actually used (after shrinkage/PSD). */
  conditionNumber: number | null;
  /** Ledoit–Wolf shrinkage intensity δ, when shrinkage was applied. */
  shrinkageDelta: number | null;
  converged: boolean;
  iterations: number | null;
  assumptions: string[];
  confidence: ConfidenceGrade;
  /** Non-fatal notes: constraint bindings, degradations taken. */
  notes: string[];
}

export interface OptimizerResult {
  id: OptimizerId;
  label: string;
  tickers: string[];
  weights: number[];       // sums to ≤ 1 (< 1 when vol targeting pads cash)
  cashWeight: number;
  expectedReturnAnnual: number | null; // null for return-free optimizers
  volAnnual: number;
  turnoverFromCurrent: number;
  diagnostics: OptimizerDiagnostics;
}

// ─────────────────────────────────────────────────────────────────
// Attribution & exposure
// ─────────────────────────────────────────────────────────────────

export interface PositionContribution {
  ticker: string;
  weight: number;
  returnPct: number;         // position return since cost basis
  contributionPct: number;   // weight × return, rescaled to sum to portfolio return
  riskContributionPct: number | null; // share of portfolio σ from Σ, null w/o Σ
}

export interface BrinsonRow {
  sector: string;
  portfolioWeight: number;
  benchmarkWeight: number;
  allocation: number;
  selection: number;
  interaction: number;
  total: number;
}

export interface AttributionAnalysis {
  positions: PositionContribution[];
  brinson: BrinsonRow[] | null;   // null when no benchmark sector returns
  brinsonBenchmarkBasis: string;  // what the benchmark weights represent
}

export interface ExposureBucket {
  label: string;
  weight: number; // fraction of portfolio value
  value: number;  // in base currency
  count: number;
}

export interface ExposureAnalysis {
  sector: ExposureBucket[];
  currency: ExposureBucket[];
  /** Realized-vol style buckets (Low/Mid/High vol terciles of the holdings). */
  volatilityStyle: ExposureBucket[] | null;
  /** Trailing-return momentum terciles. */
  momentumStyle: ExposureBucket[] | null;
  /** Weighted portfolio beta when per-asset betas exist. */
  marketBeta: MetricValue | null;
}

// ─────────────────────────────────────────────────────────────────
// Insights & reports
// ─────────────────────────────────────────────────────────────────

export type InsightSeverity = "info" | "watch" | "action";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  /** The claim, phrased from computed values only. */
  statement: string;
  /** What the investor should consider doing (deterministic rule output). */
  recommendation: string | null;
  provenance: MetricProvenance;
}

export type ReportBlock =
  | { kind: "kpi"; label: string; metric: MetricValue; format: "currency" | "percent" | "ratio" | "number" }
  | { kind: "text"; text: string }
  | { kind: "insight"; insight: Insight }
  | { kind: "table"; columns: string[]; rows: (string | number)[][] };

export interface ReportSection {
  id: string;
  title: string;
  /** The question this section answers (What happened? Why? What now?). */
  answers: string;
  blocks: ReportBlock[];
}

export interface InstitutionalReport {
  id: string;
  title: string;
  asOf: number;
  baseCurrency: string;
  sections: ReportSection[];
  /** Every distinct data source used anywhere in the report. */
  sources: DataSource[];
}
