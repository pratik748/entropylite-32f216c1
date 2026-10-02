-- Ensure provider column exists on api_credentials
alter table public.api_credentials add column if not exists provider text;

-- Ensure api_key_health table exists for telemetry and health tracking
create table if not exists public.api_key_health (
  credential_name text primary key,
  provider text not null default 'unknown',
  source text not null default 'environment',
  is_configured boolean not null default true,
  last_status text,
  last_error text,
  last_error_at timestamptz,
  last_used_at timestamptz,
  last_latency_ms integer,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  updated_at timestamptz not null default now()
);

grant all on public.api_key_health to service_role;
grant select on public.api_key_health to authenticated;

alter table public.api_key_health enable row level security;

drop policy if exists "Admins read api key health" on public.api_key_health;
create policy "Admins read api key health"
on public.api_key_health for select to authenticated
using (public.is_admin());

drop policy if exists "Admins manage api key health" on public.api_key_health;
create policy "Admins manage api key health"
on public.api_key_health for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- RPC to record health safely without schema mismatch
create or replace function public.record_key_health(
  _name text,
  _provider text,
  _source text,
  _status text,
  _latency_ms integer,
  _error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.api_key_health (
    credential_name, provider, source, last_status, last_error,
    last_error_at, last_used_at, last_latency_ms,
    success_count, failure_count, updated_at
  )
  values (
    _name, _provider, _source, _status, _error,
    case when _status = 'error' then now() else null end,
    now(), _latency_ms,
    case when _status = 'ok' then 1 else 0 end,
    case when _status = 'error' then 1 else 0 end,
    now()
  )
  on conflict (credential_name) do update set
    provider = excluded.provider,
    source = excluded.source,
    last_status = excluded.last_status,
    last_error = case when excluded.last_status = 'ok' then null else excluded.last_error end,
    last_error_at = case when excluded.last_status = 'error' then now() else api_key_health.last_error_at end,
    last_used_at = now(),
    last_latency_ms = excluded.last_latency_ms,
    success_count = api_key_health.success_count + case when excluded.last_status = 'ok' then 1 else 0 end,
    failure_count = api_key_health.failure_count + case when excluded.last_status = 'error' then 1 else 0 end,
    updated_at = now();
end;
$$;
