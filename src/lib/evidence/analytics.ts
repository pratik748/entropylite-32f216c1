/**
 * Institutional analytics — deterministic, purpose-built computations that
 * give each workstation section its own analytical identity instead of a
 * repeated tile grid. Every figure here is arithmetic over reported or
 * scraped inputs; nothing is model-generated. When the statement pipeline
 * is absent, the structure-level views still compute from the always-live
 * analysis feed (book equity from P/B, debt from D/E) so no core section is
 * ever blank.
 */

import type { DeskAnalysis, Financials } from "./inputs";
import { round } from "./compute";

export type Provenance = "reported" | "computed" | "derived";

/* ── Capital structure (balance sheet — never blank) ───────────── */

export interface CapitalStructure {
  marketEquity: number | null;
  bookEquity: number | null;
  totalDebt: number | null;
  cash: number | null;
  netDebt: number | null;
  totalAssets: number | null;
  debtToEquityPct: number | null;
  /** Net-debt-to-equity as a share of the enterprise's funding, 0–100. */
  debtFundingPct: number | null;
  netDebtToEbitda: number | null;
  source: Provenance;
  note: string;
}

/**
 * Derive a real capital structure. Prefers reported statement figures;
 * falls back to book equity = market cap ÷ P/B and debt = book equity ×
 * (D/E), both from the always-available analysis feed.
 */
export function computeCapitalStructure(
  f: Financials | null,
  a: DeskAnalysis | null,
): CapitalStructure | null {
  const r = f?.ratios ?? {};
  const bal = f?.balance?.[0];

  // Reported path.
  if (bal?.equity != null || r.totalDebt != null) {
    const bookEquity = bal?.equity ?? null;
    const totalDebt = r.totalDebt ?? bal?.longTermDebt ?? null;
    const cash = r.totalCash ?? bal?.cash ?? null;
    const totalAssets = bal?.totalAssets ?? null;
    const netDebt = totalDebt != null ? totalDebt - (cash ?? 0) : null;
    const ebitda = r.ebitda ?? null;
    return {
      marketEquity: f?.marketCap ?? a?.marketCapValue ?? null,
      bookEquity,
      totalDebt,
      cash,
      netDebt,
      totalAssets,
      debtToEquityPct: r.debtToEquity ?? a?.debtToEquity ?? null,
      debtFundingPct:
        totalDebt != null && bookEquity != null && totalDebt + bookEquity > 0
          ? round((totalDebt / (totalDebt + bookEquity)) * 100, 0)
          : null,
      netDebtToEbitda: netDebt != null && ebitda && ebitda > 0 ? round(netDebt / ebitda, 2) : null,
      source: "reported",
      note: "Reported balance sheet.",
    };
  }

  // Derived path — from market cap, P/B and D/E (all in analyze-stock).
  const marketCap = a?.marketCapValue ?? f?.marketCap ?? null;
  const pbv = a?.pbv ?? null;
  const de = a?.debtToEquity ?? null;
  if (marketCap == null || pbv == null || pbv <= 0) return null;
  const bookEquity = round(marketCap / pbv, 0);
  const totalDebt = de != null ? round(bookEquity * (de / 100), 0) : null;
  return {
    marketEquity: marketCap,
    bookEquity,
    totalDebt,
    cash: null,
    netDebt: totalDebt,
    totalAssets: totalDebt != null ? round(bookEquity + totalDebt, 0) : null,
    debtToEquityPct: de,
    debtFundingPct:
      totalDebt != null && bookEquity + totalDebt > 0
        ? round((totalDebt / (bookEquity + totalDebt)) * 100, 0)
        : null,
    netDebtToEbitda: null,
    source: "derived",
    note: "Structure derived from market cap, price-to-book and debt-to-equity — reported statements refine it on load.",
  };
}

/* ── DuPont decomposition (profitability) ──────────────────────── */

export interface DuPontFactor {
  id: string;
  label: string;
  value: number;
  unit: "%" | "x";
  read: string;
}

export interface DuPont {
  roe: number;
  factors: DuPontFactor[];
  identity: string;
  source: Provenance;
}

/** ROE = net margin × asset turnover × equity multiplier. */
export function computeDuPont(f: Financials | null, a: DeskAnalysis | null): DuPont | null {
  const r = f?.ratios ?? {};
  const roeFrac = r.returnOnEquity ?? (a?.roe != null ? a.roe / 100 : null);
  const netMarginFrac = r.netMargin ?? null;
  const roaFrac = r.returnOnAssets ?? null;

  if (roeFrac != null && netMarginFrac != null && roaFrac != null && netMarginFrac !== 0 && roaFrac !== 0) {
    const assetTurnover = roaFrac / netMarginFrac; // revenue/assets
    const equityMultiplier = roeFrac / roaFrac; // assets/equity
    return {
      roe: round(roeFrac * 100, 1),
      identity: "ROE = Net margin × Asset turnover × Equity multiplier",
      source: "computed",
      factors: [
        {
          id: "net_margin",
          label: "Net margin",
          value: round(netMarginFrac * 100, 1),
          unit: "%",
          read: netMarginFrac >= 0.15 ? "Elite profit conversion" : netMarginFrac >= 0.05 ? "Ordinary margins" : "Thin margins",
        },
        {
          id: "asset_turnover",
          label: "Asset turnover",
          value: round(assetTurnover, 2),
          unit: "x",
          read: assetTurnover >= 1 ? "Capital-light: assets spin fast" : assetTurnover >= 0.5 ? "Moderate asset intensity" : "Asset-heavy: slow-spinning base",
        },
        {
          id: "equity_multiplier",
          label: "Equity multiplier",
          value: round(equityMultiplier, 2),
          unit: "x",
          read: equityMultiplier <= 2 ? "Lightly levered — ROE is earned, not borrowed" : equityMultiplier <= 4 ? "Moderate leverage lifts ROE" : "High leverage: much of ROE is borrowed",
        },
      ],
    };
  }

  // Two-factor fallback from analysis: ROE and leverage only.
  if (roeFrac != null && a?.debtToEquity != null) {
    const equityMultiplier = 1 + a.debtToEquity / 100;
    const roa = roeFrac / equityMultiplier;
    return {
      roe: round(roeFrac * 100, 1),
      identity: "ROE = Return on assets × Equity multiplier",
      source: "derived",
      factors: [
        {
          id: "roa",
          label: "Return on assets",
          value: round(roa * 100, 1),
          unit: "%",
          read: roa >= 0.08 ? "Assets themselves earn well" : roa >= 0.03 ? "Ordinary asset productivity" : "Weak unlevered returns",
        },
        {
          id: "equity_multiplier",
          label: "Equity multiplier",
          value: round(equityMultiplier, 2),
          unit: "x",
          read: equityMultiplier <= 2 ? "ROE is earned, not borrowed" : equityMultiplier <= 4 ? "Leverage lifts ROE" : "Much of ROE is leverage",
        },
      ],
    };
  }
  return null;
}

/* ── Cash conversion cascade (cash generation) ─────────────────── */

export interface CascadeStep {
  id: string;
  label: string;
  value: number;
  /** Conversion versus the prior step, as a %. */
  conversionPct: number | null;
  tone: "fg" | "gain" | "loss";
}

export function computeCashCascade(f: Financials | null): CascadeStep[] | null {
  const inc = f?.income?.[0];
  const cf = f?.cashflow?.[0];
  if (!inc?.revenue || !cf?.operatingCF) return null;
  const revenue = inc.revenue;
  const steps: { id: string; label: string; value: number | null | undefined; tone: CascadeStep["tone"] }[] = [
    { id: "revenue", label: "Revenue", value: revenue, tone: "fg" },
    { id: "operating", label: "Operating income", value: inc.operatingIncome, tone: "fg" },
    { id: "net", label: "Net income", value: inc.netIncome, tone: "fg" },
    { id: "ocf", label: "Operating cash flow", value: cf.operatingCF, tone: "gain" },
    { id: "fcf", label: "Free cash flow", value: cf.freeCF, tone: "gain" },
    {
      id: "returned",
      label: "Returned to holders",
      value:
        cf.dividendsPaid != null || cf.buybacks != null
          ? Math.abs(cf.dividendsPaid ?? 0) + Math.abs(cf.buybacks ?? 0)
          : undefined,
      tone: "loss",
    },
  ];
  const present = steps.filter((s) => s.value != null) as { id: string; label: string; value: number; tone: CascadeStep["tone"] }[];
  if (present.length < 3) return null;
  let prev: number | null = null;
  return present.map((s) => {
    const conversionPct = prev != null && prev !== 0 ? round((s.value / prev) * 100, 0) : null;
    prev = s.value;
    return { id: s.id, label: s.label, value: s.value, conversionPct, tone: s.tone };
  });
}

/* ── Distress / solvency scorecard (financial health) ──────────── */

export interface HealthCheck {
  id: string;
  label: string;
  pass: boolean | null;
  detail: string;
}

export interface HealthScore {
  score: number;
  max: number;
  band: "Fortress" | "Sound" | "Watch" | "Strained";
  checks: HealthCheck[];
  source: Provenance;
}

/**
 * A Piotroski-style solvency scorecard — computed binary checks over the
 * statement and analysis feeds. Deterministic, auditable, no model input.
 */
export function computeHealthScore(f: Financials | null, a: DeskAnalysis | null): HealthScore | null {
  const r = f?.ratios ?? {};
  const inc = f?.income ?? [];
  const cf = f?.cashflow?.[0];
  const checks: HealthCheck[] = [];
  const add = (id: string, label: string, pass: boolean | null, detail: string) =>
    checks.push({ id, label, pass, detail });

  const ni = inc[0]?.netIncome ?? null;
  add("profitable", "Profitable", ni != null ? ni > 0 : a?.roe != null ? a.roe > 0 : null,
    ni != null ? `Net income ${(ni / 1e9).toFixed(1)}B` : a?.roe != null ? `ROE ${a.roe}%` : "No earnings read");

  const ocf = cf?.operatingCF ?? r.operatingCashflow ?? null;
  add("cash_positive", "Cash-generative", ocf != null ? ocf > 0 : null,
    ocf != null ? `OCF ${(ocf / 1e9).toFixed(1)}B` : "No cash-flow read");

  const fcf = r.freeCashflow ?? cf?.freeCF ?? null;
  add("fcf_positive", "Free cash positive", fcf != null ? fcf > 0 : null,
    fcf != null ? `FCF ${(fcf / 1e9).toFixed(1)}B` : "No FCF read");

  add("accruals", "Cash-backed earnings", ocf != null && ni != null ? ocf > ni : null,
    ocf != null && ni != null ? `OCF ${ocf > ni ? "exceeds" : "trails"} net income` : "Accrual read pending statements");

  const cr = r.currentRatio ?? null;
  add("liquidity", "Adequate liquidity", cr != null ? cr >= 1 : null,
    cr != null ? `Current ratio ${cr.toFixed(2)}×` : "No liquidity read");

  const de = r.debtToEquity ?? a?.debtToEquity ?? null;
  const isFin = /financ|bank|insur/i.test(String(a?.sector ?? ""));
  add("leverage", "Contained leverage", de != null ? (isFin ? true : de < 150) : null,
    de != null ? `Debt/equity ${de.toFixed(0)}%${isFin ? " (financial-sector frame)" : ""}` : "No leverage read");

  const totalCash = r.totalCash ?? null;
  const totalDebt = r.totalDebt ?? null;
  if (totalCash != null && totalDebt != null) {
    add("net_cash", "Net cash or serviceable debt", totalCash >= totalDebt || totalDebt - totalCash < (r.ebitda ?? Infinity) * 3,
      totalCash >= totalDebt ? "Net cash position" : `Net debt ${((totalDebt - totalCash) / 1e9).toFixed(1)}B`);
  }

  const revGrowth = r.revenueGrowth ?? null;
  add("growth", "Growing top line", revGrowth != null ? revGrowth > 0 : null,
    revGrowth != null ? `Revenue growth ${(revGrowth * 100).toFixed(1)}%` : "Growth read pending statements");

  const answered = checks.filter((c) => c.pass !== null);
  if (answered.length < 3) return null;
  const score = answered.filter((c) => c.pass).length;
  const max = answered.length;
  const ratio = score / max;
  const band: HealthScore["band"] = ratio >= 0.85 ? "Fortress" : ratio >= 0.65 ? "Sound" : ratio >= 0.45 ? "Watch" : "Strained";
  return { score, max, band, checks: answered, source: f ? "computed" : "derived" };
}

/* ── Risk factor decomposition (risk analysis) ─────────────────── */

export interface RiskFactor {
  id: string;
  label: string;
  value: number;
  share: number;
  tone: "gain" | "neutral" | "loss";
}

export function computeRiskDecomposition(a: DeskAnalysis | null): { composite: number; factors: RiskFactor[] } | null {
  const rb = a?.riskBreakdown;
  if (!rb) return null;
  const raw = [
    { id: "vol", label: "Volatility", value: rb.volatilityRisk },
    { id: "sector", label: "Sector", value: rb.sectorRisk },
    { id: "financial", label: "Balance sheet", value: rb.financialRisk },
    { id: "macro", label: "Macro", value: rb.macroRisk },
    { id: "regulatory", label: "Regulatory", value: rb.regulatoryRisk },
  ].filter((x) => x.value != null) as { id: string; label: string; value: number }[];
  if (raw.length === 0) return null;
  const total = raw.reduce((s, x) => s + x.value, 0);
  const factors: RiskFactor[] = raw
    .map((x) => ({
      id: x.id,
      label: x.label,
      value: x.value,
      share: total > 0 ? round((x.value / total) * 100, 0) : 0,
      tone: (x.value >= 60 ? "loss" : x.value >= 40 ? "neutral" : "gain") as RiskFactor["tone"],
    }))
    .sort((p, q) => q.value - p.value);
  return { composite: a?.riskScore ?? round(total / raw.length, 0), factors };
}
