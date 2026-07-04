import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Clock, Share2, Check, Twitter, Linkedin, Link2, Loader2 } from "lucide-react";
import Wordmark from "@/components/marketing/Wordmark";
import SiteFooter from "@/components/marketing/SiteFooter";
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
    document.title = `${entry.concept} | Cadence — Entropy`;
    const meta = document.querySelector('meta[name="description"]');
    const desc = `${entry.tagline} A research note from Entropy.`;
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
    setOG("og:title", `${entry.concept} — Cadence`);
    setOG("og:description", desc);
    setOG("og:type", "article");
    setOG("og:url", window.location.href);
    if (entry.insideTheSystem.image && !entry.insideTheSystem.image.startsWith("data:")) {
      setOG("og:image", entry.insideTheSystem.image);
    }
  }, [entry]);

  if (loading) {
    return (
      <div className="site-public min-h-screen bg-carbon-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-2 text-white/40 mkt-num text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading entry…
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="site-public min-h-screen bg-carbon-950 text-white flex flex-col items-center justify-center px-6">
        <p className="mkt-num text-sm text-white/45 mb-5">Entry not found.</p>
        <button
          onClick={() => navigate("/cadence")}
          className="inline-flex h-11 items-center gap-2 border border-hairline-strong px-6 text-[13px] font-medium tracking-tight text-white/70 hover:border-white/40 hover:text-white transition-colors duration-150 ease-out"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Cadence
        </button>
      </div>
    );
  }

  const url = typeof window !== "undefined" ? window.location.href : "";
  const shareText = `${entry.concept} — ${entry.tagline}`;

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
    <div className="site-public min-h-screen bg-carbon-950 text-white">
      {/* Reading chrome */}
      <header className="border-b border-hairline sticky top-0 z-40 bg-carbon-950/95 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/cadence")}
            className="inline-flex items-center gap-2 text-[12px] font-medium tracking-tight text-white/45 hover:text-white transition-colors duration-150 ease-out"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Cadence
          </button>
          <button onClick={() => navigate("/")} aria-label="Entropy home">
            <Wordmark light compact />
          </button>
          <div className="flex items-center gap-1">
            <a href={xUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-white/45 hover:text-white transition-colors duration-150 ease-out" aria-label="Share on X">
              <Twitter className="h-3.5 w-3.5" />
            </a>
            <a href={liUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-white/45 hover:text-white transition-colors duration-150 ease-out" aria-label="Share on LinkedIn">
              <Linkedin className="h-3.5 w-3.5" />
            </a>
            <button onClick={onCopy} className="p-2 text-white/45 hover:text-white transition-colors duration-150 ease-out" aria-label="Copy link">
              {copied ? <Check className="h-3.5 w-3.5 text-pos" /> : <Link2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-5 sm:px-6 py-12 sm:py-16">
        {/* Title block */}
        <div className="mb-14 pb-10 border-b border-hairline">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px w-8 bg-hairline-strong" />
            <span className="mkt-label text-[10px] text-white/55">
              Cadence · {formatPublishDate(entry.publishDate)} · {entry.discipline}
            </span>
          </div>
          <h1 className="mkt-display-2 mb-5 text-white">{entry.concept}</h1>
          <p className="text-lg sm:text-xl text-white/50 leading-snug mb-7 max-w-2xl tracking-tight">
            {entry.tagline}
          </p>
          <div className="flex items-center gap-4 mkt-label text-[9px] text-white/35 flex-wrap">
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
          <p className="text-base sm:text-[16px] leading-[1.7] text-white/70 whitespace-pre-line">
            {entry.whyItMatters}
          </p>
        </Section>

        <Section label="02" title="Inside the system">
          {entry.insideTheSystem.image ? (
            <figure className="border border-hairline bg-carbon-900 overflow-hidden mb-4">
              <img
                src={entry.insideTheSystem.image}
                alt={entry.insideTheSystem.caption}
                className="w-full h-auto block"
                loading="lazy"
              />
              <figcaption className="px-4 py-2.5 border-t border-hairline mkt-label text-[8px] text-white/40">
                Fig. — {entry.insideTheSystem.caption}
              </figcaption>
            </figure>
          ) : (
            <div className="border border-hairline bg-carbon-900 p-6 mb-4">
              <p className="mkt-label text-[8px] text-white/35">
                Fig. — {entry.insideTheSystem.caption}
              </p>
            </div>
          )}
          <p className="text-base leading-[1.7] text-white/65 whitespace-pre-line">
            {entry.insideTheSystem.annotation}
          </p>
        </Section>

        <Section label="03" title="Mathematical core">
          <div className="space-y-8">
            {entry.mathematicalCore.map((s, i) => (
              <div key={i}>
                <h4 className="text-[15px] font-semibold tracking-tight text-white mb-2">{s.heading}</h4>
                <p className="text-base leading-[1.7] text-white/65 mb-3 whitespace-pre-line">{s.body}</p>
                {s.equation && (
                  <pre className="bg-carbon-900 border border-hairline text-white/90 mkt-num text-[13px] leading-[1.7] px-5 py-4 overflow-x-auto whitespace-pre">
{s.equation}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section label="04" title="Failure modes & limits">
          <ul className="border-t border-hairline">
            {entry.failureModes.map((f, i) => (
              <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-4 border-b border-hairline text-base leading-[1.65] text-white/65">
                <span className="mkt-label text-[9px] text-white/25 mt-1.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="whitespace-pre-line">{f}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Share block */}
        <div className="mt-16 pt-10 border-t border-hairline">
          <p className="mkt-label text-[10px] text-white/35 mb-5">Share this entry</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={xUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 border border-hairline-strong px-4 text-[12px] font-medium tracking-tight text-white/65 hover:border-white/40 hover:text-white transition-colors duration-150 ease-out"
            >
              <Twitter className="h-3.5 w-3.5" /> Post on X
            </a>
            <a
              href={liUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 border border-hairline-strong px-4 text-[12px] font-medium tracking-tight text-white/65 hover:border-white/40 hover:text-white transition-colors duration-150 ease-out"
            >
              <Linkedin className="h-3.5 w-3.5" /> Share on LinkedIn
            </a>
            <button
              onClick={onCopy}
              className="inline-flex h-10 items-center gap-2 border border-hairline-strong px-4 text-[12px] font-medium tracking-tight text-white/65 hover:border-white/40 hover:text-white transition-colors duration-150 ease-out"
            >
              {copied ? (
                <><Check className="h-3.5 w-3.5 text-pos" /> Link copied</>
              ) : (
                <><Share2 className="h-3.5 w-3.5" /> Copy link</>
              )}
            </button>
          </div>
          <p className="mt-6 text-[12px] text-white/40 leading-relaxed">
            Cadence is published by Entropy. Free to read, free to share, no login required. If you
            find an error in the math or the framing, we want to hear about it.
          </p>
        </div>
      </article>

      <SiteFooter />
    </div>
  );
}

function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <div className="flex items-center gap-3 mb-6">
        <span className="mkt-label text-[10px] text-white/30">{label}</span>
        <span className="h-px w-8 bg-hairline-strong" />
        <h3 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">{title}</h3>
      </div>
      {children}
    </section>
  );
}
