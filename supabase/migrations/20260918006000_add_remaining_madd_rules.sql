insert into public.tajweed_rules
  (code, name_ar, name_en, category, description, detection_mode)
values
  ('madd_tamkin', 'مد التمكين', 'Madd al-Tamkin', 'madd',
   'حالة خاصة مرتبطة باجتماع الياءات وتحتاج تحليلًا صرفيًا وقرائيًا دقيقًا.',
   'planned'),
  ('madd_tabii_harfi', 'مد طبيعي حرفي', 'Harfi Natural Madd', 'madd',
   'المد في هجاء بعض الحروف المقطعة التي هجاؤها على حرفي مد دون سبب فرعي، ويحتاج معرفة هجاء الحرف.',
   'planned')
on conflict (code) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  category = excluded.category,
  description = excluded.description,
  detection_mode = excluded.detection_mode,
  updated_at = now();
