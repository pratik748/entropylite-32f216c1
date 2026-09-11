CREATE TABLE public.api_key_health (
  credential_name text PRIMARY KEY,
  provider text NOT NULL,
  source text NOT NULL CHECK (source IN ('manager', 'environment')),
  is_configured boolean NOT NULL DEFAULT true,
  last_status text CHECK (last_status IS NULL OR last_status IN ('ok', 'error')),
  last_latency_ms integer CHECK (last_latency_ms IS NULL OR last_latency_ms >= 0),
  last_error text,
  last_error_at timestamptz,
  last_used_at timestamptz,
  success_count bigint NOT NULL DEFAULT 0,
  failure_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.api_key_health TO authenticated;
GRANT ALL ON public.api_key_health TO service_role;
ALTER TABLE public.api_key_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view key health" ON public.api_key_health FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.record_key_health(
  _name text,
  _provider text,
  _source text,
  _status text,
  _latency_ms integer,
  _error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status NOT IN ('ok', 'error') OR _source NOT IN ('manager', 'environment') THEN
    RAISE EXCEPTION 'Invalid key health event';
  END IF;
  INSERT INTO public.api_key_health (
    credential_name, provider, source, is_configured, last_status,
    last_latency_ms, last_error, last_error_at, last_used_at,
    success_count, failure_count, updated_at
  ) VALUES (
    _name, _provider, _source, true, _status,
    GREATEST(0, COALESCE(_latency_ms, 0)),
    CASE WHEN _status = 'error' THEN left(COALESCE(_error, 'Unknown provider error'), 300) ELSE NULL END,
    CASE WHEN _status = 'error' THEN now() ELSE NULL END,
    now(), CASE WHEN _status = 'ok' THEN 1 ELSE 0 END,
    CASE WHEN _status = 'error' THEN 1 ELSE 0 END, now()
  )
  ON CONFLICT (credential_name) DO UPDATE SET
    provider = EXCLUDED.provider,
    source = EXCLUDED.source,
    is_configured = true,
    last_status = EXCLUDED.last_status,
    last_latency_ms = EXCLUDED.last_latency_ms,
    last_error = CASE WHEN EXCLUDED.last_status = 'error' THEN EXCLUDED.last_error ELSE NULL END,
    last_error_at = CASE WHEN EXCLUDED.last_status = 'error' THEN now() ELSE api_key_health.last_error_at END,
    last_used_at = now(),
    success_count = api_key_health.success_count + CASE WHEN EXCLUDED.last_status = 'ok' THEN 1 ELSE 0 END,
    failure_count = api_key_health.failure_count + CASE WHEN EXCLUDED.last_status = 'error' THEN 1 ELSE 0 END,
    updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.record_key_health(text, text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_key_health(text, text, text, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_key_health(text, text, text, text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_key_health(text, text, text, text, integer, text) TO service_role;