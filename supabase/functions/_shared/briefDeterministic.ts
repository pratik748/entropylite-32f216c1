/**
 * Deterministic Entropy Daily Brief Synthesis Engine.
 *
 * Distills live portfolio exposures, PnL, regime alignment, and risk vectors
 * into 3 share-worthy, institutional-grade analytical insights without LLM failure points.
 */

export interface BriefInsight {
  headline: string;
  body: string;
  ticker?: string | null;
  metric?: string | null;
  tone: "bullish" | "bearish" | "neutral" | "warning";
}

export interface BriefResponse {
  generatedAt: number;
  regime: string;
  marketLine: string;
  insights: BriefInsight[];
}

export function generateDeterministicBrief(opts: {
  portfolio?: any[];
  regime?: string;
  vix?: number;
}): BriefResponse {
  const regime = opts.regime || "Neutral";
  const vix = typeof opts.vix === "number" && opts.vix > 0 ? opts.vix : 18.5;
  const portfolio = Array.isArray(opts.portfolio) ? opts.portfolio : [];

  if (portfolio.length === 0) {
    return {
      generatedAt: Date.now(),
      regime,
      marketLine: `${regime} regime · VIX ${vix.toFixed(1)} · awaiting book positions`,
      insights: [
        {
          headline: "Add positions to initialize telemetry brief",
          body: "Analyze at least one asset to surface conviction-weighted telemetry from your active terminal session.",
          tone: "neutral",
        },
        {
          headline: "Probabilistic distributions over predictions",
          body: "Entropy models the market as an evolving stochastic surface calibrated to your specific portfolio holdings.",
          tone: "neutral",
        },
        {
          headline: "12 analytical engines composed in real time",
          body: "10,000-path Monte Carlo, Merton default distance, and CLANK mechanical constraints computed deterministically.",
          tone: "neutral",
        },
      ],
    };
  }

  // 1. Find lead position by conviction / PnL magnitude
  const sorted = [...portfolio].sort((a, b) => Math.abs(Number(b.pnlPct || 0)) - Math.abs(Number(a.pnlPct || 0)));
  const lead = sorted[0];
  const leadPnl = Number(lead.pnlPct || 0);
  const leadTicker = lead.ticker || lead.symbol || "HOLDING";
  const leadTone: BriefInsight["tone"] = leadPnl >= 0 ? "bullish" : "bearish";

  const leadInsight: BriefInsight = {
    headline: leadPnl >= 0 ? `${leadTicker} leading upside alpha attribution` : `${leadTicker} reflects drawdown pressure`,
    body: `${leadTicker} shows ${leadPnl >= 0 ? "+" : ""}${leadPnl.toFixed(1)}% return, driving primary variance contribution within the ${lead.sector || "core"} allocation.`,
    ticker: leadTicker,
    metric: `${leadTicker} ${leadPnl >= 0 ? "+" : ""}${leadPnl.toFixed(1)}%`,
    tone: leadTone,
  };

  // 2. Risk insight (warning)
  const highRisk = portfolio.find((s) => Number(s.riskScore || s.risk || 0) > 60 || Number(s.beta || 1) > 1.35) || sorted[sorted.length - 1];
  const riskTicker = highRisk.ticker || highRisk.symbol || leadTicker;
  const riskBeta = Number(highRisk.beta || 1.15);

  const riskInsight: BriefInsight = {
    headline: `Tail risk exposure concentrated in ${riskTicker}`,
    body: `Beta of ${riskBeta.toFixed(2)} with VIX at ${vix.toFixed(1)} expands downside tail dispersion under systemic volatility shocks.`,
    ticker: riskTicker,
    metric: `β ${riskBeta.toFixed(2)} | VIX ${vix.toFixed(1)}`,
    tone: "warning",
  };

  // 3. Macro / Regime insight (neutral)
  const macroInsight: BriefInsight = {
    headline: `${regime.toUpperCase()} regime governs cross-asset discounting`,
    body: `Systemic pricing implies ${vix > 22 ? "elevated hedging demand and negative dealer gamma" : "orderly asset re-pricing with contained correlation spillover"}.`,
    ticker: null,
    metric: `Regime: ${regime}`,
    tone: "neutral",
  };

  const marketLine = `${regime} regime · VIX ${vix.toFixed(1)} · ${portfolio.length} active positions monitored`;

  return {
    generatedAt: Date.now(),
    regime,
    marketLine,
    insights: [leadInsight, riskInsight, macroInsight],
  };
}
