create table if not exists public.incident_comments (
  id uuid primary key default gen_random_uuid(),
  incident_slug text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) >= 2 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists incident_comments_slug_created_idx
  on public.incident_comments (incident_slug, created_at desc);

comment on table public.incident_comments is
  'Signed-in user comments on incident detail pages.';

alter table public.incident_comments enable row level security;
alter table public.incident_comments force row level security;

drop policy if exists "incident_comments_select_auth" on public.incident_comments;
create policy "incident_comments_select_auth"
  on public.incident_comments
  for select
  to authenticated
  using (true);

drop policy if exists "incident_comments_insert_own" on public.incident_comments;
create policy "incident_comments_insert_own"
  on public.incident_comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "incident_comments_delete_own" on public.incident_comments;
create policy "incident_comments_delete_own"
  on public.incident_comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.incident_comment_votes (
  comment_id uuid not null references public.incident_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists incident_comment_votes_comment_idx
  on public.incident_comment_votes (comment_id);

comment on table public.incident_comment_votes is
  'Signed-in user up/down votes on incident comments.';

alter table public.incident_comment_votes enable row level security;
alter table public.incident_comment_votes force row level security;

drop policy if exists "incident_comment_votes_select_auth" on public.incident_comment_votes;
create policy "incident_comment_votes_select_auth"
  on public.incident_comment_votes
  for select
  to authenticated
  using (true);

drop policy if exists "incident_comment_votes_insert_own" on public.incident_comment_votes;
create policy "incident_comment_votes_insert_own"
  on public.incident_comment_votes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "incident_comment_votes_update_own" on public.incident_comment_votes;
create policy "incident_comment_votes_update_own"
  on public.incident_comment_votes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "incident_comment_votes_delete_own" on public.incident_comment_votes;
create policy "incident_comment_votes_delete_own"
  on public.incident_comment_votes
  for delete
  to authenticated
  using (auth.uid() = user_id);
