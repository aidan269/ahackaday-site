alter table public.user_saved_incidents enable row level security;
alter table public.user_saved_incidents force row level security;

drop policy if exists "user_saved_incidents_update_own" on public.user_saved_incidents;
create policy "user_saved_incidents_update_own"
  on public.user_saved_incidents
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
