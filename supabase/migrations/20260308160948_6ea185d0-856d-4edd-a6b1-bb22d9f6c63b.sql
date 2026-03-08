
-- Fix user_portfolios: drop restrictive policies, recreate as permissive
DROP POLICY IF EXISTS "Users can view own portfolio" ON public.user_portfolios;
DROP POLICY IF EXISTS "Users can insert own portfolio" ON public.user_portfolios;
DROP POLICY IF EXISTS "Users can update own portfolio" ON public.user_portfolios;
DROP POLICY IF EXISTS "Users can delete own portfolio" ON public.user_portfolios;

CREATE POLICY "Users can view own portfolio" ON public.user_portfolios FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own portfolio" ON public.user_portfolios FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own portfolio" ON public.user_portfolios FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own portfolio" ON public.user_portfolios FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix user_analysis_history
DROP POLICY IF EXISTS "Users can view own history" ON public.user_analysis_history;
DROP POLICY IF EXISTS "Users can insert own history" ON public.user_analysis_history;
DROP POLICY IF EXISTS "Users can delete own history" ON public.user_analysis_history;

CREATE POLICY "Users can view own history" ON public.user_analysis_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON public.user_analysis_history FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own history" ON public.user_analysis_history FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix clank_activation_events
DROP POLICY IF EXISTS "Users can view own activations" ON public.clank_activation_events;
DROP POLICY IF EXISTS "Users can insert own activations" ON public.clank_activation_events;
DROP POLICY IF EXISTS "Users can update own activations" ON public.clank_activation_events;
DROP POLICY IF EXISTS "Users can delete own activations" ON public.clank_activation_events;

CREATE POLICY "Users can view own activations" ON public.clank_activation_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activations" ON public.clank_activation_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own activations" ON public.clank_activation_events FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own activations" ON public.clank_activation_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Fix clank_confidence_overrides
DROP POLICY IF EXISTS "Users can view own overrides" ON public.clank_confidence_overrides;
DROP POLICY IF EXISTS "Users can insert own overrides" ON public.clank_confidence_overrides;
DROP POLICY IF EXISTS "Users can update own overrides" ON public.clank_confidence_overrides;
DROP POLICY IF EXISTS "Users can delete own overrides" ON public.clank_confidence_overrides;

CREATE POLICY "Users can view own overrides" ON public.clank_confidence_overrides FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own overrides" ON public.clank_confidence_overrides FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own overrides" ON public.clank_confidence_overrides FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own overrides" ON public.clank_confidence_overrides FOR DELETE TO authenticated USING (auth.uid() = user_id);
