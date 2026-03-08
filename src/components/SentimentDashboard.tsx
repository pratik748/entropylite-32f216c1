import { useState, useEffect } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Brain, Globe, Newspaper, BarChart3, MessageCircle, Eye, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";

interface SentimentData {
  cnnFearGreed: {
    score: number;
    label: string;
    previousClose: number;
    weekAgo: number;
    monthAgo: number;
    history: { date: string; score: number }[];
  } | null;
  gdeltTone: {
    avgTone: number;
    articleCount: number;
    trendDirection: string;
    toneTrend: { date: string; tone: number }[];
    articles: { title: string; url: string; source: string; tone: number; date: string }[];
  } | null;
  sourceBreakdown: {
    source: string;
    tier: number;
    positive: number;
    negative: number;
    neutral: number;
    count: number;
    score: number;
  }[];
  redditSentiment: {
    retailScore: number;
    mood: string;
    totalBullish: number;
    totalBearish: number;
    subreddits: { subreddit: string; bullishCount: number; bearishCount: number; totalPosts: number; avgUpvoteRatio: number }[];
    topPosts: { title: string; score: number; upvoteRatio: number; comments: number; url: string }[];
  } | null;
  wikiAttention: {
    article: string;
    recentAvgViews: number;
    historicAvgViews: number;
    spikeRatio: number;
    isSpike: boolean;
    attentionScore: number;
    trend: { date: string; views: number }[];
  } | null;
  macroSignals: {
    vix: number;
    vixChange: number;
    vixSentiment: number;
    vixLabel: string;
    shortYield: number;
    macroScore: number;
  } | null;
  compositeScore: number;
  trend: "improving" | "deteriorating" | "stable";
  signalCount: number;
}

interface Props {
  ticker?: string;
  compact?: boolean;
}

// Fear & Greed Gauge
const FearGreedGauge = ({ score, label }: { score: number; label: string }) => {
  const size = 160;
  const radius = (size - 20) / 2;
  const cx = size / 2;
  const cy = size / 2 + 12;
  const sweepAngle = Math.PI - (score / 100) * Math.PI;
  const endX = cx + radius * Math.cos(sweepAngle);
  const endY = cy - radius * Math.sin(sweepAngle);
  const color = score <= 25 ? "hsl(var(--loss))" : score <= 45 ? "hsl(var(--warning))" : score <= 55 ? "hsl(var(--muted-foreground))" : score <= 75 ? "hsl(var(--gain))" : "hsl(120, 80%, 45%)";

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 24} viewBox={`0 0 ${size} ${size / 2 + 24}`}>
        <path d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`} fill="none" stroke="hsl(var(--border))" strokeWidth={10} strokeLinecap="round" />
        {[
          { start: 0, end: 0.25, color: "hsl(var(--loss))" },
          { start: 0.25, end: 0.45, color: "hsl(var(--warning))" },
          { start: 0.45, end: 0.55, color: "hsl(var(--muted-foreground))" },
          { start: 0.55, end: 0.75, color: "hsl(var(--gain))" },
          { start: 0.75, end: 1, color: "hsl(120, 80%, 45%)" },
        ].map((zone, i) => {
          const s = Math.PI - zone.start * Math.PI;
          const e = Math.PI - zone.end * Math.PI;
          return (
            <path key={i} d={`M ${cx + (radius - 12) * Math.cos(s)} ${cy - (radius - 12) * Math.sin(s)} A ${radius - 12} ${radius - 12} 0 0 1 ${cx + (radius - 12) * Math.cos(e)} ${cy - (radius - 12) * Math.sin(e)}`} fill="none" stroke={zone.color} strokeWidth={3} opacity={0.3} />
          );
        })}
        {score > 0 && <line x1={cx} y1={cy} x2={endX} y2={endY} stroke={color} strokeWidth={2.5} strokeLinecap="round" className="transition-all duration-700" />}
        <circle cx={cx} cy={cy} r={4} fill={color} className="transition-all duration-700" />
        <text x={cx} y={cy - 12} textAnchor="middle" className="fill-foreground font-mono text-xl font-black">{score}</text>
        <text x={cx} y={cy + 6} textAnchor="middle" className="fill-muted-foreground text-[8px] uppercase tracking-wider font-mono">{label}</text>
        <text x={cx - radius + 4} y={cy + 16} textAnchor="start" className="fill-loss text-[7px] font-mono">Fear</text>
        <text x={cx + radius - 4} y={cy + 16} textAnchor="end" className="fill-gain text-[7px] font-mono">Greed</text>
      </svg>
    </div>
  );
};

const CompositeScore = ({ score, trend, signalCount }: { score: number; trend: string; signalCount: number }) => {
  const TrendIcon = trend === "improving" ? TrendingUp : trend === "deteriorating" ? TrendingDown : Minus;
  const trendColor = trend === "improving" ? "text-gain" : trend === "deteriorating" ? "text-loss" : "text-muted-foreground";
  const scoreColor = score > 20 ? "text-gain" : score < -20 ? "text-loss" : "text-warning";

  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-lg border border-border bg-surface-2">
      <div className="flex items-center gap-1">
        <Brain className="h-3.5 w-3.5 text-primary" />
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Composite</span>
        <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5">{signalCount} signals</Badge>
      </div>
      <span className={`text-2xl font-black font-mono ${scoreColor}`}>{score > 0 ? "+" : ""}{score}</span>
      <div className={`flex items-center gap-1 ${trendColor}`}>
        <TrendIcon className="h-3 w-3" />
        <span className="text-[9px] font-mono capitalize">{trend}</span>
      </div>
    </div>
  );
};

const SourceBar = ({ source }: { source: SentimentData["sourceBreakdown"][0] }) => {
  const total = source.count || 1;
  const posW = (source.positive / total) * 100;
  const negW = (source.negative / total) * 100;
  const neutW = 100 - posW - negW;
  const tierLabel = source.tier === 1 ? "T1" : source.tier === 2 ? "T2" : source.tier === 3 ? "T3" : "T4";
  const tierColor = source.tier === 1 ? "bg-primary text-primary-foreground" : source.tier === 2 ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground";

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono">
      <Badge className={`${tierColor} text-[7px] px-1 py-0 h-3.5 rounded`}>{tierLabel}</Badge>
      <span className="w-20 truncate text-foreground">{source.source}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-3 overflow-hidden flex">
        {posW > 0 && <div className="bg-gain h-full transition-all" style={{ width: `${posW}%` }} />}
        {neutW > 0 && <div className="bg-muted-foreground/30 h-full transition-all" style={{ width: `${neutW}%` }} />}
        {negW > 0 && <div className="bg-loss h-full transition-all" style={{ width: `${negW}%` }} />}
      </div>
      <span className="w-6 text-right text-muted-foreground">{source.count}</span>
    </div>
  );
};

// Reddit Sentiment Card
const RedditCard = ({ reddit }: { reddit: NonNullable<SentimentData["redditSentiment"]> }) => {
  const moodColor = reddit.retailScore > 20 ? "text-gain" : reddit.retailScore < -20 ? "text-loss" : "text-warning";
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <MessageCircle className="h-3 w-3 text-orange-500" />
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Reddit Retail Pulse</span>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-lg font-black font-mono ${moodColor}`}>{reddit.retailScore > 0 ? "+" : ""}{reddit.retailScore}</span>
        <Badge variant="outline" className={`text-[8px] ${moodColor}`}>{reddit.mood}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[9px] font-mono text-muted-foreground mb-2">
        <div>🐂 Bullish: <span className="text-gain">{reddit.totalBullish}</span></div>
        <div>🐻 Bearish: <span className="text-loss">{reddit.totalBearish}</span></div>
      </div>
      {reddit.subreddits.map((sub, i) => (
        <div key={i} className="flex items-center justify-between text-[8px] font-mono text-muted-foreground border-t border-border/50 pt-1 mt-1">
          <span>r/{sub.subreddit}</span>
          <div className="flex items-center gap-2">
            <span className="text-gain">{sub.bullishCount}↑</span>
            <span className="text-loss">{sub.bearishCount}↓</span>
            <span>{sub.totalPosts} posts</span>
          </div>
        </div>
      ))}
      {reddit.topPosts.length > 0 && (
        <div className="mt-2 space-y-1 max-h-[100px] overflow-y-auto">
          {reddit.topPosts.slice(0, 3).map((p, i) => (
            <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="block text-[8px] font-mono text-foreground/80 hover:text-primary truncate">
              ↗ {p.title} <span className="text-muted-foreground">({p.score}⇡ {p.comments}💬)</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// Macro Signals Card
const MacroCard = ({ macro }: { macro: NonNullable<SentimentData["macroSignals"]> }) => {
  const vixColor = macro.vix > 30 ? "text-loss" : macro.vix > 20 ? "text-warning" : "text-gain";
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Zap className="h-3 w-3 text-primary" />
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Macro Fear Signals</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground">VIX</span>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-black font-mono ${vixColor}`}>{macro.vix}</span>
            <span className={`text-[9px] font-mono ${macro.vixChange > 0 ? "text-loss" : "text-gain"}`}>
              {macro.vixChange > 0 ? "+" : ""}{macro.vixChange.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-muted-foreground">Regime</span>
          <Badge variant="outline" className={`text-[8px] ${vixColor}`}>{macro.vixLabel}</Badge>
        </div>
        <div className="h-2 rounded-full bg-surface-3 overflow-hidden relative">
          <div className="absolute inset-0 rounded-full" style={{
            background: "linear-gradient(to right, hsl(var(--gain)), hsl(var(--warning)) 40%, hsl(var(--loss)) 75%)"
          }} />
          <div className="absolute top-0 h-full w-1 bg-foreground rounded-full transition-all duration-500 shadow-lg"
            style={{ left: `${Math.min((macro.vix / 50) * 100, 98)}%` }}
          />
        </div>
        <div className="flex justify-between text-[7px] font-mono text-muted-foreground">
          <span>10</span><span>20</span><span>30</span><span>40</span><span>50</span>
        </div>
      </div>
    </div>
  );
};

// Wikipedia Attention Badge
const WikiAttention = ({ wiki }: { wiki: NonNullable<SentimentData["wikiAttention"]> }) => {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Eye className="h-3 w-3 text-blue-400" />
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Wikipedia Attention</span>
        {wiki.isSpike && <Badge className="bg-warning text-warning-foreground text-[7px] px-1 py-0 h-3.5 animate-pulse">SPIKE</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
        <div>
          <div className="text-muted-foreground">7d Avg Views</div>
          <div className="text-foreground font-semibold">{wiki.recentAvgViews.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-muted-foreground">30d Avg Views</div>
          <div className="text-foreground font-semibold">{wiki.historicAvgViews.toLocaleString()}</div>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[9px] font-mono text-muted-foreground">Spike Ratio</span>
        <span className={`text-sm font-bold font-mono ${wiki.spikeRatio > 2 ? "text-loss" : wiki.spikeRatio > 1.5 ? "text-warning" : "text-muted-foreground"}`}>
          {wiki.spikeRatio}x
        </span>
      </div>
    </div>
  );
};

const SentimentDashboard = ({ ticker, compact }: Props) => {
  const [data, setData] = useState<SentimentData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSentiment = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await governedInvoke<SentimentData>("sentiment-intel", {
        body: { ticker: ticker || "" },
        tier: "slow",
      });
      if (error) throw error;
      if (result) setData(result);
    } catch (err) {
      console.error("Sentiment fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSentiment(); }, [ticker]);

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
        <div className="flex items-center gap-2 mb-3">
          <div className="h-4 w-4 rounded bg-surface-3" />
          <div className="h-3 w-32 rounded bg-surface-3" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded bg-surface-2" />)}
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (compact) {
    return (
      <div className="space-y-2 p-2 font-mono text-[10px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-3 w-3 text-primary" />
            <span className="text-muted-foreground uppercase tracking-wider text-[8px]">Sentiment</span>
            <Badge variant="outline" className="text-[7px] px-1 py-0 h-3.5">{data.signalCount} signals</Badge>
          </div>
          <Button size="sm" variant="ghost" onClick={fetchSentiment} disabled={loading} className="h-4 w-4 p-0">
            <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-border bg-surface-2 p-2 text-center">
            <div className="text-[8px] text-muted-foreground">F&G Index</div>
            <div className={`text-lg font-black ${(data.cnnFearGreed?.score ?? 50) > 50 ? "text-gain" : (data.cnnFearGreed?.score ?? 50) < 50 ? "text-loss" : "text-warning"}`}>
              {data.cnnFearGreed?.score ?? "—"}
            </div>
            <div className="text-[7px] text-muted-foreground">{data.cnnFearGreed?.label ?? ""}</div>
          </div>
          <CompositeScore score={data.compositeScore} trend={data.trend} signalCount={data.signalCount} />
        </div>
        {/* Reddit mini */}
        {data.redditSentiment && (
          <div className="rounded border border-border bg-surface-2 p-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <MessageCircle className="h-2.5 w-2.5 text-orange-500" />
              <span className="text-[8px] text-muted-foreground">Reddit</span>
            </div>
            <span className={`text-[10px] font-bold ${data.redditSentiment.retailScore > 20 ? "text-gain" : data.redditSentiment.retailScore < -20 ? "text-loss" : "text-warning"}`}>
              {data.redditSentiment.mood}
            </span>
          </div>
        )}
        {/* Macro mini */}
        {data.macroSignals && (
          <div className="rounded border border-border bg-surface-2 p-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Zap className="h-2.5 w-2.5 text-primary" />
              <span className="text-[8px] text-muted-foreground">VIX</span>
            </div>
            <span className={`text-[10px] font-bold ${data.macroSignals.vix > 30 ? "text-loss" : data.macroSignals.vix > 20 ? "text-warning" : "text-gain"}`}>
              {data.macroSignals.vix} ({data.macroSignals.vixLabel})
            </span>
          </div>
        )}
        {/* Wiki spike mini */}
        {data.wikiAttention?.isSpike && (
          <div className="rounded border border-warning bg-warning/10 p-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Eye className="h-2.5 w-2.5 text-warning" />
              <span className="text-[8px] text-warning">Wiki Attention Spike</span>
            </div>
            <span className="text-[10px] font-bold text-warning">{data.wikiAttention.spikeRatio}x</span>
          </div>
        )}
        {data.sourceBreakdown.slice(0, 5).map((s, i) => <SourceBar key={i} source={s} />)}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Sentiment Intelligence</h2>
          {ticker && <Badge variant="outline" className="text-[9px] font-mono">{ticker}</Badge>}
          <Badge variant="outline" className="text-[8px] font-mono">{data.signalCount} signals</Badge>
          <span className="h-1.5 w-1.5 rounded-full bg-gain animate-pulse" />
        </div>
        <Button size="sm" variant="ghost" onClick={fetchSentiment} disabled={loading} className="h-6 w-6 p-0">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Row 1: F&G + Composite + Macro */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* CNN Fear & Greed */}
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 className="h-3 w-3 text-muted-foreground" />
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">CNN Fear & Greed</span>
          </div>
          {data.cnnFearGreed ? (
            <>
              <FearGreedGauge score={data.cnnFearGreed.score} label={data.cnnFearGreed.label} />
              <div className="mt-2 grid grid-cols-3 gap-1 text-[8px] font-mono text-muted-foreground">
                <div className="text-center"><div>Prev Close</div><div className="text-foreground font-semibold">{data.cnnFearGreed.previousClose}</div></div>
                <div className="text-center"><div>1W Ago</div><div className="text-foreground font-semibold">{data.cnnFearGreed.weekAgo}</div></div>
                <div className="text-center"><div>1M Ago</div><div className="text-foreground font-semibold">{data.cnnFearGreed.monthAgo}</div></div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-[9px] text-muted-foreground">CNN data unavailable</div>
          )}
        </div>

        {/* Composite + GDELT */}
        <div className="flex flex-col gap-3">
          <CompositeScore score={data.compositeScore} trend={data.trend} signalCount={data.signalCount} />
          <div className="rounded-lg border border-border bg-surface-2 p-3 flex-1">
            <div className="flex items-center gap-1.5 mb-2">
              <Globe className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">GDELT Global Tone</span>
            </div>
            {data.gdeltTone ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground">Avg Tone</span>
                  <span className={data.gdeltTone.avgTone > 0 ? "text-gain" : data.gdeltTone.avgTone < 0 ? "text-loss" : "text-muted-foreground"}>
                    {data.gdeltTone.avgTone > 0 ? "+" : ""}{data.gdeltTone.avgTone}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground">Articles</span>
                  <span className="text-foreground">{data.gdeltTone.articleCount}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-muted-foreground">Trend</span>
                  <span className={data.gdeltTone.trendDirection === "improving" ? "text-gain" : data.gdeltTone.trendDirection === "deteriorating" ? "text-loss" : "text-muted-foreground"}>
                    {data.gdeltTone.trendDirection}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-[9px] text-muted-foreground text-center py-4">GDELT unavailable</div>
            )}
          </div>
        </div>

        {/* Macro Signals */}
        {data.macroSignals ? (
          <MacroCard macro={data.macroSignals} />
        ) : (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Macro Signals</span>
            </div>
            <div className="py-8 text-center text-[9px] text-muted-foreground">Macro data unavailable</div>
          </div>
        )}
      </div>

      {/* Row 2: Reddit + Wikipedia + Tone Chart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Reddit */}
        {data.redditSentiment ? (
          <RedditCard reddit={data.redditSentiment} />
        ) : (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <MessageCircle className="h-3 w-3 text-orange-500" />
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Reddit Retail</span>
            </div>
            <div className="py-8 text-center text-[9px] text-muted-foreground">Reddit data unavailable</div>
          </div>
        )}

        {/* Wikipedia Attention */}
        {data.wikiAttention ? (
          <WikiAttention wiki={data.wikiAttention} />
        ) : (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Eye className="h-3 w-3 text-blue-400" />
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Wikipedia Attention</span>
            </div>
            <div className="py-8 text-center text-[9px] text-muted-foreground">{ticker ? "No wiki data" : "Analyze a stock first"}</div>
          </div>
        )}

        {/* GDELT Tone Chart */}
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Newspaper className="h-3 w-3 text-muted-foreground" />
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Tone Trend</span>
          </div>
          {data.gdeltTone?.toneTrend && data.gdeltTone.toneTrend.length > 1 ? (
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={data.gdeltTone.toneTrend}>
                <defs>
                  <linearGradient id="toneGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} formatter={(v: number) => [v.toFixed(2), "Tone"]} />
                <Area type="monotone" dataKey="tone" stroke="hsl(var(--primary))" fill="url(#toneGrad)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[100px] text-[9px] text-muted-foreground">No trend data</div>
          )}
        </div>
      </div>

      {/* Source Breakdown */}
      {data.sourceBreakdown.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <div className="flex items-center gap-1.5 mb-3">
            <Newspaper className="h-3 w-3 text-muted-foreground" />
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Source Sentiment Breakdown</span>
            <div className="ml-auto flex items-center gap-2 text-[7px] font-mono text-muted-foreground">
              <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-gain" /> Positive</span>
              <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" /> Neutral</span>
              <span className="flex items-center gap-0.5"><span className="h-1.5 w-1.5 rounded-full bg-loss" /> Negative</span>
            </div>
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {data.sourceBreakdown.map((source, i) => <SourceBar key={i} source={source} />)}
          </div>
        </div>
      )}

      {/* Source bar chart */}
      {data.sourceBreakdown.length > 2 && (
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider">Source Scores</span>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={data.sourceBreakdown.slice(0, 10)} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="source" tick={{ fontSize: 8, fontFamily: "monospace" }} angle={-30} textAnchor="end" height={40} />
              <YAxis hide domain={[-100, 100]} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10, fontFamily: "monospace" }} />
              <Bar dataKey="score" radius={[2, 2, 0, 0]}>
                {data.sourceBreakdown.slice(0, 10).map((s, i) => (
                  <Cell key={i} fill={s.score > 0 ? "hsl(var(--gain))" : s.score < 0 ? "hsl(var(--loss))" : "hsl(var(--muted-foreground))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default SentimentDashboard;
