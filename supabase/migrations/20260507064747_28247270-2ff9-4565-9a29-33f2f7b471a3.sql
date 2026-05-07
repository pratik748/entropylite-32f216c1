
CREATE TABLE public.locked_exits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticker text NOT NULL,
  buy_price numeric NOT NULL DEFAULT 0,
  exit_price numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 0,
  peak_price numeric NOT NULL DEFAULT 0,
  pnl_abs numeric NOT NULL DEFAULT 0,
  pnl_pct numeric NOT NULL DEFAULT 0,
  trigger_reason text NOT NULL DEFAULT 'chandelier',
  currency text NOT NULL DEFAULT 'USD',
  position_key text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_locked_exits_user ON public.locked_exits(user_id, locked_at DESC);
CREATE INDEX idx_locked_exits_position ON public.locked_exits(user_id, position_key);

ALTER TABLE public.locked_exits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "locked_exits_select_own" ON public.locked_exits
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "locked_exits_insert_own" ON public.locked_exits
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "locked_exits_update_own" ON public.locked_exits
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "locked_exits_delete_own" ON public.locked_exits
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
