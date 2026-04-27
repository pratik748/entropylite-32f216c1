// Self-correction: Beta posterior updates per source + online SGD on weights.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadWeights, saveWeights, bumpSource } from "./store.ts";
import type { Weights, TruthFactors } from "./types.ts";
import { sigmoid } from "./truth.ts";

function svc() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } });
}

/** Process one outcome: bump sources, SGD on weights. */
export async function applyFeedback(opts: {
  claimId: string;
  outcome: 0 | 1;
  userId?: string;
  learningRate?: number;
}): Promise<{ updatedWeights: Weights }> {
  const eta = opts.learningRate ?? 0.01;
  const sb = svc();

  // Persist the feedback row (best effort)
  if (opts.userId) {
    await sb.from("twrd_feedback").insert({
      claim_id: opts.claimId, outcome: opts.outcome, user_id: opts.userId,
    });
  }

  // Look up the claim + its evidence sources
  const { data: claim } = await sb.from("twrd_claims")
    .select("id, subject, relation, object, domain, truth_score, evidence")
    .eq("id", opts.claimId).maybeSingle();
  if (!claim) return { updatedWeights: await loadWeights() };

  // Bump every source on the evidence
  const evidence: { source_id?: string }[] = Array.isArray(claim.evidence) ? claim.evidence : [];
  for (const e of evidence) {
    if (e?.source_id) await bumpSource(e.source_id, opts.outcome);
  }

  // SGD step on weights using the recorded factors approximated from current state.
  // We use stored truth_score as the model output and infer factor vector from
  // the deterministic engine using fresh inputs. To keep this lightweight and
  // bounded, we pull the latest weights and step toward outcome with x = (S,A,D,B,C)
  // computed at scoring time and stored in twrd_claims.evidence summary if present.
  const weights = await loadWeights();
  const x: TruthFactors | null = (claim as any).factors ?? null;
  if (!x) {
    // No stored factors → only update sources, leave weights unchanged
    return { updatedWeights: weights };
  }
  const z = weights.w1*x.S + weights.w2*x.A + weights.w3*x.D - weights.w4*x.B - weights.w5*x.C + weights.b;
  const p = sigmoid(z);
  const g = p - opts.outcome;

  const next: Weights = {
    w1: Math.max(0.01, Math.min(5, weights.w1 - eta * g * x.S)),
    w2: Math.max(0.01, Math.min(5, weights.w2 - eta * g * x.A)),
    w3: Math.max(0.01, Math.min(5, weights.w3 - eta * g * x.D)),
    w4: Math.max(0.01, Math.min(5, weights.w4 + eta * g * x.B)), // sign: B is subtracted in z
    w5: Math.max(0.01, Math.min(5, weights.w5 + eta * g * x.C)),
    b:  Math.max(-3, Math.min(3, weights.b - eta * g)),
  };
  await saveWeights(next);
  return { updatedWeights: next };
}