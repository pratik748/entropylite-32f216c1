import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
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

  const utcDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="sticky top-0 z-50">
      {/* Utility strip — session facts only */}
      <div className="bg-carbon-950 border-b border-hairline-faint hidden sm:block">
        <div className="max-w-7xl mx-auto px-8 h-8 flex items-center justify-between">
          <span className="mkt-label text-[10px] text-white/35">
            Entropy · Probabilistic market infrastructure
          </span>
          <span className="flex items-center gap-6">
            <span className="mkt-num text-[10px] text-white/35">{utcDate}</span>
            <span className="mkt-num text-[10px] text-white/50">{utc} UTC</span>
          </span>
        </div>
      </div>

      {/* Primary chrome */}
      <nav className="bg-carbon-900/95 backdrop-blur-sm border-b border-hairline">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-5 sm:px-8 h-14">
          <button onClick={() => navigate("/")} className="flex items-center" aria-label="Entropy home">
            <Wordmark light compact />
          </button>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-7 h-full">
            {NAV_LINKS.map((l) => {
              const active = location.pathname === l.path;
              return (
                <button
                  key={l.path}
                  onClick={() => navigate(l.path)}
                  className={`relative h-full inline-flex items-center text-[13px] tracking-tight transition-colors duration-150 ease-out ${
                    active ? "text-white font-medium" : "text-white/50 hover:text-white/85"
                  }`}
                >
                  {l.label}
                  {active && <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />}
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-6">
            <button
              onClick={() => navigate("/access")}
              className="text-[13px] tracking-tight text-white/50 hover:text-white/85 transition-colors duration-150 ease-out"
            >
              Client access
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex h-9 items-center bg-white px-5 text-[12.5px] font-semibold tracking-tight text-carbon-950 hover:bg-white/85 transition-colors duration-150 ease-out"
            >
              Open Terminal
            </button>
          </div>

          {/* Mobile controls */}
          <div className="flex md:hidden items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-flex h-9 items-center bg-white px-4 text-[12px] font-semibold tracking-tight text-carbon-950"
            >
              Terminal
            </button>
            <button
              onClick={() => setOpen((p) => !p)}
              className="p-2 -mr-2 text-white/70"
              aria-label="Menu"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile sheet */}
        {open && (
          <div className="md:hidden fixed inset-x-0 top-14 bottom-0 z-50 bg-carbon-950 border-t border-hairline px-5 pt-2 pb-8 overflow-auto">
            {[...NAV_LINKS, { label: "Client access", path: "/access" }].map((l, i) => (
              <button
                key={l.path}
                onClick={() => {
                  navigate(l.path);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between py-4 border-b border-hairline text-left ${
                  location.pathname === l.path ? "text-white" : "text-white/60"
                }`}
              >
                <span className="text-[16px] font-medium tracking-tight">{l.label}</span>
                <span className="mkt-label text-[10px] text-white/30">{String(i + 1).padStart(2, "0")}</span>
              </button>
            ))}
            <button
              onClick={() => {
                navigate("/dashboard");
                setOpen(false);
              }}
              className="mt-6 flex w-full h-12 items-center justify-center gap-2 bg-white text-carbon-950 text-[14px] font-semibold tracking-tight"
            >
              Open Terminal
            </button>
          </div>
        )}
      </nav>
    </div>
  );
}
