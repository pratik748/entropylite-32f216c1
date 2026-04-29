CREATE TABLE public.scar_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticker text NOT NULL,
  signal_type text NOT NULL,
  regime text NOT NULL,
  vol_bucket text NOT NULL,
  sentiment_bucket text NOT NULL,
  momentum_bucket text NOT NULL,
  failure_pattern text NOT NULL,
  realized_pnl_pct numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scar_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scar_select_own" ON public.scar_memory
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "scar_insert_own" ON public.scar_memory
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "scar_delete_own" ON public.scar_memory
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX scar_lookup ON public.scar_memory (user_id, ticker, regime, vol_bucket);