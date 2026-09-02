do $$ begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin','moderator','user');
  end if;
end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

drop policy if exists "Users can read own roles" on public.user_roles;
create policy "Users can read own roles"
on public.user_roles for select to authenticated
using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role(auth.uid(), 'admin'::public.app_role)
      or coalesce(lower((auth.jwt() ->> 'email')) = 'pardhan9013334137@gmail.com', false)
$$;

insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users
where lower(email) = 'pardhan9013334137@gmail.com'
on conflict (user_id, role) do nothing;

create table if not exists public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  label text,
  key_value text not null,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.api_credentials to authenticated;
grant all on public.api_credentials to service_role;

alter table public.api_credentials enable row level security;

drop policy if exists "Admins manage api credentials" on public.api_credentials;
create policy "Admins manage api credentials"
on public.api_credentials for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop trigger if exists trg_api_credentials_updated on public.api_credentials;
create trigger trg_api_credentials_updated
before update on public.api_credentials
for each row execute function public.tg_set_updated_at();