import { getSupabaseAdmin } from "../supabase-admin";
import { normalizeArabic } from "../../scripts/normalize-arabic";

export type IdentifySurahQuestion = {
  question_type: "identify_surah";
  prompt: string;
  expected_answer: {
    surah_id: number;
    surah_name_ar: string;
    ayah_number: number;
    anchor?: string;
  };
  difficulty: number;
  metadata: {
    anchor_match_count: number;
  };
};

export async function generateIdentifySurahQuestion(input: {
  anchor?: string;
  surahId?: number;
  ayahNumber?: number;
}): Promise<IdentifySurahQuestion> {
  const db = getSupabaseAdmin();

  if (input.surahId != null && input.ayahNumber != null) {
    const [{ data: ayah, error: ayahError }, { data: surah, error: surahError }] = await Promise.all([
      db.from("ayahs").select("surah_id,ayah_number,text_ar").eq("surah_id", input.surahId).eq("ayah_number", input.ayahNumber).maybeSingle(),
      db.from("surahs").select("id,name_ar").eq("id", input.surahId).maybeSingle(),
    ]);

    if (ayahError) throw new Error(ayahError.message);
    if (surahError) throw new Error(surahError.message);
    if (!ayah || !surah) throw new Error("The requested ayah or surah was not found.");

    return {
      question_type: "identify_surah",
      prompt: 'في أي سورة وردت الآية ' + ayah.ayah_number + ': «' + ayah.text_ar + '»؟',
      expected_answer: {
        surah_id: Number(surah.id),
        surah_name_ar: surah.name_ar,
        ayah_number: Number(ayah.ayah_number),
      },
      difficulty: 2,
      metadata: { anchor_match_count: 1 },
    };
  }

  const anchor = input.anchor?.trim();
  if (!anchor) throw new Error("Provide anchor or surah_id + ayah_number.");

  const normalized = normalizeArabic(anchor);
  const { data, error } = await db
    .from("ayahs")
    .select("surah_id,ayah_number,text_ar,normalized_text")
    .ilike("normalized_text", '%' + normalized + '%')
    .order("surah_id")
    .order("ayah_number")
    .limit(20);

  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("No ayah found containing anchor: " + anchor + ".");
  if (data.length > 1) {
    throw new Error('Anchor is ambiguous: "' + anchor + '" matches ' + data.length + ' ayahs. Provide surah_id + ayah_number.');
  }

  const ayah = data[0];
  const { data: surah, error: surahError } = await db
    .from("surahs")
    .select("id,name_ar")
    .eq("id", ayah.surah_id)
    .maybeSingle();

  if (surahError) throw new Error(surahError.message);
  if (!surah) throw new Error("Surah not found for ayah " + ayah.surah_id + ":" + ayah.ayah_number + ".");

  return {
    question_type: "identify_surah",
    prompt: 'في أي سورة وردت الآية التي جاء فيها: «' + anchor + '»؟',
    expected_answer: {
      surah_id: Number(surah.id),
      surah_name_ar: surah.name_ar,
      ayah_number: Number(ayah.ayah_number),
      anchor,
    },
    difficulty: 2,
    metadata: { anchor_match_count: 1 },
  };
}
