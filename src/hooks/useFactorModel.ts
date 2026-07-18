import { useEffect, useMemo } from "react";
import { useHistoricalPrices } from "@/hooks/useHistoricalPrices";
import { logReturns } from "@/lib/quant-engine";
import {
  computeFactorModel, selectFactors, rollingBetaSeries,
  type FactorModelResult, type FactorDef,
} from "@/lib/quant/factor-model";
import type { QuantSnapshot } from "@/hooks/useQuantSnapshot";

export interface FactorModelState {
  ready: boolean;
  model: FactorModelResult | null;
  factors: FactorDef[];
  /** Portfolio rolling 60d beta vs the primary market factor. */
  rollingBeta: number[];
  /** Full-sample portfolio beta vs the primary market factor. */
  fullBeta: number | null;
  marketFactorLabel: string;
}

/**
 * Fits the multi-factor risk model for the current quant snapshot. Factor
 * proxy histories flow through the same governed historical-prices pipeline
 * as every asset series — one data path, one cache, one provenance.
 */
export function useFactorModel(snapshot: QuantSnapshot, hasInrExposure: boolean): FactorModelState {
  const { prices, fetchHistorical } = useHistoricalPrices();
  const factors = useMemo(() => selectFactors(hasInrExposure), [hasInrExposure]);

  useEffect(() => {
    if (snapshot.ready) fetchHistorical(factors.map((f) => f.ticker), "1y");
  }, [snapshot.ready, factors, fetchHistorical]);

  return useMemo<FactorModelState>(() => {
    const marketFactor = factors[0];
    const empty: FactorModelState = {
      ready: false, model: null, factors, rollingBeta: [], fullBeta: null,
      marketFactorLabel: marketFactor?.label ?? "",
    };
    if (!snapshot.ready) return empty;

    const factorReturns: Record<string, number[]> = {};
    for (const f of factors) {
      const series = prices[f.ticker];
      if (series && series.closes.length >= 30) factorReturns[f.id] = logReturns(series.closes);
    }
    if (Object.keys(factorReturns).length < 2) return empty;

    const model = computeFactorModel({
      assetReturns: snapshot.returnsByTicker,
      weights: snapshot.weights,
      factorReturns,
      factors,
    });
    if (!model) return empty;

    // Portfolio beta stability vs the primary market factor
    const mktRets = factorReturns[marketFactor.id];
    let rollingBeta: number[] = [];
    let fullBeta: number | null = null;
    if (mktRets && snapshot.portfolio.returns.length >= 65) {
      rollingBeta = rollingBetaSeries(snapshot.portfolio.returns, mktRets, 60);
      const full = rollingBetaSeries(
        snapshot.portfolio.returns, mktRets,
        Math.min(snapshot.portfolio.returns.length, mktRets.length),
      );
      fullBeta = full.length > 0 ? full[full.length - 1] : null;
    }

    return {
      ready: true,
      model,
      factors: model.factors,
      rollingBeta,
      fullBeta,
      marketFactorLabel: marketFactor.label,
    };
  }, [snapshot, prices, factors]);
}
