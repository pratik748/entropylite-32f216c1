/**
 * Deterministic Strategy & Trade Execution Instruction Compiler.
 *
 * Generates institutional portfolio assessments and actionable trade instructions
 * based on portfolio weights, PnL, beta, and market regime conditions.
 */

export interface TradeInstruction {
  action: "BUY" | "SELL" | "HOLD" | "TRIM" | "ADD" | "HEDGE";
  ticker: string;
  is_existing_position: boolean;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  entry_price?: number;
  stop_loss_price?: number;
  take_profit_price?: number;
  time_horizon: string;
  rationale: string;
  risk_reward: string;
  category: "POSITION_MGMT" | "HEDGE" | "NEW_ENTRY" | "REBALANCE" | "RISK_REDUCTION";
  priority: number;
  confidence: number;
}

export interface StrategyGenerateResponse {
  portfolio_assessment: string;
  instructions: TradeInstruction[];
  regime: string;
  timestamp: number;
}

export function generateDeterministicStrategy(opts: {
  portfolio?: any[];
  regime?: string;
  vix?: number;
}): StrategyGenerateResponse {
  const regime = opts.regime || "Neutral";
  const vix = typeof opts.vix === "number" && opts.vix > 0 ? opts.vix : 18.5;
  const portfolio = Array.isArray(opts.portfolio) ? opts.portfolio : [];

  const instructions: TradeInstruction[] = [];

  for (let i = 0; i < Math.min(portfolio.length, 5); i++) {
    const stock = portfolio[i];
    const ticker = stock.ticker || stock.symbol || "ASSET";
    const price = Number(stock.currentPrice || stock.buyPrice || 100);
    const pnl = Number(stock.pnlPct || 0);
    const beta = Number(stock.beta || 1.0);

    if (pnl < -5.0) {
      // Risk reduction or stop loss
      instructions.push({
        action: "TRIM",
        ticker,
        is_existing_position: true,
        urgency: "HIGH",
        entry_price: price,
        stop_loss_price: Number((price * 0.96).toFixed(2)),
        take_profit_price: Number((price * 1.08).toFixed(2)),
        time_horizon: "Intraday to 3 days",
        rationale: `De-risking ${ticker} (${pnl.toFixed(1)}% PnL) to protect capital preservation floor.`,
        risk_reward: "1:2.5",
        category: "RISK_REDUCTION",
        priority: 1,
        confidence: 84,
      });
    } else if (pnl > 7.5) {
      // Take profit / trailing stop
      instructions.push({
        action: "POSITION_MGMT",
        ticker,
        is_existing_position: true,
        urgency: "MEDIUM",
        entry_price: price,
        stop_loss_price: Number((price * 0.97).toFixed(2)),
        take_profit_price: Number((price * 1.10).toFixed(2)),
        time_horizon: "Swing 2-5 days",
        rationale: `Securing accrued convex gains on ${ticker} with trailing stop threshold.`,
        risk_reward: "1:3.0",
        category: "POSITION_MGMT",
        priority: 2,
        confidence: 79,
      });
    } else {
      // Rebalance / Hold
      instructions.push({
        action: "HOLD",
        ticker,
        is_existing_position: true,
        urgency: "LOW",
        entry_price: price,
        stop_loss_price: Number((price * 0.95).toFixed(2)),
        take_profit_price: Number((price * 1.07).toFixed(2)),
        time_horizon: "Position 1-4 weeks",
        rationale: `Maintaining target exposure in ${ticker} (β = ${beta.toFixed(2)}) within risk budget.`,
        risk_reward: "1:2.4",
        category: "REBALANCE",
        priority: 3 + i,
        confidence: 72,
      });
    }
  }

  // Add macro tail hedge instruction if VIX is elevated
  if (vix > 20 || instructions.length === 0) {
    instructions.unshift({
      action: "HEDGE",
      ticker: "SPY_PUT",
      is_existing_position: false,
      urgency: vix > 25 ? "HIGH" : "MEDIUM",
      time_horizon: "1-4 weeks",
      rationale: `Systematic downside convexity hedge against ${regime.toLowerCase()} regime volatility expansion.`,
      risk_reward: "1:3.5",
      category: "HEDGE",
      priority: 1,
      confidence: 88,
    });
  }

  const portfolio_assessment = `Portfolio structure reflects ${portfolio.length} active positions in the ${regime} regime (VIX ${vix.toFixed(1)}). Capital deployment is optimized for asymmetric tail risk protection and systematic factor efficiency.`;

  return {
    portfolio_assessment,
    instructions: instructions.sort((a, b) => a.priority - b.priority),
    regime,
    timestamp: Date.now(),
  };
}
