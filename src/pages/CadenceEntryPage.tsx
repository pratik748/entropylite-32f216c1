import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock, Share2, Check, Twitter, Linkedin, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchEntryBySlug, formatPublishDate, type CadenceEntry } from "@/data/cadence";

export default function CadenceEntryPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<CadenceEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    fetchEntryBySlug(slug)
      .then((e) => setEntry(e))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!entry) return;
    document.title = `${entry.concept} | Cadence, Entropy Lite`;
    const meta = document.querySelector('meta[name="description"]');
    const desc = `${entry.tagline} A research note from Entropy Lite.`;
    if (meta) meta.setAttribute("content", desc);

    const setOG = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setOG("og:title", `${entry.concept}, Cadence`);
    setOG("og:description", desc);
    setOG("og:type", "article");
    setOG("og:url", window.location.href);
    if (entry.insideTheSystem.image && !entry.insideTheSystem.image.startsWith("data:")) {
      setOG("og:image", entry.insideTheSystem.image);
    }
  }, [entry]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-black flex items-center justify-center">
        <div className="flex items-center gap-2 text-black/40 font-mono text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading entry…
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center px-6">
        <p className="font-mono text-sm text-black/50 mb-4">Entry not found.</p>
        <Button variant="outline" onClick={() => navigate("/cadence")}>
          Back to Cadence
        </Button>
      </div>
    );
  }

  const url = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${entry.concept}, ${entry.tagline}`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(url)}`;
  const liUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;

  return (
    <div className="min-h-screen bg-white text-black">
      <header className="border-b border-black/5 sticky top-0 z-40 bg-white/85 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/cadence")}
            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-black/50 hover:text-black transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Cadence
          </button>
          <div className="flex items-center gap-1">
            <a href={xUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-black/50 hover:text-black transition-colors" aria-label="Share on X">
              <Twitter className="h-3.5 w-3.5" />
            </a>
            <a href={liUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-black/50 hover:text-black transition-colors" aria-label="Share on LinkedIn">
              <Linkedin className="h-3.5 w-3.5" />
            </a>
            <button onClick={onCopy} className="p-2 text-black/50 hover:text-black transition-colors" aria-label="Copy link">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="mb-12 pb-10 border-b border-black/10">
          <p className="font-mono text-[10px] tracking-[0.2em] text-black/40 uppercase mb-3">
            Cadence · {formatPublishDate(entry.publishDate)} · {entry.discipline}
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4 leading-[1.1]">
            {entry.concept}
          </h1>
          <p className="text-lg sm:text-xl text-black/55 leading-snug mb-6 max-w-2xl">
            {entry.tagline}
          </p>
          <div className="flex items-center gap-4 font-mono text-[11px] text-black/40 flex-wrap">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" /> {entry.readMinutes} min read
            </span>
            {entry.providersUsed.length > 0 && (
              <>
                <span>·</span>
                <span>Synthesized via {entry.providersUsed.filter((p) => p !== "critic").join(" + ")} + critic pass</span>
              </>
            )}
          </div>
        </div>

        <Section label="01" title="Why it matters">
          <p className="text-base sm:text-[17px] leading-[1.7] text-black/75 whitespace-pre-line">
            {entry.whyItMatters}
          </p>
        </Section>

        <Section label="02" title="Inside the system">
          {entry.insideTheSystem.image ? (
            <figure className="border border-black/10 bg-black/[0.015] overflow-hidden mb-4">
              <img
                src={entry.insideTheSystem.image}
                alt={entry.insideTheSystem.caption}
                className="w-full h-auto block"
                loading="lazy"
              />
              <figcaption className="px-4 py-2.5 border-t border-black/10 font-mono text-[10px] text-black/45 uppercase tracking-wider">
                Fig., {entry.insideTheSystem.caption}
              </figcaption>
            </figure>
          ) : (
            <div className="border border-black/10 bg-black/[0.015] p-6 mb-4">
              <p className="font-mono text-[10px] text-black/40 uppercase tracking-wider">
                Fig., {entry.insideTheSystem.caption}
              </p>
            </div>
          )}
          <p className="text-base leading-[1.7] text-black/70 whitespace-pre-line">
            {entry.insideTheSystem.annotation}
          </p>
        </Section>

        <Section label="03" title="Mathematical core">
          <div className="space-y-7">
            {entry.mathematicalCore.map((s, i) => (
              <div key={i}>
                <h4 className="text-sm font-semibold tracking-tight text-black mb-2">{s.heading}</h4>
                <p className="text-base leading-[1.7] text-black/70 mb-3 whitespace-pre-line">{s.body}</p>
                {s.equation && (
                  <pre className="bg-black text-white font-mono text-[13px] leading-[1.7] px-5 py-4 overflow-x-auto whitespace-pre">
{s.equation}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section label="04" title="Failure modes & limits">
          <ul className="space-y-3">
            {entry.failureModes.map((f, i) => (
              <li key={i} className="flex gap-3 text-base leading-[1.65] text-black/70">
                <span className="font-mono text-[11px] text-black/30 mt-1.5 shrink-0">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="whitespace-pre-line">{f}</span>
              </li>
            ))}
          </ul>
        </Section>

        <div className="mt-16 pt-10 border-t border-black/10">
          <p className="font-mono text-[11px] tracking-[0.2em] text-black/40 uppercase mb-4">Share this entry</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="font-mono text-xs">
              <a href={xUrl} target="_blank" rel="noopener noreferrer">
                <Twitter className="h-3.5 w-3.5 mr-1.5" /> Post on X
              </a>
            </Button>
            <Button asChild variant="outline" size="sm" className="font-mono text-xs">
              <a href={liUrl} target="_blank" rel="noopener noreferrer">
                <Linkedin className="h-3.5 w-3.5 mr-1.5" /> Share on LinkedIn
              </a>
            </Button>
            <Button onClick={onCopy} variant="outline" size="sm" className="font-mono text-xs">
              {copied ? (
                <><Check className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> Link copied</>
              ) : (
                <><Share2 className="h-3.5 w-3.5 mr-1.5" /> Copy link</>
              )}
            </Button>
          </div>
          <p className="mt-6 font-mono text-[10px] text-black/35 leading-relaxed">
            Cadence is published by Entropy Lite. Free to read, free to share, no login required. If you find an error in the math or the framing, we want to hear about it.
          </p>
        </div>
      </article>
    </div>
  );
}

function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <div className="flex items-baseline gap-3 mb-5">
        <span className="font-mono text-[10px] tracking-[0.2em] text-black/35">{label}</span>
        <h3 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h3>
      </div>
      {children}
    </section>
  );
}
