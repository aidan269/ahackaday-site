create table if not exists public.incident_social_metrics (
  incident_id uuid primary key references public.incidents(id) on delete cascade,
  social_mentions_24h integer not null default 0,
  social_trend text not null default 'flat'
    check (social_trend in ('up', 'flat', 'down')),
  social_summary text not null default '',
  social_delta_24h_pct integer,
  social_platform_split jsonb not null default '{"x":40,"reddit":35,"github":25}'::jsonb,
  social_keywords text[] not null default '{}',
  source text not null default 'github',
  updated_at timestamptz not null default now()
);

create index if not exists incident_social_metrics_updated_at_idx
  on public.incident_social_metrics (updated_at desc);

comment on table public.incident_social_metrics is
  'Per-incident social metrics refreshed by /api/social/refresh.';

alter table public.incident_social_metrics enable row level security;

drop policy if exists "incident_social_metrics_select_public" on public.incident_social_metrics;
create policy "incident_social_metrics_select_public"
  on public.incident_social_metrics
  for select
  to anon, authenticated
  using (true);
