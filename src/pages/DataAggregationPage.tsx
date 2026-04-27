import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Database, Filter, GitMerge, Scale, Repeat, ShieldCheck, AlertTriangle, Activity, Clock, Layers, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicNav from "@/components/PublicNav";
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
  { icon: Database, title: "Ingest", desc: "Crawl any domain — .gov, Tier-1 press, niche blogs, X, Reddit. No whitelist. Auto-registers new sources with Bayesian Beta priors." },
  { icon: Filter, title: "Clean & extract", desc: "Strip boilerplate, deduplicate, extract structured (subject, predicate, object, t) claim triples ready for scoring." },
  { icon: GitMerge, title: "Cross-source fuse", desc: "Noisy-OR agreement across independent sources. Source diversity (Shannon entropy H) measured to detect echo chambers." },
  { icon: Scale, title: "Truth gate T(x,t)", desc: "Sigmoid of weighted factors: source credibility, agreement, temporal freshness, bias, contradictions. Output ∈ [0,1]." },
  { icon: ShieldCheck, title: "Veracity-weighted signal", desc: "Every downstream input is multiplied by T before reaching prediction, risk, reflexivity or sizing engines." },
  { icon: Repeat, title: "Self-correct", desc: "Trade outcomes feed SGD on (w1..w5, b) and Bayesian updates on (α, β) per source. The truth model gets sharper every week." },
];

const GUARDS = [
  { icon: AlertTriangle, title: "False Consensus", math: "A > 0.85 ∧ H < 0.35 ∧ C > 0.25", desc: "Many sources agree — but they all copy the same wire. Triggers a hard contrarian flag in Reflexivity." },
  { icon: Activity, title: "Adversarial Spike", math: "ΔClaim/Δt > 3σ in <60s", desc: "Coordinated narrative push (pump, rumour, manipulation). Source weights are temporarily down-shifted." },
  { icon: Clock, title: "Stale Fact", math: "D(Δt) < 0.20", desc: "Information has decayed below its half-life. Signal multiplier collapses regardless of original credibility." },
  { icon: Layers, title: "Overfit Drift", math: "‖Δw‖ > τ over rolling 100 trades", desc: "Weight vector is diverging. Regularisation kicks in to prevent the truth engine from chasing recent noise." },
];

const STATS = [
  { v: "0", l: "Whitelisted sources" },
  { v: "T ∈ [0,1]", l: "Per-claim veracity" },
  { v: "Beta(α,β)", l: "Per-source posterior" },
  { v: "Online SGD", l: "Self-correcting weights" },
];

const tipStyle = { background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, fontSize: 11, color: "#000" };

export default function DataAggregationPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Data Aggregation · TWRD Veracity Layer | Entropy Lite";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "TWRD — the Truth-Weighted Reality Database powering Entropy Lite. Every signal is gated by T(x,t)=σ(w1S+w2A+w3D−w4B−w5C+b) before reaching prediction or risk.");
  }, []);

  return (
    <div className="min-h-screen bg-white text-black pb-20">
      <PublicNav />

      {/* HERO */}
      <header className="border-b border-black/[0.06]">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 pt-12 sm:pt-20 pb-12 sm:pb-16">
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full border border-black/10 bg-black/[0.02]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[10px] tracking-[0.15em] text-black/55 uppercase">Veracity Layer · Live</span>
          </div>
          <h1 className="text-[2.4rem] sm:text-6xl font-bold tracking-tighter leading-[1.02] mb-5">
            Data Aggregation
            <br />
            <span className="text-black/45">weighted by truth, not by source.</span>
          </h1>
          <p className="text-[16px] sm:text-lg text-black/60 max-w-2xl leading-relaxed mb-8">
            Most terminals trust whatever lands first. <span className="text-black font-semibold">TWRD</span> — the Truth-Weighted Reality Database — gates every claim through a sigmoid of source credibility, cross-source agreement, temporal decay, bias and contradiction, before it reaches a single decision engine.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-12">
            <Button size="lg" className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-7 h-12 rounded-full" onClick={() => navigate("/dashboard")}>
              See it live in the terminal <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <button onClick={() => navigate("/backbone")} className="font-mono text-xs tracking-wide px-7 h-12 rounded-full border border-black/15 hover:bg-black/[0.03]">
              Read the backbone
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-8 border-t border-black/[0.06]">
            {STATS.map((s) => (
              <div key={s.l}>
                <div className="text-xl sm:text-2xl font-bold tracking-tight font-mono">{s.v}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-black/40 mt-1.5">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* THE EQUATION */}
      <section className="border-b border-black/[0.06] bg-black/[0.015]">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">The truth function</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-8">One equation gates the entire stack.</h2>

          <div className="rounded-2xl border border-black/10 bg-white p-6 sm:p-10 shadow-sm">
            <div className="text-center font-mono text-lg sm:text-3xl tracking-tight mb-2 select-text">
              T(x, t) = σ( <span className="text-black/80">w₁·S</span> + <span className="text-black/80">w₂·A</span> + <span className="text-black/80">w₃·D</span> − <span className="text-black/80">w₄·B</span> − <span className="text-black/80">w₅·C</span> + b )
            </div>
            <p className="text-center font-mono text-[10px] text-black/40 tracking-wider">σ(z) = 1 / (1 + e<sup>−z</sup>) &nbsp;·&nbsp; T ∈ [0, 1]</p>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8 pt-8 border-t border-black/[0.06]">
              {[
                { sym: "S", name: "Source credibility", math: "Beta(α, β) posterior, per-domain" },
                { sym: "A", name: "Cross-source agreement", math: "Noisy-OR over independent sources" },
                { sym: "D", name: "Temporal freshness", math: "exp(−λ·Δt), λ tuned per claim type" },
                { sym: "B", name: "Bias penalty", math: "outlet lean × narrative loading" },
                { sym: "C", name: "Contradiction load", math: "fraction of conflicting claims" },
              ].map((f) => (
                <div key={f.sym} className="rounded-xl border border-black/[0.08] bg-black/[0.015] p-4">
                  <div className="font-mono text-2xl font-bold mb-1">{f.sym}</div>
                  <div className="text-[12px] font-semibold tracking-tight">{f.name}</div>
                  <div className="font-mono text-[10px] text-black/45 mt-1.5 leading-relaxed">{f.math}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PIPELINE FLOW */}
      <section className="border-b border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">The pipeline</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">Raw claim → veracity-weighted signal.</h2>
          <p className="text-sm sm:text-base text-black/55 max-w-2xl mb-10">Six deterministic stages. No source whitelist. No silent fallbacks. Every claim is auditable end-to-end.</p>

          {/* horizontal flow */}
          <div className="overflow-x-auto pb-3 -mx-5 px-5">
            <div className="flex items-stretch gap-3 min-w-max">
              {PIPELINE.map((p, i) => (
                <div key={p.title} className="flex items-stretch gap-3">
                  <div className="w-[200px] sm:w-[220px] rounded-xl border border-black/10 bg-white p-4 flex flex-col">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-black/[0.04] flex items-center justify-center">
                        <p.icon className="h-3.5 w-3.5 text-black/60" />
                      </div>
                      <span className="font-mono text-[9px] text-black/35 tracking-wider">STAGE {String(i + 1).padStart(2, "0")}</span>
                    </div>
                    <h3 className="font-semibold text-[13px] tracking-tight mb-1.5">{p.title}</h3>
                    <p className="text-[11.5px] text-black/55 leading-snug">{p.desc}</p>
                  </div>
                  {i < PIPELINE.length - 1 && (
                    <div className="flex items-center text-black/20 text-xl">→</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CHARTS GRID */}
      <section className="border-b border-black/[0.06] bg-black/[0.015]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">The math, visualised</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">Two views. The rest is written down.</h2>
          <p className="text-sm sm:text-base text-black/55 max-w-2xl mb-10">
            We deliberately keep the visuals minimal. Two charts cover the inputs that matter most — <span className="text-black font-semibold">who</span> a claim came from, and <span className="text-black font-semibold">how fast</span> it goes stale. Everything else is explained in plain language so you can audit the logic, not just admire the dashboard.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-12">
            {/* Source credibility curve */}
            <div className="rounded-xl border border-black/10 bg-white p-6">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="font-semibold text-sm tracking-tight">Source credibility — Beta posteriors</h3>
                <span className="font-mono text-[9px] text-black/40">α / (α + β)</span>
              </div>
              <p className="text-[11px] text-black/50 mb-4">Each domain class enters with a tier-appropriate Beta prior, then updates from real trade outcomes — every win sharpens α, every false signal sharpens β.</p>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={credibilityCurve} layout="vertical" margin={{ left: 90 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "rgba(0,0,0,0.45)", fontSize: 10 }} axisLine={{ stroke: "rgba(0,0,0,0.1)" }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: "rgba(0,0,0,0.6)", fontSize: 10 }} axisLine={{ stroke: "rgba(0,0,0,0.1)" }} width={88} />
                    <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Credibility"]} />
                    <Bar dataKey="credibility" radius={[0, 4, 4, 0]}>
                      {credibilityCurve.map((_, i) => <Cell key={i} fill={`rgba(0,0,0,${0.85 - i * 0.1})`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Temporal decay */}
            <div className="rounded-xl border border-black/10 bg-white p-6">
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="font-semibold text-sm tracking-tight">Temporal decay D(Δt)</h3>
                <span className="font-mono text-[9px] text-black/40">exp(−λ Δt)</span>
              </div>
              <p className="text-[11px] text-black/50 mb-4">Different claim types decay at different rates. A breaking rumour dies in hours, a macro print in days, a structural rate-cycle thesis in weeks. λ is tuned per claim class.</p>
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={decayCurve} margin={{ left: 0, right: 10 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(0,0,0,0.6)" /><stop offset="100%" stopColor="rgba(0,0,0,0)" /></linearGradient>
                      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(0,0,0,0.35)" /><stop offset="100%" stopColor="rgba(0,0,0,0)" /></linearGradient>
                      <linearGradient id="g3" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(0,0,0,0.15)" /><stop offset="100%" stopColor="rgba(0,0,0,0)" /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                    <XAxis dataKey="hours" tick={{ fill: "rgba(0,0,0,0.45)", fontSize: 10 }} axisLine={{ stroke: "rgba(0,0,0,0.1)" }} label={{ value: "Hours since claim", position: "insideBottom", offset: -4, fill: "rgba(0,0,0,0.4)", fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: "rgba(0,0,0,0.45)", fontSize: 10 }} axisLine={{ stroke: "rgba(0,0,0,0.1)" }} />
                    <Tooltip contentStyle={tipStyle} />
                    <Area type="monotone" dataKey="structural" stroke="rgba(0,0,0,0.5)" strokeWidth={1.5} fill="url(#g3)" />
                    <Area type="monotone" dataKey="macro" stroke="rgba(0,0,0,0.7)" strokeWidth={1.5} fill="url(#g2)" />
                    <Area type="monotone" dataKey="breaking" stroke="#000" strokeWidth={2} fill="url(#g1)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 mt-2 text-[10px] text-black/55">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-black" /> Breaking (λ=0.25/h)</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-black/60" /> Macro (λ=0.05/h)</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-black/30" /> Structural (λ=0.015/h)</span>
              </div>
            </div>
          </div>

          {/* WRITTEN EXPLANATION — agreement, diversity, gated vs raw */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <article className="rounded-xl border border-black/10 bg-white p-6">
              <h3 className="text-base font-semibold tracking-tight mb-2">Why agreement alone doesn't prove anything.</h3>
              <p className="text-[13px] text-black/65 leading-relaxed mb-3">
                Twenty outlets shouting the same headline is not twenty pieces of evidence — it is one wire-service quote, copy-pasted twenty times. TWRD measures source <span className="font-semibold text-black">diversity</span> using Shannon entropy across the cluster of sources backing a claim. Agreement (A) is then combined with diversity (H) inside the truth function so that <span className="font-semibold text-black">echo chambers self-cap</span>: the more correlated the publishers, the less each additional repetition is worth.
              </p>
              <p className="text-[13px] text-black/65 leading-relaxed">
                Concretely: if a story is carried by Reuters, the SEC filing, an FT analyst piece and a regional broker note, T climbs quickly. If the same story is carried by 40 SEO-farm rewrites of one tweet, T stays low — sometimes lower than a single tier-1 source on its own.
              </p>
            </article>

            <article className="rounded-xl border border-black/10 bg-white p-6">
              <h3 className="text-base font-semibold tracking-tight mb-2">Gated input vs. raw input — the practical delta.</h3>
              <p className="text-[13px] text-black/65 leading-relaxed mb-3">
                A naive terminal feeds every headline into the model with weight 1. TWRD multiplies every input by its truth score T ∈ [0, 1] before it touches prediction, position sizing or risk. The downstream model sees a <span className="font-semibold text-black">veracity-weighted signal</span>, not a popularity-weighted one.
              </p>
              <p className="text-[13px] text-black/65 leading-relaxed">
                In practice this means a single SEC 8-K can outweigh a hundred Reddit posts, and a coordinated narrative push gets quietly damped to near-zero influence — even while it still appears on every news ticker on the street.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* SOURCE TIERS TABLE */}
      <section className="border-b border-black/[0.06]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Source priors</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">Every source enters. None enter equal.</h2>
          <p className="text-sm sm:text-base text-black/55 max-w-2xl mb-8">No outlet is whitelisted, no outlet is banned. Each domain class arrives with a Bayesian prior; live trade outcomes update it forever.</p>

          <div className="overflow-x-auto rounded-xl border border-black/10">
            <table className="w-full text-sm">
              <thead className="bg-black/[0.025]">
                <tr className="text-left">
                  {["Tier", "Examples", "Prior α", "Prior β", "E[S]"].map((h) => (
                    <th key={h} className="px-4 py-3 font-mono text-[10px] tracking-wider text-black/45 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SOURCE_TIERS.map((t) => {
                  const expected = (t.alpha / (t.alpha + t.beta) * 100).toFixed(1);
                  return (
                    <tr key={t.tier} className="border-t border-black/[0.06]">
                      <td className="px-4 py-3 font-semibold text-[13px]">{t.tier}</td>
                      <td className="px-4 py-3 text-[12px] text-black/55">{t.examples}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{t.alpha}</td>
                      <td className="px-4 py-3 font-mono text-[12px]">{t.beta}</td>
                      <td className="px-4 py-3 font-mono text-[12px] font-semibold">{expected}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAILURE GUARDS */}
      <section className="border-b border-black/[0.06] bg-black/[0.015]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Failure guards</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">Four ways the truth engine refuses to be fooled.</h2>
          <p className="text-sm sm:text-base text-black/55 max-w-2xl mb-10">Each guard is a hard, math-defined trigger. None of them are AI judgement.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {GUARDS.map((g) => (
              <div key={g.title} className="rounded-xl border border-black/10 bg-white p-6">
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-black/[0.04] flex items-center justify-center flex-shrink-0">
                    <g.icon className="h-4 w-4 text-black/60" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[14px] tracking-tight">{g.title}</h3>
                    <code className="font-mono text-[10.5px] text-black/50 block mt-0.5">{g.math}</code>
                  </div>
                </div>
                <p className="text-[12.5px] text-black/60 leading-relaxed mt-2">{g.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DOWNSTREAM */}
      <section className="border-b border-black/[0.06]">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Where it shows up</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-10">TWRD touches every decision surface.</h2>

          <div className="space-y-3">
            {[
              { name: "Reflexivity Engine", effect: "False-consensus flags raise shift probability ≥70 and surface a contrarian read." },
              { name: "Risk Intelligence", effect: "Truth Risk lowers position-size multipliers and biases hedge weight when meanT < 0.4." },
              { name: "Desirable Assets", effect: "Candidates whose thesis depends on low-truth claims are demoted in the funnel." },
              { name: "Strategy Lab", effect: "Generated trade plans carry a TruthBadge so you see the input quality, not just the output confidence." },
              { name: "Reflexivity & Crown alerts", effect: "Adversarial spikes downweight social momentum signals before they reach prediction." },
            ].map((d) => (
              <div key={d.name} className="flex items-start gap-4 p-4 rounded-xl border border-black/[0.08] bg-white">
                <Workflow className="h-4 w-4 text-black/40 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-[13px] tracking-tight">{d.name}</div>
                  <p className="text-[12.5px] text-black/55 mt-0.5 leading-relaxed">{d.effect}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-5 sm:px-6 py-16 sm:py-24 text-center">
        <h2 className="text-3xl sm:text-5xl font-bold tracking-tighter mb-4">
          Stop trading on what was said.
          <br />
          <span className="text-black/45">Trade on what survives.</span>
        </h2>
        <p className="text-sm sm:text-base text-black/55 max-w-xl mx-auto mb-8">
          The TWRD layer is on by default for every Entropy Lite session. There is no toggle, no upsell, no second tier.
        </p>
        <Button size="lg" className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12 rounded-full" onClick={() => navigate("/dashboard")}>
          Open the terminal · free <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </section>
    </div>
  );
}