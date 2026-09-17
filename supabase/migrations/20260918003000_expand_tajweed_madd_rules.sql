alter table public.tajweed_occurrences
  add column if not exists char_start integer,
  add column if not exists char_end integer;

alter table public.tajweed_occurrences
  drop constraint if exists tajweed_occurrences_ayah_rule_word_trigger_key;

alter table public.tajweed_occurrences
  add constraint tajweed_occurrences_location_key
  unique (ayah_id, rule_id, char_start, char_end, word_index, word_index_end, trigger_text);

insert into public.tajweed_rules
  (code, name_ar, name_en, category, description, detection_mode)
values
  ('madd_asli', 'مد طبيعي', 'Natural Madd', 'madd',
   'حرف مد لا يليه همز ولا سكون لازم، والأصل فيه حركتان في قراءة حفص ضمن هذا الملف المرجعي.',
   'deterministic_v1'),
  ('madd_badl', 'مد البدل', 'Madd al-Badal', 'madd',
   'همزة متقدمة على حرف المد في الكلمة.',
   'deterministic_v1'),
  ('madd_muttasil', 'مد متصل', 'Madd al-Muttasil', 'madd',
   'حرف المد يليه همز في الكلمة نفسها.',
   'deterministic_v1'),
  ('madd_munfasil', 'مد منفصل', 'Madd al-Munfasil', 'madd',
   'حرف المد في آخر كلمة وتليه همزة في أول الكلمة التالية، ويُقاس مقدار المد وفق ملف القراءة/الطريق المعتمد.',
   'deterministic_v1'),
  ('madd_lazim_kalimi_muthaqqal', 'مد لازم كلمي مثقل', 'Kalimi Muthaqqal Madd', 'madd',
   'حرف المد يليه سكون أصلي في صورة حرف مشدد داخل الكلمة.',
   'deterministic_v1'),
  ('madd_lazim_kalimi_mukhaffaf', 'مد لازم كلمي مخفف', 'Kalimi Mukhaffaf Madd', 'madd',
   'حرف المد يليه سكون أصلي مخفف داخل الكلمة.',
   'deterministic_v1'),
  ('madd_arid_lissukun', 'مد عارض للسكون', 'Madd al-Arid li-Sukun', 'madd',
   'مد يتولد عند الوقف بسبب السكون العارض بعد حرف المد.',
   'planned'),
  ('madd_leen', 'مد اللين', 'Madd al-Leen', 'madd',
   'واو أو ياء ساكنة قبلها فتح، ويظهر حكم المد عند الوقف بحسب القراءة.',
   'planned'),
  ('madd_iwad', 'مد العوض', 'Madd al-Iwad', 'madd',
   'عوض عن تنوين الفتح عند الوقف في المواضع التي ينطبق عليها الحكم.',
   'planned'),
  ('madd_silah_qasirah', 'مد صلة صغرى', 'Qasr al-Silah', 'madd',
   'صلة هاء الضمير بين متحركين من غير همز بعدها، وتحتاج تحليلًا صرفيًا/نحويًا وسياقيًا.',
   'planned'),
  ('madd_silah_kubra', 'مد صلة كبرى', 'Silah Kubra', 'madd',
   'صلة هاء الضمير إذا جاء بعدها همز، وتحتاج تحليلًا سياقيًا وصوتيًا.',
   'planned'),
  ('madd_lazim_harfi', 'مد لازم حرفي', 'Harfi Madd Lazim', 'madd',
   'أحكام المد في فواتح السور تحتاج معرفة هجاء الحروف المقطعة، ولا تستنتج من حرف واحد في الكلمة العادية.',
   'planned'),
  ('madd_farq', 'مد الفرق', 'Madd al-Farq', 'madd',
   'حالة خاصة تحتاج تحليل تركيب الهمز والسياق في الموضع القرآني.',
   'planned')
on conflict (code) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  category = excluded.category,
  description = excluded.description,
  detection_mode = excluded.detection_mode,
  updated_at = now();

create index if not exists idx_tajweed_occurrences_char_span
  on public.tajweed_occurrences (ayah_id, char_start, char_end);
