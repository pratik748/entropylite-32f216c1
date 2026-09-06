ALTER TABLE public.api_credentials
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status text,
  ADD COLUMN IF NOT EXISTS last_latency_ms integer,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS success_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_count bigint NOT NULL DEFAULT 0;

ALTER TABLE public.api_credentials DROP CONSTRAINT IF EXISTS api_credentials_last_status_check;
ALTER TABLE public.api_credentials ADD CONSTRAINT api_credentials_last_status_check CHECK (last_status IS NULL OR last_status IN ('ok', 'error'));
ALTER TABLE public.api_credentials DROP CONSTRAINT IF EXISTS api_credentials_last_latency_ms_check;
ALTER TABLE public.api_credentials ADD CONSTRAINT api_credentials_last_latency_ms_check CHECK (last_latency_ms IS NULL OR last_latency_ms >= 0);

CREATE OR REPLACE FUNCTION public.record_key_telemetry(
  _name text,
  _provider text,
  _status text,
  _latency_ms integer,
  _error text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status NOT IN ('ok', 'error') THEN
    RAISE EXCEPTION 'Invalid telemetry status';
  END IF;

  UPDATE public.api_credentials
  SET provider = COALESCE(NULLIF(_provider, ''), provider),
      last_used_at = now(),
      last_status = _status,
      last_latency_ms = GREATEST(0, COALESCE(_latency_ms, 0)),
      last_error = CASE WHEN _status = 'error' THEN left(COALESCE(_error, 'Unknown provider error'), 300) ELSE NULL END,
      last_error_at = CASE WHEN _status = 'error' THEN now() ELSE last_error_at END,
      success_count = success_count + CASE WHEN _status = 'ok' THEN 1 ELSE 0 END,
      failure_count = failure_count + CASE WHEN _status = 'error' THEN 1 ELSE 0 END
  WHERE name = _name;
END;
$$;

REVOKE ALL ON FUNCTION public.record_key_telemetry(text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_key_telemetry(text, text, text, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_key_telemetry(text, text, text, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_key_telemetry(text, text, text, integer, text) TO service_role;