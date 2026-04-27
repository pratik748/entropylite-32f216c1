// TWRD store — Supabase reads/writes for sources, claims, contradictions, weights.
// Decay is applied on READ so stored truth_score is the value at write time.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type {
  RawClaim, SourcePosterior, TwrdDomain, Weights, TruthScore,
} from "./types.ts";
import { DEFAULT_WEIGHTS } from "./types.ts";
import { computeTruth, decay, sourceCredibility } from "./truth.ts";

let _client: SupabaseClient | null = null;
function client(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export async function loadWeights(): Promise<Weights> {
  try {
    const { data } = await client().from("twrd_weights").select("*").eq("id", 1).maybeSingle();
    if (!data) return DEFAULT_WEIGHTS;
    return {
      w1: Number(data.w1), w2: Number(data.w2), w3: Number(data.w3),
      w4: Number(data.w4), w5: Number(data.w5), b: Number(data.b),
    };
  } catch { return DEFAULT_WEIGHTS; }
}

export async function saveWeights(w: Weights): Promise<void> {
  await client().from("twrd_weights").update({
    w1: w.w1, w2: w.w2, w3: w.w3, w4: w.w4, w5: w.w5, b: w.b,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
}

export async function loadSources(ids: string[]): Promise<Map<string, SourcePosterior>> {
  const out = new Map<string, SourcePosterior>();
  if (!ids.length) return out;
  const uniq = [...new Set(ids.map((s) => s.toLowerCase()))];
  const { data } = await client().from("twrd_sources").select("*").in("id", uniq);
  for (const r of data ?? []) {
    out.set(r.id, {
      id: r.id, domain: r.domain as TwrdDomain,
      alpha: Number(r.alpha), beta: Number(r.beta),
    });
  }
  // Synthesise tiered priors for unseen sources — NO whitelist; any crawled
  // source is accepted and weighted by heuristic priors that improve over time
  // via Bayesian feedback (twrd-feedback updates α/β from trade outcomes).
  const unseen: { id: string; domain: TwrdDomain; alpha: number; beta: number }[] = [];
  for (const id of uniq) {
    if (out.has(id)) continue;
    const prior = inferPrior(id);
    out.set(id, { id, ...prior });
    unseen.push({ id, ...prior });
  }
  // Persist unseen sources so future weight updates have a row to learn against.
  if (unseen.length) {
    try { await client().from("twrd_sources").upsert(unseen, { onConflict: "id" }); }
    catch { /* non-fatal — in-memory prior still applies */ }
  }
  return out;
}

/** Heuristic prior for any source id (domain-like string). No whitelist. */
function inferPrior(rawId: string): { domain: TwrdDomain; alpha: number; beta: number } {
  const id = rawId.toLowerCase();
  // Domain classification
  let domain: TwrdDomain = "news";
  if (/(twitter|x\.com|reddit|stocktwits|tiktok|telegram|discord|youtube)/.test(id)) domain = "social";
  else if (/(sec\.gov|federalreserve|treasury|imf\.org|worldbank|bls\.gov|ecb\.europa|rbi\.org)/.test(id)) domain = "financial";
  else if (/(arxiv|nature\.com|science\.org|nih\.gov|ssrn|pubmed)/.test(id)) domain = "scientific";
  else if (/(reuters|bloomberg|ft\.com|wsj|cnbc|nytimes|guardian|bbc|aljazeera|economist|forbes|barrons|seekingalpha|moneycontrol|economictimes|livemint|business-standard)/.test(id)) domain = "news";
  else if (/(geopolitics|stratfor|cfr\.org|chathamhouse|csis\.org)/.test(id)) domain = "geo";

  // Tiered confidence: .gov/.edu > tier-1 outlets > general .com/.org > social/unknown
  let alpha = 5, beta = 5; // neutral default π0=0.5, n0=10
  if (/\.gov(\.|$)|\.edu(\.|$)|sec\.gov|federalreserve|nih\.gov|bls\.gov/.test(id)) { alpha = 18; beta = 4; }
  else if (/(reuters|bloomberg|ft\.com|wsj|economist|nature\.com|science\.org)/.test(id)) { alpha = 16; beta = 5; }
  else if (/(cnbc|nytimes|bbc|guardian|forbes|barrons|seekingalpha|moneycontrol|economictimes|livemint)/.test(id)) { alpha = 12; beta = 6; }
  else if (/(twitter|x\.com|reddit|stocktwits|tiktok|telegram|discord)/.test(id)) { alpha = 4; beta = 8; }
  else if (/\.org(\.|$)/.test(id)) { alpha = 8; beta = 6; }
  // else keep neutral 5/5 — any new source is ACCEPTED, not rejected.

  return { domain, alpha, beta };
}

export async function bumpSource(id: string, outcome: 0 | 1): Promise<void> {
  const lower = id.toLowerCase();
  const { data } = await client().from("twrd_sources").select("*").eq("id", lower).maybeSingle();
  if (!data) {
    await client().from("twrd_sources").insert({
      id: lower, domain: "news",
      alpha: outcome ? 6 : 5, beta: outcome ? 5 : 6,
    });
    return;
  }
  const alpha = Number(data.alpha) + (outcome ? 1 : 0);
  const beta  = Number(data.beta)  + (outcome ? 0 : 1);
  await client().from("twrd_sources").update({
    alpha, beta, updated_at: new Date().toISOString(),
  }).eq("id", lower);
}

export async function findContradictorMaxT(claim: RawClaim): Promise<number> {
  // Naive: same subject+relation, different object → contradictor.
  const { data } = await client().from("twrd_claims")
    .select("truth_score, valid_from, domain, object")
    .eq("subject", claim.subject)
    .eq("relation", claim.relation)
    .order("valid_from", { ascending: false })
    .limit(20);
  let max = 0;
  const now = Date.now();
  for (const r of data ?? []) {
    if (r.object === claim.object) continue;
    const ageSec = (now - new Date(r.valid_from).getTime()) / 1000;
    const decayed = Number(r.truth_score) * decay(ageSec, r.domain as TwrdDomain);
    if (decayed > max) max = decayed;
  }
  return max;
}

/** Score a single claim against the live store and persist it. */
export async function scoreAndStore(claim: RawClaim): Promise<TruthScore> {
  const weights = await loadWeights();
  const sourceIds = (claim.evidence ?? []).map((e) => e.source_id);
  const sources = await loadSources(sourceIds);
  const thetas = sourceIds.map((id) => {
    const s = sources.get(id.toLowerCase());
    return s ? sourceCredibility(s.alpha, s.beta) : 0.5;
  });
  const oldestTs = (claim.evidence ?? [])
    .map((e) => new Date(e.ts).getTime())
    .reduce((a, b) => Math.min(a, b), Date.now());
  const ageSeconds = Math.max(0, (Date.now() - oldestTs) / 1000);

  const maxContradictorT = await findContradictorMaxT(claim);

  const { T, factors } = computeTruth({
    thetas, ageSeconds, domain: claim.domain,
    biasHat: claim.biasHat ?? 0,
    maxContradictorT,
    weights,
    piHatCap: claim.piHatCap,
  });

  const halfLife = ({ financial: 7, news: 14, social: 2, geo: 60, scientific: 365 }[claim.domain] ?? 7) * 86400;
  await client().from("twrd_claims").insert({
    subject: claim.subject, relation: claim.relation, object: claim.object,
    domain: claim.domain, truth_score: T,
    decay_rate: Math.LN2 / halfLife,
    evidence: claim.evidence ?? [],
  });

  return {
    T, factors, thetas, kIndependent: thetas.length,
    piHatCap: claim.piHatCap, domain: claim.domain,
  };
}

/** Read the freshest truth-decayed score for a triple, or null. */
export async function readLiveTruth(
  subject: string, relation: string, object?: string,
): Promise<{ T: number; ageSeconds: number; domain: TwrdDomain } | null> {
  let q = client().from("twrd_claims")
    .select("truth_score, valid_from, domain, object")
    .eq("subject", subject).eq("relation", relation)
    .order("valid_from", { ascending: false }).limit(5);
  const { data } = await q;
  if (!data?.length) return null;
  const row = object ? data.find((r) => r.object === object) ?? data[0] : data[0];
  const ageSec = (Date.now() - new Date(row.valid_from).getTime()) / 1000;
  const T = Number(row.truth_score) * decay(ageSec, row.domain as TwrdDomain);
  return { T, ageSeconds: ageSec, domain: row.domain as TwrdDomain };
}