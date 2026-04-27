import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock, Loader2 } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import { fetchAllEntries, formatPublishDate, type CadenceEntry } from "@/data/cadence";
import { supabase } from "@/integrations/supabase/client";

export default function CadencePage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<CadenceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    document.title = "Cadence | Entropy Lite, Daily research on the math behind the system";
    const meta = document.querySelector('meta[name="description"]');
    if (meta)
      meta.setAttribute(
        "content",
        "A daily research stream from Entropy Lite. One concept per 24 hours, unpacked with intuition, mathematics, and live system traces.",
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
    <div className="min-h-screen bg-white text-black">
      <PublicNav />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <header className="mb-12 sm:mb-16">
          <p className="font-mono text-[11px] tracking-[0.2em] text-black/40 uppercase mb-4">
            Cadence · Daily Research Stream
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-5">
            One concept.<br />
            <span className="text-black/50">Unpacked every 24 hours.</span>
          </h1>
          <p className="text-base sm:text-lg text-black/60 leading-relaxed max-w-2xl">
            A research note from inside Entropy Lite. Each entry takes a single idea that powers the system, a model, a measure, a structural assumption, and unpacks it the way a quant team would brief a new hire: intuition first, math second, and a custom diagram showing exactly where the idea lands in production.
          </p>
        </header>

        {loading && (
          <div className="flex items-center gap-2 text-black/40 font-mono text-sm py-12">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading entries…
          </div>
        )}

        {!loading && error && (
          <div className="border border-black/10 p-6 font-mono text-sm text-black/60">
            Could not load Cadence: {error}
          </div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="border border-black/10 p-8 bg-black/[0.015]">
            <p className="font-mono text-[11px] tracking-[0.2em] text-black/40 uppercase mb-3">
              {generating ? "Generating today's entry…" : "First entry inbound"}
            </p>
            {generating ? (
              <div className="flex items-center gap-2 text-black/60 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Multi-provider research in progress. This usually takes 30–60 seconds, refresh in a moment.
              </div>
            ) : (
              <p className="text-base text-black/65 leading-relaxed">
                The daily research generator is warming up. The first Cadence entry will publish within 24 hours, and a new one every day after that, automatically curated, multi-provider researched, peer-critiqued, and illustrated.
              </p>
            )}
          </div>
        )}

        {!loading && today && (
          <section className="mb-14">
            <button
              onClick={() => navigate(`/cadence/${today.slug}`)}
              className="group block w-full text-left border border-black/10 hover:border-black/40 transition-colors p-6 sm:p-8 bg-white"
            >
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="font-mono text-[10px] tracking-[0.2em] text-black bg-black/5 px-2 py-1 uppercase">
                  Today · {formatPublishDate(today.publishDate)}
                </span>
                <span className="font-mono text-[10px] text-black/40 uppercase tracking-wider">
                  {today.discipline}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-3 group-hover:text-black/80">
                {today.concept}
              </h2>
              <p className="text-base text-black/60 mb-5 leading-relaxed">{today.tagline}</p>
              <div className="flex items-center gap-4 text-xs font-mono text-black/40">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3" /> {today.readMinutes} min read
                </span>
                <span className="inline-flex items-center gap-1 text-black group-hover:translate-x-1 transition-transform">
                  Read entry <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </button>
          </section>
        )}

        {!loading && archive.length > 0 && (
          <section>
            <h3 className="font-mono text-[11px] tracking-[0.2em] text-black/40 uppercase mb-5">
              Earlier entries
            </h3>
            <ul className="divide-y divide-black/5 border-y border-black/5">
              {archive.map((entry) => (
                <li key={entry.slug}>
                  <button
                    onClick={() => navigate(`/cadence/${entry.slug}`)}
                    className="group block w-full text-left py-5 hover:bg-black/[0.02] -mx-2 px-2 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-4 mb-1.5">
                      <h4 className="text-base sm:text-lg font-semibold tracking-tight group-hover:text-black/70">
                        {entry.concept}
                      </h4>
                      <span className="font-mono text-[10px] text-black/40 shrink-0">
                        {formatPublishDate(entry.publishDate)}
                      </span>
                    </div>
                    <p className="text-sm text-black/55 leading-relaxed mb-2">{entry.tagline}</p>
                    <p className="font-mono text-[10px] text-black/35 uppercase tracking-wider">
                      {entry.discipline} · {entry.readMinutes} min
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-16 pt-8 border-t border-black/5">
          <p className="font-mono text-[11px] text-black/40 leading-relaxed">
            Cadence is generated daily by Entropy Lite. Each entry is researched in parallel by multiple AI providers, synthesized through a critic pass, and illustrated with a custom diagram. Free to read, free to share, no login required.
          </p>
          {entries.length > 0 && (
            <p className="font-mono text-[10px] text-black/30 mt-3">
              Latest entry: {formatPublishDate(entries[0].publishDate)} · Next scheduled: 06:00 UTC daily
            </p>
          )}
        </footer>
      </main>
    </div>
  );
}
