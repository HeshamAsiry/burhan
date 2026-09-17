create table if not exists public.quran_phoneme_references (
  id uuid primary key default gen_random_uuid(),
  ayah_id uuid not null unique references public.ayahs(id) on delete cascade,
  phoneme_version text not null,
  phonemes jsonb not null,
  source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quran_phoneme_references_version
  on public.quran_phoneme_references (phoneme_version);

alter table public.quran_phoneme_references enable row level security;
