import { useState, useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";

// ─── Types ───────────────────────────────────────────

export interface ProfitFieldEntry {
  id: string;
  asset: string;
  assetClass: "equity" | "options" | "futures" | "etf" | "crypto" | "fx" | "unknown";
  features: {
    momentum: number;   // -100 to 100
    vol: number;        // annualized vol %
    sentiment: number;  // -100 to 100
    regime: string;     // "trending" | "volatile" | "range" | "crisis"
  };
  pnlPct: number;
  returnAbs: number;
  duration: number; // hours
  timestamp: number;
}

export interface AssetScore {
  asset: string;
  weightedProfitScore: number;
  tradeCount: number;
  winRate: number;
  avgPnlPct: number;
  recentTrend: "rising" | "falling" | "stable";
  isHotZone: boolean;
  isBlacklisted: boolean;
}

export interface PairScore {
  pair: string; // "AAPL+MSFT"
  synergyScore: number;
  jointWinRate: number;
  jointAvgPnl: number;
  tradeCount: number;
}

export interface FeatureWeight {
  feature: string;
  weight: number;
  delta: number; // change from last update
}

export interface DesirableZone {
  id: string;
  assets: string[];
  regime: string;
  avgPnlPct: number;
  tradeCount: number;
  density: number; // profit per trade in this zone
  featureSignature: { momentum: number; vol: number; sentiment: number };
}

export interface GradientVector {
  assetBiases: Record<string, number>; // asset → selection probability multiplier (0.5–2.0)
  featureWeights: FeatureWeight[];
  allocationScales: Record<string, number>; // asset → allocation multiplier (0.7–1.5)
  timestamp: number;
  generation: number;
}

export interface IntelligenceSignal {
  id: string;
  type: "invest" | "hedge" | "pair" | "avoid" | "scale_up" | "rotate";
  urgency: "high" | "medium" | "low";
  title: string;
  reasoning: string;
  assets: string[];
  confidence: number; // 0-100
}

export interface ShadowState {
  activeParams: GradientVector;
  evolvedParams: GradientVector;
  activePnlRolling: number;
  evolvedPnlRolling: number;
  promoted: boolean;
}

export interface SafetyStatus {
  maxAllocCap: number;       // 25%
  learningRate: number;      // current α
  decayFactor: number;       // 0.97
  blacklistedAssets: string[];
  rollbackTriggered: boolean;
  diversificationCount: number; // distinct assets in hot zones
  rollingPnl5: number;       // 5-trade rolling PnL
}

// ─── Constants ───────────────────────────────────────

const LAMBDA = 0.03;           // exponential decay rate
const MAX_ALLOC_PER_ASSET = 0.25;
const ALPHA_MIN = 0.05;
const ALPHA_MAX = 0.15;
const DAILY_DECAY = 0.97;
const DRAWDOWN_LIMIT = -15;    // % per zone
const DIVERSIFICATION_FLOOR = 5;
const ROLLBACK_THRESHOLD = -8; // 5-trade rolling PnL %
const TOP_PERCENTILE = 0.20;   // top 20% = winners
const MAX_ENTRIES = 200;
const UPDATE_EVERY_N = 25;
const MAX_BIAS = 2.0;
const MIN_BIAS = 0.5;
const MAX_ALLOC_SCALE = 1.5;
const MIN_ALLOC_SCALE = 0.7;

// ─── Helpers ─────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function daysSince(ts: number) { return Math.max(0, (Date.now() - ts) / 86_400_000); }

function expWeight(ts: number) { return Math.exp(-LAMBDA * daysSince(ts)); }

function mean(arr: number[]) { return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length; }

// ─── Core Hook ───────────────────────────────────────

export function useOutcomeGradient() {
  const [entries, setEntries] = useLocalStorage<ProfitFieldEntry[]>("odgs-entries", []);
  const [gradient, setGradient] = useLocalStorage<GradientVector>("odgs-gradient", {
    assetBiases: {},
    featureWeights: [
      { feature: "momentum", weight: 1.0, delta: 0 },
      { feature: "vol", weight: 1.0, delta: 0 },
      { feature: "sentiment", weight: 1.0, delta: 0 },
    ],
    allocationScales: {},
    timestamp: Date.now(),
    generation: 0,
  });
  const [blacklist, setBlacklist] = useLocalStorage<string[]>("odgs-blacklist", []);
  const [rollbackTriggered, setRollbackTriggered] = useState(false);
  const [updateCounter, setUpdateCounter] = useLocalStorage<number>("odgs-update-counter", 0);

  // ─── Ingest Trade ──────────────────────────────────

  const ingestTrade = useCallback((trade: Omit<ProfitFieldEntry, "id">) => {
    const entry: ProfitFieldEntry = { ...trade, id: crypto.randomUUID() };
    setEntries(prev => {
      const updated = [entry, ...prev].slice(0, MAX_ENTRIES);
      return updated;
    });
    setUpdateCounter(prev => {
      const next = prev + 1;
      return next;
    });
  }, [setEntries, setUpdateCounter]);

  // ─── Compute Profit Field ─────────────────────────

  const profitField = useMemo((): AssetScore[] => {
    const assetMap: Record<string, { scores: number[]; wins: number; count: number; recentScores: number[] }> = {};

    for (const e of entries) {
      const w = expWeight(e.timestamp);
      // Amplify top performers
      const pnlRank = [...entries].sort((a, b) => b.pnlPct - a.pnlPct);
      const topCutoff = pnlRank[Math.floor(pnlRank.length * TOP_PERCENTILE)]?.pnlPct ?? 0;
      const amplifier = e.pnlPct >= topCutoff && e.pnlPct > 0 ? 2.0 : 1.0;

      if (!assetMap[e.asset]) assetMap[e.asset] = { scores: [], wins: 0, count: 0, recentScores: [] };
      const weighted = e.pnlPct * w * amplifier;
      assetMap[e.asset].scores.push(weighted);
      if (e.pnlPct > 0) assetMap[e.asset].wins++;
      assetMap[e.asset].count++;
      if (daysSince(e.timestamp) < 7) assetMap[e.asset].recentScores.push(e.pnlPct);
    }

    return Object.entries(assetMap).map(([asset, data]) => {
      const wps = data.scores.reduce((s, v) => s + v, 0);
      const recentAvg = mean(data.recentScores);
      const overallAvg = mean(data.scores);
      const trend = data.recentScores.length < 2 ? "stable" as const :
        recentAvg > overallAvg * 1.1 ? "rising" as const :
        recentAvg < overallAvg * 0.9 ? "falling" as const : "stable" as const;

      const wr = data.count > 0 ? (data.wins / data.count) * 100 : 0;
      return {
        asset,
        weightedProfitScore: wps,
        tradeCount: data.count,
        winRate: wr,
        avgPnlPct: data.count > 0 ? data.scores.reduce((s, v) => s + v, 0) / data.count : 0,
        recentTrend: trend,
        isHotZone: wps > 0 && wr > 50 && data.count >= 3,
        isBlacklisted: blacklist.includes(asset),
      };
    }).sort((a, b) => b.weightedProfitScore - a.weightedProfitScore);
  }, [entries, blacklist]);

  // ─── Detect Desirable Zones ────────────────────────

  const desirableZones = useMemo((): DesirableZone[] => {
    if (entries.length < 5) return [];

    // Group by regime
    const regimeGroups: Record<string, ProfitFieldEntry[]> = {};
    for (const e of entries) {
      const regime = e.features.regime || "unknown";
      if (!regimeGroups[regime]) regimeGroups[regime] = [];
      regimeGroups[regime].push(e);
    }

    const zones: DesirableZone[] = [];
    for (const [regime, group] of Object.entries(regimeGroups)) {
      // Find top percentile within regime
      const sorted = [...group].sort((a, b) => b.pnlPct - a.pnlPct);
      const topN = Math.max(1, Math.floor(sorted.length * TOP_PERCENTILE));
      const topTrades = sorted.slice(0, topN).filter(t => t.pnlPct > 0);

      if (topTrades.length === 0) continue;

      const assets = [...new Set(topTrades.map(t => t.asset))];
      const avgPnl = mean(topTrades.map(t => t.pnlPct));
      const avgMomentum = mean(topTrades.map(t => t.features.momentum));
      const avgVol = mean(topTrades.map(t => t.features.vol));
      const avgSent = mean(topTrades.map(t => t.features.sentiment));

      zones.push({
        id: `zone-${regime}-${assets.slice(0, 3).join("-")}`,
        assets,
        regime,
        avgPnlPct: avgPnl,
        tradeCount: topTrades.length,
        density: avgPnl / Math.max(1, topTrades.length),
        featureSignature: { momentum: avgMomentum, vol: avgVol, sentiment: avgSent },
      });
    }

    return zones.sort((a, b) => b.avgPnlPct - a.avgPnlPct);
  }, [entries]);

  // ─── Combination Scores ────────────────────────────

  const combinationScores = useMemo((): PairScore[] => {
    if (entries.length < 10) return [];

    // Group entries by a time window (same day) to find co-occurring trades
    const dayBuckets: Record<string, ProfitFieldEntry[]> = {};
    for (const e of entries) {
      const day = new Date(e.timestamp).toISOString().split("T")[0];
      if (!dayBuckets[day]) dayBuckets[day] = [];
      dayBuckets[day].push(e);
    }

    const pairMap: Record<string, { pnls: number[]; wins: number }> = {};
    for (const bucket of Object.values(dayBuckets)) {
      if (bucket.length < 2) continue;
      const assets = [...new Set(bucket.map(e => e.asset))].sort();
      for (let i = 0; i < assets.length; i++) {
        for (let j = i + 1; j < assets.length; j++) {
          const key = `${assets[i]}+${assets[j]}`;
          if (!pairMap[key]) pairMap[key] = { pnls: [], wins: 0 };
          const jointPnl = mean(bucket.filter(e => e.asset === assets[i] || e.asset === assets[j]).map(e => e.pnlPct));
          pairMap[key].pnls.push(jointPnl);
          if (jointPnl > 0) pairMap[key].wins++;
        }
      }
    }

    return Object.entries(pairMap)
      .filter(([, v]) => v.pnls.length >= 2)
      .map(([pair, data]) => ({
        pair,
        synergyScore: mean(data.pnls) * Math.sqrt(data.pnls.length),
        jointWinRate: (data.wins / data.pnls.length) * 100,
        jointAvgPnl: mean(data.pnls),
        tradeCount: data.pnls.length,
      }))
      .sort((a, b) => b.synergyScore - a.synergyScore)
      .slice(0, 20);
  }, [entries]);

  // ─── Compute & Apply Gradient ──────────────────────

  const computeAndApplyGradient = useCallback(() => {
    if (entries.length < 5) return;

    // Compute current α based on recent volatility
    const recentPnls = entries.slice(0, 20).map(e => e.pnlPct);
    const pnlStd = Math.sqrt(mean(recentPnls.map(p => p * p)) - mean(recentPnls) ** 2) || 1;
    const alpha = clamp(ALPHA_MAX / (1 + pnlStd * 0.05), ALPHA_MIN, ALPHA_MAX);

    // Safety: 5-trade rolling PnL check
    const rolling5 = mean(entries.slice(0, 5).map(e => e.pnlPct));
    if (rolling5 < ROLLBACK_THRESHOLD) {
      setRollbackTriggered(true);
      // Decay all biases toward neutral
      setGradient(prev => ({
        ...prev,
        assetBiases: Object.fromEntries(
          Object.entries(prev.assetBiases).map(([k, v]) => [k, clamp(v * 0.8 + 0.2, MIN_BIAS, MAX_BIAS)])
        ),
        allocationScales: Object.fromEntries(
          Object.entries(prev.allocationScales).map(([k, v]) => [k, clamp(v * 0.8 + 0.2, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE)])
        ),
        timestamp: Date.now(),
        generation: prev.generation + 1,
      }));
      return;
    }
    setRollbackTriggered(false);

    // Compute asset biases from profit field
    const hotAssets = profitField.filter(a => a.isHotZone && !a.isBlacklisted);
    const coldAssets = profitField.filter(a => !a.isHotZone && a.weightedProfitScore < 0);

    const newAssetBiases: Record<string, number> = { ...gradient.assetBiases };
    for (const hot of hotAssets) {
      const current = newAssetBiases[hot.asset] || 1.0;
      newAssetBiases[hot.asset] = clamp(current + alpha * 0.3, MIN_BIAS, MAX_BIAS);
    }
    for (const cold of coldAssets) {
      const current = newAssetBiases[cold.asset] || 1.0;
      newAssetBiases[cold.asset] = clamp(current - alpha * 0.2, MIN_BIAS, MAX_BIAS);
    }

    // Apply daily decay to all biases
    for (const key of Object.keys(newAssetBiases)) {
      newAssetBiases[key] = clamp(
        1.0 + (newAssetBiases[key] - 1.0) * DAILY_DECAY,
        MIN_BIAS,
        MAX_BIAS
      );
    }

    // Compute feature weights from winning trades
    const winners = entries.filter(e => e.pnlPct > 0);
    const losers = entries.filter(e => e.pnlPct <= 0);
    const winMomentum = mean(winners.map(e => Math.abs(e.features.momentum)));
    const loseMomentum = mean(losers.map(e => Math.abs(e.features.momentum)));
    const winVol = mean(winners.map(e => e.features.vol));
    const loseVol = mean(losers.map(e => e.features.vol));
    const winSent = mean(winners.map(e => e.features.sentiment));
    const loseSent = mean(losers.map(e => e.features.sentiment));

    const prevWeights = gradient.featureWeights;
    const newFeatureWeights: FeatureWeight[] = [
      { feature: "momentum", weight: clamp(1.0 + alpha * (winMomentum - loseMomentum) * 0.01, 0.3, 3.0), delta: 0 },
      { feature: "vol", weight: clamp(1.0 + alpha * (loseVol - winVol) * 0.01, 0.3, 3.0), delta: 0 },
      { feature: "sentiment", weight: clamp(1.0 + alpha * (winSent - loseSent) * 0.01, 0.3, 3.0), delta: 0 },
    ];
    for (const fw of newFeatureWeights) {
      const prev = prevWeights.find(p => p.feature === fw.feature);
      fw.delta = prev ? fw.weight - prev.weight : 0;
    }

    // Allocation scales
    const newAllocScales: Record<string, number> = { ...gradient.allocationScales };
    for (const hot of hotAssets) {
      const current = newAllocScales[hot.asset] || 1.0;
      newAllocScales[hot.asset] = clamp(current + alpha * 0.15, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE);
    }
    for (const cold of coldAssets) {
      const current = newAllocScales[cold.asset] || 1.0;
      newAllocScales[cold.asset] = clamp(current - alpha * 0.1, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE);
    }

    // Check blacklist: zones with drawdown beyond limit
    const newBlacklist: string[] = [...blacklist];
    for (const asset of profitField) {
      const recentTrades = entries.filter(e => e.asset === asset.asset).slice(0, 10);
      const worstPnl = Math.min(...recentTrades.map(e => e.pnlPct), 0);
      if (worstPnl < DRAWDOWN_LIMIT && !newBlacklist.includes(asset.asset)) {
        newBlacklist.push(asset.asset);
      }
    }
    // Auto-remove from blacklist after 30 days
    setBlacklist(newBlacklist.filter(a => {
      const lastTrade = entries.find(e => e.asset === a);
      return lastTrade ? daysSince(lastTrade.timestamp) < 30 : false;
    }));

    setGradient({
      assetBiases: newAssetBiases,
      featureWeights: newFeatureWeights,
      allocationScales: newAllocScales,
      timestamp: Date.now(),
      generation: gradient.generation + 1,
    });
  }, [entries, profitField, gradient, blacklist, setGradient, setBlacklist]);

  // ─── Auto-trigger on N trades ──────────────────────

  const shouldAutoUpdate = updateCounter > 0 && updateCounter % UPDATE_EVERY_N === 0;

  // ─── Get Boost for Asset ───────────────────────────

  const getAssetBoost = useCallback((ticker: string): { scoreMult: number; allocMult: number; isHot: boolean; isBlacklisted: boolean } => {
    const bias = gradient.assetBiases[ticker] || 1.0;
    const allocScale = gradient.allocationScales[ticker] || 1.0;
    const field = profitField.find(a => a.asset === ticker);
    return {
      scoreMult: clamp(bias, 0.7, 1.5),
      allocMult: clamp(allocScale, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE),
      isHot: field?.isHotZone ?? false,
      isBlacklisted: blacklist.includes(ticker),
    };
  }, [gradient, profitField, blacklist]);

  // ─── Safety Status ─────────────────────────────────

  const safetyStatus = useMemo((): SafetyStatus => {
    const recentPnls = entries.slice(0, 20).map(e => e.pnlPct);
    const pnlStd = Math.sqrt(mean(recentPnls.map(p => p * p)) - mean(recentPnls) ** 2) || 1;
    const alpha = clamp(ALPHA_MAX / (1 + pnlStd * 0.05), ALPHA_MIN, ALPHA_MAX);
    const rolling5 = mean(entries.slice(0, 5).map(e => e.pnlPct));
    const hotCount = profitField.filter(a => a.isHotZone).length;

    return {
      maxAllocCap: MAX_ALLOC_PER_ASSET * 100,
      learningRate: alpha,
      decayFactor: DAILY_DECAY,
      blacklistedAssets: blacklist,
      rollbackTriggered,
      diversificationCount: hotCount,
      rollingPnl5: rolling5,
    };
  }, [entries, profitField, blacklist, rollbackTriggered]);

  // ─── Shadow Evolution ──────────────────────────────

  const shadowComparison = useMemo((): ShadowState => {
    const neutral: GradientVector = {
      assetBiases: {},
      featureWeights: [
        { feature: "momentum", weight: 1.0, delta: 0 },
        { feature: "vol", weight: 1.0, delta: 0 },
        { feature: "sentiment", weight: 1.0, delta: 0 },
      ],
      allocationScales: {},
      timestamp: Date.now(),
      generation: 0,
    };

    // Simulate both: neutral (active) vs biased (evolved)
    const recentTrades = entries.slice(0, 50);
    const activePnl = mean(recentTrades.map(e => e.pnlPct));

    // Evolved: weight by gradient biases
    const evolvedPnl = mean(recentTrades.map(e => {
      const bias = gradient.assetBiases[e.asset] || 1.0;
      return e.pnlPct * bias;
    }));

    return {
      activeParams: neutral,
      evolvedParams: gradient,
      activePnlRolling: activePnl,
      evolvedPnlRolling: evolvedPnl,
      promoted: evolvedPnl > activePnl * 1.05, // 5% improvement threshold
    };
  }, [entries, gradient]);

  // ─── Allocation Shift History ──────────────────────

  const allocationHistory = useMemo(() => {
    const generations = Math.min(gradient.generation, 20);
    const history: { gen: number; momentum: number; vol: number; sentiment: number }[] = [];
    for (let i = 0; i <= generations; i++) {
      const decay = Math.pow(0.95, generations - i);
      history.push({
        gen: i,
        momentum: (gradient.featureWeights.find(f => f.feature === "momentum")?.weight || 1) * decay + (1 - decay),
        vol: (gradient.featureWeights.find(f => f.feature === "vol")?.weight || 1) * decay + (1 - decay),
        sentiment: (gradient.featureWeights.find(f => f.feature === "sentiment")?.weight || 1) * decay + (1 - decay),
      });
    }
    return history;
  }, [gradient]);

  // ─── Intelligence Signals ─────────────────────────

  const intelligenceSignals = useMemo((): IntelligenceSignal[] => {
    if (entries.length < 3) return [];
    const signals: IntelligenceSignal[] = [];

    // 1. INVEST signals: hot-zone assets with rising trend
    for (const asset of profitField.filter(a => a.isHotZone && !a.isBlacklisted && a.recentTrend === "rising")) {
      const allocScale = gradient.allocationScales[asset.asset] || 1.0;
      const zone = desirableZones.find(z => z.assets.includes(asset.asset));
      signals.push({
        id: `invest-${asset.asset}`,
        type: "invest",
        urgency: asset.avgPnlPct > 5 ? "high" : "medium",
        title: `Increase ${asset.asset} — hot zone, rising momentum`,
        reasoning: `${asset.asset} is in a desirable zone with ${asset.winRate.toFixed(0)}% win rate and avg +${asset.avgPnlPct.toFixed(1)}% PnL across ${asset.tradeCount} trades. ` +
          `Gradient suggests scaling allocation to ${allocScale.toFixed(2)}×.` +
          (zone ? ` Best in ${zone.regime} regime with momentum=${zone.featureSignature.momentum.toFixed(0)}, sentiment=${zone.featureSignature.sentiment.toFixed(0)}.` : ""),
        assets: [asset.asset],
        confidence: Math.min(95, Math.round(asset.winRate * 0.7 + asset.tradeCount * 2)),
      });
    }

    // 2. PAIR signals: high-synergy combinations
    for (const pair of combinationScores.filter(p => p.synergyScore > 0.5 && p.jointWinRate > 55)) {
      const [a, b] = pair.pair.split("+");
      signals.push({
        id: `pair-${pair.pair}`,
        type: "pair",
        urgency: pair.jointAvgPnl > 3 ? "high" : "medium",
        title: `Pair ${a} + ${b} — ${pair.jointWinRate.toFixed(0)}% joint win rate`,
        reasoning: `When traded together, ${a} and ${b} produce +${pair.jointAvgPnl.toFixed(1)}% avg PnL with synergy score ${pair.synergyScore.toFixed(2)} across ${pair.tradeCount} co-occurrences. ` +
          `Joint performance exceeds individual — consider correlated entries.`,
        assets: [a, b],
        confidence: Math.min(90, Math.round(pair.jointWinRate * 0.8 + pair.tradeCount * 3)),
      });
    }

    // 3. HEDGE signals: assets with high vol feature weight + falling zones
    const volWeight = gradient.featureWeights.find(f => f.feature === "vol")?.weight || 1;
    if (volWeight > 1.3) {
      const highVolAssets = profitField.filter(a => !a.isBlacklisted && a.recentTrend === "falling" && a.tradeCount >= 2);
      for (const asset of highVolAssets.slice(0, 2)) {
        const hotPair = combinationScores.find(p => p.pair.includes(asset.asset) && p.synergyScore > 0);
        const hedgeTarget = hotPair ? hotPair.pair.split("+").find(x => x !== asset.asset) : null;
        signals.push({
          id: `hedge-${asset.asset}`,
          type: "hedge",
          urgency: "medium",
          title: `Hedge ${asset.asset}${hedgeTarget ? ` with ${hedgeTarget}` : ""} — vol regime elevated`,
          reasoning: `Gradient vol weight is ${volWeight.toFixed(2)}× (elevated). ${asset.asset} is in a falling trend with avg ${asset.avgPnlPct.toFixed(1)}% PnL. ` +
            (hedgeTarget
              ? `Historical pair data shows ${hedgeTarget} offsets ${asset.asset} drawdowns — consider a paired hedge.`
              : `Consider protective puts or reducing position size to cap downside.`),
          assets: hedgeTarget ? [asset.asset, hedgeTarget] : [asset.asset],
          confidence: Math.min(80, Math.round(50 + (volWeight - 1) * 30)),
        });
      }
    }

    // 4. AVOID signals: blacklisted or consistently losing
    for (const asset of profitField.filter(a => a.isBlacklisted || (a.winRate < 30 && a.tradeCount >= 3))) {
      signals.push({
        id: `avoid-${asset.asset}`,
        type: "avoid",
        urgency: asset.isBlacklisted ? "high" : "low",
        title: `Avoid ${asset.asset} — ${asset.isBlacklisted ? "blacklisted (DD > 15%)" : `${asset.winRate.toFixed(0)}% win rate`}`,
        reasoning: `${asset.asset} has underperformed with ${asset.winRate.toFixed(0)}% win rate and avg ${asset.avgPnlPct.toFixed(1)}% PnL over ${asset.tradeCount} trades. ` +
          (asset.isBlacklisted ? "Drawdown exceeded 15% — automatically blocked. Will re-enable after 30 days." : "Gradient is reducing selection probability."),
        assets: [asset.asset],
        confidence: Math.min(90, Math.round(70 + (50 - asset.winRate) * 0.5)),
      });
    }

    // 5. SCALE_UP: promoted shadow evolution
    if (shadowComparison.promoted && profitField.filter(a => a.isHotZone).length >= 3) {
      const topHot = profitField.filter(a => a.isHotZone).slice(0, 3).map(a => a.asset);
      signals.push({
        id: "scale-up-promoted",
        type: "scale_up",
        urgency: "high",
        title: `Scale up hot-zone portfolio — evolved system outperforms by ${((shadowComparison.evolvedPnlRolling / Math.max(0.01, shadowComparison.activePnlRolling) - 1) * 100).toFixed(0)}%`,
        reasoning: `The ODGS-biased portfolio produces ${shadowComparison.evolvedPnlRolling.toFixed(2)}% vs ${shadowComparison.activePnlRolling.toFixed(2)}% neutral rolling PnL. ` +
          `Profit gradient is converging — consider increasing overall exposure to ${topHot.join(", ")}.`,
        assets: topHot,
        confidence: 75,
      });
    }

    // 6. ROTATE: regime-based zone shifts
    for (const zone of desirableZones.filter(z => z.avgPnlPct > 3 && z.tradeCount >= 3)) {
      const currentExposure = zone.assets.filter(a => {
        const bias = gradient.assetBiases[a] || 1.0;
        return bias < 1.1; // under-biased relative to zone performance
      });
      if (currentExposure.length > 0) {
        signals.push({
          id: `rotate-${zone.id}`,
          type: "rotate",
          urgency: zone.avgPnlPct > 5 ? "high" : "low",
          title: `Rotate into ${zone.regime} zone — ${currentExposure.slice(0, 3).join(", ")} underweighted`,
          reasoning: `${zone.regime} regime zone averaging +${zone.avgPnlPct.toFixed(1)}% PnL with momentum=${zone.featureSignature.momentum.toFixed(0)} and sentiment=${zone.featureSignature.sentiment.toFixed(0)}. ` +
            `${currentExposure.join(", ")} are in this zone but currently underweighted by the gradient — consider increasing exposure.`,
          assets: currentExposure.slice(0, 5),
          confidence: Math.min(85, Math.round(zone.avgPnlPct * 8 + zone.tradeCount * 3)),
        });
      }
    }

    // Sort: high urgency first, then by confidence
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    return signals
      .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.confidence - a.confidence)
      .slice(0, 12);
  }, [entries, profitField, desirableZones, combinationScores, gradient, shadowComparison]);

  // ─── Clear ─────────────────────────────────────────

  const clearAll = useCallback(() => {
    setEntries([]);
    setGradient({
      assetBiases: {},
      featureWeights: [
        { feature: "momentum", weight: 1.0, delta: 0 },
        { feature: "vol", weight: 1.0, delta: 0 },
        { feature: "sentiment", weight: 1.0, delta: 0 },
      ],
      allocationScales: {},
      timestamp: Date.now(),
      generation: 0,
    });
    setBlacklist([]);
    setUpdateCounter(0);
  }, [setEntries, setGradient, setBlacklist, setUpdateCounter]);

  return {
    // Data
    entries,
    profitField,
    desirableZones,
    combinationScores,
    gradient,
    safetyStatus,
    shadowComparison,
    allocationHistory,
    intelligenceSignals,
    // Actions
    ingestTrade,
    computeAndApplyGradient,
    getAssetBoost,
    clearAll,
    shouldAutoUpdate,
    // Meta
    totalTrades: entries.length,
    generation: gradient.generation,
  };
}
