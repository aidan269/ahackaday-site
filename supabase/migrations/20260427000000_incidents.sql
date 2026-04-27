-- AHackaday: incidents table for DATA_SOURCE=supabase and /api/ingest
-- Apply in Supabase Dashboard → SQL Editor → Run, or via `supabase db push`.

create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text not null,
  source_name text not null,
  raw_content text not null default '',
  claude_summary text not null default '{}',
  severity text not null default 'medium'
    check (severity in ('critical', 'high', 'medium', 'low')),
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint incidents_source_url_key unique (source_url)
);

create index if not exists incidents_published_at_idx
  on public.incidents (published_at desc);

comment on table public.incidents is 'Security incident feed rows; populated by /api/ingest';

alter table public.incidents enable row level security;

-- Server-side reads may use service role (bypasses RLS). Anon key needs explicit SELECT.
drop policy if exists "incidents_select_public" on public.incidents;
create policy "incidents_select_public"
  on public.incidents
  for select
  to anon, authenticated
  using (true);

-- Writes are expected via service role only (ingest route). No insert/update policies for anon.
