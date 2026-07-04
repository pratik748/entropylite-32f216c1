import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Database, Filter, GitMerge, Scale, Repeat, ShieldCheck, AlertTriangle, Activity, Clock, Layers, Workflow } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import { PageHeader, SectionIntro, InkButton, LineButton } from "@/components/marketing/Section";
import { usePrefersLight } from "@/hooks/use-prefers-light";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area,
} from "recharts";

// --- mocked but mathematically faithful illustrations of the live TWRD layer ---

const SOURCE_TIERS = [
  { tier: "Regulators · .gov / .edu", alpha: 18, beta: 4, examples: "SEC, Federal Reserve, RBI, ECB, Eurostat" },
  { tier: "Tier-1 Financial Press", alpha: 16, beta: 5, examples: "Reuters, Bloomberg, FT, WSJ, Nature, Science" },
  { tier: "Established Outlets", alpha: 12, beta: 6, examples: "CNBC, BBC, Moneycontrol, ET, Mint" },
  { tier: "Independent / Long-form", alpha: 9, beta: 7, examples: "Substack analysts, niche research blogs" },
  { tier: "Aggregators / Unknown", alpha: 5, beta: 5, examples: "First-time domains, generic .com / .org" },
  { tier: "Social / Speculative", alpha: 4, beta: 8, examples: "X / Twitter, Reddit, Stocktwits, Telegram" },
];

const credibilityCurve = SOURCE_TIERS.map((t) => ({
  name: t.tier.split("·")[0].trim(),
  credibility: Number((t.alpha / (t.alpha + t.beta) * 100).toFixed(1)),
}));

// temporal decay D(Δt) = exp(−λ Δt)
const decayCurve = Array.from({ length: 25 }, (_, i) => {
  const hours = i;
  return {
    hours,
    breaking: Number((Math.exp(-0.25 * hours) * 100).toFixed(1)),
    macro: Number((Math.exp(-0.05 * hours) * 100).toFixed(1)),
    structural: Number((Math.exp(-0.015 * hours) * 100).toFixed(1)),
  };
});

const PIPELINE = [
  { icon: Database, title: "Ingest", desc: "Crawl any domain — .gov, tier-1 press, niche blogs, X, Reddit. No whitelist. New sources auto-register with Bayesian Beta priors." },
  { icon: Filter, title: "Clean & extract", desc: "Strip boilerplate, deduplicate, extract structured (subject, predicate, object, t) claim triples ready for scoring." },
  { icon: GitMerge, title: "Cross-source fuse", desc: "Noisy-OR agreement across independent sources. Source diversity (Shannon entropy H) measured to detect echo chambers." },
  { icon: Scale, title: "Truth gate T(x,t)", desc: "Sigmoid of weighted factors: source credibility, agreement, temporal freshness, bias, contradictions. Output ∈ [0,1]." },
  { icon: ShieldCheck, title: "Veracity-weighted signal", desc: "Every downstream input is multiplied by T before reaching prediction, risk, reflexivity or sizing engines." },
  { icon: Repeat, title: "Self-correct", desc: "Trade outcomes feed SGD on (w1..w5, b) and Bayesian updates on (α, β) per source. The truth model sharpens every week." },
];

const GUARDS = [
  { icon: AlertTriangle, title: "False consensus", math: "A > 0.85 ∧ H < 0.35 ∧ C > 0.25", desc: "Many sources agree, but they all copy the same wire. Triggers a hard contrarian flag in Reflexivity." },
  { icon: Activity, title: "Adversarial spike", math: "ΔClaim/Δt > 3σ in <60s", desc: "Coordinated narrative push (pump, rumour, manipulation). Source weights are temporarily down-shifted." },
  { icon: Clock, title: "Stale fact", math: "D(Δt) < 0.20", desc: "Information has decayed below its half-life. Signal multiplier collapses regardless of original credibility." },
  { icon: Layers, title: "Overfit drift", math: "‖Δw‖ > τ over rolling 100 trades", desc: "Weight vector is diverging. Regularisation kicks in to prevent the truth engine from chasing recent noise." },
];

const STATS = [
  { v: "0", l: "Whitelisted sources" },
  { v: "T ∈ [0,1]", l: "Per-claim veracity" },
  { v: "Beta(α,β)", l: "Per-source posterior" },
  { v: "Online SGD", l: "Self-correcting weights" },
];

export default function DataAggregationPage() {
  const navigate = useNavigate();
  const light = usePrefersLight();

  // Chart colours live in JS (Recharts style props) so they can't ride the
  // --pub-* CSS variables the rest of the site flips through — derive them
  // from the system theme here. `fg` is the ink/paper foreground triplet.
  const fg = light ? "10,10,11" : "255,255,255";
  const ink = (a: number) => `rgba(${fg},${a})`;
  const tipStyle = {
    background: light ? "#F0F0F1" : "#0E0E0E",
    border: `1px solid ${light ? "#D0D0D3" : "#2B2B2B"}`,
    borderRadius: 0,
    fontSize: 11,
    color: ink(0.85),
  };
  const AXIS_TICK = { fill: ink(0.4), fontSize: 10 };
  const AXIS_LINE = { stroke: ink(0.12) };
  const GRID_STROKE = ink(0.05);

  useEffect(() => {
    document.title = "Data · TWRD veracity layer | Entropy";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "TWRD, the Truth-Weighted Reality Database powering Entropy. Every signal is gated by T(x,t)=σ(w1S+w2A+w3D−w4B−w5C+b) before reaching prediction or risk.");
  }, []);

  return (
    <div className="site-public min-h-screen bg-carbon-950 text-white">
      <PublicNav />

      <PageHeader
        label="Veracity layer"
        title={
          <>
            Data aggregation weighted
            <br />
            <span className="text-white/40">by truth, not by source.</span>
          </>
        }
        lede={
          <>
            Most terminals trust whatever lands first.{" "}
            <span className="text-white font-medium">TWRD</span> — the Truth-Weighted
            Reality Database — gates every claim through a sigmoid of source credibility,
            cross-source agreement, temporal decay, bias and contradiction before it
            reaches a single decision engine.
          </>
        }
      >
        <div className="flex flex-col sm:flex-row gap-3 mt-9">
          <InkButton onClick={() => navigate("/dashboard")}>
            See it in the terminal <ArrowRight className="h-4 w-4" />
          </InkButton>
          <LineButton onClick={() => navigate("/backbone")}>
            Read the backbone
          </LineButton>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-hairline mt-12">
          {STATS.map((s, i) => (
            <div
              key={s.l}
              className={`py-6 pr-6 ${i > 0 ? "lg:border-l lg:border-hairline lg:pl-8" : ""} ${i % 2 === 1 ? "border-l border-hairline pl-6 lg:pl-8" : ""}`}
            >
              <div className="mkt-num text-xl sm:text-2xl text-white">{s.v}</div>
              <div className="mkt-label text-[9px] text-white/35 mt-2">{s.l}</div>
            </div>
          ))}
        </div>
      </PageHeader>

      {/* THE EQUATION */}
      <section className="border-b border-hairline bg-carbon-900">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <SectionIntro
            index="01"
            label="The truth function"
            title={<>One equation gates the entire stack.</>}
          />

          <div className="border border-hairline bg-carbon-950 p-6 sm:p-10 mt-12">
            <div className="text-center mkt-num text-lg sm:text-3xl mb-2 select-text text-white">
              T(x, t) = σ( <span className="text-white/75">w₁·S</span> + <span className="text-white/75">w₂·A</span> + <span className="text-white/75">w₃·D</span> − <span className="text-white/75">w₄·B</span> − <span className="text-white/75">w₅·C</span> + b )
            </div>
            <p className="text-center mkt-num text-[10px] text-white/35 tracking-wider">σ(z) = 1 / (1 + e<sup>−z</sup>) &nbsp;·&nbsp; T ∈ [0, 1]</p>

            <div className="grid grid-cols-2 md:grid-cols-5 mt-10 border-t border-l border-hairline">
              {[
                { sym: "S", name: "Source credibility", math: "Beta(α, β) posterior, per-domain" },
                { sym: "A", name: "Cross-source agreement", math: "Noisy-OR over independent sources" },
                { sym: "D", name: "Temporal freshness", math: "exp(−λ·Δt), λ tuned per claim type" },
                { sym: "B", name: "Bias penalty", math: "outlet lean × narrative loading" },
                { sym: "C", name: "Contradiction load", math: "fraction of conflicting claims" },
              ].map((f) => (
                <div key={f.sym} className="border-b border-r border-hairline p-4 sm:p-5">
                  <div className="mkt-num text-2xl text-white mb-1.5">{f.sym}</div>
                  <div className="text-[12px] font-semibold tracking-tight text-white">{f.name}</div>
                  <div className="mkt-num text-[10px] text-white/40 mt-1.5 leading-relaxed">{f.math}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PIPELINE FLOW */}
      <section className="border-b border-hairline">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <SectionIntro
            index="02"
            label="The pipeline"
            title={<>Raw claim → veracity-weighted signal.</>}
            lede="Six deterministic stages. No source whitelist. No silent fallbacks. Every claim is auditable end-to-end."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mt-12 border-t border-l border-hairline">
            {PIPELINE.map((p, i) => (
              <div key={p.title} className="border-b border-r border-hairline p-7 hover:bg-carbon-900 transition-colors duration-150 ease-out">
                <div className="flex items-center justify-between mb-4">
                  <p.icon className="h-4 w-4 text-white/40" strokeWidth={1.5} />
                  <span className="mkt-label text-[9px] text-white/30">Stage {String(i + 1).padStart(2, "0")}</span>
                </div>
                <h3 className="text-[14px] font-semibold tracking-tight mb-2 text-white">{p.title}</h3>
                <p className="text-[12.5px] text-white/50 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CHARTS GRID */}
      <section className="border-b border-hairline bg-carbon-900">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <SectionIntro
            index="03"
            label="The math, visualised"
            title={<>Two views. The rest is written down.</>}
            lede={
              <>
                Two charts cover the inputs that matter most — <span className="text-white font-medium">who</span> a
                claim came from, and <span className="text-white font-medium">how fast</span> it goes stale.
                Everything else is explained in plain language so you can audit the logic, not just
                admire the dashboard.
              </>
            }
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-12 mb-12">
            {/* Source credibility curve */}
            <div className="border border-hairline bg-carbon-950 p-6 sm:p-7">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-[14px] font-semibold tracking-tight text-white">Source credibility — Beta posteriors</h3>
                <span className="mkt-num text-[9px] text-white/35">α / (α + β)</span>
              </div>
              <p className="text-[11.5px] text-white/45 mb-4 leading-relaxed">Each domain class enters with a tier-appropriate Beta prior, then updates from real trade outcomes — every win sharpens α, every false signal sharpens β.</p>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={credibilityCurve} layout="vertical" margin={{ left: 90 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={AXIS_TICK} axisLine={AXIS_LINE} />
                    <YAxis dataKey="name" type="category" tick={{ fill: ink(0.55), fontSize: 10 }} axisLine={AXIS_LINE} width={88} />
                    <Tooltip contentStyle={tipStyle} cursor={{ fill: ink(0.04) }} formatter={(v: number) => [`${v}%`, "Credibility"]} />
                    <Bar dataKey="credibility">
                      {credibilityCurve.map((_, i) => <Cell key={i} fill={ink(Number((0.75 - i * 0.1).toFixed(2)))} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Temporal decay */}
            <div className="border border-hairline bg-carbon-950 p-6 sm:p-7">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-[14px] font-semibold tracking-tight text-white">Temporal decay D(Δt)</h3>
                <span className="mkt-num text-[9px] text-white/35">exp(−λ Δt)</span>
              </div>
              <p className="text-[11.5px] text-white/45 mb-4 leading-relaxed">Different claim types decay at different rates. A breaking rumour dies in hours, a macro print in days, a structural rate-cycle thesis in weeks. λ is tuned per claim class.</p>
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={decayCurve} margin={{ left: 0, right: 10 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ink(0.35)} /><stop offset="100%" stopColor={ink(0)} /></linearGradient>
                      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ink(0.18)} /><stop offset="100%" stopColor={ink(0)} /></linearGradient>
                      <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ink(0.08)} /><stop offset="100%" stopColor={ink(0)} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                    <XAxis dataKey="hours" tick={AXIS_TICK} axisLine={AXIS_LINE} label={{ value: "Hours since claim", position: "insideBottom", offset: -4, fill: ink(0.35), fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={AXIS_TICK} axisLine={AXIS_LINE} />
                    <Tooltip contentStyle={tipStyle} />
                    <Area type="monotone" dataKey="structural" stroke={ink(0.3)} strokeWidth={1.2} fill="url(#g3)" />
                    <Area type="monotone" dataKey="macro" stroke={ink(0.55)} strokeWidth={1.2} fill="url(#g2)" />
                    <Area type="monotone" dataKey="breaking" stroke={ink(0.9)} strokeWidth={1.6} fill="url(#g1)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 mt-2 text-[10px] text-white/50">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-white/90" /> Breaking (λ=0.25/h)</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-white/50" /> Macro (λ=0.05/h)</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 bg-white/25" /> Structural (λ=0.015/h)</span>
              </div>
            </div>
          </div>

          {/* WRITTEN EXPLANATION */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <article className="border border-hairline bg-carbon-950 p-6 sm:p-7">
              <h3 className="text-[15px] font-semibold tracking-tight mb-3 text-white">Why agreement alone doesn't prove anything.</h3>
              <p className="text-[13px] text-white/55 leading-relaxed mb-3">
                Twenty outlets shouting the same headline is not twenty pieces of evidence — it is one wire-service quote, copy-pasted twenty times. TWRD measures source <span className="font-semibold text-white">diversity</span> using Shannon entropy across the cluster of sources backing a claim. Agreement (A) is then combined with diversity (H) inside the truth function so that <span className="font-semibold text-white">echo chambers self-cap</span>: the more correlated the publishers, the less each additional repetition is worth.
              </p>
              <p className="text-[13px] text-white/55 leading-relaxed">
                Concretely: if a story is carried by Reuters, the SEC filing, an FT analyst piece and a regional broker note, T climbs quickly. If the same story is carried by 40 SEO-farm rewrites of one tweet, T stays low — sometimes lower than a single tier-1 source on its own.
              </p>
            </article>

            <article className="border border-hairline bg-carbon-950 p-6 sm:p-7">
              <h3 className="text-[15px] font-semibold tracking-tight mb-3 text-white">Gated input vs. raw input — the practical delta.</h3>
              <p className="text-[13px] text-white/55 leading-relaxed mb-3">
                A naive terminal feeds every headline into the model with weight 1. TWRD multiplies every input by its truth score T ∈ [0, 1] before it touches prediction, position sizing or risk. The downstream model sees a <span className="font-semibold text-white">veracity-weighted signal</span>, not a popularity-weighted one.
              </p>
              <p className="text-[13px] text-white/55 leading-relaxed">
                In practice this means a single SEC 8-K can outweigh a hundred Reddit posts, and a coordinated narrative push gets quietly damped to near-zero influence — even while it still appears on every news ticker on the street.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* SOURCE TIERS TABLE */}
      <section className="border-b border-hairline">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <SectionIntro
            index="04"
            label="Source priors"
            title={<>Every source enters. None enter equal.</>}
            lede="No outlet is whitelisted, no outlet is banned. Each domain class arrives with a Bayesian prior; live trade outcomes update it forever."
          />

          <div className="overflow-x-auto border border-hairline mt-12 bg-carbon-900">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left border-b border-hairline">
                  {["Tier", "Examples", "Prior α", "Prior β", "E[S]"].map((h, i) => (
                    <th key={h} className={`px-4 py-3 mkt-label text-[9px] text-white/35 font-medium ${i >= 2 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SOURCE_TIERS.map((t) => {
                  const expected = (t.alpha / (t.alpha + t.beta) * 100).toFixed(1);
                  return (
                    <tr key={t.tier} className="border-b border-hairline-faint last:border-b-0 hover:bg-carbon-750 transition-colors duration-150 ease-out">
                      <td className="px-4 py-3.5 font-medium text-[13px] tracking-tight text-white">{t.tier}</td>
                      <td className="px-4 py-3.5 text-[12px] text-white/50">{t.examples}</td>
                      <td className="px-4 py-3.5 mkt-num text-[12px] text-white/70 text-right">{t.alpha}</td>
                      <td className="px-4 py-3.5 mkt-num text-[12px] text-white/70 text-right">{t.beta}</td>
                      <td className="px-4 py-3.5 mkt-num text-[12px] text-white text-right">{expected}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAILURE GUARDS */}
      <section className="border-b border-hairline bg-carbon-900">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <SectionIntro
            index="05"
            label="Failure guards"
            title={<>Four ways the truth engine refuses to be fooled.</>}
            lede="Each guard is a hard, math-defined trigger. None of them are AI judgement."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 mt-12 border-t border-l border-hairline">
            {GUARDS.map((g) => (
              <div key={g.title} className="border-b border-r border-hairline bg-carbon-950 p-7">
                <div className="flex items-start gap-4 mb-3">
                  <g.icon className="h-4 w-4 text-white/40 mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold tracking-tight text-white">{g.title}</h3>
                    <code className="mkt-num text-[10.5px] text-white/45 block mt-1">{g.math}</code>
                  </div>
                </div>
                <p className="text-[12.5px] text-white/50 leading-relaxed">{g.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DOWNSTREAM */}
      <section className="border-b border-hairline">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <SectionIntro
            index="06"
            label="Where it shows up"
            title={<>TWRD touches every decision surface.</>}
          />

          <div className="border-t border-hairline mt-12">
            {[
              { name: "Reflexivity Engine", effect: "False-consensus flags raise shift probability ≥70 and surface a contrarian read." },
              { name: "Risk Intelligence", effect: "Truth Risk lowers position-size multipliers and biases hedge weight when meanT < 0.4." },
              { name: "Desirable Assets", effect: "Candidates whose thesis depends on low-truth claims are demoted in the funnel." },
              { name: "Strategy Lab", effect: "Generated trade plans carry a TruthBadge so you see the input quality, not just the output confidence." },
              { name: "Reflexivity & Crown alerts", effect: "Adversarial spikes downweight social momentum signals before they reach prediction." },
            ].map((d) => (
              <div key={d.name} className="grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-1 sm:gap-6 items-baseline border-b border-hairline py-5">
                <div className="flex items-center gap-3">
                  <Workflow className="h-3.5 w-3.5 text-white/30 flex-shrink-0" strokeWidth={1.5} />
                  <span className="text-[13.5px] font-semibold tracking-tight text-white">{d.name}</span>
                </div>
                <p className="text-[13px] text-white/50 leading-relaxed pl-6 sm:pl-0">{d.effect}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-carbon-950">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 py-20 sm:py-32 text-center">
          <h2 className="mkt-display text-white">
            Stop trading on what was said.
            <br />
            <span className="text-white/35">Trade on what survives.</span>
          </h2>
          <p className="mkt-lede text-white/50 max-w-xl mx-auto mt-6">
            The TWRD layer is on by default for every Entropy session. There is no toggle, no upsell, no second tier.
          </p>
          <div className="mt-10">
            <InkButton onClick={() => navigate("/dashboard")}>
              Open the terminal <ArrowRight className="h-4 w-4" />
            </InkButton>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
