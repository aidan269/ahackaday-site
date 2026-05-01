create table if not exists public.user_incident_votes (
  user_id uuid not null references auth.users(id) on delete cascade,
  incident_slug text not null,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, incident_slug)
);

create index if not exists user_incident_votes_slug_idx
  on public.user_incident_votes (incident_slug);

comment on table public.user_incident_votes is
  'Per-user incident sentiment vote. +1 helpful, -1 not helpful.';

alter table public.user_incident_votes enable row level security;
alter table public.user_incident_votes force row level security;

drop policy if exists "user_incident_votes_select_own" on public.user_incident_votes;
create policy "user_incident_votes_select_own"
  on public.user_incident_votes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_incident_votes_insert_own" on public.user_incident_votes;
create policy "user_incident_votes_insert_own"
  on public.user_incident_votes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_incident_votes_update_own" on public.user_incident_votes;
create policy "user_incident_votes_update_own"
  on public.user_incident_votes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_incident_votes_delete_own" on public.user_incident_votes;
create policy "user_incident_votes_delete_own"
  on public.user_incident_votes
  for delete
  to authenticated
  using (auth.uid() = user_id);
