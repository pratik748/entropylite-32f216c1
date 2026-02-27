import { useState, useEffect } from "react";
import { Newspaper, ExternalLink, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface NewsArticle {
  title: string;
  description: string | null;
  link: string;
  source: string;
  pubDate: string;
  imageUrl: string | null;
  category: string;
  sentiment: string | null;
}

interface LiveNewsFeedProps {
  ticker?: string;
}

const LiveNewsFeed = ({ ticker }: LiveNewsFeedProps) => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-news", {
        body: { ticker: ticker || "", category: "business" },
      });
      if (error) throw error;
      setArticles(data.articles || []);
      setLastFetched(new Date());
    } catch (err) {
      console.error("News fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [ticker]);

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-foreground" />
          <h2 className="text-base font-semibold text-foreground">Live News</h2>
          {ticker && (
            <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {ticker}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastFetched && (
            <span className="text-[10px] text-muted-foreground">
              {lastFetched.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
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
          {articles.map((article, i) => (
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
                  <span className="font-medium">{article.source}</span>
                  <span>·</span>
                  <span>{new Date(article.pubDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                </div>
              </div>
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40 group-hover:text-foreground mt-1" />
            </a>
          ))}
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
