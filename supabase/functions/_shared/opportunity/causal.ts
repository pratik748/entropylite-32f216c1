// Causal chain evaluator — reasons through the transmission mechanism
// instead of observing isolated correlations.
//
// The EDGES of each chain are structural economic priors (documented and
// fixed: rate discounting, dollar invoicing, credit risk appetite, vol
// regime, sector rotation, curve → bank margins). The ACTIVATION of every
// node is measured from live market data in the MacroContext — nothing in
// a chain narrative is asserted without a number behind it.
//
// A chain only contributes to a candidate when its terminal node actually
// reaches that candidate (asset class, sector, beta), and every active
// chain is traced end-to-end in the model's rationale.

import type { EvidenceBundle, ModelScore } from "./types.ts";
import { sectorRelStrength, type MacroContext } from "./macro.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

interface ChainHit {
  contribution: number; // signed, from the LONG side's perspective
  narrative: string;    // traced path with measured values
}

/** Activation thresholds — each is the point where the measured move is
 *  large enough to plausibly transmit (≈ one quarter of typical annual
 *  variation for that instrument), not a tuning knob. */
const RATE_MOVE_PT = 0.25;     // 10y move over 63d, percentage points
const DOLLAR_MOVE = 0.02;      // UUP 63d return
const CREDIT_MOVE = 0.01;      // HYG−LQD 63d relative return
const SECTOR_MOVE = 0.02;      // sector ETF 63d RS vs SPY
const CURVE_STEEP_PT = 0.5;    // 10y−3m slope

export function evaluateCausalChains(bundle: EvidenceBundle, macro: MacroContext): ChainHit[] {
  const hits: ChainHit[] = [];
  const { candidate, fundamentals, price } = bundle;
  const sector = fundamentals?.sector ?? null;
  const beta = price?.betaVsBenchmark ?? null;

  // ── Chain 1: rates → discounting → long-duration assets ────────
  const d10y = macro.rates.tenYearChange63dPct;
  const isLongDuration =
    candidate.assetClass === "bond" ||
    candidate.assetClass === "crypto" ||
    (candidate.assetClass === "equity" && (sector === "Technology" || sector === "Communication Services"));
  if (d10y != null && Math.abs(d10y) >= RATE_MOVE_PT && isLongDuration) {
    const falling = d10y < 0;
    hits.push({
      contribution: falling ? 0.35 : -0.35,
      narrative: `10y yield ${d10y >= 0 ? "+" : ""}${d10y}pt over 63d → ${falling ? "cheaper" : "costlier"} discounting of long-dated cash flows → ${candidate.assetClass === "bond" ? "duration" : candidate.assetClass === "crypto" ? "long-duration risk assets" : `long-duration growth (${sector})`} ${falling ? "supported" : "pressured"}.`,
    });
  }

  // ── Chain 2: dollar → invoicing/flows → commodities & crypto ───
  const dxy = macro.dollar.ret63d;
  if (dxy != null && Math.abs(dxy) >= DOLLAR_MOVE && (candidate.assetClass === "commodity" || candidate.assetClass === "crypto")) {
    const weakening = dxy < 0;
    hits.push({
      contribution: weakening ? 0.35 : -0.35,
      narrative: `Dollar ${dxy >= 0 ? "+" : ""}${pct(dxy)} over 63d → USD-priced hard assets become ${weakening ? "cheaper globally, attracting" : "dearer globally, repelling"} flows → ${candidate.assetClass} ${weakening ? "supported" : "pressured"}.`,
    });
  }

  // ── Chain 3: credit spreads → risk appetite → high-beta equity ─
  const credit = macro.credit.highYieldRelStrength63d;
  if (credit != null && Math.abs(credit) >= CREDIT_MOVE && beta != null && beta >= 1.1 && candidate.assetClass === "equity") {
    const tightening = credit > 0;
    hits.push({
      contribution: tightening ? 0.3 : -0.4,
      narrative: `High-yield credit ${tightening ? "outperforming" : "underperforming"} IG by ${pct(Math.abs(credit))} over 63d → risk appetite ${tightening ? "rising → high-beta names attract" : "falling → high-beta names lose"} marginal flows (this name's beta ${beta.toFixed(2)}).`,
    });
  }

  // ── Chain 4: volatility regime → positioning capacity ──────────
  const vixPctile = macro.volatility.vixPercentile1y;
  if (vixPctile != null && beta != null) {
    if (vixPctile >= 0.7 && beta >= 1.1) {
      hits.push({
        contribution: -0.35,
        narrative: `VIX in the ${Math.round(vixPctile * 100)}th percentile of its 1y range → vol-targeting and risk-parity books de-gross → high-beta exposure (β ${beta.toFixed(2)}) gets sold mechanically.`,
      });
    } else if (vixPctile >= 0.7 && beta <= 0.5 && beta >= -0.5) {
      hits.push({
        contribution: 0.2,
        narrative: `VIX in the ${Math.round(vixPctile * 100)}th percentile → de-risking rotation favors low-beta defensives (β ${beta.toFixed(2)}).`,
      });
    } else if (vixPctile <= 0.3 && beta >= 0.8 && price && price.ret63d > 0) {
      hits.push({
        contribution: 0.2,
        narrative: `VIX in the ${Math.round(vixPctile * 100)}th percentile (calm) → systematic strategies re-gross → established momentum (63d ${pct(price.ret63d)}) tends to persist.`,
      });
    }
  }

  // ── Chain 5: sector rotation → constituent flows ────────────────
  const sectorRS = sectorRelStrength(macro, sector);
  if (sectorRS != null && Math.abs(sectorRS) >= SECTOR_MOVE && candidate.assetClass === "equity") {
    const leading = sectorRS > 0;
    hits.push({
      contribution: leading ? 0.3 : -0.3,
      narrative: `${sector} sector ETF ${leading ? "+" : ""}${pct(sectorRS)} vs SPY over 63d → institutional rotation ${leading ? "into" : "out of"} the sector → ETF ${leading ? "creations lift" : "redemptions drag"} constituents.`,
    });
  }

  // ── Chain 6: yield curve → net interest margins → financials ───
  const slope = macro.rates.curveSlopePct;
  if (slope != null && sector === "Financial Services") {
    if (slope >= CURVE_STEEP_PT) {
      hits.push({
        contribution: 0.3,
        narrative: `10y−3m curve +${slope}pt (steep) → banks borrow short / lend long at wider margins → financials' earnings power supported.`,
      });
    } else if (slope <= -CURVE_STEEP_PT) {
      hits.push({
        contribution: -0.3,
        narrative: `10y−3m curve ${slope}pt (inverted) → net-interest margins compressed → structural headwind for financials.`,
      });
    }
  }

  return hits;
}

/** Bucket-C model wrapping the chain evaluation. */
export function causalModel(bundle: EvidenceBundle, macro: MacroContext): ModelScore {
  if (macro.missing.length >= 6) {
    return {
      id: "causal", label: "Causal chains", direction: 0, confidence: 0, score: 0,
      rationale: ["Macro instruments unavailable — causal transmission cannot be measured, so the model abstains."],
      hasSignal: false,
    };
  }
  const hits = evaluateCausalChains(bundle, macro);
  if (hits.length === 0) {
    return {
      id: "causal", label: "Causal chains", direction: 0, confidence: 0, score: 0,
      rationale: ["No macro transmission chain currently reaches this instrument with a measured activation — abstaining."],
      hasSignal: true,
    };
  }
  const score = clamp(hits.reduce((s, h) => s + h.contribution, 0), -1, 1);
  const direction: -1 | 0 | 1 = Math.abs(score) < 0.15 ? 0 : score > 0 ? 1 : -1;
  return {
    id: "causal",
    label: "Causal chains",
    direction,
    confidence: direction === 0 ? 0 : clamp(Math.abs(score), 0.05, 1),
    score: Number(score.toFixed(3)),
    rationale: hits.map((h) => h.narrative),
    hasSignal: true,
  };
}
