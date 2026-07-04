import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import { PageHeader, SectionIntro, InkButton } from "@/components/marketing/Section";

const SECTIONS = [
  {
    n: "01",
    title: "The problem",
    body: [
      "Retail investors make decisions with incomplete data. Institutional desks operate with proprietary quant models, dedicated risk teams, and real-time flow intelligence. The gap between those two worlds has not narrowed in decades.",
      "Most retail platforms offer charts and basic indicators. None provide the structural analysis, constraint detection, or predictive simulation that professional desks rely on daily.",
    ],
  },
  {
    n: "02",
    title: "The system",
    body: [
      "Entropy delivers institutional-grade research capability without institutional complexity. The platform ingests real-time market data from multiple sources, runs Monte Carlo simulations across 10,000 paths, detects structural constraints through the CLANK engine, and produces probabilistic intelligence — all in real time.",
      "The system is organized into interconnected intelligence modules, each responsible for a specific analytical domain: risk quantification, statistical arbitrage, geopolitical monitoring, regime classification, causal-chain modelling, and autonomous strategy generation.",
    ],
  },
  {
    n: "03",
    title: "Market structure analysis",
    body: [
      "Every asset exists inside a web of structural forces — liquidity constraints, positioning patterns, regime shifts, geopolitical pressure. Entropy maps these forces continuously, providing a probabilistic intelligence layer that adapts as market structure evolves.",
      "The CLANK engine (Constraint, Liquidity, Accumulation, Narrative, Kinetic) monitors five structural dimensions simultaneously and raises alerts when any dimension approaches a critical threshold.",
    ],
  },
  {
    n: "04",
    title: "Quantitative risk framework",
    body: [
      "The risk engine computes Value at Risk and Conditional VaR (Expected Shortfall) at both 95% and 99% confidence. Liquidity-adjusted VaR accounts for position-size-dependent slippage. Portfolio-wide stress testing replays historical crisis scenarios against your current book. Every metric updates live.",
    ],
  },
  {
    n: "05",
    title: "Predictive intelligence",
    body: [
      "Monte Carlo simulation models 10,000 possible future price paths for each asset using Geometric Brownian Motion calibrated to current volatility and drift. The Causal Effects engine models how a single event cascades through correlated sectors, currencies, and asset classes across three orders of impact.",
    ],
  },
  {
    n: "06",
    title: "Scenario intelligence",
    body: [
      "The Strategy Factory autonomously generates scenario-based positioning hypotheses calibrated to the current regime, portfolio composition, and identified structural patterns. Each scenario carries key levels, projected ranges, and risk-based sizing. Paper simulation validates hypotheses before any live positioning.",
    ],
  },
  {
    n: "07",
    title: "Continuous learning",
    body: [
      "Scar Memory records every market outcome and scenario accuracy. The Outcome Gradient engine uses this record to continuously improve confidence calibration and model selection — for your account alone.",
    ],
  },
];

export default function AboutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Platform | Entropy — Institutional market intelligence";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Entropy is an institutional-grade market intelligence system: structural market analysis, liquidity flow detection, and probabilistic decision modelling in one terminal.");
  }, []);

  return (
    <div className="min-h-screen bg-white text-ink">
      <PublicNav />

      <PageHeader
        label="Platform"
        title={
          <>
            The intelligence layer
            <br />
            <span className="text-white/40">markets were missing.</span>
          </>
        }
        lede="Entropy combines quantitative risk analytics, regime detection, liquidity-flow analysis and probabilistic modelling into a single, institutional-grade research terminal."
      />

      <main className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Sticky index */}
          <aside className="hidden lg:block lg:col-span-3">
            <div className="sticky top-32">
              <p className="mkt-label text-[9px] text-ink/40 mb-5">Contents</p>
              <ul className="space-y-3 border-l border-ink/[0.08]">
                {SECTIONS.map((s) => (
                  <li key={s.n}>
                    <a
                      href={`#s-${s.n}`}
                      className="flex items-baseline gap-3 pl-4 -ml-px border-l border-transparent hover:border-ink/40 text-[12.5px] tracking-tight text-ink/50 hover:text-ink transition-colors"
                    >
                      <span className="mkt-label text-[8px] text-ink/30">{s.n}</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Body */}
          <div className="lg:col-span-9 lg:max-w-2xl">
            {SECTIONS.map((s) => (
              <section key={s.n} id={`s-${s.n}`} className="border-t border-ink/[0.07] py-10 first:border-t-0 first:pt-0 scroll-mt-28">
                <div className="flex items-center gap-3 mb-4">
                  <span className="mkt-label text-[9px] text-ink/30">{s.n}</span>
                  <h2 className="text-[19px] font-semibold tracking-tight">{s.title}</h2>
                </div>
                {s.body.map((p, i) => (
                  <p key={i} className="text-[15px] text-ink/60 leading-relaxed mb-4 last:mb-0">
                    {p}
                  </p>
                ))}
              </section>
            ))}

            <section className="border-t border-ink/[0.07] py-10">
              <div className="flex items-center gap-3 mb-4">
                <span className="mkt-label text-[9px] text-ink/30">08</span>
                <h2 className="text-[19px] font-semibold tracking-tight">Built by Pratik Sehwag</h2>
              </div>
              <p className="text-[15px] text-ink/60 leading-relaxed">
                Entropy is designed and engineered as a research-grade intelligence system. Every
                module — from the statistical-arbitrage engine to the causal-effects simulator — is
                grounded in quantitative methodology and real market data. The platform provides
                intelligence, not advice. All investment decisions remain with the user.
              </p>
            </section>
          </div>
        </div>
      </main>

      {/* CTA band */}
      <section className="border-t border-ink/[0.07] bg-[#FAFBFC]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <SectionIntro
            label="Next"
            align="center"
            title={<>See the system running.</>}
          />
          <div className="text-center mt-8">
            <InkButton onClick={() => navigate("/dashboard")}>
              Open the Terminal <ArrowRight className="h-4 w-4" />
            </InkButton>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
