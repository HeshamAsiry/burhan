create table if not exists public.tajweed_madd_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_code text not null,
  profile_name_ar text not null,
  qiraah text not null,
  riwayah text not null,
  tariq text,
  rule_code text not null references public.tajweed_rules(code) on update cascade on delete restrict,
  allowed_harakah jsonb,
  measurement_mode text not null default 'route_profile'
    check (measurement_mode in ('fixed_harakah','route_profile','contextual')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_code, rule_code)
);

create index if not exists idx_tajweed_madd_profiles_code
  on public.tajweed_madd_profiles (profile_code);

alter table public.tajweed_madd_profiles enable row level security;

insert into public.tajweed_madd_profiles
  (profile_code, profile_name_ar, qiraah, riwayah, tariq, rule_code, allowed_harakah, measurement_mode, notes)
values
  ('hafs_asim_baseline_v1', 'حفص عن عاصم — خط أساس', 'عاصم', 'حفص', null, 'madd_asli', '[2]'::jsonb, 'fixed_harakah', 'خط أساس للمد الطبيعي؛ القياس الصوتي يظل مستقلًا عن سرعة القارئ.'),
  ('hafs_asim_baseline_v1', 'حفص عن عاصم — خط أساس', 'عاصم', 'حفص', null, 'madd_lazim_kalimi_muthaqqal', '[6]'::jsonb, 'fixed_harakah', 'المد اللازم له الإشباع بست حركات في هذا الخط الأساس.'),
  ('hafs_asim_baseline_v1', 'حفص عن عاصم — خط أساس', 'عاصم', 'حفص', null, 'madd_lazim_kalimi_mukhaffaf', '[6]'::jsonb, 'fixed_harakah', 'المد اللازم له الإشباع بست حركات في هذا الخط الأساس.')
on conflict (profile_code, rule_code) do update set
  profile_name_ar = excluded.profile_name_ar,
  qiraah = excluded.qiraah,
  riwayah = excluded.riwayah,
  tariq = excluded.tariq,
  allowed_harakah = excluded.allowed_harakah,
  measurement_mode = excluded.measurement_mode,
  notes = excluded.notes,
  updated_at = now();


create index if not exists idx_tajweed_madd_profiles_rule_code
  on public.tajweed_madd_profiles (rule_code);
