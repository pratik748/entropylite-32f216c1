-- email_log: idempotent record of every transactional email attempt.
-- service_role only — this table backs the real send pipeline and must not
-- be readable/writable by end users.
CREATE TABLE public.email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  recipient_email text NOT NULL,
  template_name text NOT NULL,
  status text NOT NULL DEFAULT 'sending',
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.email_log TO service_role;
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;
-- no policies for authenticated/anon: default-deny, service_role bypasses RLS

CREATE TRIGGER trg_email_log_updated BEFORE UPDATE ON public.email_log
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Track consecutive failed re-analysis attempts per watch so a broken
-- upstream analysis call doesn't silently masquerade as "up to date".
ALTER TABLE public.portfolio_watch
  ADD COLUMN consecutive_analysis_failures integer NOT NULL DEFAULT 0;
