-- Ensure new ingest rows receive a canonical id without client-providing it.
alter table public.incidents
  alter column canonical_id set default gen_random_uuid();
