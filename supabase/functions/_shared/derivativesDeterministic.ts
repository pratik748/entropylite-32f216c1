export interface DerivativesRequestBody {
  tickers: string[];
  weights?: number[];
  prices?: number[];
  volatilities?: number[];
  sectors?: string[];
  baseCurrency?: string;
  discovery_mode?: boolean;
  news_context?: string;
  macro_context?: string;
  sentiment_context?: string;
  indiaMode?: boolean;
}

type Bias = "risk_on" | "risk_off" | "balanced";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function hashString(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeWeights(weights: number[] | undefined, n: number) {
  if (!weights?.length) return Array.from({ length: n }, () => 1 / Math.max(1, n));
  const padded = Array.from({ length: n }, (_, i) => Math.max(0, Number(weights[i] ?? 0)));
  const total = padded.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return Array.from({ length: n }, () => 1 / Math.max(1, n));
  return padded.map((value) => value / total);
}

function inferContext(news = "", macro = "", sentiment = "") {
  const combined = `${news} ${macro} ${sentiment}`.toLowerCase();
  const riskOffWords = [
    "intervention", "sold", "reserve", "dip", "lowest", "war", "conflict", "tariff", "inflation",
    "hawkish", "hike", "stress", "selloff", "crisis", "debt", "volatility", "tightening", "drawdown",
  ];
  const riskOnWords = [
    "rally", "easing", "stimulus", "breakout", "upgrade", "beat", "soft landing", "cooling inflation",
    "risk-on", "recovery", "liquidity", "tailwind", "momentum", "expansion",
  ];

  const riskOffScore = riskOffWords.reduce((sum, word) => sum + (combined.includes(word) ? 1 : 0), 0);
  const riskOnScore = riskOnWords.reduce((sum, word) => sum + (combined.includes(word) ? 1 : 0), 0);

  const bias: Bias = riskOffScore > riskOnScore
    ? "risk_off"
    : riskOnScore > riskOffScore
      ? "risk_on"
      : "balanced";

  const themes = [
    { key: "fx", words: ["fx", "usd", "inr", "rupee", "currency"] },
    { key: "rates", words: ["rate", "yield", "rbi", "fed", "policy"] },
    { key: "energy", words: ["oil", "gas", "energy", "crude"] },
    { key: "gold", words: ["gold", "bullion", "safe haven"] },
    { key: "defense", words: ["defense", "military", "conflict", "border"] },
    { key: "banks", words: ["bank", "credit", "financial"] },
    { key: "tech", words: ["ai", "software", "semiconductor", "cloud", "tech"] },
  ]
    .filter((entry) => entry.words.some((word) => combined.includes(word)))
    .map((entry) => entry.key);

  return {
    bias,
    themes,
    intensity: clamp(0.5 + Math.abs(riskOffScore - riskOnScore) * 0.08, 0.5, 0.95),
    headline: bias === "risk_off"
      ? "Risk-off regime with stronger demand for hedges and carry protection"
      : bias === "risk_on"
        ? "Risk-on regime with stronger appetite for momentum and leveraged beta"
        : "Balanced regime with selective relative-value opportunities",
  };
}

function futuresSymbolFor(ticker: string, sector: string, indiaMode: boolean, themes: string[]) {
  const upperTicker = ticker.toUpperCase();
  const upperSector = sector.toUpperCase();

  if (indiaMode) {
    if (upperTicker.includes("BANK") || upperSector.includes("FINANCIAL")) return "BANKNIFTY";
    if (upperSector.includes("TECH") || upperTicker.includes("TCS") || upperTicker.includes("INFY")) return "NIFTYIT";
    if (themes.includes("energy") || upperSector.includes("ENERGY")) return "MCXCRUDE";
    if (themes.includes("gold")) return "MCXGOLD";
    return "NIFTY";
  }

  if (upperSector.includes("TECH") || /NVDA|AAPL|MSFT|AMD|META/.test(upperTicker)) return "NQ";
  if (upperSector.includes("FINANCIAL") || /JPM|GS|MS/.test(upperTicker)) return "XLF";
  if (upperSector.includes("ENERGY") || themes.includes("energy")) return "CL";
  if (themes.includes("gold")) return "GC";
  if (upperSector.includes("INDUSTRIAL")) return "ES";
  return "ES";
}

function hedgeInstrument(indiaMode: boolean, bias: Bias, themes: string[]) {
  if (indiaMode) {
    if (themes.includes("fx")) return "USDINR futures";
    if (themes.includes("gold") || bias === "risk_off") return "GOLDBEES.NS / MCX gold";
    return "NIFTY protective puts";
  }
  if (themes.includes("rates")) return "TLT calls";
  if (themes.includes("gold") || bias === "risk_off") return "GLD / GC futures";
  return "SPY protective puts";
}

function discoveryTemplates(indiaMode: boolean) {
  return indiaMode
    ? [
        {
          type: "nifty_fo",
          asset_a: "NIFTY",
          asset_b: "NIFTY weekly options",
          instrument_a: "NIFTY futures",
          instrument_b: "NIFTY weekly put spread",
          structure: "Use futures for directional beta and overlay a limited-risk options hedge",
        },
        {
          type: "sector_pair",
          asset_a: "BANKBEES.NS",
          asset_b: "ITBEES.NS",
          instrument_a: "Long BANKBEES.NS",
          instrument_b: "Short ITBEES.NS",
          structure: "Relative-value rotation between domestic credit beta and export tech",
        },
        {
          type: "macro_hedge",
          asset_a: "GOLDBEES.NS",
          asset_b: "USDINR",
          instrument_a: "Long GOLDBEES.NS",
          instrument_b: "Long USDINR futures",
          structure: "Layer gold and FX hedges when domestic macro stress rises",
        },
        {
          type: "relative_value",
          asset_a: "BANKNIFTY",
          asset_b: "NIFTY",
          instrument_a: "BANKNIFTY futures",
          instrument_b: "NIFTY futures",
          structure: "Trade dispersion between high-beta banks and broad index exposure",
        },
        {
          type: "cross_asset",
          asset_a: "NIFTY",
          asset_b: "MCXCRUDE",
          instrument_a: "Short NIFTY futures",
          instrument_b: "Long MCX crude",
          structure: "Cross-asset hedge against imported inflation and margin pressure",
        },
      ]
    : [
        {
          type: "futures_etf_leverage",
          asset_a: "ES",
          asset_b: "SPY",
          instrument_a: "Long ES futures",
          instrument_b: "Trim SPY cash",
          structure: "Replace part of cash equity with futures for capital-efficient beta",
        },
        {
          type: "sector_pair",
          asset_a: "XLF",
          asset_b: "XLK",
          instrument_a: "Long XLF",
          instrument_b: "Short XLK",
          structure: "Relative-value rotation trade across cyclicals versus duration-sensitive growth",
        },
        {
          type: "macro_hedge",
          asset_a: "GLD",
          asset_b: "SPY puts",
          instrument_a: "Long GLD",
          instrument_b: "Buy SPY put spreads",
          structure: "Pair convex downside protection with liquid safe-haven exposure",
        },
        {
          type: "relative_value",
          asset_a: "SMH",
          asset_b: "QQQ",
          instrument_a: "Long SMH",
          instrument_b: "Short QQQ",
          structure: "Express semiconductor leadership without full broad-tech beta",
        },
        {
          type: "cross_asset",
          asset_a: "XLE",
          asset_b: "CL",
          instrument_a: "Long XLE",
          instrument_b: "Long crude futures",
          structure: "Cross-asset inflation play using energy equities plus commodity convexity",
        },
      ];
}

export function generateDerivativesIntelligence(body: DerivativesRequestBody) {
  const tickers = body.tickers;
  const n = tickers.length;
  const weights = normalizeWeights(body.weights, n);
  const prices = Array.from({ length: n }, (_, i) => Number(body.prices?.[i] ?? 0));
  const volatilities = Array.from({ length: n }, (_, i) => clamp(Number(body.volatilities?.[i] ?? 0.25), 0.08, 0.9));
  const sectors = Array.from({ length: n }, (_, i) => String(body.sectors?.[i] ?? "Unknown"));
  const context = inferContext(body.news_context, body.macro_context, body.sentiment_context);
  const seed = hashString(JSON.stringify({
    tickers,
    weights: weights.map((value) => round(value, 4)),
    prices: prices.map((value) => round(value, 2)),
    volatilities: volatilities.map((value) => round(value, 3)),
    sectors,
    news: body.news_context?.slice(0, 180),
    macro: body.macro_context?.slice(0, 180),
    sentiment: body.sentiment_context?.slice(0, 180),
    indiaMode: body.indiaMode,
  }));
  const rng = mulberry32(seed);

  const pairCandidates: Array<{
    asset_a: string;
    asset_b: string;
    correlation: number;
    window: string;
    stability: number;
    trend: string;
    historical_corr: number;
    current_corr: number;
    divergence_magnitude: number;
    z_score: number;
    reversion_prob: number;
    expected_return: number;
    reasoning: string;
    sector_neutral: boolean;
  }> = [];

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sameSector = sectors[i] === sectors[j] && sectors[i] !== "Unknown";
      const volatilityGap = Math.abs(volatilities[i] - volatilities[j]);
      const weightGap = Math.abs(weights[i] - weights[j]);
      const historicalCorr = clamp((sameSector ? 0.74 : 0.32) - volatilityGap * 0.35 + (rng() - 0.5) * 0.12, -0.25, 0.95);
      const stressShift = context.bias === "risk_off" ? -0.18 : context.bias === "risk_on" ? 0.08 : -0.04;
      const currentCorr = clamp(historicalCorr + stressShift + (rng() - 0.5) * 0.2, -0.45, 0.95);
      const divergence = Math.abs(historicalCorr - currentCorr);
      const z = clamp(((prices[i] / Math.max(prices[j], 1)) - 1) * 3 + (rng() - 0.5) * 0.8, -3.2, 3.2);

      pairCandidates.push({
        asset_a: tickers[i],
        asset_b: tickers[j],
        correlation: round(currentCorr),
        window: sameSector ? "1m" : "1w",
        stability: round(clamp(0.92 - volatilityGap * 0.8 - weightGap * 0.4, 0.35, 0.96)),
        trend: divergence > 0.25 ? "breaking_down" : sameSector ? "stable" : "relinking",
        historical_corr: round(historicalCorr),
        current_corr: round(currentCorr),
        divergence_magnitude: round(divergence),
        z_score: round(z),
        reversion_prob: round(clamp(0.55 + divergence * 0.35 + (sameSector ? 0.08 : 0), 0.45, 0.9)),
        expected_return: round(clamp(0.015 + divergence * 0.08 + Math.abs(z) * 0.01, 0.02, 0.14)),
        reasoning: sameSector
          ? `${tickers[i]} and ${tickers[j]} are trading off the same sector impulse; the current spread has widened enough to justify a measured mean-reversion trade.`
          : `${tickers[i]} and ${tickers[j]} show a cross-sector dislocation that can be traded as a relative-value basket rather than a pure directional bet.`,
        sector_neutral: sameSector || weightGap < 0.08,
      });
    }
  }

  pairCandidates.sort((a, b) => b.divergence_magnitude - a.divergence_magnitude || b.reversion_prob - a.reversion_prob);

  const pairCount = Math.min(pairCandidates.length, Math.max(1, Math.min(12, pairCandidates.length)));
  const divergenceCount = Math.min(pairCandidates.length, Math.max(1, Math.min(6, Math.floor(pairCandidates.length / 2) || 1)));
  const pairTradeCount = Math.min(pairCandidates.length, Math.max(1, Math.min(6, Math.ceil(n / 2))));
  const opportunityCount = Math.max(4, Math.min(10, n * 2));
  const futuresCount = Math.max(1, Math.min(6, n));
  const simulationCount = Math.max(1, Math.min(6, n));

  const options_intel = tickers.map((ticker, i) => {
    const hv = volatilities[i];
    const iv = clamp(hv * (context.bias === "risk_off" ? 1.28 : context.bias === "risk_on" ? 1.12 : 1.18) + rng() * 0.05, 0.1, 1.25);
    const ivRank = Math.round(clamp((iv / hv) * 48 + rng() * 12, 18, 96));
    const skew = round(clamp((context.bias === "risk_off" ? -0.12 : 0.03) + (rng() - 0.5) * 0.08, -0.22, 0.18));
    const premiumRich = iv > hv * 1.18;
    return {
      ticker,
      iv_rank: ivRank,
      iv_percentile: Math.round(clamp(ivRank + (rng() - 0.5) * 10, 10, 99)),
      historical_vol: round(hv, 3),
      implied_vol: round(iv, 3),
      skew,
      gamma_exposure: Math.round((prices[i] || 100) * 12000 * (1 + weights[i]) * (0.8 + rng() * 0.5)),
      signal: premiumRich ? (context.bias === "risk_off" ? "overpriced_puts" : "rich_premium") : "long_gamma_candidate",
      signal_type: premiumRich ? "vol_expansion" : "vol_compression",
      opportunity: premiumRich
        ? `${context.bias === "risk_off" ? "Sell defined-risk put spreads" : "Harvest elevated premium with call spreads"} while implied vol remains above realized vol.`
        : "Own optionality selectively — implied vol is near realized and convexity is inexpensive.",
      confidence: round(clamp(0.58 + Math.abs(iv - hv) * 0.8, 0.52, 0.88)),
    };
  });

  const futures = tickers
    .map((ticker, i) => {
      const futures_symbol = futuresSymbolFor(ticker, sectors[i], !!body.indiaMode, context.themes);
      const leverage = clamp(4 + weights[i] * 10 + volatilities[i] * 8, 3, 16);
      return {
        ticker,
        futures_symbol,
        basis_pct: round(clamp((rng() - 0.5) * 1.6, -0.8, 1.2)),
        leverage_ratio: round(leverage, 1),
        cost_of_carry: round(clamp(0.01 + weights[i] * 0.03 + rng() * 0.01, 0.01, 0.06), 3),
        margin_requirement: Math.round((prices[i] || 100) * 90 * (1.2 + volatilities[i] * 1.8)),
        capital_efficiency_vs_spot: round(clamp(1.4 + leverage * 0.22, 1.5, 5.2), 1),
        recommendation: `${futures_symbol} offers cleaner exposure for ${ticker} while preserving cash for hedges and relative-value overlays.`,
        confidence: round(clamp(0.58 + weights[i] * 0.25 + (context.bias === "risk_on" ? 0.05 : 0), 0.55, 0.86)),
      };
    })
    .sort((a, b) => b.capital_efficiency_vs_spot - a.capital_efficiency_vs_spot)
    .slice(0, futuresCount);

  const sectorWeights = sectors.reduce<Record<string, number>>((acc, sector, index) => {
    acc[sector] = (acc[sector] || 0) + weights[index];
    return acc;
  }, {});
  const sectorNames = Object.keys(sectorWeights);
  const benchmark = sectorNames.length > 0 ? 1 / sectorNames.length : 1;

  const neutrality = {
    beta_exposure: round(clamp(0.82 + volatilities.reduce((sum, value, i) => sum + value * weights[i], 0) * 1.6, 0.75, 1.65)),
    sector_tilts: sectorNames.map((sector) => ({
      sector,
      weight: round(sectorWeights[sector], 3),
      benchmark: round(benchmark, 3),
      overweight: round(sectorWeights[sector] - benchmark, 3),
    })),
    factor_exposures: [
      { factor: "Momentum", loading: round(clamp((context.bias === "risk_on" ? 0.32 : 0.12) + (rng() - 0.5) * 0.12, -0.1, 0.45)) },
      { factor: "Quality", loading: round(clamp(0.16 + (rng() - 0.5) * 0.1, 0.02, 0.28)) },
      { factor: "Macro Sensitivity", loading: round(clamp((context.bias === "risk_off" ? 0.34 : 0.18) + (rng() - 0.5) * 0.12, 0.04, 0.42)) },
    ],
    hedge_suggestions: [
      {
        instrument: hedgeInstrument(!!body.indiaMode, context.bias, context.themes),
        action: context.bias === "risk_on" ? "Trim" : "Buy",
        size: neutralitySize(weights, context.bias),
        reasoning: `${context.headline}. Hedge size is intentionally moderate so the engine reverses bias without becoming too punitive.`,
        confidence: round(clamp(0.6 + context.intensity * 0.18, 0.6, 0.9)),
      },
    ],
  };

  const opportunities = [
    ...pairCandidates.slice(0, pairTradeCount).map((pair, index) => ({
      type: pair.divergence_magnitude > 0.25 ? "correlation_breakdown" : "pair_trade",
      title: `${pair.asset_a} vs ${pair.asset_b} mean-reversion setup`,
      confidence: round(clamp(pair.reversion_prob + 0.04, 0.55, 0.92)),
      risk_reward: round(clamp(1.8 + pair.divergence_magnitude * 3 + Math.abs(pair.z_score) * 0.3, 1.6, 4.8), 1),
      capital_efficiency: round(clamp(1.6 + (pair.sector_neutral ? 1.2 : 0.6) + index * 0.08, 1.8, 4.2), 1),
      expected_return: round(pair.expected_return, 3),
      max_loss: round(clamp(-pair.expected_return * 0.7, -0.09, -0.015), 3),
      reasoning: pair.reasoning,
      urgency: pair.divergence_magnitude > 0.28 ? "high" : "medium",
      category: "pair_trade",
    })),
    ...options_intel.slice(0, Math.min(3, options_intel.length)).map((option) => ({
      type: "options_mispricing",
      title: `${option.ticker} volatility dislocation`,
      confidence: option.confidence,
      risk_reward: round(clamp(1.9 + option.iv_rank / 40, 1.8, 4.4), 1),
      capital_efficiency: round(clamp(2.2 + option.iv_percentile / 60, 2.1, 4.1), 1),
      expected_return: round(clamp((option.implied_vol - option.historical_vol) * 0.25, 0.025, 0.11), 3),
      max_loss: round(clamp(-(option.implied_vol - option.historical_vol) * 0.18, -0.08, -0.02), 3),
      reasoning: option.opportunity,
      urgency: option.iv_rank > 75 ? "high" : "medium",
      category: "vol_arb",
    })),
    ...futures.slice(0, Math.min(3, futures.length)).map((future) => ({
      type: "futures_efficiency",
      title: `${future.ticker} via ${future.futures_symbol}`,
      confidence: future.confidence,
      risk_reward: round(clamp(1.7 + future.capital_efficiency_vs_spot * 0.45, 1.8, 4.6), 1),
      capital_efficiency: future.capital_efficiency_vs_spot,
      expected_return: round(clamp(0.03 + future.basis_pct * 0.02 + 0.02, 0.03, 0.12), 3),
      max_loss: round(clamp(-0.025 - future.cost_of_carry * 0.6, -0.08, -0.02), 3),
      reasoning: future.recommendation,
      urgency: future.capital_efficiency_vs_spot > 3.3 ? "high" : "low",
      category: "futures_efficiency",
    })),
  ]
    .sort((a, b) => b.confidence - a.confidence || b.risk_reward - a.risk_reward)
    .slice(0, opportunityCount);

  const simulations = opportunities.slice(0, simulationCount).map((opportunity, index) => ({
    strategy_name: opportunity.title,
    strategy_type: opportunity.category,
    expected_return_low: round(clamp(opportunity.expected_return * 0.4 - 0.01, -0.04, 0.05), 3),
    expected_return_mid: round(opportunity.expected_return, 3),
    expected_return_high: round(clamp(opportunity.expected_return * 1.9, 0.04, 0.22), 3),
    win_probability: round(clamp(opportunity.confidence - 0.08 + index * 0.01, 0.48, 0.83)),
    sharpe: round(clamp(opportunity.risk_reward / 2.1, 0.8, 2.4), 2),
    max_dd: round(clamp(Math.abs(opportunity.max_loss) * 1.3, 0.03, 0.12), 3),
    capital_required: Math.round(8000 + (index + 1) * 3500 + opportunity.capital_efficiency * 1500),
    holding_period_days: Math.round(clamp(8 + index * 6 + rng() * 9, 7, 45)),
    confidence: round(clamp(opportunity.confidence - 0.04, 0.52, 0.88)),
  }));

  const discoveries = body.discovery_mode
    ? Array.from({ length: Math.max(10, Math.min(20, n * 3 || 10)) }, (_, index) => {
        const template = discoveryTemplates(!!body.indiaMode)[index % discoveryTemplates(!!body.indiaMode).length];
        const anchorTicker = tickers[index % n] || tickers[0];
        const catalyst = context.themes[index % Math.max(1, context.themes.length)] || (context.bias === "risk_off" ? "macro" : "structural");
        const confidence = round(clamp(0.6 + (index % 5) * 0.04 + (context.bias === "risk_off" && template.type.includes("hedge") ? 0.08 : 0), 0.58, 0.9));
        return {
          asset_a: template.asset_a,
          asset_b: template.asset_b,
          type: template.type,
          thesis: `${template.asset_a} / ${template.asset_b} around ${anchorTicker}`,
          instrument_a: template.instrument_a,
          instrument_b: template.instrument_b,
          structure: template.structure,
          capital_efficiency: round(clamp(2.2 + (index % 4) * 0.45, 2.1, 4.6), 1),
          catalyst,
          confidence,
          reasoning: `${context.headline}. This setup complements ${anchorTicker} and reverses repeat losses with a measured counter-bias rather than a hard shutdown of the same trade family.`,
          risk_reward: round(clamp(2.1 + (index % 4) * 0.4, 2.0, 4.4), 1),
          urgency: context.bias === "risk_off" || catalyst === "fx" ? "high" : index % 3 === 0 ? "medium" : "low",
        };
      })
    : [];

  return {
    correlations: {
      pairs: pairCandidates.slice(0, pairCount).map(({ historical_corr, current_corr, divergence_magnitude, z_score, reversion_prob, expected_return, reasoning, sector_neutral, ...pair }) => pair),
      divergences: pairCandidates.slice(0, divergenceCount).map((pair) => ({
        asset_a: pair.asset_a,
        asset_b: pair.asset_b,
        historical_corr: pair.historical_corr,
        current_corr: pair.current_corr,
        divergence_magnitude: pair.divergence_magnitude,
        signal: pair.current_corr < pair.historical_corr ? "mean_reversion_opportunity" : "momentum_reacceleration",
      })),
    },
    pair_trades: pairCandidates.slice(0, pairTradeCount).map((pair) => ({
      long: pair.z_score < 0 ? pair.asset_a : pair.asset_b,
      short: pair.z_score < 0 ? pair.asset_b : pair.asset_a,
      z_score: pair.z_score,
      spread_mean: round(pair.historical_corr * 0.08, 3),
      spread_std: round(clamp(pair.divergence_magnitude * 0.18, 0.01, 0.09), 3),
      reversion_prob: pair.reversion_prob,
      win_rate: round(clamp(pair.reversion_prob - 0.07, 0.46, 0.82)),
      expected_return: pair.expected_return,
      reasoning: pair.reasoning,
      sector_neutral: pair.sector_neutral,
    })),
    options_intel,
    futures,
    neutrality,
    opportunities,
    simulations,
    discoveries,
    provider: "deterministic",
    engine: "rules-v1",
    generated_at: new Date().toISOString(),
    market_bias: context.bias,
  };
}

function neutralitySize(weights: number[], bias: Bias) {
  const largestPosition = Math.max(...weights, 0.1);
  const base = bias === "risk_off" ? 0.05 : bias === "balanced" ? 0.035 : 0.025;
  return `${Math.round(clamp((base + largestPosition * 0.08) * 100, 2, 8))}% of portfolio`;
}