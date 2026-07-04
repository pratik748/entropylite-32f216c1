import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock, Loader2 } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import { PageHeader } from "@/components/marketing/Section";
import { fetchAllEntries, formatPublishDate, type CadenceEntry } from "@/data/cadence";
import { supabase } from "@/integrations/supabase/client";

export default function CadencePage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CadenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    document.title = "Cadence | Entropy — daily research on the math behind the system";
    const meta = document.querySelector('meta[name="description"]');
    if (meta)
      meta.setAttribute(
        "content",
        "A daily research stream from Entropy. One concept per 24 hours, unpacked with intuition, mathematics, and live system traces.",
      );

    let cancelled = false;
    (async () => {
      try {
        const list = await fetchAllEntries();
        if (cancelled) return;
        setEntries(list);
        setLoading(false);

        // Self-heal: if no entries exist, trigger a one-shot generation (once per session)
        if (list.length === 0 && !sessionStorage.getItem("cadence_self_heal_attempted")) {
          sessionStorage.setItem("cadence_self_heal_attempted", "1");
          setGenerating(true);
          try {
            await supabase.functions.invoke("cadence-generate", { body: { force: true } });
            const refreshed = await fetchAllEntries();
            if (!cancelled) setEntries(refreshed);
          } catch (genErr) {
            console.warn("Cadence self-heal failed:", genErr);
          } finally {
            if (!cancelled) setGenerating(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load Cadence");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const today = entries[0];
  const archive = entries.slice(1);

  return (
    <div className="min-h-screen bg-white text-ink">
      <PublicNav />

      <PageHeader
        label="Cadence · Daily research stream"
        title={
          <>
            One concept.
            <br />
            <span className="text-white/40">Unpacked every 24 hours.</span>
          </>
        }
        lede="A research note from inside Entropy. Each entry takes a single idea that powers the system — a model, a measure, a structural assumption — and unpacks it the way a quant team briefs a new hire: intuition first, math second, and a diagram showing exactly where the idea lands in production."
      />

      <main className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-24">
        <div className="lg:max-w-3xl">
          {loading && (
            <div className="flex items-center gap-2 text-ink/40 font-mono text-sm py-12">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading entries…
            </div>
          )}

          {!loading && error && (
            <div className="border border-ink/10 rounded-xl p-6 font-mono text-sm text-ink/60">
              Could not load Cadence: {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="border border-ink/10 rounded-xl p-8 bg-[#FAFBFC]">
              <p className="mkt-label text-[9px] text-ink/40 mb-4">
                {generating ? "Generating today's entry…" : "First entry inbound"}
              </p>
              {generating ? (
                <div className="flex items-center gap-2 text-ink/60 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Multi-provider research in progress. This usually takes 30–60 seconds — refresh in a moment.
                </div>
              ) : (
                <p className="text-[15px] text-ink/60 leading-relaxed">
                  The daily research generator is warming up. The first Cadence entry will publish
                  within 24 hours, and a new one every day after that — automatically curated,
                  multi-provider researched, peer-critiqued, and illustrated.
                </p>
              )}
            </div>
          )}

          {!loading && today && (
            <section className="mb-16">
              <button
                onClick={() => navigate(`/cadence/${today.slug}`)}
                className="group block w-full text-left border border-ink/[0.09] hover:border-ink/40 transition-colors rounded-xl p-7 sm:p-10 bg-white"
              >
                <div className="flex items-center gap-3 mb-6 flex-wrap">
                  <span className="mkt-label text-[9px] bg-ink text-white px-2.5 py-1.5 rounded">
                    Today · {formatPublishDate(today.publishDate)}
                  </span>
                  <span className="mkt-label text-[9px] text-ink/40">{today.discipline}</span>
                </div>
                <h2 className="text-2xl sm:text-[32px] font-bold tracking-tight mb-3 leading-tight">
                  {today.concept}
                </h2>
                <p className="text-[15.5px] text-ink/55 mb-6 leading-relaxed max-w-2xl">{today.tagline}</p>
                <div className="flex items-center gap-5 mkt-label text-[9px] text-ink/40">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3 w-3" /> {today.readMinutes} min read
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-ink group-hover:translate-x-1 transition-transform">
                    Read entry <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </button>
            </section>
          )}

          {!loading && archive.length > 0 && (
            <section>
              <p className="mkt-label text-[9px] text-ink/40 mb-6">Earlier entries</p>
              <ul className="border-t border-ink/[0.07]">
                {archive.map((entry, i) => (
                  <li key={entry.slug}>
                    <button
                      onClick={() => navigate(`/cadence/${entry.slug}`)}
                      className="group grid grid-cols-[48px_1fr] gap-4 w-full text-left py-6 border-b border-ink/[0.07] hover:bg-ink/[0.015] transition-colors px-2 -mx-2"
                    >
                      <span className="mkt-label text-[9px] text-ink/30 mt-1.5">
                        {String(i + 2).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-baseline justify-between gap-4 mb-1.5">
                          <h4 className="text-[17px] font-semibold tracking-tight group-hover:text-ink/70">
                            {entry.concept}
                          </h4>
                          <span className="mkt-label text-[9px] text-ink/40 shrink-0">
                            {formatPublishDate(entry.publishDate)}
                          </span>
                        </div>
                        <p className="text-[13.5px] text-ink/55 leading-relaxed mb-2">{entry.tagline}</p>
                        <p className="mkt-label text-[8px] text-ink/35">
                          {entry.discipline} · {entry.readMinutes} min
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-16 pt-8 border-t border-ink/[0.07]">
            <p className="text-[12px] text-ink/45 leading-relaxed">
              Cadence is generated daily by Entropy. Each entry is researched in parallel by multiple
              AI providers, synthesized through a critic pass, and illustrated with a custom diagram.
              Free to read, free to share — no login required.
            </p>
            {entries.length > 0 && (
              <p className="mkt-label text-[8px] text-ink/30 mt-4">
                Latest entry: {formatPublishDate(entries[0].publishDate)} · Next scheduled: 06:00 UTC daily
              </p>
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
