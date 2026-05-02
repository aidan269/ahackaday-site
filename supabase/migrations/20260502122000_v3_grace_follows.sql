-- Phase 3–4: practitioner follows + Grace durable runs + org scratch notes.

create table if not exists public.user_incident_follows (
  user_id uuid not null references auth.users (id) on delete cascade,
  incident_slug text not null,
  mention_alert_threshold integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, incident_slug),
  constraint user_incident_follows_threshold_nonneg check (
    mention_alert_threshold is null or mention_alert_threshold >= 0
  )
);

create index if not exists user_incident_follows_slug_idx
  on public.user_incident_follows (incident_slug);

comment on table public.user_incident_follows is
  'Pinned “track this incident” rows; optional mention threshold for future alerting.';

alter table public.user_incident_follows enable row level security;

drop policy if exists "user_incident_follows_select_own" on public.user_incident_follows;
create policy "user_incident_follows_select_own"
  on public.user_incident_follows
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "user_incident_follows_insert_own" on public.user_incident_follows;
create policy "user_incident_follows_insert_own"
  on public.user_incident_follows
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_incident_follows_update_own" on public.user_incident_follows;
create policy "user_incident_follows_update_own"
  on public.user_incident_follows
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_incident_follows_delete_own" on public.user_incident_follows;
create policy "user_incident_follows_delete_own"
  on public.user_incident_follows
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.grace_runs (
  id uuid primary key default gen_random_uuid(),
  incident_canonical_id uuid not null references public.incidents (canonical_id) on delete cascade,
  incident_slug text not null,
  track text not null
    check (track in ('contain', 'hunt', 'patch', 'brief')),
  status text not null default 'completed'
    check (status in ('queued', 'running', 'completed', 'failed')),
  inputs jsonb not null default '{}'::jsonb,
  outputs jsonb not null default '{}'::jsonb,
  audit jsonb not null default '{}'::jsonb,
  plugins_used text[] not null default '{}',
  tokens_used integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  actor text not null default 'system'
);

create index if not exists grace_runs_canonical_started_idx
  on public.grace_runs (incident_canonical_id, started_at desc);

comment on table public.grace_runs is 'Durable Grace workflow executions keyed by canonical incident id.';

alter table public.grace_runs enable row level security;

drop policy if exists "grace_runs_select_public" on public.grace_runs;
create policy "grace_runs_select_public"
  on public.grace_runs
  for select
  to anon, authenticated
  using (true);

create table if not exists public.grace_org_notes (
  id uuid primary key default gen_random_uuid(),
  incident_canonical_id uuid not null references public.incidents (canonical_id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  author_label text not null default 'team'
);

create index if not exists grace_org_notes_canonical_idx
  on public.grace_org_notes (incident_canonical_id, updated_at desc);

comment on table public.grace_org_notes is 'Org-visible scratch context layered onto canonical incidents.';

alter table public.grace_org_notes enable row level security;

drop policy if exists "grace_org_notes_select_public" on public.grace_org_notes;
create policy "grace_org_notes_select_public"
  on public.grace_org_notes
  for select
  to anon, authenticated
  using (true);
