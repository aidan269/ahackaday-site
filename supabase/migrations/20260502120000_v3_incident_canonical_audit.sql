-- AHackaday v3 Phase 1: canonical incident identity, revision history, evidence claims graph.

alter table public.incidents
  add column if not exists canonical_id uuid,
  add column if not exists canonical_version integer not null default 1,
  add column if not exists merged_from uuid[] not null default '{}';

update public.incidents set canonical_id = id where canonical_id is null;

alter table public.incidents alter column canonical_id set not null;

create unique index if not exists incidents_canonical_id_uidx
  on public.incidents (canonical_id);

comment on column public.incidents.canonical_id is 'Stable public incident identity; survives slug/title churn.';
comment on column public.incidents.canonical_version is 'Monotonic narrative version for merged duplicate rows.';
comment on column public.incidents.merged_from is 'Other incidents.id values folded into this canonical record (optional).';

create table if not exists public.incident_revisions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  revision_no integer not null,
  changed_fields text[] not null default '{}',
  previous_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  source text not null default 'system',
  note text,
  created_at timestamptz not null default now(),
  unique (incident_id, revision_no)
);

create index if not exists incident_revisions_incident_created_idx
  on public.incident_revisions (incident_id, created_at desc);

comment on table public.incident_revisions is 'Append-only snapshot rows for severity/summary/affected/iocs/evidence changes.';

create table if not exists public.incident_claims (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents (id) on delete cascade,
  field text not null,
  value text not null default '',
  source_url text,
  snippet text,
  confidence numeric(5, 4),
  inferred_by text not null default 'heuristic'
    check (inferred_by in ('source', 'model', 'heuristic')),
  created_at timestamptz not null default now()
);

create index if not exists incident_claims_incident_idx
  on public.incident_claims (incident_id);

comment on table public.incident_claims is 'Claim lineage for incident fields (evidence graph).';

alter table public.incident_revisions enable row level security;
alter table public.incident_claims enable row level security;

drop policy if exists "incident_revisions_select_public" on public.incident_revisions;
create policy "incident_revisions_select_public"
  on public.incident_revisions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "incident_claims_select_public" on public.incident_claims;
create policy "incident_claims_select_public"
  on public.incident_claims
  for select
  to anon, authenticated
  using (true);
