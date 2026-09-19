-- Speeds up the leading-wildcard ILIKE queries used by the Burhan
-- anchor candidate RPC. The indexes were applied to the production
-- Supabase database before committing this migration for reproducibility.

create index if not exists ayahs_normalized_text_trgm_idx
  on public.ayahs using gin (normalized_text gin_trgm_ops);

create index if not exists anchors_normalized_text_trgm_idx
  on public.anchors using gin (normalized_text gin_trgm_ops);
