import type { SectionDef, WorkspaceDef } from "../registry";
import { useEvidence } from "../EvidenceContext";
import { MetricGrid, MetricStat } from "../Metric";
import SectionShell from "./SectionShell";
import { Block, PendingEvidence, ShareBar } from "./blocks";
import type { DeskAnalysis, Dossier, NewsItem } from "@/lib/evidence/inputs";

/**
 * Dossier-backed sections — competitors, supply chain, segments, geography,
 * leadership, ownership registers, insider trades, filings and news. Renders
 * the section's evidence nodes first, then the underlying dossier detail in
 * institutional form. Estimated data is labeled as such once, quietly.
 */
const DossierView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data } = useEvidence();
  const key = `${workspace.id}/${section.id}`;
  const metrics = sectionMetrics(key);
  const d = data.dossier;

  const detail = d ? renderDetail(key, d, data.analysis) : null;

  return (
    <SectionShell workspace={workspace} section={section} wide>
      {metrics.length > 0 && (
        <MetricGrid>
          {metrics.slice(0, 6).map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </MetricGrid>
      )}
      {detail}
      {!detail && metrics.length === 0 && <PendingEvidence section={section} />}
      {d && detail && (
        <p className="text-[10.5px] leading-relaxed text-muted-foreground/60">
          Register detail is assembled by the dossier model from scraped filings, ownership and news
          data — treat names and structure as reliable, exact figures as estimates.
        </p>
      )}
    </SectionShell>
  );
};

/* ── per-section dossier detail ───────────────────────────────── */

function renderDetail(key: string, d: Dossier, analysis: DeskAnalysis | null) {
  switch (key) {
    case "competition/landscape":
    case "competition/network":
    case "competition/peer-matrix": {
      const competitors = Array.isArray(d.competitors) ? d.competitors : [];
      if (competitors.length === 0) return null;
      return (
        <Block title="Competitor register">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Competitor</th>
                  <th className="py-1.5 pr-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Threat</th>
                  <th className="py-1.5 pr-3 text-right text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Share</th>
                  <th className="hidden py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:table-cell">Edge</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 pr-3 font-medium text-foreground">
                      {c.name}
                      {c.ticker && <span className="ml-1.5 text-[10.5px] text-muted-foreground">{c.ticker}</span>}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span
                        className={`text-[11px] ${
                          c.threat === "direct" ? "text-loss" : c.threat === "emerging" ? "text-warning" : "text-muted-foreground"
                        }`}
                      >
                        {c.threat}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">
                      {c.marketShare != null ? `${c.marketShare}%` : "—"}
                    </td>
                    <td className="hidden max-w-[280px] truncate py-1.5 text-muted-foreground sm:table-cell">{c.strengths || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Block>
      );
    }

    case "ecosystem/supply-chain":
    case "ecosystem/suppliers": {
      const suppliers = d.supplyChain?.suppliers ?? [];
      const manufacturers = d.supplyChain?.manufacturers ?? [];
      if (suppliers.length === 0 && manufacturers.length === 0) return null;
      return (
        <>
          {suppliers.length > 0 && (
            <Block title="Key suppliers & dependence risk">
              <div className="grid gap-2 sm:grid-cols-2">
                {suppliers.map((s, i) => (
                  <div key={i} className="flex items-start justify-between gap-3 rounded-sm border border-border/60 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-foreground">{s.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{s.role}</p>
                    </div>
                    <span
                      className={`shrink-0 text-[10.5px] font-medium ${
                        s.riskLevel === "critical" || s.riskLevel === "high" ? "text-loss" : s.riskLevel === "medium" ? "text-warning" : "text-muted-foreground"
                      }`}
                    >
                      {s.riskLevel} risk
                    </span>
                  </div>
                ))}
              </div>
            </Block>
          )}
          {manufacturers.length > 0 && (
            <Block title="Manufacturing footprint">
              <div className="grid gap-2 sm:grid-cols-2">
                {manufacturers.map((m, i) => (
                  <div key={i} className="rounded-sm border border-border/60 px-3 py-2">
                    <p className="text-[12.5px] font-medium text-foreground">{m.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.location} · {m.type}
                    </p>
                  </div>
                ))}
              </div>
            </Block>
          )}
        </>
      );
    }

    case "ecosystem/customers": {
      const distributors = d.supplyChain?.distributors ?? [];
      const segments = Array.isArray(d.revenueSegments) ? d.revenueSegments : [];
      if (distributors.length === 0 && segments.length === 0) return null;
      return (
        <>
          {segments.length > 0 && (
            <Block title="Demand mix — where revenue comes from">
              {segments.map((s, i) => (
                <ShareBar key={i} label={s.segment ?? "Segment"} pct={s.percentage ?? 0} detail={s.trend} />
              ))}
            </Block>
          )}
          {distributors.length > 0 && (
            <Block title="Distribution channels">
              <div className="flex flex-wrap gap-1.5">
                {distributors.map((x, i) => (
                  <span key={i} className="rounded-sm border border-border/70 px-2 py-1 text-[11px] text-muted-foreground">
                    {x.name} · {x.region}
                  </span>
                ))}
              </div>
            </Block>
          )}
        </>
      );
    }

    case "ecosystem/products-segments": {
      const products = Array.isArray(d.products) ? d.products : [];
      const segments = Array.isArray(d.revenueSegments) ? d.revenueSegments : [];
      if (products.length === 0 && segments.length === 0) return null;
      return (
        <>
          {segments.length > 0 && (
            <Block title="Segment revenue mix">
              {segments.map((s, i) => (
                <ShareBar key={i} label={s.segment ?? "Segment"} pct={s.percentage ?? 0} detail={s.trend} />
              ))}
            </Block>
          )}
          {products.length > 0 && (
            <Block title="Product lines & lifecycle">
              <div className="grid gap-2 sm:grid-cols-2">
                {products.map((p, i) => (
                  <div key={i} className="rounded-sm border border-border/60 px-3 py-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-[12.5px] font-medium text-foreground">{p.name}</p>
                      <span
                        className={`shrink-0 text-[10.5px] ${
                          p.lifecycle === "growth" || p.lifecycle === "launch" ? "text-gain" : p.lifecycle === "declining" ? "text-loss" : "text-muted-foreground"
                        }`}
                      >
                        {p.lifecycle}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{p.description}</p>
                    {p.revenueContribution > 0 && (
                      <p className="mt-1 text-[10.5px] tabular-nums text-muted-foreground/70">
                        ~{p.revenueContribution}% of revenue
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Block>
          )}
        </>
      );
    }

    case "ecosystem/geographic": {
      const regions = Array.isArray(d.geographicRevenue) ? d.geographicRevenue : [];
      if (regions.length === 0) return null;
      return (
        <Block title="Revenue by region">
          {regions.map((r, i) => (
            <ShareBar key={i} label={r.region ?? "Region"} pct={r.percentage ?? 0} />
          ))}
        </Block>
      );
    }

    case "intelligence/management": {
      const leadership = Array.isArray(d.leadership) ? d.leadership : [];
      if (leadership.length === 0) return null;
      return (
        <Block title="Executive register">
          <div className="grid gap-2 sm:grid-cols-2">
            {leadership.map((e, i) => (
              <div key={i} className="rounded-sm border border-border/60 px-3 py-2.5">
                <p className="text-[12.5px] font-medium text-foreground">{e.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {e.role}
                  {e.since ? ` · since ${e.since}` : ""}
                </p>
                {e.background && (
                  <p className="mt-1 line-clamp-3 text-[11px] leading-snug text-muted-foreground/80">{e.background}</p>
                )}
                {Array.isArray(e.previousCompanies) && e.previousCompanies.length > 0 && (
                  <p className="mt-1 truncate text-[10.5px] text-muted-foreground/60">
                    Prev: {e.previousCompanies.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Block>
      );
    }

    case "intelligence/earnings-calls": {
      const n = d.narrative;
      if (!n) return null;
      return (
        <Block title="Management communication read">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ToneTile label="Earnings tone" value={n.earningsTone} good={n.earningsTone === "positive"} bad={n.earningsTone === "negative"} />
            <ToneTile label="Analyst consensus" value={(n.analystConsensus || "—").replace(/_/g, " ")} good={/buy/.test(n.analystConsensus || "")} bad={/sell/.test(n.analystConsensus || "")} />
            <ToneTile label="News sentiment" value={n.newsSentiment != null ? `${n.newsSentiment > 0 ? "+" : ""}${n.newsSentiment}` : "—"} good={n.newsSentiment > 10} bad={n.newsSentiment < -10} />
            <ToneTile label="Social tone" value={n.socialSentiment != null ? `${n.socialSentiment > 0 ? "+" : ""}${n.socialSentiment}` : "—"} good={n.socialSentiment > 10} bad={n.socialSentiment < -10} />
          </div>
          {Array.isArray(n.narrativeShifts) && n.narrativeShifts.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
                Narrative shifts detected
              </p>
              <ul className="space-y-1">
                {n.narrativeShifts.map((s, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-[12px] leading-relaxed text-muted-foreground">
                    <span className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full bg-muted-foreground/50" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Block>
      );
    }

    case "intelligence/filings": {
      const items: NewsItem[] = (analysis?.news ?? []).filter((x) =>
        /edgar|sec|bse|nse|exchange|filing/i.test(String(x.source || "")),
      );
      const reg = Array.isArray(d.regulatoryExposure) ? d.regulatoryExposure : [];
      if (items.length === 0 && reg.length === 0) return null;
      return (
        <>
          {items.length > 0 && (
            <Block title="Recent filings & exchange disclosures">
              <div className="space-y-1.5">
                {items.map((x, i) => (
                  <div key={i} className="flex items-baseline gap-2.5 text-[12px]">
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60">{x.source}</span>
                    <span className="min-w-0 flex-1 truncate text-foreground">{x.headline}</span>
                  </div>
                ))}
              </div>
            </Block>
          )}
          {reg.length > 0 && (
            <Block title="Active regulatory register">
              <div className="space-y-1.5">
                {reg.map((r, i) => (
                  <div key={i} className="flex items-baseline gap-2.5 text-[12px]">
                    <span
                      className={`shrink-0 text-[10.5px] font-medium ${
                        r.severity === "critical" || r.severity === "high" ? "text-loss" : r.severity === "medium" ? "text-warning" : "text-muted-foreground"
                      }`}
                    >
                      {r.severity}
                    </span>
                    <span className="min-w-0 flex-1 text-foreground">{r.issue}</span>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">
                      {r.region} · {r.status}
                    </span>
                  </div>
                ))}
              </div>
            </Block>
          )}
        </>
      );
    }

    case "intelligence/news": {
      const items: NewsItem[] = analysis?.news ?? [];
      if (items.length === 0) return null;
      return (
        <Block title="Impact-scored headline flow">
          <div className="space-y-1.5">
            {items.slice(0, 10).map((x, i) => (
              <div key={i} className="flex items-baseline gap-2.5 text-[12px]">
                <span
                  className={`w-9 shrink-0 text-right font-semibold tabular-nums ${
                    (x.sentiment ?? 0) > 5 ? "text-gain" : (x.sentiment ?? 0) < -5 ? "text-loss" : "text-muted-foreground"
                  }`}
                >
                  {(x.sentiment ?? 0) > 0 ? "+" : ""}
                  {x.sentiment ?? 0}
                </span>
                <span className="min-w-0 flex-1 text-foreground">{x.headline}</span>
                <span className="hidden shrink-0 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60 sm:inline">
                  {x.source}
                </span>
              </div>
            ))}
          </div>
        </Block>
      );
    }

    case "structure/ownership": {
      const o = d.ownership;
      if (!o) return null;
      const holders = Array.isArray(o.topHolders) ? o.topHolders : [];
      return (
        <>
          <Block title="Register composition">
            <ShareBar label="Institutional" pct={o.institutionalPct ?? 0} />
            <ShareBar label="Insider" pct={o.insiderPct ?? 0} />
            <ShareBar label="Retail" pct={o.retailPct ?? 0} />
          </Block>
          {holders.length > 0 && (
            <Block title="Top holders">
              <div className="space-y-1">
                {holders.map((h, i) => (
                  <div key={i} className="flex items-baseline gap-2.5 text-[12px]">
                    <span className="min-w-0 flex-1 truncate text-foreground">{h.name}</span>
                    <span className="shrink-0 text-[10.5px] text-muted-foreground">{h.type}</span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-foreground">{h.pct}%</span>
                    <span
                      className={`w-20 shrink-0 text-right text-[10.5px] ${
                        h.trend === "accumulating" ? "text-gain" : h.trend === "distributing" ? "text-loss" : "text-muted-foreground"
                      }`}
                    >
                      {h.trend}
                    </span>
                  </div>
                ))}
              </div>
            </Block>
          )}
        </>
      );
    }

    case "structure/insider": {
      const trades = Array.isArray(d.insiderActivity) ? d.insiderActivity : [];
      if (trades.length === 0) return null;
      return (
        <Block title="Reported insider transactions">
          <div className="space-y-1">
            {trades.map((t, i) => (
              <div key={i} className="flex items-baseline gap-2.5 text-[12px]">
                <span
                  className={`w-10 shrink-0 text-[10.5px] font-semibold uppercase ${
                    t.action === "buy" ? "text-gain" : t.action === "sell" ? "text-loss" : "text-muted-foreground"
                  }`}
                >
                  {t.action}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {t.name}
                  <span className="ml-1.5 text-[10.5px] text-muted-foreground">{t.role}</span>
                </span>
                <span className="shrink-0 tabular-nums text-foreground">{(t.shares ?? 0).toLocaleString()}</span>
                <span className="hidden w-20 shrink-0 text-right text-[10.5px] text-muted-foreground sm:inline">{t.date}</span>
              </div>
            ))}
          </div>
        </Block>
      );
    }

    default:
      return null;
  }
}

const ToneTile = ({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) => (
  <div className="rounded-sm border border-border/60 px-3 py-2">
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{label}</p>
    <p className={`mt-1 text-[13px] font-semibold capitalize ${good ? "text-gain" : bad ? "text-loss" : "text-foreground"}`}>
      {value || "—"}
    </p>
  </div>
);

export default DossierView;
