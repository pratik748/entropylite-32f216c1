-- Persistent trade ledger for ODGS
CREATE TABLE public.odgs_trade_ledger (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  asset_class TEXT NOT NULL DEFAULT 'equity',
  pnl_pct NUMERIC NOT NULL DEFAULT 0,
  return_abs NUMERIC NOT NULL DEFAULT 0,
  duration_hours NUMERIC NOT NULL DEFAULT 0,
  feature_momentum NUMERIC NOT NULL DEFAULT 0,
  feature_vol NUMERIC NOT NULL DEFAULT 0,
  feature_sentiment NUMERIC NOT NULL DEFAULT 0,
  feature_regime TEXT NOT NULL DEFAULT 'unknown',
  source TEXT NOT NULL DEFAULT 'manual',
  trade_timestamp BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_odgs_ledger_user_ts ON public.odgs_trade_ledger(user_id, trade_timestamp DESC);
CREATE INDEX idx_odgs_ledger_user_asset ON public.odgs_trade_ledger(user_id, asset);

ALTER TABLE public.odgs_trade_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perm_select_odgs_ledger" ON public.odgs_trade_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "perm_insert_odgs_ledger" ON public.odgs_trade_ledger
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_update_odgs_ledger" ON public.odgs_trade_ledger
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_delete_odgs_ledger" ON public.odgs_trade_ledger
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Per-user gradient state
CREATE TABLE public.odgs_gradient_state (
  user_id UUID NOT NULL PRIMARY KEY,
  asset_biases JSONB NOT NULL DEFAULT '{}'::jsonb,
  feature_weights JSONB NOT NULL DEFAULT '[]'::jsonb,
  allocation_scales JSONB NOT NULL DEFAULT '{}'::jsonb,
  generation INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.odgs_gradient_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perm_select_odgs_gradient" ON public.odgs_gradient_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "perm_insert_odgs_gradient" ON public.odgs_gradient_state
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_update_odgs_gradient" ON public.odgs_gradient_state
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_delete_odgs_gradient" ON public.odgs_gradient_state
  FOR DELETE TO authenticated USING (auth.uid() = user_id);