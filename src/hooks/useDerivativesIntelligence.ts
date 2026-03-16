import { useState, useCallback } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { toast } from "sonner";

export interface DerivativesData {
  correlations: {
    pairs: { asset_a: string; asset_b: string; correlation: number; window: string; stability: number; trend: string }[];
    divergences: { asset_a: string; asset_b: string; historical_corr: number; current_corr: number; divergence_magnitude: number; signal: string }[];
  };
  pair_trades: {
    long: string; short: string; z_score: number; spread_mean: number; spread_std: number;
    reversion_prob: number; win_rate: number; expected_return: number; reasoning: string; sector_neutral: boolean;
  }[];
  options_intel: {
    ticker: string; iv_rank: number; iv_percentile: number; historical_vol: number; implied_vol: number;
    skew: number; gamma_exposure: number; signal: string; signal_type: string; opportunity: string; confidence: number;
  }[];
  futures: {
    ticker: string; futures_symbol: string; basis_pct: number; leverage_ratio: number;
    cost_of_carry: number; margin_requirement: number; capital_efficiency_vs_spot: number;
    recommendation: string; confidence: number;
  }[];
  neutrality: {
    beta_exposure: number;
    sector_tilts: { sector: string; weight: number; benchmark: number; overweight: number }[];
    factor_exposures: { factor: string; loading: number }[];
    hedge_suggestions: { instrument: string; action: string; size: string; reasoning: string; confidence: number }[];
  };
  opportunities: {
    type: string; title: string; confidence: number; risk_reward: number; capital_efficiency: number;
    expected_return: number; max_loss: number; reasoning: string; urgency: string; category: string;
  }[];
  simulations: {
    strategy_name: string; strategy_type: string; expected_return_low: number; expected_return_mid: number;
    expected_return_high: number; win_probability: number; sharpe: number; max_dd: number;
    capital_required: number; holding_period_days: number; confidence: number;
  }[];
  provider?: string;
}

export function useDerivativesIntelligence(stocks: PortfolioStock[]) {
  const [data, setData] = useState<DerivativesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (force = false) => {
    const analyzed = stocks.filter(s => s.analysis);
    if (analyzed.length === 0) return;

    setLoading(true);
    setError(null);

    const totalValue = analyzed.reduce((s, st) => s + (st.analysis?.currentPrice ?? st.buyPrice) * st.quantity, 0);

    try {
      const { data: result, error: err } = await governedInvoke<DerivativesData>("derivatives-intelligence", {
        tier: "slow",
        force,
        body: {
          tickers: analyzed.map(s => s.ticker),
          weights: analyzed.map(s => ((s.analysis?.currentPrice ?? s.buyPrice) * s.quantity) / (totalValue || 1)),
          prices: analyzed.map(s => s.analysis?.currentPrice ?? s.buyPrice),
          volatilities: analyzed.map(s => {
            const vol = s.analysis?.riskLevel;
            if (vol === "High") return 0.4;
            if (vol === "Medium") return 0.25;
            return 0.15;
          }),
          sectors: analyzed.map(s => {
            // Extract sector from analysis if available
            const rec = s.analysis?.recommendation || "";
            if (/tech|software|semi/i.test(rec)) return "Technology";
            if (/financ|bank/i.test(rec)) return "Financials";
            if (/health|pharma|bio/i.test(rec)) return "Healthcare";
            if (/energy|oil|gas/i.test(rec)) return "Energy";
            if (/consumer|retail/i.test(rec)) return "Consumer";
            if (/industrial|manufact/i.test(rec)) return "Industrials";
            if (/util/i.test(rec)) return "Utilities";
            if (/real.*estate|reit/i.test(rec)) return "Real Estate";
            if (/material|mining/i.test(rec)) return "Materials";
            if (/telecom|comm/i.test(rec)) return "Communication";
            return "Unknown";
          }),
          baseCurrency: "USD",
        },
      });

      if (err) throw err;
      if (result) setData(result);
    } catch (e: any) {
      const msg = e?.message || "Failed to fetch derivatives intelligence";
      setError(msg);
      toast.error("Derivatives engine failed", { description: msg });
    } finally {
      setLoading(false);
    }
  }, [stocks]);

  return { data, loading, error, analyze };
}
