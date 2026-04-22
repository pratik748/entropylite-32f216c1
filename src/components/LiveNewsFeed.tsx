import { useState, useEffect, useRef } from "react";
import { ExternalLink, RefreshCw, Radio } from "lucide-react";
import { governedInvoke } from "@/lib/apiGovernor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface NewsArticle {
  title: string;
  description: string | null;
  link: string;
  source: string;
  pubDate: string;
  imageUrl: string | null;
  category: string;
  sentiment: string | null;
  sourceTier?: number;
  origin?: string;
}

function getTierBadge(tier?: number): { label: string; className: string } | null {
  if (tier === 1) return { label: "T1", className: "bg-primary text-primary-foreground" };
  if (tier === 2) return { label: "T2", className: "bg-accent text-accent-foreground" };
  if (tier === 3) return { label: "T3", className: "bg-muted text-muted-foreground" };
  return null;
}

interface LiveNewsFeedProps {
  ticker?: string;
  compact?: boolean;
  region?: string;
  onArticlesUpdate?: (articles: NewsArticle[]) => void;
}

const NEWS_REFRESH_INTERVAL = 120_000; // 2 minutes

function useTimeAgo(date: Date | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!date) return;
    const interval = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(interval);
  }, [date]);
  if (!date) return null;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const LiveNewsFeed = ({ ticker, compact, region, onArticlesUpdate }: LiveNewsFeedProps) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [sourcesPolled, setSourcesPolled] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeAgo = useTimeAgo(lastFetched);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const { data, error } = await governedInvoke("fetch-news", {
        body: { ticker: ticker || "", category: "business", region: region || "All" },
      });
      if (error) throw error;
      const arts = data.articles || [];
      setArticles(arts);
      setSourcesPolled(data.sourcesPolled || 0);
      setLastFetched(new Date());
      onArticlesUpdate?.(arts);
    } catch (err) {
      console.error("News fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    intervalRef.current = setInterval(fetchNews, NEWS_REFRESH_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ticker, region]);

  const getSentimentDot = (sentiment: string | null) => {
    if (!sentiment) return "bg-muted-foreground/30";
    if (sentiment.toLowerCase().includes("pos")) return "bg-gain";
    if (sentiment.toLowerCase().includes("neg")) return "bg-loss";
    return "bg-warning";
  };

  if (compact) {
    return (
      <div className="flex flex-col h-full font-mono text-[10px]">
        <div className="flex items-center justify-between px-2 py-1 border-b border-border">
          <div className="flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-primary" />
            <span className="text-[7px] font-bold text-primary tracking-widest">MULTI-SRC</span>
            <span className="h-1.5 w-1.5 rounded-full bg-gain animate-pulse" />
            {sourcesPolled > 0 && (
              <span className="text-[7px] text-muted-foreground">{sourcesPolled} feeds</span>
            )}
            {timeAgo && <span className="text-[7px] text-muted-foreground/60">· {timeAgo}</span>}
          </div>
          <Button size="sm" variant="ghost" onClick={fetchNews} disabled={loading} className="h-4 w-4 p-0">
            <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex-1 overflow-auto space-y-0">
          {articles.slice(0, 40).map((article, i) => {
            const tier = getTierBadge(article.sourceTier);
            return (
              <a
                key={i}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-2 py-1 hover:bg-surface-2 transition-colors border-b border-border/20 group"
              >
                <span className="text-[8px] text-muted-foreground/60 tabular-nums w-10 flex-shrink-0">
                  {article.pubDate ? new Date(article.pubDate).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "--:--"}
                </span>
                <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${getSentimentDot(article.sentiment)}`} />
                {tier && <Badge className={`${tier.className} text-[6px] px-0.5 py-0 h-2.5 rounded leading-none`}>{tier.label}</Badge>}
                <span className="text-[8px] text-muted-foreground/60 w-12 flex-shrink-0 truncate">{article.source}</span>
                <span className="text-foreground truncate flex-1 group-hover:text-primary transition-colors">{article.title}</span>
              </a>
            );
          })}
          {!loading && articles.length === 0 && (
            <div className="py-4 text-center text-muted-foreground text-[9px]">No news</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Multi-Source Intelligence</h2>
          {ticker && (
            <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {ticker}
            </span>
          )}
          <span className="h-2 w-2 rounded-full bg-gain animate-pulse" />
          {sourcesPolled > 0 && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-mono">
              {sourcesPolled} feeds
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {timeAgo && (
            <span className="text-[10px] text-muted-foreground">
              {timeAgo}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchNews}
            disabled={loading}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && articles.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-lg bg-surface-2 p-4">
              <div className="h-3 w-3/4 rounded bg-surface-3 mb-2" />
              <div className="h-2 w-1/2 rounded bg-surface-3" />
            </div>
          ))}
        </div>
      )}

      {articles.length > 0 && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {articles.map((article, i) => {
            const tier = getTierBadge(article.sourceTier);
            return (
              <a
                key={i}
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex gap-3 rounded-lg border border-border/50 bg-surface-2 p-3 transition-colors hover:bg-surface-3 hover:border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:underline">
                    {article.title}
                  </p>
                  {article.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{article.description}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                    {tier && <Badge className={`${tier.className} text-[7px] px-1 py-0 h-3.5 rounded`}>{tier.label}</Badge>}
                    <span className="font-medium">{article.source}</span>
                    <span>·</span>
                    <span>{article.pubDate ? new Date(article.pubDate).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : ""}</span>
                    {article.pubDate && (
                      <>
                        <span>·</span>
                        <span>{new Date(article.pubDate).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                      </>
                    )}
                    {article.origin && (
                      <>
                        <span>·</span>
                        <span className="text-muted-foreground/50 uppercase text-[8px]">{article.origin}</span>
                      </>
                    )}
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40 group-hover:text-foreground mt-1" />
              </a>
            );
          })}
        </div>
      )}

      {!loading && articles.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No news available</p>
        </div>
      )}
    </div>
  );
};

export default LiveNewsFeed;
