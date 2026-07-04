import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import Wordmark from "@/components/marketing/Wordmark";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen bg-ink text-white flex flex-col overflow-hidden">
      <div className="absolute inset-0 ink-grid grid-vignette" aria-hidden="true" />

      <header className="relative max-w-6xl mx-auto w-full px-5 sm:px-6 h-16 flex items-center">
        <button onClick={() => navigate("/")} aria-label="Entropy home">
          <Wordmark light />
        </button>
      </header>

      <main className="relative flex-1 flex items-center">
        <div className="max-w-6xl mx-auto w-full px-5 sm:px-6 pb-24">
          <div className="flex items-center gap-3 mb-7">
            <span className="h-px w-8 bg-white/25" />
            <span className="mkt-label text-[9px] text-white/60">Error 404</span>
          </div>
          <h1 className="mkt-display">
            This route does not resolve.
            <br />
            <span className="text-white/40">The market moved on.</span>
          </h1>
          <p className="mkt-lede text-white/55 max-w-md mt-6">
            The page you requested does not exist or has been relocated.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-10 inline-flex h-12 items-center gap-2 rounded-lg bg-white px-7 text-[13px] font-semibold tracking-tight text-ink hover:bg-white/90 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Return to base
          </button>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
