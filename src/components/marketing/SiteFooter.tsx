import { useNavigate } from "react-router-dom";
import Wordmark from "@/components/marketing/Wordmark";

const COLUMNS: { title: string; links: { label: string; path: string }[] }[] = [
  {
    title: "Platform",
    links: [
      { label: "The Terminal", path: "/dashboard" },
      { label: "Capabilities", path: "/about" },
      { label: "Pricing", path: "/pricing" },
      { label: "Client access", path: "/access" },
    ],
  },
  {
    title: "Research",
    links: [
      { label: "Backbone", path: "/backbone" },
      { label: "Cadence — daily notes", path: "/cadence" },
      { label: "Data & veracity", path: "/data" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", path: "/about" },
      { label: "Disclaimer", path: "/disclaimer" },
    ],
  },
];

export default function SiteFooter() {
  const navigate = useNavigate();

  return (
    <footer className="bg-ink text-white">
      <div className="max-w-6xl mx-auto px-5 sm:px-6">
        {/* Upper — brand + link columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-6 pt-16 pb-12">
          <div className="md:col-span-5">
            <Wordmark light />
            <p className="mt-6 max-w-sm text-[13.5px] leading-relaxed text-white/45">
              A probabilistic market-intelligence terminal. Twelve analytical
              engines — risk, constraint detection, simulation, flow — composed
              into one operational surface.
            </p>
            <div className="mt-8 flex items-center gap-2">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="mkt-label text-[9px] text-white/45">
                All systems operational
              </span>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className="md:col-span-2">
              <p className="mkt-label text-[9px] text-white/40 mb-5">{col.title}</p>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <button
                      onClick={() => navigate(l.path)}
                      className="text-[13px] tracking-tight text-white/60 hover:text-white transition-colors text-left"
                    >
                      {l.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="md:col-span-3">
            <p className="mkt-label text-[9px] text-white/40 mb-5">Begin</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex h-11 items-center rounded-lg bg-white px-5 text-[13px] font-semibold tracking-tight text-ink hover:bg-white/90 transition-colors"
            >
              Open the Terminal
            </button>
            <p className="mt-4 text-[11.5px] leading-relaxed text-white/35">
              No card required. Full access during the founding period.
            </p>
          </div>
        </div>

        {/* Disclaimer band */}
        <div className="border-t border-white/[0.08] py-6">
          <p className="text-[11px] leading-relaxed text-white/30 max-w-4xl">
            Entropy is a market-intelligence and probabilistic scenario engine. It does not
            provide investment advice, trading recommendations, or portfolio management
            services. All outputs are research-based observations and scenario projections.
            Users make independent investment decisions at their own risk.
          </p>
        </div>

        {/* Base row */}
        <div className="border-t border-white/[0.08] py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="mkt-label text-[9px] text-white/35">
            © {new Date().getFullYear()} Entropy · All rights reserved
          </p>
          <p className="mkt-label text-[9px] text-white/35">
            Designed & engineered by Pratik Sehwag
          </p>
        </div>
      </div>
    </footer>
  );
}
