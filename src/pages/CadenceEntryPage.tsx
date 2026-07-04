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
      <div className="min-h-screen bg-white text-ink flex items-center justify-center">
        <div className="flex items-center gap-2 text-ink/40 font-mono text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading entry…
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-screen bg-white text-ink flex flex-col items-center justify-center px-6">
        <p className="font-mono text-sm text-ink/50 mb-5">Entry not found.</p>
        <button
          onClick={() => navigate("/cadence")}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-ink/15 px-6 text-[13px] font-semibold tracking-tight text-ink/75 hover:border-ink/40 hover:text-ink transition-colors"
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
    <div className="min-h-screen bg-white text-ink">
      {/* Reading chrome */}
      <header className="border-b border-ink/[0.07] sticky top-0 z-40 bg-white/88 backdrop-blur-2xl">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/cadence")}
            className="inline-flex items-center gap-2 text-[12px] font-semibold tracking-tight text-ink/50 hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Cadence
          </button>
          <button onClick={() => navigate("/")} aria-label="Entropy home">
            <Wordmark compact />
          </button>
          <div className="flex items-center gap-1">
            <a href={xUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-ink/50 hover:text-ink transition-colors" aria-label="Share on X">
              <Twitter className="h-3.5 w-3.5" />
            </a>
            <a href={liUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-ink/50 hover:text-ink transition-colors" aria-label="Share on LinkedIn">
              <Linkedin className="h-3.5 w-3.5" />
            </a>
            <button onClick={onCopy} className="p-2 text-ink/50 hover:text-ink transition-colors" aria-label="Copy link">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-5 sm:px-6 py-12 sm:py-16">
        {/* Title block */}
        <div className="mb-14 pb-10 border-b border-ink/[0.08]">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px w-8 bg-ink/20" />
            <span className="mkt-label text-[9px] text-ink/55">
              Cadence · {formatPublishDate(entry.publishDate)} · {entry.discipline}
            </span>
          </div>
          <h1 className="mkt-display-2 mb-5">{entry.concept}</h1>
          <p className="text-lg sm:text-xl text-ink/55 leading-snug mb-7 max-w-2xl tracking-tight">
            {entry.tagline}
          </p>
          <div className="flex items-center gap-4 mkt-label text-[9px] text-ink/40 flex-wrap">
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
          <p className="text-base sm:text-[17px] leading-[1.7] text-ink/75 whitespace-pre-line">
            {entry.whyItMatters}
          </p>
        </Section>

        <Section label="02" title="Inside the system">
          {entry.insideTheSystem.image ? (
            <figure className="border border-ink/10 rounded-xl bg-[#FAFBFC] overflow-hidden mb-4">
              <img
                src={entry.insideTheSystem.image}
                alt={entry.insideTheSystem.caption}
                className="w-full h-auto block"
                loading="lazy"
              />
              <figcaption className="px-4 py-2.5 border-t border-ink/10 mkt-label text-[8px] text-ink/45">
                Fig. — {entry.insideTheSystem.caption}
              </figcaption>
            </figure>
          ) : (
            <div className="border border-ink/10 rounded-xl bg-[#FAFBFC] p-6 mb-4">
              <p className="mkt-label text-[8px] text-ink/40">
                Fig. — {entry.insideTheSystem.caption}
              </p>
            </div>
          )}
          <p className="text-base leading-[1.7] text-ink/70 whitespace-pre-line">
            {entry.insideTheSystem.annotation}
          </p>
        </Section>

        <Section label="03" title="Mathematical core">
          <div className="space-y-8">
            {entry.mathematicalCore.map((s, i) => (
              <div key={i}>
                <h4 className="text-[15px] font-semibold tracking-tight text-ink mb-2">{s.heading}</h4>
                <p className="text-base leading-[1.7] text-ink/70 mb-3 whitespace-pre-line">{s.body}</p>
                {s.equation && (
                  <pre className="bg-ink text-white font-mono text-[13px] leading-[1.7] px-5 py-4 rounded-xl overflow-x-auto whitespace-pre">
{s.equation}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </Section>

        <Section label="04" title="Failure modes & limits">
          <ul className="border-t border-ink/[0.07]">
            {entry.failureModes.map((f, i) => (
              <li key={i} className="grid grid-cols-[40px_1fr] gap-3 py-4 border-b border-ink/[0.07] text-base leading-[1.65] text-ink/70">
                <span className="mkt-label text-[9px] text-ink/30 mt-1.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="whitespace-pre-line">{f}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Share block */}
        <div className="mt-16 pt-10 border-t border-ink/[0.08]">
          <p className="mkt-label text-[9px] text-ink/40 mb-5">Share this entry</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={xUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink/15 px-4 text-[12px] font-semibold tracking-tight text-ink/70 hover:border-ink/40 hover:text-ink transition-colors"
            >
              <Twitter className="h-3.5 w-3.5" /> Post on X
            </a>
            <a
              href={liUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink/15 px-4 text-[12px] font-semibold tracking-tight text-ink/70 hover:border-ink/40 hover:text-ink transition-colors"
            >
              <Linkedin className="h-3.5 w-3.5" /> Share on LinkedIn
            </a>
            <button
              onClick={onCopy}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-ink/15 px-4 text-[12px] font-semibold tracking-tight text-ink/70 hover:border-ink/40 hover:text-ink transition-colors"
            >
              {copied ? (
                <><Check className="h-3.5 w-3.5 text-emerald-600" /> Link copied</>
              ) : (
                <><Share2 className="h-3.5 w-3.5" /> Copy link</>
              )}
            </button>
          </div>
          <p className="mt-6 text-[12px] text-ink/45 leading-relaxed">
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
        <span className="mkt-label text-[9px] text-ink/35">{label}</span>
        <span className="h-px w-8 bg-ink/20" />
        <h3 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h3>
      </div>
      {children}
    </section>
  );
}
