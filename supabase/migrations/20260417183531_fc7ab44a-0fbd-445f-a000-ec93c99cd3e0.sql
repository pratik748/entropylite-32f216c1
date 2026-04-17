create table public.statarb_outcomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  pair text not null,
  regime_at_entry text not null,
  s_final numeric not null default 0,
  expected_half_life numeric not null default 0,
  actual_outcome text not null check (actual_outcome in ('reverted','did_not_revert','regime_flipped')),
  pnl_bps numeric not null default 0,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.statarb_outcomes enable row level security;

create policy "perm_select_statarb_outcomes" on public.statarb_outcomes
  for select to authenticated using (auth.uid() = user_id);
create policy "perm_insert_statarb_outcomes" on public.statarb_outcomes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "perm_update_statarb_outcomes" on public.statarb_outcomes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "perm_delete_statarb_outcomes" on public.statarb_outcomes
  for delete to authenticated using (auth.uid() = user_id);

create index statarb_outcomes_user_pair_idx on public.statarb_outcomes(user_id, pair, closed_at desc);