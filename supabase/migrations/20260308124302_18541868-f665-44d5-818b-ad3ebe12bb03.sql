
-- Portfolio stocks table
CREATE TABLE public.user_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker TEXT NOT NULL,
  buy_price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, ticker)
);

ALTER TABLE public.user_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own portfolio" ON public.user_portfolios
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own portfolio" ON public.user_portfolios
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own portfolio" ON public.user_portfolios
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own portfolio" ON public.user_portfolios
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Analysis history table
CREATE TABLE public.user_analysis_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticker TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  suggestion TEXT NOT NULL,
  current_price NUMERIC NOT NULL,
  buy_price NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_analysis_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own history" ON public.user_analysis_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own history" ON public.user_analysis_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own history" ON public.user_analysis_history
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
