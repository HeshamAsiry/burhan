create table if not exists public.burhan_tajweed_analyses (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.test_attempts(id) on delete cascade,
  question_id uuid not null references public.test_questions(id) on delete cascade,
  audio_answer_id uuid references public.burhan_audio_answers(id) on delete set null,
  analysis_version text not null default 'tajweed-v1',
  model text,
  pronunciation_score numeric check (pronunciation_score is null or pronunciation_score >= 0 and pronunciation_score <= 100),
  tajweed_score numeric check (tajweed_score is null or tajweed_score >= 0 and tajweed_score <= 100),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  issue_detected boolean not null default false,
  audio_quality text not null default 'good' check (audio_quality in ('good','unclear','poor')),
  unresolved_items integer not null default 0 check (unresolved_items >= 0),
  conflicting_signals integer not null default 0 check (conflicting_signals >= 0),
  verdict_status text not null check (verdict_status in ('not_assessed','verified','needs_teacher_review','detected_issue')),
  review_reasons jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

create index if not exists idx_burhan_tajweed_analyses_review
  on public.burhan_tajweed_analyses (verdict_status, created_at desc);

create index if not exists idx_burhan_tajweed_analyses_attempt
  on public.burhan_tajweed_analyses (attempt_id);

create index if not exists idx_burhan_tajweed_analyses_question
  on public.burhan_tajweed_analyses (question_id);

create table if not exists public.burhan_teacher_reviews (
  id uuid primary key default gen_random_uuid(),
  tajweed_analysis_id uuid not null unique references public.burhan_tajweed_analyses(id) on delete cascade,
  status text not null check (status in ('confirmed','rejected','unclear')),
  reviewer_external_id text,
  notes text,
  final_score numeric check (final_score is null or final_score >= 0 and final_score <= 100),
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_burhan_teacher_reviews_status
  on public.burhan_teacher_reviews (status, reviewed_at desc);

alter table public.burhan_tajweed_analyses enable row level security;
alter table public.burhan_teacher_reviews enable row level security;
