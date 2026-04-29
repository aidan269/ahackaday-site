create table if not exists public.user_saved_incidents (
  user_id uuid not null references auth.users(id) on delete cascade,
  incident_slug text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, incident_slug)
);

create index if not exists user_saved_incidents_created_at_idx
  on public.user_saved_incidents (created_at desc);

comment on table public.user_saved_incidents is
  'User-specific saved incident bookmarks for optional signed-in sync.';

alter table public.user_saved_incidents enable row level security;

drop policy if exists "user_saved_incidents_select_own" on public.user_saved_incidents;
create policy "user_saved_incidents_select_own"
  on public.user_saved_incidents
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_saved_incidents_insert_own" on public.user_saved_incidents;
create policy "user_saved_incidents_insert_own"
  on public.user_saved_incidents
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_saved_incidents_delete_own" on public.user_saved_incidents;
create policy "user_saved_incidents_delete_own"
  on public.user_saved_incidents
  for delete
  to authenticated
  using (auth.uid() = user_id);
