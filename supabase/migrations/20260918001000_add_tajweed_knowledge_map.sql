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
  unique (ayah_id, rule_id, word_index, word_index_end, trigger_text)
);

create index if not exists idx_tajweed_occurrences_ayah
  on public.tajweed_occurrences (ayah_id, word_index);

create index if not exists idx_tajweed_occurrences_rule
  on public.tajweed_occurrences (rule_id, ayah_id);

alter table public.tajweed_rules enable row level security;
alter table public.tajweed_occurrences enable row level security;

insert into public.tajweed_rules (code, name_ar, name_en, category, description, detection_mode)
values
  ('noon_izhar', 'إظهار حلقي', 'Noon/Tanween Izhar', 'noon_tanween', 'إظهار النون الساكنة أو التنوين قبل حروف الحلق في هذا الموضع.', 'deterministic_v1'),
  ('noon_idgham_ghunnah', 'إدغام بغنة', 'Idgham with Ghunnah', 'noon_tanween', 'إدغام النون الساكنة أو التنوين قبل الياء أو النون أو الميم أو الواو.', 'deterministic_v1'),
  ('noon_idgham_without_ghunnah', 'إدغام بغير غنة', 'Idgham without Ghunnah', 'noon_tanween', 'إدغام النون الساكنة أو التنوين قبل اللام أو الراء.', 'deterministic_v1'),
  ('noon_iqlab', 'إقلاب', 'Iqlab', 'noon_tanween', 'إقلاب النون الساكنة أو التنوين عند الباء.', 'deterministic_v1'),
  ('noon_ikhfa', 'إخفاء حقيقي', 'Ikhfa', 'noon_tanween', 'إخفاء النون الساكنة أو التنوين قبل حروف الإخفاء.', 'deterministic_v1'),
  ('meem_idgham_shafawi', 'إدغام شفوي', 'Shafawi Idgham', 'meem_sakinah', 'إدغام الميم الساكنة في الميم المتحركة التي تليها.', 'deterministic_v1'),
  ('meem_ikhfa_shafawi', 'إخفاء شفوي', 'Shafawi Ikhfa', 'meem_sakinah', 'إخفاء الميم الساكنة قبل الباء.', 'deterministic_v1'),
  ('meem_izhar_shafawi', 'إظهار شفوي', 'Shafawi Izhar', 'meem_sakinah', 'إظهار الميم الساكنة عند بقية الحروف.', 'deterministic_v1'),
  ('ghunnah_mushaddadah', 'غنة مشددة', 'Mushaddad Ghunnah', 'ghunnah', 'غنة ظاهرة في النون أو الميم المشددتين.', 'deterministic_v1'),
  ('qalqalah', 'قلقلة', 'Qalqalah', 'qalqalah', 'قلقلة أحد حروف قطب جد عند تحقق سبب القلقلة المكتوب.', 'deterministic_v1'),
  ('lam_shamsiyyah', 'لام شمسية', 'Sun Letter Lam', 'lam', 'إدغام لام التعريف في أحد الحروف الشمسية.', 'deterministic_v1'),
  ('lam_qamariyyah', 'لام قمرية', 'Moon Letter Lam', 'lam', 'إظهار لام التعريف قبل أحد الحروف القمرية.', 'deterministic_v1'),
  ('lafz_al_jalalah_lam', 'لام لفظ الجلالة', 'Lafz al-Jalalah Lam', 'lam', 'لام لفظ الجلالة تحتاج تحليلًا صوتيًا للسياق التفخيمي أو الترقيقي.', 'planned'),
  ('madd_asli', 'مد طبيعي', 'Natural Madd', 'madd', 'مد أصلي يحتاج لاحقًا إلى تحليل زمني صوتي وليس مجرد نص.', 'planned'),
  ('ra_tafkhim_tarqiq', 'أحكام الراء', 'Raa Tafkhim/Tarqiq', 'tafkhim_tarqiq', 'أحكام تفخيم وترقيق الراء تحتاج تحليلًا سياقيًا وصوتيًا أعمق.', 'planned')
on conflict (code) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  category = excluded.category,
  description = excluded.description,
  detection_mode = excluded.detection_mode,
  updated_at = now();
