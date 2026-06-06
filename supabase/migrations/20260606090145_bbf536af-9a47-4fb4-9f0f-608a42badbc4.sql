-- Structural rebuild: bucket-aware ensemble + walk-forward calibration + per-ticker reliability priors

-- 1) Signal outcomes ledger — every fired BUY/SELL is logged here for calibration
CREATE TABLE public.signal_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NULL,
  source TEXT NOT NULL DEFAULT 'direct-profit',
  ticker TEXT NOT NULL,
  ticker_class TEXT NOT NULL DEFAULT 'unknown',
  regime TEXT NOT NULL DEFAULT 'unknown',
  action TEXT NOT NULL,
  ensemble_score NUMERIC NOT NULL DEFAULT 0,
  agreement NUMERIC NOT NULL DEFAULT 0,
  calibrated_prob NUMERIC NOT NULL DEFAULT 0.5,
  expected_r NUMERIC NOT NULL DEFAULT 0,
  bucket_a_dir SMALLINT NOT NULL DEFAULT 0,
  bucket_b_dir SMALLINT NOT NULL DEFAULT 0,
  bucket_c_dir SMALLINT NOT NULL DEFAULT 0,
  engines JSONB NOT NULL DEFAULT '[]'::jsonb,
  entry_price NUMERIC NOT NULL DEFAULT 0,
  target_price NUMERIC NULL,
  stop_loss NUMERIC NULL,
  cost_haircut NUMERIC NOT NULL DEFAULT 0,
  -- Outcome (filled by calibration-fit job after T+5 trading days)
  outcome_price NUMERIC NULL,
  outcome_pct NUMERIC NULL,
  outcome_won SMALLINT NULL, -- 1=win, 0=loss, NULL=unsettled
  outcome_at TIMESTAMP WITH TIME ZONE NULL
);

GRANT SELECT, INSERT, UPDATE ON public.signal_outcomes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.signal_outcomes TO anon;
GRANT ALL ON public.signal_outcomes TO service_role;

ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (edge functions write here as anon when no user); reads scoped to owner or NULL (system signals)
CREATE POLICY signal_outcomes_insert_any ON public.signal_outcomes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY signal_outcomes_select_own ON public.signal_outcomes FOR SELECT TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY signal_outcomes_update_system ON public.signal_outcomes FOR UPDATE TO authenticated USING (user_id IS NULL OR auth.uid() = user_id) WITH CHECK (true);

CREATE INDEX signal_outcomes_fired_at_idx ON public.signal_outcomes (fired_at DESC);
CREATE INDEX signal_outcomes_ticker_idx ON public.signal_outcomes (ticker);
CREATE INDEX signal_outcomes_unsettled_idx ON public.signal_outcomes (fired_at) WHERE outcome_won IS NULL;

-- 2) Engine reliability — per-engine × ticker_class × regime hit-rate, updated nightly
CREATE TABLE public.engine_reliability (
  engine_id TEXT NOT NULL,
  ticker_class TEXT NOT NULL DEFAULT 'all',
  regime TEXT NOT NULL DEFAULT 'all',
  n INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  hit_rate NUMERIC NOT NULL DEFAULT 0.55,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (engine_id, ticker_class, regime)
);

GRANT SELECT ON public.engine_reliability TO anon, authenticated;
GRANT ALL ON public.engine_reliability TO service_role;

ALTER TABLE public.engine_reliability ENABLE ROW LEVEL SECURITY;
CREATE POLICY engine_reliability_read ON public.engine_reliability FOR SELECT TO anon, authenticated USING (true);

-- 3) Calibration parameters — Platt scaling constants fit nightly
CREATE TABLE public.calibration_params (
  id SMALLINT NOT NULL DEFAULT 1 PRIMARY KEY,
  alpha NUMERIC NOT NULL DEFAULT 3.2,
  beta NUMERIC NOT NULL DEFAULT 1.4,
  gamma NUMERIC NOT NULL DEFAULT -0.7,
  n_samples INTEGER NOT NULL DEFAULT 0,
  brier_score NUMERIC NOT NULL DEFAULT 0.25,
  fit_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.calibration_params TO anon, authenticated;
GRANT ALL ON public.calibration_params TO service_role;

ALTER TABLE public.calibration_params ENABLE ROW LEVEL SECURITY;
CREATE POLICY calibration_params_read ON public.calibration_params FOR SELECT TO anon, authenticated USING (true);

-- Seed defaults
INSERT INTO public.calibration_params (id, alpha, beta, gamma, n_samples, brier_score)
VALUES (1, 3.2, 1.4, -0.7, 0, 0.25)
ON CONFLICT (id) DO NOTHING;