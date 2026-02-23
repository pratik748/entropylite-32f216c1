import { Newspaper, TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface NewsItem {
  headline: string;
  category: "Company" | "Sector" | "Macro" | "Competitor";
  sentiment: number;
  shortTermImpact: number;
  longTermImpact: number;
  confidence: number;
  explanation: string;
}

interface NewsImpactTableProps {
  news: NewsItem[];
  overallSentiment: number;
  totalPressure: number;
}

const categoryColors: Record<string, string> = {
  Company: "bg-primary/15 text-primary",
  Sector: "bg-info/15 text-info",
  Macro: "bg-warning/15 text-warning",
  Competitor: "bg-loss/15 text-loss",
};

const NewsImpactTable = ({ news, overallSentiment, totalPressure }: NewsImpactTableProps) => {
  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Related News Impact</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Sentiment:</span>
            <span className={`font-mono font-semibold ${overallSentiment >= 0 ? "text-gain" : "text-loss"}`}>
              {overallSentiment >= 0 ? "+" : ""}{overallSentiment}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">Pressure:</span>
            <span className={`font-mono font-semibold ${totalPressure >= 0 ? "text-gain" : "text-loss"}`}>
              {totalPressure >= 0 ? "+" : ""}{totalPressure.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Headline</th>
              <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</th>
              <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Sentiment</th>
              <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Short-term</th>
              <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Long-term</th>
              <th className="pb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground text-right">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {news.map((item, i) => (
              <tr key={i} className="group border-b border-border/50 transition-colors hover:bg-surface-2">
                <td className="py-3 pr-4">
                  <p className="font-medium text-foreground leading-snug">{item.headline}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.explanation}</p>
                </td>
                <td className="py-3 pr-4">
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${categoryColors[item.category]}`}>
                    {item.category}
                  </span>
                </td>
                <td className="py-3 pr-4 text-right">
                  <SentimentBadge value={item.sentiment} />
                </td>
                <td className="py-3 pr-4 text-right">
                  <ImpactValue value={item.shortTermImpact} />
                </td>
                <td className="py-3 pr-4 text-right">
                  <ImpactValue value={item.longTermImpact} />
                </td>
                <td className="py-3 text-right">
                  <span className="font-mono text-sm text-muted-foreground">{item.confidence}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const SentimentBadge = ({ value }: { value: number }) => {
  const isPositive = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-sm font-semibold ${isPositive ? "text-gain" : "text-loss"}`}>
      {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isPositive ? "+" : ""}{value}
    </span>
  );
};

const ImpactValue = ({ value }: { value: number }) => (
  <span className={`font-mono text-sm font-medium ${value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-muted-foreground"}`}>
    {value > 0 ? "+" : ""}{value.toFixed(1)}%
  </span>
);

export default NewsImpactTable;
