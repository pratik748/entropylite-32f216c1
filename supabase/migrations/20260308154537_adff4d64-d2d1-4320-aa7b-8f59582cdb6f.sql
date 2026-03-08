
-- Create clank_activation_events table
CREATE TABLE public.clank_activation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  constraint_id text NOT NULL,
  activated_at timestamptz NOT NULL DEFAULT now(),
  clank_score_at_activation numeric NOT NULL DEFAULT 0,
  activation_probability numeric NOT NULL DEFAULT 0,
  observed_price_impact numeric,
  observed_volume_impact numeric,
  observed_vol_change numeric,
  outcome_accuracy numeric,
  notes text
);

ALTER TABLE public.clank_activation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activations" ON public.clank_activation_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activations" ON public.clank_activation_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own activations" ON public.clank_activation_events FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own activations" ON public.clank_activation_events FOR DELETE USING (auth.uid() = user_id);

-- Create clank_confidence_overrides table
CREATE TABLE public.clank_confidence_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  constraint_id text NOT NULL,
  adjusted_confidence numeric NOT NULL DEFAULT 0,
  sample_count integer NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, constraint_id)
);

ALTER TABLE public.clank_confidence_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own overrides" ON public.clank_confidence_overrides FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own overrides" ON public.clank_confidence_overrides FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own overrides" ON public.clank_confidence_overrides FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own overrides" ON public.clank_confidence_overrides FOR DELETE USING (auth.uid() = user_id);
