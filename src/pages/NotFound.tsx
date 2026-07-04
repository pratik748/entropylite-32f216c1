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
    <div className="site-public min-h-screen bg-carbon-950 text-white flex flex-col">
      <header className="max-w-7xl mx-auto w-full px-5 sm:px-8 h-14 flex items-center border-b border-hairline">
        <button onClick={() => navigate("/")} aria-label="Entropy home">
          <Wordmark light compact />
        </button>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-7xl mx-auto w-full px-5 sm:px-8 pb-24">
          <div className="flex items-center gap-3 mb-7">
            <span className="h-px w-8 bg-hairline-strong" />
            <span className="mkt-label text-[10px] text-white/55">Error 404</span>
          </div>
          <h1 className="mkt-display text-white">
            This route does not resolve.
            <br />
            <span className="text-white/40">The page has moved or never existed.</span>
          </h1>
          <p className="mkt-lede text-white/50 max-w-md mt-6">
            Check the address, or return to the front page.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-10 inline-flex h-11 items-center gap-2 bg-white px-7 text-[13px] font-semibold tracking-tight text-carbon-950 hover:bg-white/85 transition-colors duration-150 ease-out"
          >
            <ArrowLeft className="h-4 w-4" /> Return home
          </button>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
