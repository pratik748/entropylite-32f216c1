CREATE TABLE public.asset_graph_edges (
  src text NOT NULL,
  dst text NOT NULL,
  edge_type text NOT NULL CHECK (edge_type IN
    ('sector_member','supply_chain','cointegrated','lead_lag','claim_link')),
  weight real NOT NULL CHECK (weight >= 0 AND weight <= 1),
  as_of timestamptz NOT NULL DEFAULT now(),
  meta jsonb,
  PRIMARY KEY (src, dst, edge_type)
);
GRANT SELECT ON public.asset_graph_edges TO authenticated;
GRANT ALL ON public.asset_graph_edges TO service_role;
ALTER TABLE public.asset_graph_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "age_read_all" ON public.asset_graph_edges
  FOR SELECT TO authenticated USING (true);
CREATE INDEX age_by_src ON public.asset_graph_edges (src, weight DESC);

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  symbol text NOT NULL,
  signal_class text NOT NULL,
  direction smallint NOT NULL CHECK (direction IN (-1, 1)),
  horizon_days int NOT NULL,
  os real NOT NULL,
  factors jsonb NOT NULL,
  regime text,
  bottleneck jsonb,
  published boolean NOT NULL DEFAULT false,
  reject_reasons text[],
  frozen_features jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opp_read_all" ON public.opportunities
  FOR SELECT TO authenticated USING (true);
CREATE INDEX opp_recent ON public.opportunities (created_at DESC, published);
CREATE INDEX opp_by_symbol ON public.opportunities (symbol, created_at DESC);

CREATE TABLE public.opportunity_outcomes (
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  horizon_days int NOT NULL,
  fwd_return real,
  hit boolean,
  filled_at timestamptz,
  PRIMARY KEY (opportunity_id, horizon_days)
);
GRANT SELECT ON public.opportunity_outcomes TO authenticated;
GRANT ALL ON public.opportunity_outcomes TO service_role;
ALTER TABLE public.opportunity_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "oo_read_all" ON public.opportunity_outcomes
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.engine_regime_stats (
  engine_id text NOT NULL,
  regime text NOT NULL,
  alpha real NOT NULL DEFAULT 5.5,
  beta real NOT NULL DEFAULT 4.5,
  n int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (engine_id, regime)
);
GRANT SELECT ON public.engine_regime_stats TO authenticated;
GRANT ALL ON public.engine_regime_stats TO service_role;
ALTER TABLE public.engine_regime_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ers_read_all" ON public.engine_regime_stats
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.scar_memory
  ADD COLUMN IF NOT EXISTS scar_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS permanent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS corroboration int NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS scar_permanent
  ON public.scar_memory (user_id, permanent, scar_score DESC);