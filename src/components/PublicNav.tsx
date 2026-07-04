import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Menu, X, ArrowUpRight } from "lucide-react";
import Wordmark from "@/components/marketing/Wordmark";

const NAV_LINKS = [
  { label: "Platform", path: "/about" },
  { label: "Backbone", path: "/backbone" },
  { label: "Data", path: "/data" },
  { label: "Research", path: "/cadence" },
  { label: "Pricing", path: "/pricing" },
];

export default function PublicNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [utc, setUtc] = useState("");

  useEffect(() => {
    const tick = () => setUtc(new Date().toISOString().slice(11, 19));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  // Lock body scroll while the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="sticky top-0 z-50">
      {/* Utility strip — operational status, the institutional heartbeat */}
      <div className="bg-ink text-white/50 hidden sm:block">
        <div className="max-w-6xl mx-auto px-6 h-7 flex items-center justify-between">
          <span className="mkt-label text-[9px] text-white/40">
            Institutional-grade market intelligence
          </span>
          <span className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="mkt-label text-[9px] text-white/50">All systems operational</span>
            </span>
            <span className="mkt-label text-[9px] text-white/40 tabular-nums">{utc} UTC</span>
          </span>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="bg-white/85 backdrop-blur-2xl border-b border-ink/[0.07]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 sm:px-6 h-16">
          <button onClick={() => navigate("/")} className="flex items-center" aria-label="Entropy home">
            <Wordmark />
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((l) => {
              const active = location.pathname === l.path;
              return (
                <button
                  key={l.path}
                  onClick={() => navigate(l.path)}
                  className={`px-3.5 py-2 rounded-md text-[13px] font-medium tracking-tight transition-colors ${
                    active
                      ? "text-ink bg-ink/[0.05]"
                      : "text-ink/55 hover:text-ink hover:bg-ink/[0.03]"
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => navigate("/access")}
              className="text-[13px] font-medium tracking-tight text-ink/55 hover:text-ink transition-colors px-2"
            >
              Client access
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="group inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-[12.5px] font-semibold tracking-tight text-white hover:bg-ink-700 transition-colors"
            >
              Open Terminal
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </div>

          {/* Mobile controls */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex h-9 items-center rounded-lg bg-ink px-4 text-[12px] font-semibold tracking-tight text-white"
            >
              Terminal
            </button>
            <button
              onClick={() => setOpen((p) => !p)}
              className="p-2 -mr-2 text-ink/70 rounded-md hover:bg-ink/[0.04] transition-colors"
              aria-label="Menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile sheet */}
        {open && (
          <div className="md:hidden fixed inset-x-0 top-16 bottom-0 z-50 bg-white border-t border-ink/[0.07] px-5 pt-4 pb-8 overflow-auto animate-in fade-in slide-in-from-top-2 duration-200">
            {[...NAV_LINKS, { label: "Client access", path: "/access" }].map((l, i) => (
              <button
                key={l.path}
                onClick={() => {
                  navigate(l.path);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between py-4 border-b border-ink/[0.06] text-left ${
                  location.pathname === l.path ? "text-ink" : "text-ink/70"
                }`}
              >
                <span className="text-[17px] font-semibold tracking-tight">{l.label}</span>
                <span className="mkt-label text-[9px] text-ink/30">{String(i + 1).padStart(2, "0")}</span>
              </button>
            ))}
            <button
              onClick={() => {
                navigate("/dashboard");
                setOpen(false);
              }}
              className="mt-6 flex w-full h-12 items-center justify-center gap-2 rounded-lg bg-ink text-white text-[14px] font-semibold tracking-tight"
            >
              Open Terminal <ArrowUpRight className="h-4 w-4" />
            </button>
            <p className="mkt-label text-[9px] text-ink/30 text-center mt-6">
              Designed & engineered by Pratik Sehwag
            </p>
          </div>
        )}
      </nav>
    </div>
  );
}
