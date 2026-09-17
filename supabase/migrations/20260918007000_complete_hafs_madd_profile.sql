insert into public.tajweed_madd_profiles
  (profile_code, profile_name_ar, qiraah, riwayah, tariq, rule_code, allowed_harakah, measurement_mode, notes)
values
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_badl','[2]'::jsonb,'fixed_harakah','مد البدل حركتان في هذا الخط الأساسي.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_muttasil','[4,5]'::jsonb,'route_profile','المد المتصل 4 أو 5 حركات في خط الشاطبية؛ القياس مرتبط بالطريق.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_munfasil','[4,5]'::jsonb,'route_profile','المد المنفصل 4 أو 5 حركات في خط الشاطبية؛ القياس مرتبط بالطريق.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_arid_lissukun','[2,4,6]'::jsonb,'contextual','يتوقف على الوقف وحال الوصل، وقد تتغير الأوجه إذا كان أصله مدًا أقوى.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_leen','[2,4,6]'::jsonb,'contextual','خاص بالوقف، وتفاصيله مرتبطة بالسياق وأصل المد.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_iwad','[2]'::jsonb,'fixed_harakah','مد العوض حركتان عند الوقف على تنوين الفتح غير تاء التأنيث.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_silah_qasirah','[2]'::jsonb,'fixed_harakah','الصلة الصغرى حركتان عند تحقق شرطها.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_silah_kubra','[4,5]'::jsonb,'route_profile','الصلة الكبرى مرتبطة بالهمز والطريق.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_tamkin','[2]'::jsonb,'fixed_harakah','خط أساس مد التمكين حركتان.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_farq','[6]'::jsonb,'fixed_harakah','المد اللازم في مد الفرق 6 حركات في هذا الخط الأساسي.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_lazim_harfi','[6]'::jsonb,'contextual','الأصل 6، مع استثناءات سياقية معروفة في بعض الحروف مثل عين؛ لا يُحكم آليًا دون سياق الحرف المقطّع.'),
  ('hafs_asim_baseline_v1','حفص عن عاصم - خط أساس','عاصم','حفص','الشاطبية','madd_tabii_harfi','[2]'::jsonb,'fixed_harakah','المد الطبيعي الحرفي حركتان للحروف التي ينطبق عليها هذا الوصف.')
on conflict (profile_code, rule_code) do update set
  allowed_harakah = excluded.allowed_harakah,
  measurement_mode = excluded.measurement_mode,
  notes = excluded.notes,
  updated_at = now();
