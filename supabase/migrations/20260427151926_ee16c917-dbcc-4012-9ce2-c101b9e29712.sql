-- TWRD Veracity Layer — sources, claims, contradictions, feedback, weights

create table if not exists public.twrd_sources (
  id text primary key,
  domain text not null check (domain in ('financial','news','social','geo','scientific')),
  alpha numeric not null default 5,
  beta  numeric not null default 5,
  updated_at timestamptz not null default now()
);

create table if not exists public.twrd_claims (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  relation text not null,
  object text not null,
  domain text not null,
  truth_score numeric not null check (truth_score >= 0 and truth_score <= 1),
  alpha numeric not null default 5,
  beta  numeric not null default 5,
  decay_rate numeric not null default 0.0000011,  -- ln(2)/7d in 1/sec
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  evidence jsonb not null default '[]'::jsonb,
  superseded_by uuid references public.twrd_claims(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists twrd_claims_subject_relation_idx on public.twrd_claims (subject, relation);
create index if not exists twrd_claims_domain_valid_idx on public.twrd_claims (domain, valid_from desc);

create table if not exists public.twrd_contradictions (
  claim_a uuid references public.twrd_claims(id) on delete cascade,
  claim_b uuid references public.twrd_claims(id) on delete cascade,
  detected_at timestamptz not null default now(),
  primary key (claim_a, claim_b)
);

create table if not exists public.twrd_feedback (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references public.twrd_claims(id) on delete cascade,
  user_id uuid,
  outcome smallint not null check (outcome in (0,1)),
  observed_at timestamptz not null default now()
);
create index if not exists twrd_feedback_claim_idx on public.twrd_feedback (claim_id);

create table if not exists public.twrd_weights (
  id smallint primary key default 1 check (id = 1),
  w1 numeric not null default 1.2,
  w2 numeric not null default 1.0,
  w3 numeric not null default 0.8,
  w4 numeric not null default 1.1,
  w5 numeric not null default 1.3,
  b  numeric not null default -0.5,
  updated_at timestamptz not null default now()
);

insert into public.twrd_weights (id) values (1) on conflict (id) do nothing;

-- Seed canonical source priors (n0=10, π0 reflected in α,β)
insert into public.twrd_sources (id, domain, alpha, beta) values
  ('reuters',          'news',       8.5, 1.5),
  ('bloomberg',        'news',       8.5, 1.5),
  ('wsj',              'news',       8.0, 2.0),
  ('ft',               'news',       8.0, 2.0),
  ('cnbc',             'news',       6.5, 3.5),
  ('yahoo-finance',    'financial',  7.5, 2.5),
  ('alphavantage',     'financial',  7.5, 2.5),
  ('finnhub',          'financial',  7.5, 2.5),
  ('polygon',          'financial',  8.0, 2.0),
  ('sec-edgar',        'financial',  9.5, 0.5),
  ('newsdata',         'news',       6.0, 4.0),
  ('seeking-alpha',    'news',       5.5, 4.5),
  ('twitter',          'social',     3.0, 7.0),
  ('reddit',           'social',     3.5, 6.5),
  ('gdelt',            'geo',        7.0, 3.0),
  ('polymarket',       'financial',  6.5, 3.5),
  ('arxiv',            'scientific', 6.0, 4.0)
on conflict (id) do nothing;

-- RLS
alter table public.twrd_sources         enable row level security;
alter table public.twrd_claims          enable row level security;
alter table public.twrd_contradictions  enable row level security;
alter table public.twrd_feedback        enable row level security;
alter table public.twrd_weights         enable row level security;

create policy twrd_sources_read         on public.twrd_sources         for select to anon, authenticated using (true);
create policy twrd_claims_read          on public.twrd_claims          for select to anon, authenticated using (true);
create policy twrd_contradictions_read  on public.twrd_contradictions  for select to anon, authenticated using (true);
create policy twrd_weights_read         on public.twrd_weights         for select to anon, authenticated using (true);

create policy twrd_feedback_select_own  on public.twrd_feedback for select to authenticated using (auth.uid() = user_id);
create policy twrd_feedback_insert_own  on public.twrd_feedback for insert to authenticated with check (auth.uid() = user_id);