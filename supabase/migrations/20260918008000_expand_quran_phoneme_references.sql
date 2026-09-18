alter table public.quran_phoneme_references
  add column if not exists letter_phoneme_mappings jsonb not null default '[]'::jsonb,
  add column if not exists tajweed_mappings jsonb not null default '[]'::jsonb;
