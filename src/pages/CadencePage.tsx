import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Clock } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import { getOrderedEntries, getEntryDateLabel } from "@/data/cadence";

export default function CadencePage() {
  const navigate = useNavigate();
  const entries = getOrderedEntries();
  const today = entries[0];

  useEffect(() => {
    document.title = "Cadence | Entropy Lite — Daily research on the math behind the system";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "A daily research stream from Entropy Lite. One concept per 24 hours — unpacked with intuition, mathematics, and the live system traces that put it to work.");
  }, []);

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
            A research note from inside Entropy Lite. Each entry takes a single idea that powers the system — a model, a measure, a structural assumption — and unpacks it the way a quant team would brief a new hire: intuition first, math second, and the live UI traces showing exactly where the idea lands in production.
          </p>
        </header>

        {/* Today's entry — featured */}
        <section className="mb-14">
          <button
            onClick={() => navigate(`/cadence/${today.slug}`)}
            className="group block w-full text-left border border-black/10 hover:border-black/40 transition-colors p-6 sm:p-8 bg-white"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="font-mono text-[10px] tracking-[0.2em] text-black bg-black/5 px-2 py-1 uppercase">
                Today · {getEntryDateLabel(today, 0)}
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

        {/* Archive */}
        <section>
          <h3 className="font-mono text-[11px] tracking-[0.2em] text-black/40 uppercase mb-5">
            Earlier entries
          </h3>
          <ul className="divide-y divide-black/5 border-y border-black/5">
            {entries.slice(1).map((entry, i) => (
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
                      {getEntryDateLabel(entry, i + 1)}
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

        <footer className="mt-16 pt-8 border-t border-black/5">
          <p className="font-mono text-[11px] text-black/40 leading-relaxed">
            Cadence is a contribution to public financial literature. Each entry is a standalone, login-free page meant to be read on its merits and shared freely. We publish what we believe, in the form we use it.
          </p>
        </footer>
      </main>
    </div>
  );
}
