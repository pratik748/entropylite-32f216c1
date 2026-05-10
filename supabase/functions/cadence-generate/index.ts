// Cadence — daily research stream generator.
// Pipeline: pick topic → parallel multi-provider research → critic/synthesis pass
// → AI-generated conceptual diagram (nano-banana) → persist row.
// No auth required: invoked by pg_cron and (optionally) by an admin key.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { callAIParallel, callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Curated quant/finance concept bank — system picks the next unused one daily.
// When fewer than 5 remain, AI proposes new ones from broader domain.
const TOPIC_BANK: Array<{ topic: string; discipline: string }> = [
  { topic: "Kelly Criterion", discipline: "Information Theory · Capital Allocation" },
  { topic: "Hidden Markov Models for Regime Detection", discipline: "Stochastic Processes · State-Space Models" },
  { topic: "Conditional Value-at-Risk (CVaR) and Coherent Risk Measures", discipline: "Risk Theory · Coherent Risk Measures" },
  { topic: "Reflexivity and Belief-Driven Price Dynamics", discipline: "Behavioral Finance · Feedback Dynamics" },
  { topic: "Geometric Brownian Motion and Monte Carlo Path Simulation", discipline: "Stochastic Calculus · Numerical Methods" },
  { topic: "GARCH and Volatility Clustering", discipline: "Econometrics · Volatility Modeling" },
  { topic: "Black-Scholes-Merton and the Greeks", discipline: "Derivatives Pricing · Risk Sensitivities" },
  { topic: "Cointegration and Pairs Trading (Engle-Granger)", discipline: "Time-Series Econometrics · Statistical Arbitrage" },
  { topic: "Ornstein-Uhlenbeck Mean Reversion", discipline: "Stochastic Processes · Mean Reversion" },
  { topic: "Kalman Filtering for Hedge Ratio Estimation", discipline: "State-Space Estimation · Statistical Arbitrage" },
  { topic: "Cholesky Decomposition for Correlated Asset Simulation", discipline: "Linear Algebra · Risk Simulation" },
  { topic: "Ledoit-Wolf Covariance Shrinkage", discipline: "High-Dimensional Statistics · Portfolio Theory" },
  { topic: "Merton Distance-to-Default Model", discipline: "Credit Risk · Structural Models" },
  { topic: "Heston Stochastic Volatility Model", discipline: "Derivatives Pricing · Stochastic Volatility" },
  { topic: "Jump-Diffusion Models (Merton 1976)", discipline: "Stochastic Calculus · Tail Risk" },
  { topic: "Extreme Value Theory and Peaks-Over-Threshold", discipline: "Tail Risk · Extreme Statistics" },
  { topic: "Copulas and Dependence Modeling", discipline: "Multivariate Statistics · Risk Aggregation" },
  { topic: "Cornish-Fisher Expansion for Non-Gaussian VaR", discipline: "Risk Theory · Higher Moments" },
  { topic: "Almgren-Chriss Optimal Execution", discipline: "Market Microstructure · Execution Algorithms" },
  { topic: "Avellaneda-Stoikov Market Making", discipline: "Market Microstructure · Liquidity Provision" },
  { topic: "Order Flow Imbalance and Price Impact", discipline: "Market Microstructure · Flow Dynamics" },
  { topic: "Kyle's Lambda and Adverse Selection", discipline: "Market Microstructure · Information Asymmetry" },
  { topic: "Hawkes Processes for Event Clustering", discipline: "Point Processes · High-Frequency Trading" },
  { topic: "Bayesian Updating in Sequential Trading", discipline: "Bayesian Inference · Decision Theory" },
  { topic: "Expectation-Maximization for Latent Regimes", discipline: "Unsupervised Learning · Mixture Models" },
  { topic: "Principal Component Analysis of Yield Curves", discipline: "Linear Algebra · Fixed Income" },
  { topic: "Risk Parity and Equal Risk Contribution", discipline: "Portfolio Construction · Risk Budgeting" },
  { topic: "Black-Litterman Posterior Allocation", discipline: "Bayesian Portfolio Theory · Views Integration" },
  { topic: "Sharpe Ratio: Statistical Properties and Pitfalls", discipline: "Performance Measurement · Statistics" },
  { topic: "Sortino Ratio and Downside Deviation", discipline: "Performance Measurement · Asymmetric Risk" },
  { topic: "Maximum Drawdown and Calmar Ratio", discipline: "Performance Measurement · Drawdown Analysis" },
  { topic: "Heath-Jarrow-Morton Framework for Interest Rates", discipline: "Fixed Income · Forward Rate Models" },
  { topic: "Vasicek and CIR Short-Rate Models", discipline: "Fixed Income · Stochastic Rates" },
  { topic: "PCA-Based Statistical Arbitrage", discipline: "Statistical Arbitrage · Dimension Reduction" },
  { topic: "Reinforcement Learning for Trade Execution", discipline: "Machine Learning · Sequential Decision" },
  { topic: "Information Coefficient and Strategy Decay", discipline: "Quant Research · Signal Evaluation" },
  { topic: "Backtest Overfitting and the Deflated Sharpe Ratio", discipline: "Quant Research · Multiple Testing" },
  { topic: "Walk-Forward Analysis vs. Cross-Validation", discipline: "Backtesting Methodology · Time-Series ML" },
  { topic: "Lagrange Multipliers in Mean-Variance Optimization", discipline: "Convex Optimization · Portfolio Theory" },
  { topic: "Implied Volatility Smile and SABR Model", discipline: "Volatility Surfaces · Options" },
  { topic: "Variance Risk Premium", discipline: "Volatility Trading · Risk Premia" },
  { topic: "Dispersion Trading and Correlation Risk", discipline: "Volatility Trading · Index Options" },
  { topic: "Gamma Exposure (GEX) and Dealer Hedging Flows", discipline: "Options Microstructure · Flow Analysis" },
  { topic: "Vanna and Charm Effects on Underlying", discipline: "Second-Order Greeks · Flow Analysis" },
  { topic: "Term Structure of Volatility", discipline: "Volatility Surfaces · Cross-Section" },
  { topic: "Stochastic Discount Factors and Asset Pricing", discipline: "Asset Pricing Theory · Pricing Kernels" },
  { topic: "Fama-French Multi-Factor Models", discipline: "Factor Investing · Cross-Sectional Returns" },
  { topic: "Momentum and the 12-1 Anomaly", discipline: "Behavioral Finance · Cross-Sectional Anomalies" },
  { topic: "Carry Trade and Uncovered Interest Parity", discipline: "FX · Risk Premia" },
  { topic: "Liquidity-Adjusted VaR (LVaR)", discipline: "Risk Theory · Liquidity Risk" },
  { topic: "Wavelet Decomposition of Financial Time Series", discipline: "Signal Processing · Multi-Scale Analysis" },
];

// ---------------- topic picker ----------------

async function pickNextTopic(supabase: ReturnType<typeof createClient>): Promise<{ topic: string; discipline: string; isFromBank: boolean }> {
  const { data: usedRows } = await supabase
    .from("cadence_topics_used")
    .select("topic");
  const usedSet = new Set((usedRows ?? []).map((r: any) => r.topic.toLowerCase()));

  const remaining = TOPIC_BANK.filter((t) => !usedSet.has(t.topic.toLowerCase()));

  if (remaining.length > 0) {
    const pick = remaining[0];
    return { ...pick, isFromBank: true };
  }

  // Fallback: ask AI to propose a fresh quant concept not in the used list
  const usedList = Array.from(usedSet).slice(0, 60).join(", ");
  const sys =
    "You are a senior quantitative researcher at a tier-1 hedge fund. Propose ONE under-discussed but rigorous concept from quantitative finance, market microstructure, or risk theory that is suitable for a deep ~7-minute research note. Output strict JSON only.";
  const user = `Already-covered topics (do NOT repeat any of these or close synonyms):\n${usedList}\n\nReturn JSON: {"topic": "...", "discipline": "..."}`;
  try {
    const ai = await callAI({ systemPrompt: sys, userPrompt: user, jsonMode: true, temperature: 0.7, maxTokens: 400 });
    const parsed = safeParseJSON(ai.text) as { topic: string; discipline: string };
    if (parsed?.topic && parsed?.discipline) {
      return { topic: parsed.topic, discipline: parsed.discipline, isFromBank: false };
    }
  } catch (e) {
    console.warn("AI topic proposal failed:", e);
  }
  // Hard fallback — recycle oldest
  return { ...TOPIC_BANK[0], isFromBank: true };
}

// ---------------- research pipeline ----------------

const RESEARCH_SYSTEM = `You are a senior quantitative researcher at a top hedge fund (Renaissance / Citadel / Two Sigma caliber).
You are writing a research note for serious practitioners — quants, portfolio managers, risk officers.

Tone:
- Precise, dense, intellectually honest. Like a Marcos López de Prado paper or a Hull chapter.
- Never marketing. Never hype. Never vague.
- Every claim must be defensible. Cite mechanism, not authority.

You will be told a single concept. Produce the deepest possible note covering:
- Why it matters in real money management (concrete trading consequence)
- Mathematical core with rigorous formulas (use unicode math: μ σ² ρ Σ ∂ ∫ ∇ ≤ ≥ ≈)
- Failure modes and limits — the things practitioners actually get burned by

Output STRICT JSON only — no preamble, no markdown fences.`;

function researchPrompt(topic: string, discipline: string): string {
  return `CONCEPT: ${topic}
DISCIPLINE: ${discipline}

Write a deep research note. Output STRICT JSON matching this schema EXACTLY:

{
  "tagline": "One sharp aphoristic line capturing the essence (max 18 words). Examples of tone: 'The map changes the territory. Then the territory changes the map.' / 'VaR tells you the door. CVaR tells you what is behind it.' Avoid generic phrasing.",

  "read_minutes": 7,

  "why_it_matters": "180-260 words. Why a serious practitioner cares. Open with the concrete trading consequence — what blows up if you ignore this, what edge it unlocks. Then the historical context (who developed it, what problem it solved). End with how it lands inside Entropy Lite (a quant intelligence platform with VaR/CVaR/HMM regimes/strategy lab). Single paragraph, no bullets.",

  "inside_caption": "Short caption (max 12 words) for the conceptual diagram, e.g. 'Forward-backward smoothing over a 3-state regime model'.",

  "inside_annotation": "150-220 words explaining how this concept manifests inside Entropy Lite specifically: which module, what the user sees, what the bound/threshold is. Reference real components when plausible: Risk Engine, Strategy Lab, Reflexivity Engine, CLANK constraint engine, Augment dashboard, Sandbox, Monte Carlo Engine, Statistical Arbitrage module. Be concrete about parameters where appropriate (e.g. '½-Kelly bound', '95% / 99% CVaR', 'rolling 60-day backtest').",

  "mathematical_core": [
    {
      "heading": "First sub-section heading (e.g. 'The classical formulation')",
      "body": "120-180 words explaining this slice of the math. Define all symbols. Single paragraph.",
      "equation": "The actual equation in unicode math. Multi-line allowed with \\n. Be RIGOROUS — no hand-waving."
    },
    {
      "heading": "Second sub-section heading",
      "body": "120-180 words.",
      "equation": "Real equation."
    },
    {
      "heading": "Third sub-section heading (estimation, computation, or generalization)",
      "body": "120-180 words. Address how it's actually computed in production — gotchas, numerical issues.",
      "equation": "Optional. May be omitted if the section is purely descriptive."
    }
  ],

  "failure_modes": [
    "Failure mode 1 — 1-2 sentences, intellectually honest. Name the assumption that breaks and the consequence.",
    "Failure mode 2 — same.",
    "Failure mode 3 — same.",
    "Failure mode 4 — same."
  ]
}

CRITICAL RULES:
- Equations must be REAL math, not pseudo-prose. Use proper symbols.
- "why_it_matters" must contain a concrete consequence — never vague claims like 'helps with risk'.
- "inside_annotation" must reference Entropy Lite specifically.
- 3 mathematical_core sections. 4 failure_modes.
- Output ONLY the JSON object. No markdown, no commentary.`;
}

const CRITIC_SYSTEM = `You are a brutally honest senior reviewer (think: Andrew Lo crossed with Marcos López de Prado).
You receive 2-3 candidate research notes on the same concept from different AI authors. Your job:

1. Cross-check the math. If two drafts disagree on a formula, identify the correct one.
2. Pick the strongest framing for "why_it_matters" — the one with the sharpest concrete consequence.
3. Pick the most rigorous "mathematical_core" — fewer hand-waves, cleaner derivations.
4. Merge the best "failure_modes" across drafts (de-duplicate, keep the most precise).
5. Tighten the prose — remove hedging, generic phrasing, marketing language.
6. Verify the "inside_annotation" reads like a real product trace, not a brochure.

You output a SINGLE final note in the same JSON schema. This is the version that will be published. Be ruthless.`;

function criticPrompt(topic: string, discipline: string, drafts: Array<{ provider: string; data: any }>): string {
  const draftsText = drafts
    .map((d, i) => `===== DRAFT ${i + 1} (${d.provider}) =====\n${JSON.stringify(d.data, null, 2)}`)
    .join("\n\n");

  return `CONCEPT: ${topic}
DISCIPLINE: ${discipline}

You have ${drafts.length} candidate research notes below. Synthesize the BEST possible final note.

${draftsText}

Output the final merged note in this exact JSON schema (same as inputs):

{
  "tagline": "...",
  "read_minutes": 7,
  "why_it_matters": "...",
  "inside_caption": "...",
  "inside_annotation": "...",
  "mathematical_core": [{ "heading": "...", "body": "...", "equation": "..." }, ... 3 items],
  "failure_modes": ["...", ... 4 items]
}

Output ONLY the JSON. No markdown fences, no commentary.`;
}

async function generateResearch(topic: string, discipline: string): Promise<{ entry: any; providersUsed: string[] }> {
  console.log(`[research] Firing 2 Mistral drafts (key1 + key2 fallback) for: ${topic}`);
  // Mistral-only: fire two drafts at different temperatures for diversity.
  // callAI() already handles MISTRAL_API_KEY → MISTRAL_API_KEY_2 failover.
  const racePromises = [
    callAI({
      systemPrompt: RESEARCH_SYSTEM,
      userPrompt: researchPrompt(topic, discipline),
      jsonMode: true,
      temperature: 0.45,
      maxTokens: 4000,
      provider: "mistral",
    }).then(r => ({ ...r, provider: "mistral" as const })).catch(e => {
      console.warn("[research] Mistral draft A failed:", (e as Error).message);
      return null;
    }),
    callAI({
      systemPrompt: RESEARCH_SYSTEM,
      userPrompt: researchPrompt(topic, discipline),
      jsonMode: true,
      temperature: 0.6,
      maxTokens: 4000,
      provider: "mistral",
    }).then(r => ({ ...r, provider: "mistral" as const })).catch(e => {
      console.warn("[research] Mistral draft B failed:", (e as Error).message);
      return null;
    }),
  ];
  const settled = await Promise.all(racePromises);
  const draftResults = settled.filter((r): r is NonNullable<typeof r> => r !== null);

  const validDrafts: Array<{ provider: string; data: any }> = [];
  for (const r of draftResults) {
    let parsed: any = null;
    try {
      parsed = safeParseJSON(r.text);
    } catch (parseErr) {
      // safeParseJSON can throw on bad escape sequences (LaTeX backslashes etc.)
      // Try a more aggressive cleanup: escape stray backslashes inside strings.
      try {
        const cleaned = r.text
          .replace(/\\(?!["\\/bfnrtu])/g, "\\\\") // escape lone backslashes
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
        parsed = JSON.parse(cleaned);
      } catch (retryErr) {
        console.warn(`[research] Parse failed for ${r.provider}: ${(parseErr as Error).message}`);
      }
    }
    if (parsed && parsed.tagline && Array.isArray(parsed.mathematical_core) && parsed.mathematical_core.length >= 2) {
      validDrafts.push({ provider: r.provider, data: parsed });
    } else {
      console.warn(`[research] Discarding malformed draft from ${r.provider}`);
    }
  }

  if (validDrafts.length === 0) throw new Error("No valid drafts produced by any provider");

  console.log(`[research] ${validDrafts.length} valid drafts; running critic synthesis…`);

  // Critic pass: merge best of N
  let finalEntry: any = validDrafts[0].data;
  if (validDrafts.length >= 2) {
    try {
      const criticRes = await callAI({
        systemPrompt: CRITIC_SYSTEM,
        userPrompt: criticPrompt(topic, discipline, validDrafts),
        jsonMode: true,
        temperature: 0.3,
        maxTokens: 4500,
      });
      const merged = safeParseJSON(criticRes.text);
      if (merged && merged.tagline && Array.isArray(merged.mathematical_core)) {
        finalEntry = merged;
        console.log(`[research] Critic synthesis succeeded via ${criticRes.provider}`);
      } else {
        console.warn("[research] Critic returned malformed JSON — falling back to best raw draft");
      }
    } catch (e) {
      console.warn("[research] Critic pass failed, using best draft:", (e as Error).message);
    }
  }

  // Defensive normalization
  finalEntry.mathematical_core = (finalEntry.mathematical_core ?? []).slice(0, 4).map((s: any) => ({
    heading: String(s.heading ?? "").slice(0, 120),
    body: String(s.body ?? ""),
    equation: s.equation ? String(s.equation) : undefined,
  }));
  finalEntry.failure_modes = (finalEntry.failure_modes ?? []).slice(0, 6).map((f: any) => String(f));
  finalEntry.read_minutes = Number(finalEntry.read_minutes) || 7;

  return {
    entry: finalEntry,
    providersUsed: [...validDrafts.map((d) => d.provider), "critic"],
  };
}

// ---------------- diagram generation (nano-banana) ----------------

async function generateDiagram(_topic: string, _caption: string): Promise<string | null> {
  // Image generation removed — Mistral has no image-generation endpoint.
  // Cadence entries render without a diagram (UI handles null gracefully).
  return null;
}

// ---------------- helpers ----------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------- main handler ----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log(`[cadence] === invoked === method=${req.method} url=${req.url}`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const today = todayISO();

    // Idempotency: skip if today's entry already exists (unless ?force=1)
    const url = new URL(req.url);
    const forceParam = url.searchParams.get("force");
    const force = forceParam === "1" || forceParam === "true";
    console.log(`[cadence] today=${today} force=${force}`);

    if (!force) {
      const { data: existing } = await supabase
        .from("cadence_entries")
        .select("id, slug")
        .eq("publish_date", today)
        .maybeSingle();
      if (existing) {
        console.log(`[cadence] entry already exists for ${today}: ${existing.slug}`);
        return new Response(JSON.stringify({ ok: true, skipped: true, slug: existing.slug }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const startedAt = Date.now();
    const { topic, discipline, isFromBank } = await pickNextTopic(supabase);
    console.log(`[cadence] Picked topic: ${topic} (${discipline}) — fromBank=${isFromBank}`);

    const { entry, providersUsed } = await generateResearch(topic, discipline);
    console.log(`[cadence] Research complete (${providersUsed.join(", ")}) in ${Date.now() - startedAt}ms`);

    let diagram: string | null = null;
    try {
      diagram = await generateDiagram(topic, entry.inside_caption ?? topic);
      console.log(`[cadence] Diagram step done — image=${diagram ? "yes" : "null"}`);
    } catch (e) {
      console.warn("[cadence] Diagram threw — continuing without image:", (e as Error).message);
      diagram = null;
    }

    const slug = `${slugify(topic)}-${today}`.slice(0, 90);

    const insertPayload = {
      slug,
      publish_date: today,
      concept: topic,
      tagline: String(entry.tagline ?? ""),
      discipline,
      read_minutes: entry.read_minutes,
      why_it_matters: String(entry.why_it_matters ?? ""),
      inside_caption: String(entry.inside_caption ?? ""),
      inside_annotation: String(entry.inside_annotation ?? ""),
      image_url: diagram,
      mathematical_core: entry.mathematical_core,
      failure_modes: entry.failure_modes,
      providers_used: providersUsed,
      generation_meta: {
        from_topic_bank: isFromBank,
        elapsed_ms: Date.now() - startedAt,
        critic_used: providersUsed.includes("critic"),
      },
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("cadence_entries")
      .insert(insertPayload)
      .select("id, slug")
      .single();

    if (insertErr) throw insertErr;

    await supabase
      .from("cadence_topics_used")
      .upsert({ topic, entry_id: inserted!.id });

    console.log(`[cadence] Published ${slug} in ${Date.now() - startedAt}ms`);

    return new Response(
      JSON.stringify({ ok: true, slug: inserted!.slug, providersUsed, elapsedMs: Date.now() - startedAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[cadence] generation failed:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
