-- AEO / GEO scoring tables (incident_id = public.incidents.id uuid)

create table if not exists public.aeo_scores (
  incident_id uuid not null primary key references public.incidents (id) on delete cascade,
  url text not null,
  scored_at timestamptz not null default now(),
  model text not null,
  total_score smallint not null,
  sub_scores jsonb not null,
  one_line_diagnosis text not null,
  low_content boolean not null default false,
  raw_response_id text,
  content_hash text not null
);

create index if not exists aeo_scores_scored_at_idx on public.aeo_scores (scored_at desc);

create table if not exists public.aeo_recommendations (
  id serial primary key,
  incident_id uuid not null references public.aeo_scores (incident_id) on delete cascade,
  rank smallint not null,
  issue text not null,
  current_text text not null,
  suggested_rewrite text not null,
  why_it_helps text not null,
  applied boolean not null default false,
  applied_at timestamptz,
  dismissed boolean not null default false,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists aeo_recs_incident_idx on public.aeo_recommendations (incident_id, rank);

create table if not exists public.aeo_digests (
  week_start date primary key,
  pages_scored int not null,
  avg_score numeric(5, 2) not null,
  delta_vs_prev_week numeric(5, 2),
  top_patterns jsonb not null,
  topic_queue jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.aeo_score_failures (
  id serial primary key,
  incident_id uuid,
  url text,
  failed_at timestamptz not null default now(),
  attempt smallint not null,
  error_kind text not null,
  error_detail text
);

alter table public.aeo_scores enable row level security;
alter table public.aeo_recommendations enable row level security;
alter table public.aeo_digests enable row level security;
alter table public.aeo_score_failures enable row level security;

-- Public read for scores + recommendations (incident Content tab SSR may use anon).
create policy aeo_scores_select_public on public.aeo_scores for select using (true);
create policy aeo_recommendations_select_public on public.aeo_recommendations for select using (true);

-- Digests: no public select policy; service role bypasses RLS for cron/admin.
