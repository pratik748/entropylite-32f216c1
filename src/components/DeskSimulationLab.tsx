import { useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import {
  runSimulation, runAllEngines, SIM_ENGINES, type SimEngineId, type SimShock,
} from "@/lib/quant/simulation";
import {
  COV_MODELS, estimateCovariance, portfolioSigmaFrom, type CovModelId,
} from "@/lib/quant/covariance-registry";
import { SimulationFanChart, SimulationHistogram } from "@/components/DeskBookCharts";
import type { FactorModelState } from "@/hooks/useFactorModel";
import type { QuantSnapshot } from "@/hooks/useQuantSnapshot";

/**
 * Simulation Lab — the Book's scenario engine. Distribution of outcomes,
 * never a prediction: five seeded generators over the book's own history,
 * a covariance-model registry feeding the parametric engines, and a shock
 * builder that turns a news scenario ("market −2σ", "oil +3σ") into a
 * day-0 book move through the fitted factor exposures.
 *
 * Every control changes the actual computation — the engine badge, σ-model
 * stamp, seed and method line prove it. Engines that cannot run honestly
 * say "unavailable"; nothing is silently substituted.
 */

interface Props {
  snap: QuantSnapshot;
  factor: FactorModelState;
  bookValue: number;
  fmt: (v: number) => string;
}

const HORIZONS = [5, 21, 63];
const SHOCK_SIGMAS = [-1, -2, -3];

const DeskSimulationLab = ({ snap, factor, bookValue, fmt }: Props) => {
  const [engine, setEngine] = useState<SimEngineId>("bootstrap_block");
  const [horizon, setHorizon] = useState(21);
  const [covModel, setCovModel] = useState<CovModelId>("ewma");
  const [shockFactor, setShockFactor] = useState<string | null>(null);
  const [shockSigma, setShockSigma] = useState(-2);

  // Σ from the selected covariance model, stamped with its metadata.
  const covEst = useMemo(() => {
    if (!snap.ready) return null;
    const tickers = snap.covariance.tickers;
    if (tickers.length < 2) return null;
    const series = tickers.map((t) => snap.returnsByTicker[t] ?? []);
    return estimateCovariance(covModel, series);
  }, [snap, covModel]);

  const sigmaDaily = useMemo(() => {
    if (!covEst) return snap.ready ? snap.portfolio.sigmaDaily : null;
    const w = snap.covariance.tickers.map((t) => snap.weights[t] ?? 0);
    const s = portfolioSigmaFrom(covEst.sigma, w);
    return s > 0 ? s : null;
  }, [covEst, snap]);

  // News scenario → day-0 book return through fitted factor exposures.
  const shock = useMemo<SimShock | null>(() => {
    if (!shockFactor || !factor.model?.portfolio) return null;
    const exp = factor.model.portfolio.exposures[shockFactor];
    const stats = factor.model.factorStats[shockFactor];
    const def = factor.model.factors.find((f) => f.id === shockFactor);
    if (exp == null || !stats || !def) return null;
    // Factor moves shockSigma × its monthly σ; book impact = β × move.
    const factorMovePct = shockSigma * stats.sigmaAnnual * Math.sqrt(21 / 252) * 100;
    return {
      label: `${def.label} ${shockSigma}σ (${factorMovePct.toFixed(1)}%) × β ${exp.toFixed(2)}`,
      day0ReturnPct: exp * factorMovePct,
    };
  }, [shockFactor, shockSigma, factor.model]);

  const inputs = useMemo(
    () => ({ portfolioReturns: snap.ready ? snap.portfolio.returns : [], sigmaDaily }),
    [snap, sigmaDaily],
  );

  const result = useMemo(
    () => (snap.ready ? runSimulation(inputs, { engine, horizonDays: horizon, shock }) : null),
    [inputs, engine, horizon, shock, snap.ready],
  );

  // Engine disagreement table (smaller path count — it's a comparison, not the read).
  const comparison = useMemo(
    () => (snap.ready ? runAllEngines(inputs, { horizonDays: horizon, nPaths: 1000, shock }) : []),
    [inputs, horizon, shock, snap.ready],
  );

  if (!snap.ready) {
    return (
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-muted-foreground">
        <FlaskConical className="h-3.5 w-3.5" />
        <span className="text-[12px]">Simulation Lab needs return history — assembling…</span>
      </div>
    );
  }

  const seg = (active: boolean, enabled = true) =>
    `rounded-[4px] px-2 py-0.5 font-mono text-[10px] transition-colors ${
      active ? "bg-surface-3 text-foreground" : enabled ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30 cursor-not-allowed"
    }`;

  return (
    <>
      {/* Controls — every one re-runs the engine; the seed line proves it */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Engine</span>
          <div className="inline-flex items-center rounded-md border border-border bg-surface-1 p-0.5">
            {SIM_ENGINES.map((e) => (
              <button key={e.id} onClick={() => setEngine(e.id)} title={e.description} className={seg(engine === e.id)}>
                {e.short}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Horizon</span>
          <div className="inline-flex items-center rounded-md border border-border bg-surface-1 p-0.5">
            {HORIZONS.map((h) => (
              <button key={h} onClick={() => setHorizon(h)} className={seg(horizon === h)}>{h}d</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground" title="Covariance estimator feeding the parametric engines">Σ model</span>
          <div className="inline-flex items-center rounded-md border border-border bg-surface-1 p-0.5">
            {COV_MODELS.map((m) => (
              <button key={m.id} onClick={() => setCovModel(m.id)} title={m.description} className={seg(covModel === m.id)}>
                {m.short}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scenario builder — news → factor shock → book impact */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border px-4 py-2">
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Scenario</span>
        <div className="inline-flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-surface-1 p-0.5">
          <button onClick={() => setShockFactor(null)} className={seg(shockFactor === null)}>None</button>
          {(factor.model?.factors ?? []).map((f) => (
            <button key={f.id} onClick={() => setShockFactor(f.id)} title={`Shock ${f.label} and propagate through the book's fitted β`} className={seg(shockFactor === f.id)}>
              {f.label.split(" · ")[0]}
            </button>
          ))}
        </div>
        {shockFactor && (
          <div className="inline-flex items-center rounded-md border border-border bg-surface-1 p-0.5">
            {SHOCK_SIGMAS.map((s) => (
              <button key={s} onClick={() => setShockSigma(s)} className={seg(shockSigma === s)}>{s}σ</button>
            ))}
          </div>
        )}
        {shock && (
          <span className="font-mono text-[10px] text-warning">
            day-0 impact {shock.day0ReturnPct >= 0 ? "+" : ""}{shock.day0ReturnPct.toFixed(1)}% · {shock.label}
          </span>
        )}
        {shockFactor && !shock && (
          <span className="font-mono text-[10px] text-muted-foreground/60">factor model not fitted yet — no shock applied</span>
        )}
      </div>

      {result ? (
        <>
          {/* Headline distribution stats — % and money */}
          <div className="grid grid-cols-2 divide-x divide-border border-b border-border sm:grid-cols-5">
            {[
              { label: `Median · ${horizon}d`, v: result.terminal.p50, money: true },
              { label: "P5 · P95", text: `${result.terminal.p5.toFixed(1)}% · ${result.terminal.p95.toFixed(1)}%` },
              { label: `VaR₉₅ · ${horizon}d`, v: -result.terminal.var95, money: true, loss: true },
              { label: `ES₉₅ · ${horizon}d`, v: -result.terminal.es95, money: true, loss: true },
              { label: "P(loss)", text: `${(result.terminal.probLoss * 100).toFixed(0)}%`, warn: result.terminal.probLoss > 0.5 },
            ].map((c) => (
              <div key={c.label} className="px-4 py-2">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
                <p className={`mt-0.5 font-mono text-sm font-bold tabular-nums ${
                  c.loss ? "text-loss" : c.warn ? "text-warning" : c.v != null && c.v >= 0 ? "text-gain" : c.v != null ? "text-loss" : "text-foreground"
                }`}>
                  {c.text ?? `${(c.v as number) >= 0 ? "+" : ""}${(c.v as number).toFixed(1)}%`}
                </p>
                {c.money && bookValue > 0 && (
                  <p className="font-mono text-[8px] text-muted-foreground/60">≈ {fmt(Math.abs((c.v as number) / 100) * bookValue)}</p>
                )}
              </div>
            ))}
          </div>

          {/* Fan + terminal histogram */}
          <div className="grid grid-cols-1 gap-2 border-b border-border px-3 py-2 lg:grid-cols-2">
            <div>
              <p className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Outcome fan · 5–95 and 25–75 bands, median</p>
              <SimulationFanChart fan={result.fan} />
            </div>
            <div>
              <p className="px-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Terminal distribution · {result.nPaths.toLocaleString()} paths</p>
              <SimulationHistogram bins={result.histogram} />
            </div>
          </div>

          {/* Engine disagreement — the spread between models IS the finding */}
          {comparison.length >= 2 && (
            <div className="border-b border-border px-4 py-2">
              <p className="pb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Engine disagreement · same horizon{shock ? ", same shock" : ""} — spread between models is model risk, shown not hidden
              </p>
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-[10.5px] tabular-nums">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="py-0.5 pr-3 text-left font-medium">Engine</th>
                      <th className="py-0.5 pr-3 text-right font-medium">Median</th>
                      <th className="py-0.5 pr-3 text-right font-medium">VaR₉₅</th>
                      <th className="py-0.5 pr-3 text-right font-medium">ES₉₅</th>
                      <th className="py-0.5 text-right font-medium">P(loss)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map((r) => (
                      <tr key={r.engine} className={`border-t border-border/40 ${r.engine === engine ? "text-foreground" : "text-muted-foreground"}`}>
                        <td className="py-1 pr-3">{r.label}{r.nu != null ? ` (ν=${r.nu.toFixed(1)})` : ""}</td>
                        <td className="py-1 pr-3 text-right">{r.terminal.p50 >= 0 ? "+" : ""}{r.terminal.p50.toFixed(1)}%</td>
                        <td className="py-1 pr-3 text-right text-loss">{r.terminal.var95.toFixed(1)}%</td>
                        <td className="py-1 pr-3 text-right text-loss">{r.terminal.es95.toFixed(1)}%</td>
                        <td className="py-1 text-right">{(r.terminal.probLoss * 100).toFixed(0)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Method stamp — proves the controls did something */}
          <p className="border-b border-border px-4 py-1.5 font-mono text-[9px] leading-relaxed text-muted-foreground/60">
            {result.method} · seed {result.seed} · {result.nPaths.toLocaleString()} paths
            {covEst && ` · Σ = ${covEst.meta.estimator}, ${covEst.meta.window}d${covEst.meta.shrinkage != null ? `, δ=${covEst.meta.shrinkage.toFixed(2)}` : ""}${covEst.meta.decay != null ? `, λ=${covEst.meta.decay}` : ""}`}
            {" · distribution of outcomes, not a prediction · advisory only"}
          </p>
        </>
      ) : (
        <p className="border-b border-border px-4 py-3 font-mono text-[11px] text-muted-foreground">
          {SIM_ENGINES.find((e) => e.id === engine)?.label} unavailable on current data
          {engine === "parametric_normal" || engine === "heavy_tailed_t"
            ? " — the selected Σ model could not estimate on this book's history."
            : " — needs ≥ 60 days of book return history."}{" "}
          No substitute engine is shown.
        </p>
      )}
    </>
  );
};

export default DeskSimulationLab;
