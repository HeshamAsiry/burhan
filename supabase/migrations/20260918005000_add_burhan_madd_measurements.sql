create table if not exists public.burhan_madd_measurements (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.burhan_tajweed_analyses(id) on delete cascade,
  occurrence_id uuid not null references public.tajweed_occurrences(id) on delete cascade,
  profile_code text not null,
  rule_code text not null references public.tajweed_rules(code) on update cascade on delete restrict,
  observed_duration_ms numeric check (observed_duration_ms is null or observed_duration_ms >= 0),
  reference_harakah_ms numeric check (reference_harakah_ms is null or reference_harakah_ms > 0),
  estimated_harakah numeric check (estimated_harakah is null or estimated_harakah >= 0),
  expected_harakah jsonb,
  deviation_percent numeric,
  measurement_confidence numeric check (measurement_confidence is null or (measurement_confidence >= 0 and measurement_confidence <= 1)),
  stop_detected boolean,
  status text not null check (status in ('verified','detected_issue','needs_teacher_review','not_assessed')),
  reasons jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_id, occurrence_id)
);

create index if not exists idx_burhan_madd_measurements_analysis
  on public.burhan_madd_measurements (analysis_id);

create index if not exists idx_burhan_madd_measurements_status
  on public.burhan_madd_measurements (status, created_at desc);

create index if not exists idx_burhan_madd_measurements_occurrence
  on public.burhan_madd_measurements (occurrence_id);

alter table public.burhan_madd_measurements enable row level security;
