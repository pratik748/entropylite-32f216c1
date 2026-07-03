
-- portfolio_watch: what the sentinel monitors
CREATE TABLE public.portfolio_watch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  entry_price numeric NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  peak_price numeric,
  last_price numeric,
  last_analysis_at timestamptz,
  last_verdict text,
  last_conviction numeric,
  last_max_profit_target numeric,
  drawdown_pct numeric NOT NULL DEFAULT 8,
  peak_drawdown_pct numeric NOT NULL DEFAULT 12,
  muted boolean NOT NULL DEFAULT false,
  alert_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, ticker)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_watch TO authenticated;
GRANT ALL ON public.portfolio_watch TO service_role;
ALTER TABLE public.portfolio_watch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watch_own" ON public.portfolio_watch FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- risk_alerts: append-only alert log
CREATE TABLE public.risk_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'warning',
  title text NOT NULL,
  message text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  email_status text NOT NULL DEFAULT 'pending',
  dismissed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_alerts TO authenticated;
GRANT ALL ON public.risk_alerts TO service_role;
ALTER TABLE public.risk_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_own_read" ON public.risk_alerts FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "alerts_own_update" ON public.risk_alerts FOR UPDATE
  USING (auth.uid() = user_id);
CREATE INDEX idx_risk_alerts_user_created ON public.risk_alerts(user_id, created_at DESC);

-- alert_preferences
CREATE TABLE public.alert_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  default_drawdown_pct numeric NOT NULL DEFAULT 8,
  default_peak_drawdown_pct numeric NOT NULL DEFAULT 12,
  cooldown_minutes integer NOT NULL DEFAULT 240,
  refresh_hours integer NOT NULL DEFAULT 4,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_preferences TO authenticated;
GRANT ALL ON public.alert_preferences TO service_role;
ALTER TABLE public.alert_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prefs_own" ON public.alert_preferences FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_watch_updated BEFORE UPDATE ON public.portfolio_watch
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_prefs_updated BEFORE UPDATE ON public.alert_preferences
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
