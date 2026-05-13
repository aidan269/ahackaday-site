create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_handle_format check (
    handle = lower(handle)
    and handle ~ '^[a-z0-9][a-z0-9_-]{2,29}$'
    and handle not in ('admin', 'api', 'messages', 'profile', 'support')
  ),
  constraint user_profiles_display_name_length check (
    display_name is null or char_length(display_name) <= 80
  )
);

create index if not exists user_profiles_handle_idx
  on public.user_profiles (handle);

comment on table public.user_profiles is
  'Public handles for signed-in users. Handles are used for internal messaging discovery.';

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;

drop policy if exists "user_profiles_select_auth" on public.user_profiles;
create policy "user_profiles_select_auth"
  on public.user_profiles
  for select
  to authenticated
  using (true);

drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own"
  on public.user_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own"
  on public.user_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.message_threads (
  id uuid primary key default gen_random_uuid(),
  member_low uuid not null references auth.users(id) on delete cascade,
  member_high uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint message_threads_distinct_members check (member_low <> member_high),
  constraint message_threads_ordered_members check (member_low < member_high),
  constraint message_threads_created_by_member check (created_by in (member_low, member_high)),
  unique (member_low, member_high)
);

create index if not exists message_threads_member_low_last_idx
  on public.message_threads (member_low, last_message_at desc);
create index if not exists message_threads_member_high_last_idx
  on public.message_threads (member_high, last_message_at desc);

comment on table public.message_threads is
  'Private 1:1 internal messaging threads between two signed-in users.';

alter table public.message_threads enable row level security;
alter table public.message_threads force row level security;

drop policy if exists "message_threads_select_member" on public.message_threads;
create policy "message_threads_select_member"
  on public.message_threads
  for select
  to authenticated
  using (auth.uid() in (member_low, member_high));

drop policy if exists "message_threads_insert_member" on public.message_threads;
create policy "message_threads_insert_member"
  on public.message_threads
  for insert
  to authenticated
  with check (auth.uid() = created_by and auth.uid() in (member_low, member_high));

drop policy if exists "message_threads_update_member" on public.message_threads;
create policy "message_threads_update_member"
  on public.message_threads
  for update
  to authenticated
  using (auth.uid() in (member_low, member_high))
  with check (auth.uid() in (member_low, member_high));

create table if not exists public.message_thread_reads (
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists message_thread_reads_user_idx
  on public.message_thread_reads (user_id, last_read_at desc);

comment on table public.message_thread_reads is
  'Per-user read markers for internal message threads.';

alter table public.message_thread_reads enable row level security;
alter table public.message_thread_reads force row level security;

drop policy if exists "message_thread_reads_select_own" on public.message_thread_reads;
create policy "message_thread_reads_select_own"
  on public.message_thread_reads
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "message_thread_reads_insert_own_member" on public.message_thread_reads;
create policy "message_thread_reads_insert_own_member"
  on public.message_thread_reads
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.message_threads t
      where t.id = thread_id
        and auth.uid() in (t.member_low, t.member_high)
    )
  );

drop policy if exists "message_thread_reads_update_own" on public.message_thread_reads;
create policy "message_thread_reads_update_own"
  on public.message_thread_reads
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) >= 1 and char_length(body) <= 4000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists messages_thread_created_idx
  on public.messages (thread_id, created_at desc);
create index if not exists messages_sender_idx
  on public.messages (sender_id, created_at desc);

comment on table public.messages is
  'Private internal messages scoped to participant-only message threads.';

alter table public.messages enable row level security;
alter table public.messages force row level security;

drop policy if exists "messages_select_thread_member" on public.messages;
create policy "messages_select_thread_member"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.message_threads t
      where t.id = thread_id
        and auth.uid() in (t.member_low, t.member_high)
    )
  );

drop policy if exists "messages_insert_thread_member" on public.messages;
create policy "messages_insert_thread_member"
  on public.messages
  for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1
      from public.message_threads t
      where t.id = thread_id
        and auth.uid() in (t.member_low, t.member_high)
    )
  );

drop policy if exists "messages_update_own" on public.messages;
create policy "messages_update_own"
  on public.messages
  for update
  to authenticated
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

create or replace function public.touch_message_thread_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_threads
  set last_message_at = new.created_at
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_thread_last_message_at on public.messages;
create trigger messages_touch_thread_last_message_at
  after insert on public.messages
  for each row
  execute function public.touch_message_thread_last_message_at();
