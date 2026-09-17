create table if not exists public.tajweed_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  category text not null,
  description text,
  detection_mode text not null default 'planned'
    check (detection_mode in ('deterministic_v1','planned','audio_model')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tajweed_occurrences (
  id uuid primary key default gen_random_uuid(),
  ayah_id uuid not null references public.ayahs(id) on delete cascade,
  rule_id uuid not null references public.tajweed_rules(id) on delete cascade,
  word_index integer not null check (word_index >= 0),
  word_index_end integer not null check (word_index_end >= word_index),
  trigger_text text not null,
  context_text text,
  expected_behavior jsonb not null default '{}'::jsonb,
  source_version text not null default 'burhan-tajweed-map-v1',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ayah_id, rule_id, word_index, word_index_end)
);

create index if not exists idx_tajweed_occurrences_ayah
  on public.tajweed_occurrences (ayah_id, word_index);

create index if not exists idx_tajweed_occurrences_rule
  on public.tajweed_occurrences (rule_id, ayah_id);

alter table public.tajweed_rules enable row level security;
alter table public.tajweed_occurrences enable row level security;
