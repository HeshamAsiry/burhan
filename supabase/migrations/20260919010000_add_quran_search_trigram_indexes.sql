-- The production database already contains these Trigram indexes.
-- Keep the migration idempotent so a fresh environment receives the
-- same indexes without creating duplicate definitions.
-- pg_trgm is already enabled in Supabase.

create index if not exists idx_ayahs_normalized_trgm
  on public.ayahs using gin (normalized_text gin_trgm_ops);

create index if not exists idx_anchors_normalized_text_trgm
  on public.anchors using gin (normalized_text gin_trgm_ops);
