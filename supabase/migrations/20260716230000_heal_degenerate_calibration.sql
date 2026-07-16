-- Heal a degenerate Platt calibration fit.
--
-- The nightly calibration-fit stored α=0.9672, β=0, γ=−2.6675. At full
-- consensus (ensemble score 1, agreement 1) that curve tops out at
-- σ(α+β+γ) = 15%, which the consumer clamps to the 0.50 floor — so every
-- ticket read exactly 50% calibrated probability, no gate could ever pass,
-- and Direct Profit could not produce a single BUY/SELL.
--
-- Reset any stored fit that cannot express p ≥ 0.60 at full consensus back
-- to the priors. The fitter and loader now guard against storing/using such
-- fits, so this cannot recur.
update public.calibration_params
set alpha = 3.2,
    beta  = 1.4,
    gamma = -0.7,
    fit_at = now()
where id = 1
  and 1.0 / (1.0 + exp(-(alpha + beta + gamma))) < 0.6;
