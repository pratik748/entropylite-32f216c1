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
    <footer className="bg-carbon-950 text-white border-t border-hairline">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        {/* Upper — brand + link columns */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-6 pt-16 pb-12">
          <div className="md:col-span-5">
            <Wordmark light />
            <p className="mt-6 max-w-sm text-[13px] leading-relaxed text-white/40">
              A probabilistic market-intelligence terminal. Twelve analytical
              engines — risk, constraint detection, simulation, flow — composed
              into one operational surface.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title} className="md:col-span-2">
              <p className="mkt-label text-[10px] text-white/35 mb-5">{col.title}</p>
              <ul className="space-y-3">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <button
                      onClick={() => navigate(l.path)}
                      className="text-[13px] tracking-tight text-white/55 hover:text-white transition-colors duration-150 ease-out text-left"
                    >
                      {l.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="md:col-span-3">
            <p className="mkt-label text-[10px] text-white/35 mb-5">Access</p>
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex h-10 items-center bg-white px-5 text-[13px] font-semibold tracking-tight text-carbon-950 hover:bg-white/85 transition-colors duration-150 ease-out"
            >
              Open the Terminal
            </button>
            <p className="mt-4 text-[11.5px] leading-relaxed text-white/30">
              No card required. Full access during the founding period.
            </p>
          </div>
        </div>

        {/* Disclaimer band */}
        <div className="border-t border-hairline py-6">
          <p className="text-[11px] leading-relaxed text-white/30 max-w-4xl">
            Entropy is a market-intelligence and probabilistic scenario engine. It does not
            provide investment advice, trading recommendations, or portfolio management
            services. All outputs are research-based observations and scenario projections.
            Users make independent investment decisions at their own risk.
          </p>
        </div>

        {/* Base row */}
        <div className="border-t border-hairline py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="mkt-label text-[10px] text-white/30">
            © {new Date().getFullYear()} Entropy · All rights reserved
          </p>
          <p className="mkt-label text-[10px] text-white/30">
            Designed &amp; engineered by Pratik Sehwag
          </p>
        </div>
      </div>
    </footer>
  );
}
