// Veracity Gate — single helper used by every prediction/risk/scenario engine.
// raw signal in → truth-weighted signal out + meta for UI/risk decisions.

import type { RawSignal, WeightedSignal } from "./types.ts";
import { loadSources, loadWeights, findContradictorMaxT } from "./store.ts";
import { computeTruth, sourceCredibility, meanTheta, agreement } from "./truth.ts";
import { buildVeracityMeta, shannonEntropyNormalised } from "./failureGuards.ts";

/** Gate a batch of raw signals; returns truth-weighted versions. */
export async function veracityGate(signals: RawSignal[]): Promise<WeightedSignal[]> {
  if (!signals.length) return [];
  const weights = await loadWeights();
  const allSourceIds = signals.flatMap((s) => (s.evidence ?? []).map((e) => e.source_id));
  const sources = await loadSources(allSourceIds);

  const out: WeightedSignal[] = [];
  for (const sig of signals) {
    const evidence = sig.evidence ?? [];
    const thetas = evidence.map((e) => {
      const src = sources.get(e.source_id.toLowerCase());
      return src ? sourceCredibility(src.alpha, src.beta) : 0.5;
    });
    const ts = evidence.length
      ? Math.min(...evidence.map((e) => new Date(e.ts).getTime()))
      : Date.now();
    const ageSeconds = Math.max(0, (Date.now() - ts) / 1000);

    const maxContraT = await findContradictorMaxT({
      subject: sig.claim.subject, relation: sig.claim.relation, object: sig.claim.object,
      domain: sig.domain, evidence,
    });

    const { T } = computeTruth({
      thetas, ageSeconds, domain: sig.domain,
      biasHat: sig.biasHat ?? 0,
      maxContradictorT: maxContraT,
      weights,
    });

    // Source diversity entropy: count by source_id
    const counts: Record<string, number> = {};
    for (const e of evidence) counts[e.source_id.toLowerCase()] = (counts[e.source_id.toLowerCase()] ?? 0) + 1;
    const entropy = shannonEntropyNormalised(Object.values(counts));

    const meta = buildVeracityMeta({
      T,
      S: meanTheta(thetas),
      A: agreement(thetas),
      contradictionRisk: maxContraT,
      sourceEntropy: entropy,
      ageSeconds,
      domain: sig.domain,
      kIndependent: Object.keys(counts).length || thetas.length,
      meanThetaValue: meanTheta(thetas),
    });

    out.push({ ...sig, T, weighted: sig.value * T, meta });
  }
  return out;
}

/** Aggregate veracity for a portfolio/scenario: mean T, contradiction risk, false-consensus. */
export function aggregateVeracity(weighted: WeightedSignal[]): {
  meanT: number; truthRisk: number; falseConsensus: boolean; contradictionRisk: number;
} {
  if (!weighted.length) return { meanT: 0.5, truthRisk: 0.5, falseConsensus: false, contradictionRisk: 0 };
  const meanT = weighted.reduce((a, w) => a + w.T, 0) / weighted.length;
  const contradictionRisk = weighted.reduce((a, w) => a + w.meta.contradictionRisk, 0) / weighted.length;
  const falseConsensus = weighted.some((w) => w.meta.falseConsensus);
  return { meanT, truthRisk: 1 - meanT, falseConsensus, contradictionRisk };
}