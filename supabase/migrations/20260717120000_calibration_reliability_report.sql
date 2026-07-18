-- Phase II (earned belief): store the empirical reliability of the
-- probabilities the product actually DISPLAYED, so the UI can show evidence
-- for or against them instead of the word "calibrated" doing unearned work.
--
-- One row per nightly run. `bins` is the reliability curve of
-- signal_outcomes.calibrated_prob (the displayed number) against realized
-- outcome_won: [{pLow, pHigh, meanForecast, meanOutcome, n}]. `brier_displayed`
-- scores the displayed probabilities; `brier_refit` scores the nightly
-- observability refit (never consumed by the decision path).

CREATE TABLE IF NOT EXISTS public.calibration_reports (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_days INTEGER NOT NULL DEFAULT 90,
  n_settled INTEGER NOT NULL,
  brier_displayed DOUBLE PRECISION,
  brier_refit DOUBLE PRECISION,
  hit_rate DOUBLE PRECISION,
  bins JSONB NOT NULL DEFAULT '[]'::jsonb,
  refit_params JSONB,
  notes TEXT
);

GRANT SELECT ON public.calibration_reports TO authenticated;
GRANT SELECT ON public.calibration_reports TO anon;
GRANT ALL ON public.calibration_reports TO service_role;

ALTER TABLE public.calibration_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY calibration_reports_select_all ON public.calibration_reports
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY calibration_reports_write_service ON public.calibration_reports
  FOR INSERT TO service_role WITH CHECK (true);
