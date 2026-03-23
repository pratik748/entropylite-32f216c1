import { useState, useCallback, useMemo } from "react";
import { useLocalStorage } from "./useLocalStorage";

// ─── Types ───────────────────────────────────────────

export interface ProfitFieldEntry {
  id: string;
  asset: string;
  assetClass: "equity" | "options" | "futures" | "etf" | "crypto" | "fx" | "unknown";
  features: {
    momentum: number;
    vol: number;
    sentiment: number;
    regime: string;
  };
  pnlPct: number;
  returnAbs: number;
  duration: number;
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
  pair: string;
  synergyScore: number;
  jointWinRate: number;
  jointAvgPnl: number;
  tradeCount: number;
}

export interface FeatureWeight {
  feature: string;
  weight: number;
  delta: number;
}

export interface DesirableZone {
  id: string;
  assets: string[];
  regime: string;
  avgPnlPct: number;
  tradeCount: number;
  density: number;
  featureSignature: { momentum: number; vol: number; sentiment: number };
}

export interface GradientVector {
  assetBiases: Record<string, number>;
  featureWeights: FeatureWeight[];
  allocationScales: Record<string, number>;
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
  confidence: number;
}

export interface ShadowState {
  activeParams: GradientVector;
  evolvedParams: GradientVector;
  activePnlRolling: number;
  evolvedPnlRolling: number;
  promoted: boolean;
}

export interface SafetyStatus {
  maxAllocCap: number;
  learningRate: number;
  decayFactor: number;
  blacklistedAssets: string[];
  rollbackTriggered: boolean;
  diversificationCount: number;
  rollingPnl5: number;
}

// ─── Advanced Metrics ────────────────────────────────

export interface AdvancedMetrics {
  sharpeRatio: number;
  sortinoRatio: number;
  kellyFraction: number;
  profitEntropy: number;        // distribution entropy — higher = more diversified returns
  maxConsecutiveLosses: number;
  maxConsecutiveWins: number;
  expectancy: number;           // avg win * winRate - avg loss * lossRate
  profitFactor: number;         // gross profits / gross losses
  avgWin: number;
  avgLoss: number;
  payoffRatio: number;          // avg win / avg loss
  tailRatio: number;            // 95th / 5th percentile ratio
  regimeAlpha: Record<string, number>; // alpha per regime
  momentumDecay: number;        // correlation of momentum feature with PnL over time
  featureImportance: { feature: string; importance: number; correlation: number }[];
  heatmapGrid: { x: number; y: number; z: number; asset: string; regime: string }[];
}

// ─── Constants ───────────────────────────────────────

const LAMBDA = 0.03;
const MAX_ALLOC_PER_ASSET = 0.25;
const ALPHA_MIN = 0.05;
const ALPHA_MAX = 0.15;
const DAILY_DECAY = 0.97;
const DRAWDOWN_LIMIT = -15;
const ROLLBACK_THRESHOLD = -8;
const TOP_PERCENTILE = 0.20;
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
function stdDev(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}
function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function pearsonCorr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

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
    setEntries(prev => [entry, ...prev].slice(0, MAX_ENTRIES));
    setUpdateCounter(prev => prev + 1);
  }, [setEntries, setUpdateCounter]);

  // ─── Compute Profit Field ─────────────────────────

  const profitField = useMemo((): AssetScore[] => {
    const assetMap: Record<string, { scores: number[]; wins: number; count: number; recentScores: number[] }> = {};
    for (const e of entries) {
      const w = expWeight(e.timestamp);
      const pnlRank = [...entries].sort((a, b) => b.pnlPct - a.pnlPct);
      const topCutoff = pnlRank[Math.floor(pnlRank.length * TOP_PERCENTILE)]?.pnlPct ?? 0;
      const amplifier = e.pnlPct >= topCutoff && e.pnlPct > 0 ? 2.0 : 1.0;
      if (!assetMap[e.asset]) assetMap[e.asset] = { scores: [], wins: 0, count: 0, recentScores: [] };
      assetMap[e.asset].scores.push(e.pnlPct * w * amplifier);
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
        asset, weightedProfitScore: wps, tradeCount: data.count, winRate: wr,
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
    const regimeGroups: Record<string, ProfitFieldEntry[]> = {};
    for (const e of entries) {
      const regime = e.features.regime || "unknown";
      if (!regimeGroups[regime]) regimeGroups[regime] = [];
      regimeGroups[regime].push(e);
    }
    const zones: DesirableZone[] = [];
    for (const [regime, group] of Object.entries(regimeGroups)) {
      const sorted = [...group].sort((a, b) => b.pnlPct - a.pnlPct);
      const topN = Math.max(1, Math.floor(sorted.length * TOP_PERCENTILE));
      const topTrades = sorted.slice(0, topN).filter(t => t.pnlPct > 0);
      if (topTrades.length === 0) continue;
      const assets = [...new Set(topTrades.map(t => t.asset))];
      zones.push({
        id: `zone-${regime}-${assets.slice(0, 3).join("-")}`,
        assets, regime,
        avgPnlPct: mean(topTrades.map(t => t.pnlPct)),
        tradeCount: topTrades.length,
        density: mean(topTrades.map(t => t.pnlPct)) / Math.max(1, topTrades.length),
        featureSignature: {
          momentum: mean(topTrades.map(t => t.features.momentum)),
          vol: mean(topTrades.map(t => t.features.vol)),
          sentiment: mean(topTrades.map(t => t.features.sentiment)),
        },
      });
    }
    return zones.sort((a, b) => b.avgPnlPct - a.avgPnlPct);
  }, [entries]);

  // ─── Combination Scores ────────────────────────────

  const combinationScores = useMemo((): PairScore[] => {
    if (entries.length < 10) return [];
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
        pair, synergyScore: mean(data.pnls) * Math.sqrt(data.pnls.length),
        jointWinRate: (data.wins / data.pnls.length) * 100,
        jointAvgPnl: mean(data.pnls), tradeCount: data.pnls.length,
      }))
      .sort((a, b) => b.synergyScore - a.synergyScore)
      .slice(0, 20);
  }, [entries]);

  // ─── Advanced Metrics ─────────────────────────────

  const advancedMetrics = useMemo((): AdvancedMetrics => {
    const pnls = entries.map(e => e.pnlPct);
    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p <= 0);
    const avgW = mean(wins);
    const avgL = mean(losses);
    const wr = pnls.length > 0 ? wins.length / pnls.length : 0;
    const lr = 1 - wr;

    // Sharpe (annualized assuming daily)
    const avgReturn = mean(pnls);
    const sd = stdDev(pnls);
    const sharpe = sd > 0 ? (avgReturn / sd) * Math.sqrt(252) : 0;

    // Sortino (downside deviation only)
    const downside = pnls.filter(p => p < 0);
    const downsideDev = stdDev(downside.length > 0 ? downside : [0]);
    const sortino = downsideDev > 0 ? (avgReturn / downsideDev) * Math.sqrt(252) : 0;

    // Kelly fraction
    const kelly = avgL !== 0 ? wr - (lr / (avgW / Math.abs(avgL) || 1)) : 0;

    // Profit factor
    const grossWins = wins.reduce((s, v) => s + v, 0);
    const grossLosses = Math.abs(losses.reduce((s, v) => s + v, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0;

    // Expectancy
    const expectancy = avgW * wr + avgL * lr;

    // Payoff ratio
    const payoffRatio = Math.abs(avgL) > 0 ? avgW / Math.abs(avgL) : avgW > 0 ? Infinity : 0;

    // Tail ratio
    const sortedPnls = [...pnls].sort((a, b) => a - b);
    const p95 = percentile(sortedPnls, 0.95);
    const p5 = percentile(sortedPnls, 0.05);
    const tailRatio = Math.abs(p5) > 0 ? Math.abs(p95 / p5) : 0;

    // Max consecutive
    let maxConsW = 0, maxConsL = 0, curW = 0, curL = 0;
    for (const p of pnls) {
      if (p > 0) { curW++; curL = 0; maxConsW = Math.max(maxConsW, curW); }
      else { curL++; curW = 0; maxConsL = Math.max(maxConsL, curL); }
    }

    // Profit entropy (Shannon entropy of bucketed returns)
    const buckets = new Map<number, number>();
    for (const p of pnls) {
      const b = Math.round(p); // 1% buckets
      buckets.set(b, (buckets.get(b) || 0) + 1);
    }
    let entropy = 0;
    for (const count of buckets.values()) {
      const prob = count / pnls.length;
      if (prob > 0) entropy -= prob * Math.log2(prob);
    }

    // Regime alpha
    const regimeGroups: Record<string, number[]> = {};
    for (const e of entries) {
      const r = e.features.regime || "unknown";
      if (!regimeGroups[r]) regimeGroups[r] = [];
      regimeGroups[r].push(e.pnlPct);
    }
    const regimeAlpha: Record<string, number> = {};
    for (const [r, ps] of Object.entries(regimeGroups)) {
      regimeAlpha[r] = mean(ps) - avgReturn; // alpha vs portfolio avg
    }

    // Momentum decay correlation
    const momValues = entries.map(e => e.features.momentum);
    const momentumDecay = pearsonCorr(momValues, pnls);

    // Feature importance via correlation magnitude
    const volValues = entries.map(e => e.features.vol);
    const sentValues = entries.map(e => e.features.sentiment);
    const momCorr = pearsonCorr(momValues, pnls);
    const volCorr = pearsonCorr(volValues, pnls);
    const sentCorr = pearsonCorr(sentValues, pnls);
    const totalCorr = Math.abs(momCorr) + Math.abs(volCorr) + Math.abs(sentCorr) || 1;
    const featureImportance = [
      { feature: "Momentum", importance: Math.abs(momCorr) / totalCorr * 100, correlation: momCorr },
      { feature: "Volatility", importance: Math.abs(volCorr) / totalCorr * 100, correlation: volCorr },
      { feature: "Sentiment", importance: Math.abs(sentCorr) / totalCorr * 100, correlation: sentCorr },
    ];

    // 3D Heatmap grid: x=momentum, y=vol, z=pnl, colored by regime
    const heatmapGrid = entries.map(e => ({
      x: clamp(e.features.momentum, -100, 100),
      y: clamp(e.features.vol, 0, 100),
      z: clamp(e.pnlPct, -30, 30),
      asset: e.asset,
      regime: e.features.regime || "unknown",
    }));

    return {
      sharpeRatio: isFinite(sharpe) ? sharpe : 0,
      sortinoRatio: isFinite(sortino) ? sortino : 0,
      kellyFraction: isFinite(kelly) ? clamp(kelly, -1, 1) : 0,
      profitEntropy: entropy,
      maxConsecutiveLosses: maxConsL,
      maxConsecutiveWins: maxConsW,
      expectancy: isFinite(expectancy) ? expectancy : 0,
      profitFactor: isFinite(profitFactor) ? profitFactor : 0,
      avgWin: avgW,
      avgLoss: avgL,
      payoffRatio: isFinite(payoffRatio) ? payoffRatio : 0,
      tailRatio: isFinite(tailRatio) ? tailRatio : 0,
      regimeAlpha,
      momentumDecay,
      featureImportance,
      heatmapGrid,
    };
  }, [entries]);

  // ─── Compute & Apply Gradient ──────────────────────

  const computeAndApplyGradient = useCallback(() => {
    if (entries.length < 5) return;
    const recentPnls = entries.slice(0, 20).map(e => e.pnlPct);
    const pnlStd = Math.sqrt(mean(recentPnls.map(p => p * p)) - mean(recentPnls) ** 2) || 1;
    const alpha = clamp(ALPHA_MAX / (1 + pnlStd * 0.05), ALPHA_MIN, ALPHA_MAX);

    const rolling5 = mean(entries.slice(0, 5).map(e => e.pnlPct));
    if (rolling5 < ROLLBACK_THRESHOLD) {
      setRollbackTriggered(true);
      setGradient(prev => ({
        ...prev,
        assetBiases: Object.fromEntries(Object.entries(prev.assetBiases).map(([k, v]) => [k, clamp(v * 0.8 + 0.2, MIN_BIAS, MAX_BIAS)])),
        allocationScales: Object.fromEntries(Object.entries(prev.allocationScales).map(([k, v]) => [k, clamp(v * 0.8 + 0.2, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE)])),
        timestamp: Date.now(),
        generation: prev.generation + 1,
      }));
      return;
    }
    setRollbackTriggered(false);

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
    for (const key of Object.keys(newAssetBiases)) {
      newAssetBiases[key] = clamp(1.0 + (newAssetBiases[key] - 1.0) * DAILY_DECAY, MIN_BIAS, MAX_BIAS);
    }

    const winners = entries.filter(e => e.pnlPct > 0);
    const losers = entries.filter(e => e.pnlPct <= 0);
    const prevWeights = gradient.featureWeights;
    const newFeatureWeights: FeatureWeight[] = [
      { feature: "momentum", weight: clamp(1.0 + alpha * (mean(winners.map(e => Math.abs(e.features.momentum))) - mean(losers.map(e => Math.abs(e.features.momentum)))) * 0.01, 0.3, 3.0), delta: 0 },
      { feature: "vol", weight: clamp(1.0 + alpha * (mean(losers.map(e => e.features.vol)) - mean(winners.map(e => e.features.vol))) * 0.01, 0.3, 3.0), delta: 0 },
      { feature: "sentiment", weight: clamp(1.0 + alpha * (mean(winners.map(e => e.features.sentiment)) - mean(losers.map(e => e.features.sentiment))) * 0.01, 0.3, 3.0), delta: 0 },
    ];
    for (const fw of newFeatureWeights) {
      const prev = prevWeights.find(p => p.feature === fw.feature);
      fw.delta = prev ? fw.weight - prev.weight : 0;
    }

    const newAllocScales: Record<string, number> = { ...gradient.allocationScales };
    for (const hot of hotAssets) {
      newAllocScales[hot.asset] = clamp((newAllocScales[hot.asset] || 1.0) + alpha * 0.15, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE);
    }
    for (const cold of coldAssets) {
      newAllocScales[cold.asset] = clamp((newAllocScales[cold.asset] || 1.0) - alpha * 0.1, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE);
    }

    const newBlacklist: string[] = [...blacklist];
    for (const asset of profitField) {
      const recentTrades = entries.filter(e => e.asset === asset.asset).slice(0, 10);
      const worstPnl = Math.min(...recentTrades.map(e => e.pnlPct), 0);
      if (worstPnl < DRAWDOWN_LIMIT && !newBlacklist.includes(asset.asset)) {
        newBlacklist.push(asset.asset);
      }
    }
    setBlacklist(newBlacklist.filter(a => {
      const lastTrade = entries.find(e => e.asset === a);
      return lastTrade ? daysSince(lastTrade.timestamp) < 30 : false;
    }));

    setGradient({
      assetBiases: newAssetBiases, featureWeights: newFeatureWeights,
      allocationScales: newAllocScales, timestamp: Date.now(),
      generation: gradient.generation + 1,
    });
  }, [entries, profitField, gradient, blacklist, setGradient, setBlacklist]);

  const shouldAutoUpdate = updateCounter > 0 && updateCounter % UPDATE_EVERY_N === 0;

  const getAssetBoost = useCallback((ticker: string) => {
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

  const safetyStatus = useMemo((): SafetyStatus => {
    const recentPnls = entries.slice(0, 20).map(e => e.pnlPct);
    const pnlStd = Math.sqrt(mean(recentPnls.map(p => p * p)) - mean(recentPnls) ** 2) || 1;
    const alpha = clamp(ALPHA_MAX / (1 + pnlStd * 0.05), ALPHA_MIN, ALPHA_MAX);
    const rolling5 = mean(entries.slice(0, 5).map(e => e.pnlPct));
    return {
      maxAllocCap: MAX_ALLOC_PER_ASSET * 100, learningRate: alpha,
      decayFactor: DAILY_DECAY, blacklistedAssets: blacklist,
      rollbackTriggered, diversificationCount: profitField.filter(a => a.isHotZone).length,
      rollingPnl5: rolling5,
    };
  }, [entries, profitField, blacklist, rollbackTriggered]);

  const shadowComparison = useMemo((): ShadowState => {
    const neutral: GradientVector = {
      assetBiases: {},
      featureWeights: [
        { feature: "momentum", weight: 1.0, delta: 0 },
        { feature: "vol", weight: 1.0, delta: 0 },
        { feature: "sentiment", weight: 1.0, delta: 0 },
      ],
      allocationScales: {}, timestamp: Date.now(), generation: 0,
    };
    const recentTrades = entries.slice(0, 50);
    const activePnl = mean(recentTrades.map(e => e.pnlPct));
    const evolvedPnl = mean(recentTrades.map(e => e.pnlPct * (gradient.assetBiases[e.asset] || 1.0)));
    return {
      activeParams: neutral, evolvedParams: gradient,
      activePnlRolling: activePnl, evolvedPnlRolling: evolvedPnl,
      promoted: evolvedPnl > activePnl * 1.05,
    };
  }, [entries, gradient]);

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
    if (entries.length === 0) return [];
    const signals: IntelligenceSignal[] = [];
    const topAssets = profitField.filter(a => !a.isBlacklisted).slice(0, 5);
    const lastTrade = entries[0];

    if (lastTrade) {
      signals.push({
        id: `last-${lastTrade.id}`,
        type: lastTrade.pnlPct >= 0 ? "invest" : "hedge",
        urgency: Math.abs(lastTrade.pnlPct) >= 5 ? "high" : "medium",
        title: lastTrade.pnlPct >= 0
          ? `Invest bias toward ${lastTrade.asset} after +${lastTrade.pnlPct.toFixed(2)}% outcome`
          : `Hedge ${lastTrade.asset} after ${lastTrade.pnlPct.toFixed(2)}% adverse outcome`,
        reasoning: lastTrade.pnlPct >= 0
          ? `${lastTrade.asset} just closed positive; ODGS is pulling exposure toward this zone.`
          : `${lastTrade.asset} closed negative; ODGS suggests tighter entry and protective hedge.`,
        assets: [lastTrade.asset],
        confidence: Math.min(85, Math.max(55, Math.round(55 + Math.abs(lastTrade.pnlPct) * 4))),
      });
    }

    for (const asset of topAssets.filter(a => a.weightedProfitScore > 0 && a.tradeCount >= 1)) {
      const zone = desirableZones.find(z => z.assets.includes(asset.asset));
      signals.push({
        id: `invest-${asset.asset}`, type: "invest",
        urgency: asset.avgPnlPct > 4 ? "high" : "medium",
        title: `Invest more in ${asset.asset} (${asset.winRate.toFixed(0)}% win rate)`,
        reasoning: `${asset.asset} shows positive profit density with avg ${asset.avgPnlPct >= 0 ? "+" : ""}${asset.avgPnlPct.toFixed(1)}% across ${asset.tradeCount} trades.` +
          (zone ? ` Correlated success in ${zone.regime} regime.` : ""),
        assets: [asset.asset],
        confidence: Math.min(92, Math.round(asset.winRate * 0.75 + asset.tradeCount * 4)),
      });
    }

    for (const pair of combinationScores.filter(p => p.synergyScore > 0 && p.tradeCount >= 1).slice(0, 3)) {
      const [a, b] = pair.pair.split("+");
      signals.push({
        id: `pair-${pair.pair}`, type: "pair", urgency: pair.jointAvgPnl > 2 ? "high" : "medium",
        title: `Correlation opportunity: ${a} + ${b}`,
        reasoning: `${a}/${b} shows positive joint edge (synergy ${pair.synergyScore.toFixed(2)}, win ${pair.jointWinRate.toFixed(0)}%).`,
        assets: [a, b],
        confidence: Math.min(88, Math.round(pair.jointWinRate * 0.8 + pair.tradeCount * 5)),
      });
    }

    const volWeight = gradient.featureWeights.find(f => f.feature === "vol")?.weight || 1;
    for (const asset of profitField.filter(a => !a.isBlacklisted && (a.avgPnlPct < 0 || a.recentTrend === "falling") && a.tradeCount >= 1).slice(0, 2)) {
      const hedgePair = combinationScores.find(p => p.pair.includes(asset.asset) && p.synergyScore > 0);
      const hedgeTarget = hedgePair ? hedgePair.pair.split("+").find(x => x !== asset.asset) : null;
      signals.push({
        id: `hedge-${asset.asset}`, type: "hedge",
        urgency: asset.avgPnlPct < -3 || volWeight > 1.2 ? "high" : "medium",
        title: `Hedge ${asset.asset}${hedgeTarget ? ` with ${hedgeTarget}` : ""}`,
        reasoning: `${asset.asset} shows weaker edge (${asset.avgPnlPct.toFixed(1)}% avg).` +
          (hedgeTarget ? ` Use correlation hedge via ${hedgeTarget}.` : ` Reduce size until trend improves.`),
        assets: hedgeTarget ? [asset.asset, hedgeTarget] : [asset.asset],
        confidence: Math.min(84, Math.round(58 + Math.max(0, -asset.avgPnlPct) * 4)),
      });
    }

    for (const asset of profitField.filter(a => a.isBlacklisted || (a.winRate < 35 && a.tradeCount >= 2)).slice(0, 3)) {
      signals.push({
        id: `avoid-${asset.asset}`, type: "avoid",
        urgency: asset.isBlacklisted ? "high" : "medium",
        title: `Avoid ${asset.asset}${asset.isBlacklisted ? " (risk blocked)" : ""}`,
        reasoning: `${asset.asset} underperforms with ${asset.winRate.toFixed(0)}% win rate.` +
          (asset.isBlacklisted ? " Drawdown guard triggered." : " ODGS is reducing selection probability."),
        assets: [asset.asset],
        confidence: Math.min(90, Math.round(65 + Math.max(0, 50 - asset.winRate) * 0.6)),
      });
    }

    for (const zone of desirableZones.filter(z => z.avgPnlPct > 0 && z.tradeCount >= 1).slice(0, 2)) {
      signals.push({
        id: `rotate-${zone.id}`,
        type: shadowComparison.promoted ? "scale_up" : "rotate",
        urgency: zone.avgPnlPct > 4 ? "high" : "low",
        title: shadowComparison.promoted ? `Scale up ${zone.regime} zone` : `Rotate into ${zone.regime} zone`,
        reasoning: `${zone.regime} zone producing +${zone.avgPnlPct.toFixed(1)}% avg across ${zone.tradeCount} trades.`,
        assets: zone.assets.slice(0, 5),
        confidence: Math.min(86, Math.round(zone.avgPnlPct * 7 + zone.tradeCount * 4)),
      });
    }

    if (signals.length === 0 && topAssets.length > 0) {
      const fb = topAssets[0];
      signals.push({
        id: `fallback-${fb.asset}`,
        type: fb.weightedProfitScore >= 0 ? "invest" : "hedge",
        urgency: "medium",
        title: fb.weightedProfitScore >= 0 ? `Starter: build exposure in ${fb.asset}` : `Starter: hedge ${fb.asset}`,
        reasoning: `ODGS has limited history but ${fb.asset} is the strongest node in the Profit Field.`,
        assets: [fb.asset], confidence: 58,
      });
    }

    return signals.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.urgency] - { high: 0, medium: 1, low: 2 }[b.urgency]) || b.confidence - a.confidence).slice(0, 12);
  }, [entries, profitField, desirableZones, combinationScores, gradient, shadowComparison]);

  const clearAll = useCallback(() => {
    setEntries([]);
    setGradient({
      assetBiases: {},
      featureWeights: [
        { feature: "momentum", weight: 1.0, delta: 0 },
        { feature: "vol", weight: 1.0, delta: 0 },
        { feature: "sentiment", weight: 1.0, delta: 0 },
      ],
      allocationScales: {}, timestamp: Date.now(), generation: 0,
    });
    setBlacklist([]);
    setUpdateCounter(0);
  }, [setEntries, setGradient, setBlacklist, setUpdateCounter]);

  return {
    entries, profitField, desirableZones, combinationScores,
    gradient, safetyStatus, shadowComparison, allocationHistory,
    intelligenceSignals, advancedMetrics,
    ingestTrade, computeAndApplyGradient, getAssetBoost, clearAll,
    shouldAutoUpdate, totalTrades: entries.length, generation: gradient.generation,
  };
}
