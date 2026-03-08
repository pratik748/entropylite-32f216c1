
-- Fix all RLS policies to be PERMISSIVE (they were created as RESTRICTIVE)
-- user_portfolios
DROP POLICY IF EXISTS "Users can view own portfolio" ON public.user_portfolios;
DROP POLICY IF EXISTS "Users can insert own portfolio" ON public.user_portfolios;
DROP POLICY IF EXISTS "Users can update own portfolio" ON public.user_portfolios;
DROP POLICY IF EXISTS "Users can delete own portfolio" ON public.user_portfolios;

CREATE POLICY "perm_select_portfolio" ON public.user_portfolios AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "perm_insert_portfolio" ON public.user_portfolios AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_update_portfolio" ON public.user_portfolios AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_delete_portfolio" ON public.user_portfolios AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- user_analysis_history
DROP POLICY IF EXISTS "Users can view own history" ON public.user_analysis_history;
DROP POLICY IF EXISTS "Users can insert own history" ON public.user_analysis_history;
DROP POLICY IF EXISTS "Users can delete own history" ON public.user_analysis_history;

CREATE POLICY "perm_select_history" ON public.user_analysis_history AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "perm_insert_history" ON public.user_analysis_history AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_delete_history" ON public.user_analysis_history AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- clank_activation_events
DROP POLICY IF EXISTS "Users can view own activations" ON public.clank_activation_events;
DROP POLICY IF EXISTS "Users can insert own activations" ON public.clank_activation_events;
DROP POLICY IF EXISTS "Users can update own activations" ON public.clank_activation_events;
DROP POLICY IF EXISTS "Users can delete own activations" ON public.clank_activation_events;

CREATE POLICY "perm_select_activations" ON public.clank_activation_events AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "perm_insert_activations" ON public.clank_activation_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_update_activations" ON public.clank_activation_events AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_delete_activations" ON public.clank_activation_events AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- clank_confidence_overrides
DROP POLICY IF EXISTS "Users can view own overrides" ON public.clank_confidence_overrides;
DROP POLICY IF EXISTS "Users can insert own overrides" ON public.clank_confidence_overrides;
DROP POLICY IF EXISTS "Users can update own overrides" ON public.clank_confidence_overrides;
DROP POLICY IF EXISTS "Users can delete own overrides" ON public.clank_confidence_overrides;

CREATE POLICY "perm_select_overrides" ON public.clank_confidence_overrides AS PERMISSIVE FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "perm_insert_overrides" ON public.clank_confidence_overrides AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_update_overrides" ON public.clank_confidence_overrides AS PERMISSIVE FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "perm_delete_overrides" ON public.clank_confidence_overrides AS PERMISSIVE FOR DELETE TO authenticated USING (auth.uid() = user_id);
