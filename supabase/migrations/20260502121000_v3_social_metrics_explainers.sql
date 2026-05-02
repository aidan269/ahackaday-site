-- Phase 2: structured explainability payload for social metrics (window, raw counts, scan timing).

alter table public.incident_social_metrics
  add column if not exists social_metric_explainers jsonb not null default '{}'::jsonb;

comment on column public.incident_social_metrics.social_metric_explainers is
  'Per-scan provenance: windows, raw platform counts, latency, partial-scan flags.';

-- Ensure extended X columns exist when upgrading from older databases that only had base migration.
alter table public.incident_social_metrics
  add column if not exists x_mentions_24h integer,
  add column if not exists x_unique_authors_24h integer,
  add column if not exists x_verified_mentions_24h integer,
  add column if not exists x_retweet_sum_24h integer,
  add column if not exists x_like_sum_24h integer,
  add column if not exists x_quote_sum_24h integer,
  add column if not exists x_reply_sum_24h integer,
  add column if not exists x_heat_score integer,
  add column if not exists x_heat_trend text,
  add column if not exists x_top_hashtags text[],
  add column if not exists x_top_terms text[];
