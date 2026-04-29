import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useLocalStorage } from "./useLocalStorage";
import { supabase } from "@/integrations/supabase/client";
import {
  validateTrade,
  classifyFailure,
  bucketsFor,
  type ScarRecord,
  type ValidationResult,
  type SignalKind,
} from "@/lib/odg-validator";

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
  duration: number; // hours
  timestamp: number;
  source?: string;
}

export interface AssetScore {
  asset: string;
  weightedProfitScore: number;
  tradeCount: number;
  winRate: number;
  avgPnlPct: number;
  recentTrend: "rising" | "falling" | "stable";
  isHotZone: boolean;
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
  validation?: ValidationResult;
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
  rollbackTriggered: boolean;
  diversificationCount: number;
  rollingPnl5: number;
}

// ─── Constants ───────────────────────────────────────

const LAMBDA = 0.03;
const MAX_ALLOC_PER_ASSET = 0.25;
const ALPHA_MIN = 0.05;
const ALPHA_MAX = 0.15;
const DAILY_DECAY = 0.97;
const ROLLBACK_THRESHOLD = -8;
const TOP_PERCENTILE = 0.20;
const MAX_ENTRIES = 500;
const UPDATE_EVERY_N = 25;
const MAX_BIAS = 2.0;
const MIN_BIAS = 0.5;
const MAX_ALLOC_SCALE = 1.5;
const MIN_ALLOC_SCALE = 0.7;

const DEFAULT_GRADIENT: GradientVector = {
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

// ─── Helpers ─────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function daysSince(ts: number) { return Math.max(0, (Date.now() - ts) / 86_400_000); }
function expWeight(ts: number) { return Math.exp(-LAMBDA * daysSince(ts)); }
function mean(arr: number[]) { return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length; }

function rowToEntry(r: any): ProfitFieldEntry {
  return {
    id: r.id,
    asset: r.asset,
    assetClass: r.asset_class || "equity",
    features: {
      momentum: Number(r.feature_momentum) || 0,
      vol: Number(r.feature_vol) || 0,
      sentiment: Number(r.feature_sentiment) || 0,
      regime: r.feature_regime || "unknown",
    },
    pnlPct: Number(r.pnl_pct) || 0,
    returnAbs: Number(r.return_abs) || 0,
    duration: Number(r.duration_hours) || 0,
    timestamp: Number(r.trade_timestamp) || Date.now(),
    source: r.source || "manual",
  };
}

// ─── Core Hook ───────────────────────────────────────

export function useOutcomeGradient() {
  // localStorage cache for instant render + offline/anon fallback
  const [entries, setEntries] = useLocalStorage<ProfitFieldEntry[]>("odgs-entries", []);
  const [gradient, setGradient] = useLocalStorage<GradientVector>("odgs-gradient", DEFAULT_GRADIENT);
  const [rollbackTriggered, setRollbackTriggered] = useState(false);
  const [updateCounter, setUpdateCounter] = useLocalStorage<number>("odgs-update-counter", 0);
  const [userId, setUserId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [scarMemory, setScarMemory] = useLocalStorage<ScarRecord[]>("odgs-scar-memory", []);
  const recentLocalIds = useRef<Set<string>>(new Set());

  // ─── Auth + Cloud Hydration ────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) { setHydrated(true); return; }

      // Pull ledger
      const { data: ledger } = await supabase
        .from("odgs_trade_ledger")
        .select("*")
        .order("trade_timestamp", { ascending: false })
        .limit(MAX_ENTRIES);
      if (!cancelled && ledger) {
        setEntries(ledger.map(rowToEntry));
      }

      // Pull gradient state
      const { data: g } = await supabase
        .from("odgs_gradient_state")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      if (!cancelled && g) {
        setGradient({
          assetBiases: (g.asset_biases as any) || {},
          featureWeights: ((g.feature_weights as any) && (g.feature_weights as any).length)
            ? (g.feature_weights as any) as FeatureWeight[]
            : DEFAULT_GRADIENT.featureWeights,
          allocationScales: (g.allocation_scales as any) || {},
          timestamp: new Date(g.updated_at).getTime(),
          generation: g.generation || 0,
        });
      }
      if (!cancelled) setHydrated(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Ingest Trade (cloud + local) ──────────────────

  const ingestTrade = useCallback(async (trade: Omit<ProfitFieldEntry, "id">) => {
    const id = crypto.randomUUID();
    const entry: ProfitFieldEntry = { ...trade, id };
    recentLocalIds.current.add(id);

    setEntries(prev => [entry, ...prev].slice(0, MAX_ENTRIES));
    setUpdateCounter(prev => prev + 1);

    if (userId) {
      const { error } = await supabase.from("odgs_trade_ledger").insert({
        id,
        user_id: userId,
        asset: trade.asset,
        asset_class: trade.assetClass,
        pnl_pct: trade.pnlPct,
        return_abs: trade.returnAbs,
        duration_hours: trade.duration,
        feature_momentum: trade.features.momentum,
        feature_vol: trade.features.vol,
        feature_sentiment: trade.features.sentiment,
        feature_regime: trade.features.regime,
        source: trade.source || "manual",
        trade_timestamp: trade.timestamp,
      });
      if (error) console.warn("ODGS ledger persist failed:", error.message);
    }
  }, [userId, setEntries, setUpdateCounter]);

  // ─── Persist gradient state to cloud ───────────────
  const persistGradient = useCallback(async (g: GradientVector) => {
    if (!userId) return;
    const { error } = await supabase.from("odgs_gradient_state").upsert([{
      user_id: userId,
      asset_biases: g.assetBiases as any,
      feature_weights: g.featureWeights as any,
      allocation_scales: g.allocationScales as any,
      generation: g.generation,
      updated_at: new Date().toISOString(),
    }], { onConflict: "user_id" });
    if (error) console.warn("ODGS gradient persist failed:", error.message);
  }, [userId]);

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
        asset,
        weightedProfitScore: wps,
        tradeCount: data.count,
        winRate: wr,
        avgPnlPct: data.count > 0 ? data.scores.reduce((s, v) => s + v, 0) / data.count : 0,
        recentTrend: trend,
        isHotZone: wps > 0 && wr > 50 && data.count >= 3,
      };
    }).sort((a, b) => b.weightedProfitScore - a.weightedProfitScore);
  }, [entries]);

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
      const avgPnl = mean(topTrades.map(t => t.pnlPct));
      zones.push({
        id: `zone-${regime}-${assets.slice(0, 3).join("-")}`,
        assets,
        regime,
        avgPnlPct: avgPnl,
        tradeCount: topTrades.length,
        density: avgPnl / Math.max(1, topTrades.length),
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
    const recentPnls = entries.slice(0, 20).map(e => e.pnlPct);
    const pnlStd = Math.sqrt(mean(recentPnls.map(p => p * p)) - mean(recentPnls) ** 2) || 1;
    const alpha = clamp(ALPHA_MAX / (1 + pnlStd * 0.05), ALPHA_MIN, ALPHA_MAX);
    const rolling5 = mean(entries.slice(0, 5).map(e => e.pnlPct));

    if (rolling5 < ROLLBACK_THRESHOLD) {
      setRollbackTriggered(true);
      const next: GradientVector = {
        ...gradient,
        assetBiases: Object.fromEntries(
          Object.entries(gradient.assetBiases).map(([k, v]) => [k, clamp(v * 0.8 + 0.2, MIN_BIAS, MAX_BIAS)])
        ),
        allocationScales: Object.fromEntries(
          Object.entries(gradient.allocationScales).map(([k, v]) => [k, clamp(v * 0.8 + 0.2, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE)])
        ),
        timestamp: Date.now(),
        generation: gradient.generation + 1,
      };
      setGradient(next);
      void persistGradient(next);
      return;
    }
    setRollbackTriggered(false);

    const hotAssets = profitField.filter(a => a.isHotZone);
    const coldAssets = profitField.filter(a => !a.isHotZone && a.weightedProfitScore < 0);
    const newAssetBiases: Record<string, number> = { ...gradient.assetBiases };
    for (const hot of hotAssets) {
      newAssetBiases[hot.asset] = clamp((newAssetBiases[hot.asset] || 1.0) + alpha * 0.3, MIN_BIAS, MAX_BIAS);
    }
    for (const cold of coldAssets) {
      newAssetBiases[cold.asset] = clamp((newAssetBiases[cold.asset] || 1.0) - alpha * 0.2, MIN_BIAS, MAX_BIAS);
    }
    for (const key of Object.keys(newAssetBiases)) {
      newAssetBiases[key] = clamp(1.0 + (newAssetBiases[key] - 1.0) * DAILY_DECAY, MIN_BIAS, MAX_BIAS);
    }

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

    const newAllocScales: Record<string, number> = { ...gradient.allocationScales };
    for (const hot of hotAssets) {
      newAllocScales[hot.asset] = clamp((newAllocScales[hot.asset] || 1.0) + alpha * 0.15, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE);
    }
    for (const cold of coldAssets) {
      newAllocScales[cold.asset] = clamp((newAllocScales[cold.asset] || 1.0) - alpha * 0.1, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE);
    }

    const next: GradientVector = {
      assetBiases: newAssetBiases,
      featureWeights: newFeatureWeights,
      allocationScales: newAllocScales,
      timestamp: Date.now(),
      generation: gradient.generation + 1,
    };
    setGradient(next);
    void persistGradient(next);
  }, [entries, profitField, gradient, setGradient, persistGradient]);

  // Auto-update gradient + persist after every UPDATE_EVERY_N trades
  useEffect(() => {
    if (!hydrated) return;
    if (updateCounter > 0 && updateCounter % UPDATE_EVERY_N === 0) {
      computeAndApplyGradient();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateCounter, hydrated]);

  const shouldAutoUpdate = updateCounter > 0 && updateCounter % UPDATE_EVERY_N === 0;

  // ─── Get Boost for Asset ───────────────────────────

  const getAssetBoost = useCallback((ticker: string): { scoreMult: number; allocMult: number; isHot: boolean } => {
    const bias = gradient.assetBiases[ticker] || 1.0;
    const allocScale = gradient.allocationScales[ticker] || 1.0;
    const field = profitField.find(a => a.asset === ticker);
    return {
      scoreMult: clamp(bias, 0.7, 1.5),
      allocMult: clamp(allocScale, MIN_ALLOC_SCALE, MAX_ALLOC_SCALE),
      isHot: field?.isHotZone ?? false,
    };
  }, [gradient, profitField]);

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
      rollbackTriggered,
      diversificationCount: hotCount,
      rollingPnl5: rolling5,
    };
  }, [entries, profitField, rollbackTriggered]);

  // ─── Shadow Evolution ──────────────────────────────

  const shadowComparison = useMemo((): ShadowState => {
    const neutral: GradientVector = { ...DEFAULT_GRADIENT };
    const recentTrades = entries.slice(0, 50);
    const activePnl = mean(recentTrades.map(e => e.pnlPct));
    const evolvedPnl = mean(recentTrades.map(e => (gradient.assetBiases[e.asset] || 1.0) * e.pnlPct));
    return {
      activeParams: neutral,
      evolvedParams: gradient,
      activePnlRolling: activePnl,
      evolvedPnlRolling: evolvedPnl,
      promoted: evolvedPnl > activePnl * 1.05,
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
    if (entries.length === 0) return [];
    const signals: IntelligenceSignal[] = [];
    const topAssets = profitField.slice(0, 5);
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
      const allocScale = gradient.allocationScales[asset.asset] || 1.0;
      const zone = desirableZones.find(z => z.assets.includes(asset.asset));
      signals.push({
        id: `invest-${asset.asset}`,
        type: "invest",
        urgency: asset.avgPnlPct > 4 ? "high" : "medium",
        title: `Invest more in ${asset.asset} (${asset.winRate.toFixed(0)}% win rate)`,
        reasoning: `${asset.asset} shows positive profit density with avg ${asset.avgPnlPct >= 0 ? "+" : ""}${asset.avgPnlPct.toFixed(1)}% across ${asset.tradeCount} trades. Allocation bias is ${allocScale.toFixed(2)}×.${zone ? ` Correlated success in ${zone.regime} regime.` : ""}`,
        assets: [asset.asset],
        confidence: Math.min(92, Math.round(asset.winRate * 0.75 + asset.tradeCount * 4)),
      });
    }

    for (const pair of combinationScores.filter(p => p.synergyScore > 0 && p.tradeCount >= 1).slice(0, 3)) {
      const [a, b] = pair.pair.split("+");
      signals.push({
        id: `pair-${pair.pair}`,
        type: "pair",
        urgency: pair.jointAvgPnl > 2 ? "high" : "medium",
        title: `Correlation opportunity: ${a} + ${b}`,
        reasoning: `${a}/${b} shows positive joint edge (synergy ${pair.synergyScore.toFixed(2)}, win ${pair.jointWinRate.toFixed(0)}%).`,
        assets: [a, b],
        confidence: Math.min(88, Math.round(pair.jointWinRate * 0.8 + pair.tradeCount * 5)),
      });
    }

    const volWeight = gradient.featureWeights.find(f => f.feature === "vol")?.weight || 1;
    const weakAssets = profitField.filter(a => (a.avgPnlPct < 0 || a.recentTrend === "falling") && a.tradeCount >= 1).slice(0, 2);
    for (const asset of weakAssets) {
      const hedgePair = combinationScores.find(p => p.pair.includes(asset.asset) && p.synergyScore > 0);
      const hedgeTarget = hedgePair ? hedgePair.pair.split("+").find(x => x !== asset.asset) : null;
      signals.push({
        id: `hedge-${asset.asset}`,
        type: "hedge",
        urgency: asset.avgPnlPct < -3 || volWeight > 1.2 ? "high" : "medium",
        title: `Hedge ${asset.asset}${hedgeTarget ? ` with ${hedgeTarget}` : ""}`,
        reasoning: `${asset.asset} shows weaker edge (${asset.avgPnlPct.toFixed(1)}% avg). ${hedgeTarget ? `Use correlation hedge via ${hedgeTarget}.` : `Use protective structure (smaller size / options hedge) until trend improves.`}`,
        assets: hedgeTarget ? [asset.asset, hedgeTarget] : [asset.asset],
        confidence: Math.min(84, Math.round(58 + Math.max(0, -asset.avgPnlPct) * 4 + (volWeight - 1) * 20)),
      });
    }

    for (const asset of profitField.filter(a => a.winRate < 35 && a.tradeCount >= 2).slice(0, 3)) {
      signals.push({
        id: `avoid-${asset.asset}`,
        type: "avoid",
        urgency: "medium",
        title: `Caution: ${asset.asset} underperforming`,
        reasoning: `${asset.asset} shows weak edge with ${asset.winRate.toFixed(0)}% win rate. ODGS is reducing selection probability.`,
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
        reasoning: `${zone.regime} zone is producing +${zone.avgPnlPct.toFixed(1)}% avg outcomes across ${zone.tradeCount} trades.`,
        assets: zone.assets.slice(0, 5),
        confidence: Math.min(86, Math.round(zone.avgPnlPct * 7 + zone.tradeCount * 4)),
      });
    }

    if (signals.length === 0 && topAssets.length > 0) {
      const fallback = topAssets[0];
      signals.push({
        id: `fallback-${fallback.asset}`,
        type: fallback.weightedProfitScore >= 0 ? "invest" : "hedge",
        urgency: "medium",
        title: fallback.weightedProfitScore >= 0 ? `Starter signal: build exposure in ${fallback.asset}` : `Starter signal: hedge ${fallback.asset}`,
        reasoning: `ODGS has limited history but ${fallback.asset} is currently the strongest observed node.`,
        assets: [fallback.asset],
        confidence: 58,
      });
    }

    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    return signals
      .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.confidence - a.confidence)
      .slice(0, 12);
  }, [entries, profitField, desirableZones, combinationScores, gradient, shadowComparison]);

  // ─── Clear ─────────────────────────────────────────

  const clearAll = useCallback(async () => {
    setEntries([]);
    setGradient(DEFAULT_GRADIENT);
    setUpdateCounter(0);
    if (userId) {
      await supabase.from("odgs_trade_ledger").delete().eq("user_id", userId);
      await supabase.from("odgs_gradient_state").delete().eq("user_id", userId);
    }
  }, [setEntries, setGradient, setUpdateCounter, userId]);

  return {
    entries,
    profitField,
    desirableZones,
    combinationScores,
    gradient,
    safetyStatus,
    shadowComparison,
    allocationHistory,
    intelligenceSignals,
    ingestTrade,
    computeAndApplyGradient,
    getAssetBoost,
    clearAll,
    shouldAutoUpdate,
    totalTrades: entries.length,
    generation: gradient.generation,
    isCloudPersisted: !!userId,
    isHydrated: hydrated,
  };
}
