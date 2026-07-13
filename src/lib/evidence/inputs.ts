/**
 * Typed views over the upstream payloads the evidence engine consumes.
 * These are the fields the engine actually reads; the transports deliver
 * loose JSON, so every field is optional and reads must null-check.
 */

export interface DeskAnalysis {
  currentPrice?: number;
  currency?: string;
  riskLevel?: string;
  riskScore?: number;
  riskBreakdown?: {
    volatilityRisk?: number;
    sectorRisk?: number;
    regulatoryRisk?: number;
    financialRisk?: number;
    macroRisk?: number;
  };
  keyRisks?: string[];
  bullRange?: [number, number];
  neutralRange?: [number, number];
  bearRange?: [number, number];
  suggestion?: string;
  confidence?: number;
  verdict?: string;
  sector?: string;
  marketCap?: string;
  marketCapValue?: number;
  pe?: number | null;
  pbv?: number | null;
  dividendYield?: number | null;
  beta?: number;
  roe?: number | null;
  debtToEquity?: number | null;
  technicals?: {
    rsi?: number;
    support?: number;
    resistance?: number;
    trend?: string;
    maSignal?: string;
  };
  news?: NewsItem[];
  momentum?: number;
  volatility?: number;
  overallSentiment?: number;
  totalPressure?: number;
  quantMetrics?: {
    sharpe1y?: number;
    sortino1y?: number;
    maxDrawdown?: number;
    sigmaAnnual?: number;
    sessions?: number;
  };
}

export interface NewsItem {
  headline?: string;
  source?: string;
  sentiment?: number;
}

export interface DossierSegment {
  segment?: string;
  percentage?: number;
  trend?: string;
}

export interface DossierRegion {
  region?: string;
  percentage?: number;
}

export interface DossierHolder {
  name?: string;
  type?: string;
  pct?: number;
  trend?: string;
}

export interface DossierInsiderTrade {
  name?: string;
  role?: string;
  action?: string;
  shares?: number;
  date?: string;
  signal?: string;
}

export interface DossierCompetitor {
  name?: string;
  ticker?: string;
  marketShare?: number;
  threat?: string;
  strengths?: string;
}

export interface DossierSupplier {
  name?: string;
  role?: string;
  riskLevel?: string;
}

export interface Dossier {
  companyName?: string;
  sector?: string;
  industry?: string;
  revenueSegments?: DossierSegment[];
  geographicRevenue?: DossierRegion[];
  supplyChain?: {
    suppliers?: DossierSupplier[];
    distributors?: { name?: string; region?: string }[];
    manufacturers?: { name?: string; type?: string; location?: string }[];
  };
  ownership?: {
    insiderPct?: number;
    institutionalPct?: number;
    retailPct?: number;
    topHolders?: DossierHolder[];
  };
  leadership?: {
    name?: string;
    role?: string;
    since?: string;
    background?: string;
    previousCompanies?: string[];
  }[];
  competitors?: DossierCompetitor[];
  products?: {
    name?: string;
    lifecycle?: string;
    revenueContribution?: number;
    description?: string;
  }[];
  regulatoryExposure?: {
    issue?: string;
    severity?: string;
    region?: string;
    status?: string;
  }[];
  insiderActivity?: DossierInsiderTrade[];
  narrative?: {
    newsSentiment?: number;
    socialSentiment?: number;
    analystConsensus?: string;
    earningsTone?: string;
    narrativeShifts?: string[];
    analystTargets?: { low?: number; median?: number; high?: number };
  };
  signals?: {
    supplyChainRisk?: number;
    ownershipStability?: number;
    competitiveMoat?: number;
    regulatoryRisk?: number;
    insiderConfidence?: number;
    narrativeMomentum?: number;
  };
}

export interface Quote {
  price: number;
  currency: string;
}

/* ── company-financials payload (deterministic statement pipeline) ── */

export interface IncomeRow {
  period?: string;
  endDate?: number | null;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  netIncome?: number | null;
}

export interface BalanceRow {
  period?: string;
  endDate?: number | null;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  equity?: number | null;
  cash?: number | null;
  longTermDebt?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
}

export interface CashflowRow {
  period?: string;
  endDate?: number | null;
  operatingCF?: number | null;
  capex?: number | null;
  freeCF?: number | null;
  dividendsPaid?: number | null;
  buybacks?: number | null;
  netIncome?: number | null;
}

export interface Financials {
  symbol?: string;
  currency?: string;
  marketCap?: number | null;
  sharesOutstanding?: number | null;
  income?: IncomeRow[];
  balance?: BalanceRow[];
  cashflow?: CashflowRow[];
  ratios?: {
    grossMargin?: number | null;
    operatingMargin?: number | null;
    netMargin?: number | null;
    returnOnEquity?: number | null;
    returnOnAssets?: number | null;
    currentRatio?: number | null;
    quickRatio?: number | null;
    debtToEquity?: number | null;
    totalCash?: number | null;
    totalDebt?: number | null;
    ebitda?: number | null;
    operatingCashflow?: number | null;
    freeCashflow?: number | null;
    revenueGrowth?: number | null;
    earningsGrowth?: number | null;
  };
  asOf?: number;
}
