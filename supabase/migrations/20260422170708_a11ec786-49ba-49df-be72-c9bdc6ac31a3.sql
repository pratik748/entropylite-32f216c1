create table if not exists public.cadence_entries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  publish_date date not null unique,
  concept text not null,
  tagline text not null,
  discipline text not null,
  read_minutes integer not null default 7,
  why_it_matters text not null,
  inside_caption text not null,
  inside_annotation text not null,
  image_url text,
  mathematical_core jsonb not null default '[]'::jsonb,
  failure_modes jsonb not null default '[]'::jsonb,
  providers_used jsonb not null default '[]'::jsonb,
  generation_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cadence_topics_used (
  topic text primary key,
  used_at timestamptz not null default now(),
  entry_id uuid references public.cadence_entries(id) on delete set null
);

alter table public.cadence_entries enable row level security;
alter table public.cadence_topics_used enable row level security;

create policy "cadence_public_read"
  on public.cadence_entries for select
  to anon, authenticated
  using (true);

create policy "cadence_topics_public_read"
  on public.cadence_topics_used for select
  to anon, authenticated
  using (true);

create index if not exists cadence_entries_publish_date_idx
  on public.cadence_entries (publish_date desc);