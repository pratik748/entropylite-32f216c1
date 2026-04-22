CREATE TABLE public.lodger_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticker text NOT NULL,
  side text NOT NULL DEFAULT 'long',
  entry_ts bigint NOT NULL,
  exit_ts bigint NOT NULL,
  entry_px numeric NOT NULL DEFAULT 0,
  exit_px numeric NOT NULL DEFAULT 0,
  qty numeric NOT NULL DEFAULT 0,
  pnl_pct numeric NOT NULL DEFAULT 0,
  pnl_abs numeric NOT NULL DEFAULT 0,
  expected_pct numeric NOT NULL DEFAULT 0,
  expected_hold_min numeric NOT NULL DEFAULT 0,
  actual_hold_min numeric NOT NULL DEFAULT 0,
  regime text NOT NULL DEFAULT 'unknown',
  vol_at_entry numeric NOT NULL DEFAULT 0,
  liquidity_score numeric NOT NULL DEFAULT 0,
  reflex_score numeric NOT NULL DEFAULT 0,
  exec_latency_ms numeric NOT NULL DEFAULT 0,
  slippage_bps numeric NOT NULL DEFAULT 0,
  realized_sharpe numeric NOT NULL DEFAULT 0,
  divergence_pct numeric NOT NULL DEFAULT 0,
  drawdown_elasticity numeric NOT NULL DEFAULT 0,
  lesson text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  pattern_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lodger_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY perm_select_lodger ON public.lodger_trades
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY perm_insert_lodger ON public.lodger_trades
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY perm_update_lodger ON public.lodger_trades
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY perm_delete_lodger ON public.lodger_trades
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_lodger_trades_user_created ON public.lodger_trades(user_id, created_at DESC);
CREATE INDEX idx_lodger_trades_user_regime ON public.lodger_trades(user_id, regime);